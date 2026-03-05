import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

const AMPLEMARKET_BASE_URL = "https://api.amplemarket.com";

// ─── Types ────────────────────────────────────────────────────────

interface AmplemarketContact {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  company_name?: string;
  title?: string;
  linkedin_url?: string;
  phone_numbers?: Array<{ number: string; type: string }> | string[];
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
}

interface ContactsResponse {
  contacts?: AmplemarketContact[];
  results?: AmplemarketContact[];
  _pagination?: {
    current_page: number;
    page_size: number;
    total_count: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  retries = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: headers(apiKey) });

    if (res.status === 401) {
      throw new Error("Invalid Amplemarket API key");
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      const waitMs = Math.min(retryAfter * 1000, 10000);
      console.warn(
        `[amplemarket-sync] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${retries + 1})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastError = new Error(
        `Amplemarket API error (${res.status}): ${text || res.statusText}`
      );
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
        continue;
      }
      throw lastError;
    }

    return res;
  }

  throw lastError || new Error("Failed after retries");
}

function extractPhone(
  phoneNumbers?: Array<{ number: string; type: string }> | string[]
): string | undefined {
  if (!phoneNumbers || phoneNumbers.length === 0) return undefined;
  const first = phoneNumbers[0];
  if (typeof first === "string") return first;
  if (typeof first === "object" && first.number) return first.number;
  return undefined;
}

function splitName(fullName?: string): { first: string; last: string } {
  if (!fullName) return { first: "", last: "" };
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] || "",
    last: parts.slice(1).join(" ") || "",
  };
}

// ─── Route ───────────────────────────────────────────────────────

/**
 * POST /api/amplemarket/sync-contacts
 *
 * Syncs contacts from Amplemarket into Balboa leads.
 * For each contact:
 *   - If a lead with the same email exists: update with Amplemarket data
 *   - If no matching lead: create a new lead
 *
 * Returns: { synced: count, created: count, updated: count }
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
    // 1. Fetch all contacts from Amplemarket (paginated)
    console.log("[amplemarket-sync] Fetching contacts from Amplemarket...");
    const allContacts: AmplemarketContact[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });

      const url = `${AMPLEMARKET_BASE_URL}/api/v1/contacts?${params.toString()}`;
      const res = await fetchWithRetry(url, apiKey);
      const data: ContactsResponse = await res.json();

      const contacts = data.contacts || data.results || [];
      if (contacts.length > 0) {
        allContacts.push(...contacts);
      }

      // Check pagination
      if (
        data._pagination &&
        data._pagination.current_page * data._pagination.page_size <
          data._pagination.total_count
      ) {
        page++;
      } else {
        hasMore = false;
      }

      // Safety: cap at 20 pages (2000 contacts per sync)
      if (page > 20) {
        console.warn(
          `[amplemarket-sync] Stopping pagination at page ${page} (${allContacts.length} contacts)`
        );
        hasMore = false;
      }

      // Rate limiting between pages
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    console.log(
      `[amplemarket-sync] Fetched ${allContacts.length} contacts from Amplemarket`
    );

    if (allContacts.length === 0) {
      return NextResponse.json({
        synced: 0,
        created: 0,
        updated: 0,
        message: "No contacts found in Amplemarket",
      });
    }

    // 2. Filter contacts with valid emails
    const contactsWithEmail = allContacts.filter(
      (c) => c.email && c.email.trim().length > 0
    );

    if (contactsWithEmail.length === 0) {
      return NextResponse.json({
        synced: allContacts.length,
        created: 0,
        updated: 0,
        message: "No contacts with email addresses found",
      });
    }

    // 3. Fetch existing leads by email to determine create vs update
    const emails = contactsWithEmail.map((c) =>
      c.email!.toLowerCase().trim()
    );

    const { data: existingLeads, error: leadsError } = await supabase
      .from("leads")
      .select("id, email, raw_data")
      .eq("user_id", user.id)
      .in("email", emails);

    if (leadsError) {
      console.error(
        "[amplemarket-sync] Failed to fetch existing leads:",
        leadsError
      );
      return NextResponse.json(
        { error: "Failed to check existing leads" },
        { status: 500 }
      );
    }

    const existingByEmail = new Map<
      string,
      { id: string; raw_data: Record<string, unknown> | null }
    >();
    for (const lead of existingLeads || []) {
      if (lead.email) {
        existingByEmail.set(lead.email.toLowerCase().trim(), {
          id: lead.id,
          raw_data: lead.raw_data as Record<string, unknown> | null,
        });
      }
    }

    // 4. Process contacts: update existing or create new
    const now = new Date().toISOString();
    let createdCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    const toCreate: Record<string, unknown>[] = [];
    const toUpdate: Array<{
      id: string;
      data: Record<string, unknown>;
    }> = [];

    for (const contact of contactsWithEmail) {
      const email = contact.email!.toLowerCase().trim();
      const firstName =
        contact.first_name || splitName(contact.name).first || "";
      const lastName =
        contact.last_name || splitName(contact.name).last || "";
      const phone = extractPhone(contact.phone_numbers);

      const amplemarketData = {
        amplemarket_contact_id: contact.id,
        amplemarket_synced_at: now,
        phone: phone || undefined,
        title: contact.title || undefined,
        company_name: contact.company_name || undefined,
        linkedin_url: contact.linkedin_url || undefined,
        location: contact.location || undefined,
      };

      const existing = existingByEmail.get(email);

      if (existing) {
        // Update existing lead
        const existingRawData = existing.raw_data || {};
        toUpdate.push({
          id: existing.id,
          data: {
            ...(phone && { phone }),
            ...(contact.title && { position: contact.title }),
            ...(contact.company_name && { company: contact.company_name }),
            ...(contact.linkedin_url && {
              linkedin_url: contact.linkedin_url,
            }),
            raw_data: {
              ...existingRawData,
              amplemarket: {
                ...(typeof existingRawData === "object" &&
                existingRawData !== null &&
                "amplemarket" in existingRawData
                  ? (existingRawData.amplemarket as Record<string, unknown>)
                  : {}),
                ...amplemarketData,
              },
            },
            updated_at: now,
          },
        });
      } else {
        // Create new lead
        toCreate.push({
          id: crypto.randomUUID(),
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: email,
          company: contact.company_name || "",
          position: contact.title || "",
          linkedin_url: contact.linkedin_url || "",
          phone: phone || "",
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
            email: true,
            linkedinConnected: false,
            emailVerified: false,
          },
          source: "amplemarket",
          raw_data: {
            status: "new",
            contactStatus: "not_contacted",
            amplemarket: amplemarketData,
          },
          created_at: now,
          updated_at: now,
        });
      }
    }

    // 5. Batch create new leads
    if (toCreate.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
        const batch = toCreate.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase
          .from("leads")
          .insert(batch);

        if (insertError) {
          console.error(
            `[amplemarket-sync] Batch insert failed at offset ${i}:`,
            insertError
          );
          errors.push(
            `Insert batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${insertError.message}`
          );
        } else {
          createdCount += batch.length;
        }
      }
    }

    // 6. Update existing leads one by one (batched updates not supported by Supabase)
    for (const update of toUpdate) {
      const { error: updateError } = await supabase
        .from("leads")
        .update(update.data)
        .eq("id", update.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error(
          `[amplemarket-sync] Update lead ${update.id} failed:`,
          updateError
        );
        errors.push(`Update lead ${update.id} failed: ${updateError.message}`);
      } else {
        updatedCount++;
      }
    }

    console.log(
      `[amplemarket-sync] Complete: ${createdCount} created, ${updatedCount} updated, ${errors.length} errors`
    );

    return NextResponse.json({
      synced: contactsWithEmail.length,
      created: createdCount,
      updated: updatedCount,
      ...(errors.length > 0 && { errors }),
    });
  } catch (err) {
    console.error("[amplemarket-sync] Error:", err);

    const message =
      err instanceof Error ? err.message : "Contact sync failed";

    if (message.includes("Invalid Amplemarket API key")) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    if (message.includes("rate limit") || message.includes("Rate limit")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    return NextResponse.json(
      { error: message, details: String(err) },
      { status: 500 }
    );
  }
}
