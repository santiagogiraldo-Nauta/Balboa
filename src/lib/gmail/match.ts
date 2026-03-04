import type { CommunicationThread } from "@/lib/types";
import type { ParsedGmailThread } from "./service";

interface MatchableLead {
  id: string;
  email?: string;
  firstName: string;
  lastName: string;
  company: string;
}

/**
 * Match Gmail threads to leads using multi-layer matching:
 *   1. Email-to-email (exact match)
 *   2. Name match (sender display name vs lead first+last name)
 *   3. Domain match (sender email domain vs company name heuristic)
 *
 * Returns conversations in the CommunicationThread format the Inbox expects.
 */
export function matchGmailToLeads(
  gmailThreads: ParsedGmailThread[],
  leads: MatchableLead[],
  userEmail: string
): {
  matched: Record<string, CommunicationThread[]>;
  unmatched: CommunicationThread[];
} {
  // ─── Build lookup maps ───────────────────────────────────────

  // Layer 1: email → leadId
  const emailToLeadId = new Map<string, string>();
  for (const lead of leads) {
    if (lead.email) {
      emailToLeadId.set(lead.email.toLowerCase(), lead.id);
    }
  }

  // Layer 2: normalized full name → leadId
  const nameToLeadId = new Map<string, string>();
  for (const lead of leads) {
    const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase().trim();
    if (fullName.length > 2) {
      nameToLeadId.set(fullName, lead.id);
    }
  }

  // Layer 3: company domain heuristic → leadId[]
  const domainToLeadIds = new Map<string, string[]>();
  for (const lead of leads) {
    if (lead.company) {
      const domains = companyToDomains(lead.company);
      for (const domain of domains) {
        const existing = domainToLeadIds.get(domain) || [];
        existing.push(lead.id);
        domainToLeadIds.set(domain, existing);
      }
    }
  }

  // ─── Match threads ──────────────────────────────────────────

  const matched: Record<string, CommunicationThread[]> = {};
  const unmatched: CommunicationThread[] = [];
  const normalizedUserEmail = userEmail.toLowerCase();

  for (const gmailThread of gmailThreads) {
    let leadId: string | null = null;

    // Determine direction and try matching each message
    for (const msg of gmailThread.messages) {
      if (msg.fromEmail === normalizedUserEmail) {
        msg.direction = "outbound";
        if (!leadId) leadId = matchContact(msg.toEmail, msg.to, emailToLeadId, nameToLeadId, domainToLeadIds);
      } else {
        msg.direction = "inbound";
        if (!leadId) leadId = matchContact(msg.fromEmail, msg.from, emailToLeadId, nameToLeadId, domainToLeadIds);
      }
    }

    // Convert to CommunicationThread format
    const thread: CommunicationThread = {
      id: `gmail-${gmailThread.threadId}`,
      leadId: leadId || "unmatched",
      channel: "email",
      subject: gmailThread.subject,
      messages: gmailThread.messages.map((msg) => ({
        id: `gmail-${msg.gmailId}`,
        leadId: leadId || "unmatched",
        channel: "email" as const,
        direction: msg.direction,
        subject: msg.subject,
        body: msg.snippet, // Snippet for list; full body fetched on demand
        date: msg.date,
        status: msg.isRead ? ("read" as const) : ("delivered" as const),
        threadId: `gmail-${msg.threadId}`,
        sender: msg.direction === "inbound" ? msg.from : "You",
      })),
      lastMessageDate: gmailThread.lastMessageDate,
      unreadCount: gmailThread.messages.filter((m) => !m.isRead).length,
    };

    if (leadId) {
      if (!matched[leadId]) matched[leadId] = [];
      matched[leadId].push(thread);
    } else {
      unmatched.push(thread);
    }
  }

  return { matched, unmatched };
}

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Try to match a contact (email + display name) to a lead using all layers.
 */
function matchContact(
  contactEmail: string,
  contactDisplayName: string,
  emailMap: Map<string, string>,
  nameMap: Map<string, string>,
  domainMap: Map<string, string[]>
): string | null {
  // Layer 1: exact email match
  const emailMatch = emailMap.get(contactEmail);
  if (emailMatch) return emailMatch;

  // Layer 2: name match
  const normalizedName = contactDisplayName.toLowerCase().trim();
  // Try exact full name
  const nameMatch = nameMap.get(normalizedName);
  if (nameMatch) return nameMatch;

  // Try matching with name variants (remove middle names, etc.)
  for (const [leadName, leadId] of nameMap) {
    // "Santiago Giraldo Navarro" should match "Santiago Giraldo"
    if (normalizedName.startsWith(leadName) || leadName.startsWith(normalizedName)) {
      return leadId;
    }
  }

  // Layer 3: domain match (only if domain maps to a single lead to avoid ambiguity)
  const emailDomain = contactEmail.split("@")[1]?.toLowerCase();
  if (emailDomain) {
    // Skip generic email providers
    const genericDomains = new Set([
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
      "aol.com", "icloud.com", "mail.com", "protonmail.com",
      "live.com", "msn.com", "ymail.com", "zoho.com",
    ]);

    if (!genericDomains.has(emailDomain)) {
      const domainLeads = domainMap.get(emailDomain);
      if (domainLeads && domainLeads.length === 1) {
        return domainLeads[0]; // Unambiguous domain match
      }
    }
  }

  return null;
}

/**
 * Convert a company name to likely email domains.
 * "Acme Corporation" → ["acme.com", "acmecorporation.com"]
 * "The Global FoodBanking Network" → ["globalfoodbankingnetwork.com", "gfn.com"]
 */
function companyToDomains(company: string): string[] {
  const normalized = company.toLowerCase().trim();
  const domains: string[] = [];

  // Remove common suffixes
  const cleaned = normalized
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|gmbh|sa|srl|ag)\b\.?/gi, "")
    .replace(/^the\s+/i, "")
    .trim();

  // Full name as domain (no spaces)
  const fullDomain = cleaned.replace(/[^a-z0-9]/g, "") + ".com";
  if (fullDomain.length > 4) domains.push(fullDomain);

  // First word as domain
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
  if (words.length > 0) {
    const firstWordDomain = words[0].replace(/[^a-z0-9]/g, "") + ".com";
    if (firstWordDomain !== fullDomain && firstWordDomain.length > 4) {
      domains.push(firstWordDomain);
    }
  }

  // Acronym domain for multi-word names
  if (words.length >= 2) {
    const acronym = words.map((w) => w[0]).join("") + ".com";
    if (acronym.length > 4) domains.push(acronym);
  }

  return domains;
}
