import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

const AMPLEMARKET_BASE_URL = "https://api.amplemarket.com";

interface AmplemarketLeadList {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface AmplemarketContact {
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
  title: string;
  linkedin_url?: string;
  phone_numbers?: string[];
}

interface AmplemarketSequence {
  id: string;
  name: string;
  status: string;
}

async function amplemarketFetch<T>(
  path: string,
  apiKey: string
): Promise<T> {
  const res = await fetch(`${AMPLEMARKET_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    throw new Error("Invalid Amplemarket API key");
  }

  if (res.status === 429) {
    throw new Error("Amplemarket rate limit exceeded. Try again later.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Amplemarket API error (${res.status}): ${text || res.statusText}`
    );
  }

  return res.json();
}

/**
 * POST /api/amplemarket/import
 *
 * Import contacts from all Amplemarket lead lists into Balboa as leads.
 * Deduplicates by email, upserts new leads, and returns import stats.
 */
export async function POST() {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.AMPLEMARKET_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Amplemarket is not configured. Set AMPLEMARKET_API_KEY." },
      { status: 500 }
    );
  }

  try {
    // 1. Fetch all lead lists
    console.log("[amplemarket-import] Fetching lead lists...");
    const { lead_lists } = await amplemarketFetch<{
      lead_lists: AmplemarketLeadList[];
    }>("/lead-lists", apiKey);

    if (!lead_lists || lead_lists.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        total: 0,
        leadLists: 0,
        message: "No lead lists found in Amplemarket",
      });
    }

    console.log(
      `[amplemarket-import] Found ${lead_lists.length} lead lists`
    );

    // 2. Fetch contacts from each lead list and deduplicate
    const contactsByEmail = new Map<
      string,
      AmplemarketContact & { lead_list_names: string[] }
    >();

    for (const list of lead_lists) {
      try {
        const { leads } = await amplemarketFetch<{
          leads: AmplemarketContact[];
        }>(`/lead-lists/${list.id}`, apiKey);

        if (!leads) continue;

        for (const contact of leads) {
          if (!contact.email) continue;

          const email = contact.email.toLowerCase().trim();
          const existing = contactsByEmail.get(email);

          if (existing) {
            // Add lead list name to existing contact
            if (!existing.lead_list_names.includes(list.name)) {
              existing.lead_list_names.push(list.name);
            }
          } else {
            contactsByEmail.set(email, {
              ...contact,
              email,
              lead_list_names: [list.name],
            });
          }
        }

        console.log(
          `[amplemarket-import] List "${list.name}": ${leads?.length || 0} contacts`
        );
      } catch (listErr) {
        console.error(
          `[amplemarket-import] Failed to fetch list "${list.name}" (${list.id}):`,
          listErr
        );
        // Continue with other lists
      }
    }

    const totalContacts = contactsByEmail.size;

    if (totalContacts === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        total: 0,
        leadLists: lead_lists.length,
        message: "No contacts with email addresses found in Amplemarket lists",
      });
    }

    // 3. Try to fetch sequence data for enrichment
    const sequenceMap = new Map<string, string[]>(); // email -> sequence names
    try {
      const { sequences } = await amplemarketFetch<{
        sequences: AmplemarketSequence[];
        _pagination: unknown;
      }>("/sequences", apiKey);

      if (sequences && sequences.length > 0) {
        const activeSequences = sequences.filter(
          (s) => s.status === "active"
        );
        console.log(
          `[amplemarket-import] Found ${activeSequences.length} active sequences`
        );

        // Note: The Amplemarket API doesn't have a direct endpoint to list contacts per sequence,
        // but we store sequence metadata for reference
        for (const seq of activeSequences) {
          // We'll enrich contacts with sequence info if they match
          // For now, store the sequence names so we know what's active
          sequenceMap.set(seq.id, [seq.name]);
        }
      }
    } catch (seqErr) {
      console.warn(
        "[amplemarket-import] Could not fetch sequences (non-fatal):",
        seqErr
      );
    }

    // 4. Check which emails already exist as leads
    const { data: existingLeads, error: existingError } = await supabase
      .from("leads")
      .select("email")
      .eq("user_id", user.id);

    if (existingError) {
      console.error(
        "[amplemarket-import] Failed to fetch existing leads:",
        existingError
      );
      return NextResponse.json(
        { error: "Failed to check existing leads" },
        { status: 500 }
      );
    }

    const existingEmails = new Set(
      (existingLeads || []).map((l: { email: string }) =>
        l.email?.toLowerCase()?.trim()
      )
    );

    // 5. Build new lead records (skip existing emails)
    const now = new Date().toISOString();
    const allContacts = Array.from(contactsByEmail.values());
    const newContacts = allContacts.filter(
      (c) => !existingEmails.has(c.email)
    );
    const skippedCount = totalContacts - newContacts.length;

    if (newContacts.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: skippedCount,
        total: totalContacts,
        leadLists: lead_lists.length,
        message: "All contacts already exist as leads",
      });
    }

    const leadRecords = newContacts.map((contact) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email,
      company: contact.company_name || "",
      position: contact.title || "",
      linkedin_url: contact.linkedin_url || "",
      linkedin_stage: "not_connected",
      icp_score: {
        overall: 0,
        companyFit: 0,
        roleFit: 0,
        industryFit: 0,
        signals: [],
        tier: "cold",
      },
      company_intel: {},
      draft_messages: [],
      contact_history: [],
      channels: {
        linkedin: !!contact.linkedin_url,
        email: !!contact.email,
        linkedinConnected: false,
        emailVerified: true,
      },
      source: "amplemarket",
      raw_data: {
        status: "new",
        contactStatus: "not_contacted",
        lead_list_names: contact.lead_list_names,
        phone_numbers: contact.phone_numbers || [],
        title: contact.title || "",
        company_name: contact.company_name || "",
        linkedin_url: contact.linkedin_url || "",
        imported_at: now,
      },
      created_at: now,
      updated_at: now,
    }));

    // 6. Bulk upsert in batches
    const BATCH_SIZE = 50;
    let totalImported = 0;

    for (let i = 0; i < leadRecords.length; i += BATCH_SIZE) {
      const batch = leadRecords.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("leads")
        .upsert(batch, { onConflict: "id" });

      if (upsertError) {
        console.error(
          `[amplemarket-import] Batch ${Math.floor(i / BATCH_SIZE) + 1} upsert failed:`,
          upsertError
        );
        return NextResponse.json(
          {
            error: `Import failed at batch ${Math.floor(i / BATCH_SIZE) + 1}: ${upsertError.message}`,
            imported: totalImported,
            skipped: skippedCount,
            total: totalContacts,
            leadLists: lead_lists.length,
          },
          { status: 500 }
        );
      }

      totalImported += batch.length;
    }

    console.log(
      `[amplemarket-import] Complete: ${totalImported} imported, ${skippedCount} skipped from ${lead_lists.length} lists`
    );

    return NextResponse.json({
      imported: totalImported,
      skipped: skippedCount,
      total: totalContacts,
      leadLists: lead_lists.length,
    });
  } catch (err) {
    console.error("[amplemarket-import] Error:", err);

    const message =
      err instanceof Error ? err.message : "Import failed";

    // Return appropriate status codes for known errors
    if (message.includes("Invalid Amplemarket API key")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message.includes("rate limit")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    return NextResponse.json(
      { error: message, details: String(err) },
      { status: 500 }
    );
  }
}
