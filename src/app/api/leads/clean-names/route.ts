import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";

// ─── Domains/patterns that indicate automated services, not real leads ───
const SERVICE_DOMAINS = [
  "fireflies.ai",
  "zoom.us",
  "notion.so",
  "read.ai",
  "calendly.com",
  "slack.com",
  "asana.com",
  "trello.com",
  "jira.atlassian.com",
  "linear.app",
  "figma.com",
  "loom.com",
  "miro.com",
  "clickup.com",
  "monday.com",
  "hubspot.com",
  "salesforce.com",
  "intercom.io",
  "zendesk.com",
  "mailchimp.com",
  "sendgrid.net",
  "postmarkapp.com",
  "aircall.io",
  "anthropic.com",
  "claude.ai",
  "readassistant.com",
  "grammarly.com",
  "otter.ai",
  "krisp.ai",
  "superhuman.com",
];

const SERVICE_EMAIL_PREFIXES = [
  "mailer-daemon",
  "noreply",
  "no-reply",
  "no_reply",
  "notifications@",
  "notification@",
  "calendar-notification",
  "reply@",
  "updates@",
  "support@",
  "team@",
  "hello@",
  "info@",
  "billing@",
  "admin@",
  "donotreply",
  "do-not-reply",
  "do_not_reply",
  "automated@",
  "system@",
  "alerts@",
  "digest@",
  "newsletter@",
  "feedback@",
  "fred@",
];

// Name-based patterns for service leads that might use generic email domains
const SERVICE_NAME_PATTERNS = [
  /^mail delivery/i,
  /^mailer.daemon/i,
  /^postmaster$/i,
  /^fred from fireflies/i,
  /^fireflies/i,
  /^aircall team/i,
  /^aircall$/i,
  /^claude team/i,
  /^read assistant/i,
  /^zoom$/i,
  /^zoom team/i,
  /^calendly$/i,
  /^slack$/i,
  /^notion$/i,
  /^grammarly$/i,
  /^otter\.ai/i,
  /^loom$/i,
  /^superhuman$/i,
  /^krisp$/i,
  /^anthropic$/i,
];

// ─── Helpers ─────────────────────────────────────────────────────────

function isServiceLead(email: string, firstName?: string, lastName?: string): boolean {
  const lower = email.toLowerCase().trim();

  // Check domain matches
  const domain = lower.split("@")[1] || "";
  for (const svcDomain of SERVICE_DOMAINS) {
    // Match exact domain or subdomains (e.g. e.zoom.us matches zoom.us)
    if (domain === svcDomain || domain.endsWith("." + svcDomain)) {
      return true;
    }
  }

  // Check prefix patterns
  const localPart = lower.split("@")[0] || "";
  for (const prefix of SERVICE_EMAIL_PREFIXES) {
    if (prefix.endsWith("@")) {
      // Pattern like "updates@" — match the full local part
      if (localPart === prefix.slice(0, -1)) {
        return true;
      }
    } else {
      // Pattern like "noreply" — match if local part contains it
      if (localPart === prefix || localPart.includes(prefix)) {
        return true;
      }
    }
  }

  // Check name-based patterns (for leads imported from contacts with generic email domains)
  const fullName = `${firstName || ""} ${lastName || ""}`.trim();
  if (fullName) {
    for (const pattern of SERVICE_NAME_PATTERNS) {
      if (pattern.test(fullName)) {
        return true;
      }
    }
  }

  return false;
}

function looksLikeEmail(name: string): boolean {
  if (!name) return false;
  // Must contain @ to be an email, or must contain dots/underscores
  // that look like email local parts (e.g. "john.doe", "john_doe")
  // Simple alpha-only names like "Rodrigo" are NOT emails
  return name.includes("@") || /^[a-z0-9]+[._+-][a-z0-9._+-]+$/i.test(name);
}

function extractNameFromEmailLocal(email: string): {
  firstName: string;
  lastName: string;
} {
  const localPart = email.split("@")[0] || "";
  // Split on dots, underscores, hyphens
  const parts = localPart
    .split(/[._-]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());

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

function isBogusCompany(company: string): boolean {
  if (!company) return false;
  const lower = company.trim().toLowerCase();
  // Single character companies from domain extraction bugs (e.g. "E" from e.zoom.us)
  return lower.length === 1;
}

// ─── POST handler ────────────────────────────────────────────────────

export async function POST() {
  try {
    const { user, supabase, error } = await getAuthUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all leads for this user
    const { data: leads, error: fetchError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, company")
      .eq("user_id", user.id);

    if (fetchError) {
      console.error("[clean-names] Failed to fetch leads:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        deleted: 0,
        fixed: 0,
        companyFixed: 0,
        total: 0,
        details: { deletedLeads: [], fixedLeads: [], companyFixedLeads: [] },
      });
    }

    const toDelete: string[] = [];
    const toFix: {
      id: string;
      first_name: string;
      last_name: string;
      oldFirstName: string;
      email: string;
    }[] = [];
    const toFixCompany: { id: string; company: string; oldCompany: string }[] =
      [];

    for (const lead of leads) {
      const email = ((lead.email as string) || "").toLowerCase().trim();
      const firstName = (lead.first_name as string) || "";
      const lastName = (lead.last_name as string) || "";
      const company = (lead.company as string) || "";

      // 1. Check if this is a service/automated lead to delete
      if (isServiceLead(email || "", firstName, lastName)) {
        toDelete.push(lead.id as string);
        continue; // No need to fix names on leads we are deleting
      }

      // 2. Check if first_name looks like an email — extract real name
      if (email && looksLikeEmail(firstName)) {
        const extracted = extractNameFromEmailLocal(email);
        if (extracted.firstName) {
          toFix.push({
            id: lead.id as string,
            first_name: extracted.firstName,
            last_name: extracted.lastName || lastName,
            oldFirstName: firstName,
            email,
          });
        }
      }

      // 3. Check for bogus company name (single-char like "E")
      if (isBogusCompany(company)) {
        toFixCompany.push({
          id: lead.id as string,
          company: "",
          oldCompany: company,
        });
      }
    }

    // ─── Execute deletions ───────────────────────────────────────────
    let deletedCount = 0;
    if (toDelete.length > 0) {
      // Delete in batches of 50 to avoid query size limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE);
        const { error: deleteError } = await supabase
          .from("leads")
          .delete()
          .in("id", batch)
          .eq("user_id", user.id);

        if (deleteError) {
          console.error(
            `[clean-names] Delete batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
            deleteError
          );
        } else {
          deletedCount += batch.length;
        }
      }
      console.log(
        `[clean-names] Deleted ${deletedCount} service/automated leads`
      );
    }

    // ─── Execute name fixes ──────────────────────────────────────────
    let fixedCount = 0;
    for (const fix of toFix) {
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          first_name: fix.first_name,
          last_name: fix.last_name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fix.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error(
          `[clean-names] Failed to fix name for ${fix.id}:`,
          updateError
        );
      } else {
        fixedCount++;
      }
    }
    if (fixedCount > 0) {
      console.log(`[clean-names] Fixed ${fixedCount} email-as-name leads`);
    }

    // ─── Execute company fixes ───────────────────────────────────────
    let companyFixedCount = 0;
    for (const fix of toFixCompany) {
      // Skip if this lead was already deleted
      if (toDelete.includes(fix.id)) continue;

      const { error: updateError } = await supabase
        .from("leads")
        .update({
          company: fix.company,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fix.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error(
          `[clean-names] Failed to fix company for ${fix.id}:`,
          updateError
        );
      } else {
        companyFixedCount++;
      }
    }
    if (companyFixedCount > 0) {
      console.log(
        `[clean-names] Fixed ${companyFixedCount} bogus company names`
      );
    }

    return NextResponse.json({
      deleted: deletedCount,
      fixed: fixedCount,
      companyFixed: companyFixedCount,
      total: leads.length,
      details: {
        deletedLeads: toDelete.slice(0, 20), // Cap at 20 for response size
        fixedLeads: toFix.slice(0, 20).map((f) => ({
          id: f.id,
          old: f.oldFirstName,
          new: `${f.first_name} ${f.last_name}`.trim(),
          email: f.email,
        })),
        companyFixedLeads: toFixCompany.slice(0, 20).map((f) => ({
          id: f.id,
          oldCompany: f.oldCompany,
        })),
      },
    });
  } catch (err) {
    console.error("[clean-names] Error:", err);
    return NextResponse.json(
      {
        error: "Name cleanup failed",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
