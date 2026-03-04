import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { getGmailClient, fetchGmailThreads } from "@/lib/gmail/service";

const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "msn.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "yandex.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "fastmail.com",
  "tutanota.com",
  "hey.com",
  "pm.me",
  "yahoo.co.uk",
  "yahoo.co.in",
  "hotmail.co.uk",
  "outlook.es",
  "outlook.fr",
  "googlemail.com",
]);

function parseDisplayName(displayName: string): {
  firstName: string;
  lastName: string;
} {
  if (!displayName || !displayName.trim()) {
    return { firstName: "", lastName: "" };
  }

  // Remove quotes and extra whitespace
  const cleaned = displayName.replace(/["']/g, "").trim();
  const parts = cleaned.split(/\s+/);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function extractCompanyFromDomain(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || GENERIC_DOMAINS.has(domain)) {
    return "";
  }

  // Extract company name from domain (e.g., "acme.com" -> "Acme")
  const companyPart = domain.split(".")[0];
  return companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
}

interface ContactInfo {
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  company: string;
  threadCount: number;
  inboundCount: number;
  outboundCount: number;
  firstContactDate: string | null;
  lastContactDate: string | null;
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const minThreads = parseInt(searchParams.get("minThreads") || "1", 10);

    // Get Gmail client
    const gmailResult = await getGmailClient(supabase, user.id);
    if (!gmailResult) {
      return NextResponse.json(
        { error: "Gmail not connected" },
        { status: 400 }
      );
    }
    const { gmail, tokenRow } = gmailResult;

    const userEmail = tokenRow?.gmail_email?.toLowerCase() || "";

    // Fetch all Gmail threads
    const threads = await fetchGmailThreads(gmail, {
      maxResults: 500,
      query: "",
    });

    if (!threads || threads.length === 0) {
      return NextResponse.json(
        { imported: 0, skipped: 0, total: 0, contacts: [] },
        { status: 200 }
      );
    }

    // Extract unique contacts from all threads
    const contactsMap = new Map<string, ContactInfo>();

    for (const thread of threads) {
      if (!thread.messages || thread.messages.length === 0) continue;

      // Track which contacts appear in this thread
      const threadContacts = new Set<string>();

      // Get thread date range
      const threadDates = thread.messages
        .map((m) => m.date)
        .filter(Boolean)
        .sort();
      const threadFirstDate = threadDates[0] || null;
      const threadLastDate = threadDates[threadDates.length - 1] || null;

      for (const message of thread.messages) {
        // Process fromEmail
        const fromEmail = message.fromEmail?.toLowerCase()?.trim();
        if (fromEmail && fromEmail !== userEmail) {
          threadContacts.add(fromEmail);

          if (!contactsMap.has(fromEmail)) {
            const { firstName, lastName } = parseDisplayName(
              message.from || ""
            );
            contactsMap.set(fromEmail, {
              email: fromEmail,
              displayName: message.from || "",
              firstName,
              lastName,
              company: extractCompanyFromDomain(fromEmail),
              threadCount: 0,
              inboundCount: 0,
              outboundCount: 0,
              firstContactDate: null,
              lastContactDate: null,
            });
          }

          const contact = contactsMap.get(fromEmail)!;
          // If display name was empty before but now we have one, update it
          if (!contact.firstName && message.from) {
            const { firstName, lastName } = parseDisplayName(message.from);
            contact.firstName = firstName;
            contact.lastName = lastName;
            contact.displayName = message.from;
          }

          // Count inbound messages (they sent to user)
          if (message.direction === "inbound") {
            contact.inboundCount++;
          }
        }

        // Process toEmail
        const toEmail = message.toEmail?.toLowerCase()?.trim();
        if (toEmail && toEmail !== userEmail) {
          threadContacts.add(toEmail);

          if (!contactsMap.has(toEmail)) {
            const { firstName, lastName } = parseDisplayName(message.to || "");
            contactsMap.set(toEmail, {
              email: toEmail,
              displayName: message.to || "",
              firstName,
              lastName,
              company: extractCompanyFromDomain(toEmail),
              threadCount: 0,
              inboundCount: 0,
              outboundCount: 0,
              firstContactDate: null,
              lastContactDate: null,
            });
          }

          const contact = contactsMap.get(toEmail)!;
          if (!contact.firstName && message.to) {
            const { firstName, lastName } = parseDisplayName(message.to);
            contact.firstName = firstName;
            contact.lastName = lastName;
            contact.displayName = message.to;
          }

          // Count outbound messages (user sent to them)
          if (message.direction === "outbound") {
            contact.outboundCount++;
          }
        }
      }

      // Increment thread count for each contact in this thread
      for (const email of Array.from(threadContacts)) {
        const contact = contactsMap.get(email);
        if (contact) {
          contact.threadCount++;

          // Update date range
          if (
            threadFirstDate &&
            (!contact.firstContactDate ||
              threadFirstDate < contact.firstContactDate)
          ) {
            contact.firstContactDate = threadFirstDate;
          }
          if (
            threadLastDate &&
            (!contact.lastContactDate ||
              threadLastDate > contact.lastContactDate)
          ) {
            contact.lastContactDate = threadLastDate;
          }
        }
      }
    }

    // Filter by minimum thread count
    const filteredContacts = Array.from(contactsMap.values()).filter(
      (c) => c.threadCount >= minThreads
    );

    if (filteredContacts.length === 0) {
      return NextResponse.json(
        { imported: 0, skipped: 0, total: 0, contacts: [] },
        { status: 200 }
      );
    }

    // Check which emails already exist as leads
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("email")
      .eq("user_id", user.id);

    const existingEmails = new Set(
      (existingLeads || []).map((l: { email: string }) =>
        l.email?.toLowerCase()
      )
    );

    // Separate new contacts from existing ones
    const newContacts = filteredContacts.filter(
      (c) => !existingEmails.has(c.email)
    );
    const skippedCount = filteredContacts.length - newContacts.length;

    if (newContacts.length === 0) {
      return NextResponse.json(
        {
          imported: 0,
          skipped: skippedCount,
          total: filteredContacts.length,
          contacts: [],
        },
        { status: 200 }
      );
    }

    // Build lead records for upsert
    const now = new Date().toISOString();
    const leadRecords = newContacts.map((contact) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      first_name: contact.firstName,
      last_name: contact.lastName,
      email: contact.email,
      company: contact.company,
      position: "",
      linkedin_url: "",
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
        linkedin: false,
        email: true,
        linkedinConnected: false,
        emailVerified: true,
      },
      source: "gmail",
      raw_data: {
        status: "new",
        contactStatus:
          contact.inboundCount > 0 ? "neutral" : "not_contacted",
        threadCount: contact.threadCount,
        inboundCount: contact.inboundCount,
        outboundCount: contact.outboundCount,
        firstContactDate: contact.firstContactDate,
        lastContactDate: contact.lastContactDate,
        displayName: contact.displayName,
      },
      created_at: now,
      updated_at: now,
    }));

    // Bulk upsert in batches of 50 to avoid payload limits
    const BATCH_SIZE = 50;
    let totalImported = 0;

    for (let i = 0; i < leadRecords.length; i += BATCH_SIZE) {
      const batch = leadRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("leads")
        .upsert(batch, { onConflict: "id" });

      if (error) {
        console.error(
          `Error upserting batch ${i / BATCH_SIZE + 1}:`,
          error
        );
        return NextResponse.json(
          {
            error: `Failed to import contacts: ${error.message}`,
            imported: totalImported,
            skipped: skippedCount,
            total: filteredContacts.length,
          },
          { status: 500 }
        );
      }

      totalImported += batch.length;
    }

    // Build response summary
    const contactSummary = newContacts.map((c) => ({
      email: c.email,
      name: `${c.firstName} ${c.lastName}`.trim(),
      company: c.company,
      threadCount: c.threadCount,
      inbound: c.inboundCount,
      outbound: c.outboundCount,
    }));

    return NextResponse.json(
      {
        imported: totalImported,
        skipped: skippedCount,
        total: filteredContacts.length,
        contacts: contactSummary,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Gmail import contacts error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import contacts",
      },
      { status: 500 }
    );
  }
}
