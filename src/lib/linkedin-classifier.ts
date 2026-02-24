// LinkedIn conversation classifier — multi-layer classification engine
import type {
  LinkedInConversation,
  LinkedInFilterRule,
  ClassificationResult,
  ConversationClassification,
} from "./types-linkedin";
import type { Lead } from "./types";

// Personal conversation indicators
const PERSONAL_KEYWORDS = [
  // Family & relationships
  "mom", "dad", "brother", "sister", "wife", "husband", "family", "kids",
  "birthday", "anniversary", "wedding", "baby", "pregnant",
  // Social planning
  "dinner", "lunch plans", "party", "barbecue", "drinks tonight",
  "hangout", "catch up", "miss you", "love you",
  // Personal topics
  "vacation", "holiday trip", "doctor", "gym", "workout",
  "football", "soccer", "game tonight", "netflix",
  // Casual greetings (non-business context)
  "what's up bro", "hey dude", "sup man", "lol", "haha omg",
];

// Professional conversation indicators
const PROFESSIONAL_KEYWORDS = [
  // Business terms
  "revenue", "pipeline", "quarterly", "budget", "roi", "kpi",
  "proposal", "contract", "invoice", "pricing", "discount",
  // Roles & meetings
  "meeting", "demo", "presentation", "stakeholder", "decision maker",
  "c-suite", "board", "executive", "procurement",
  // Industry terms
  "supply chain", "logistics", "distribution", "warehouse",
  "inventory", "sourcing", "freight", "manufacturing",
  // Outreach patterns
  "following up", "circling back", "touch base", "next steps",
  "interested in", "schedule a call", "availability",
];

/**
 * Classify a LinkedIn conversation using multi-layer analysis:
 * Layer 1: User-defined rules (highest priority)
 * Layer 2: Pattern detection (personal vs professional indicators)
 * Layer 3: Participant cross-reference with leads database
 */
export function classifyConversation(
  conversation: LinkedInConversation,
  rules: LinkedInFilterRule[],
  existingLeads: Lead[]
): ClassificationResult {
  const reasons: string[] = [];
  let professionalScore = 0;
  let personalScore = 0;

  const messageText = (conversation.lastMessagePreview || "").toLowerCase();
  const participantName = (conversation.participantName || "").toLowerCase();

  // ==========================================
  // LAYER 1: User-defined rules (highest priority)
  // ==========================================
  const activeRules = rules.filter(r => r.isActive);

  for (const rule of activeRules) {
    const ruleValue = rule.ruleValue.toLowerCase();

    switch (rule.ruleType) {
      case "keyword":
        if (messageText.includes(ruleValue)) {
          reasons.push(`Rule match: keyword "${rule.ruleValue}" → ${rule.classification}`);
          return {
            classification: rule.classification,
            confidence: 0.95,
            reasons,
            method: "rule",
          };
        }
        break;

      case "participant":
        if (participantName.includes(ruleValue)) {
          reasons.push(`Rule match: participant "${rule.ruleValue}" → ${rule.classification}`);
          return {
            classification: rule.classification,
            confidence: 0.95,
            reasons,
            method: "rule",
          };
        }
        break;

      case "relationship":
        // Check if participant URL matches a known relationship pattern
        if (conversation.participantUrl?.toLowerCase().includes(ruleValue)) {
          reasons.push(`Rule match: relationship "${rule.ruleValue}" → ${rule.classification}`);
          return {
            classification: rule.classification,
            confidence: 0.90,
            reasons,
            method: "rule",
          };
        }
        break;

      case "pattern":
        // Regex pattern matching
        try {
          const regex = new RegExp(ruleValue, "i");
          if (regex.test(messageText) || regex.test(participantName)) {
            reasons.push(`Rule match: pattern "${rule.ruleValue}" → ${rule.classification}`);
            return {
              classification: rule.classification,
              confidence: 0.90,
              reasons,
              method: "rule",
            };
          }
        } catch {
          // Invalid regex, skip
        }
        break;
    }
  }

  // ==========================================
  // LAYER 2: Pattern detection
  // ==========================================

  // Check personal indicators
  for (const keyword of PERSONAL_KEYWORDS) {
    if (messageText.includes(keyword)) {
      personalScore += 0.15;
      reasons.push(`Personal indicator: "${keyword}"`);
    }
  }

  // Check professional indicators
  for (const keyword of PROFESSIONAL_KEYWORDS) {
    if (messageText.includes(keyword)) {
      professionalScore += 0.15;
      reasons.push(`Professional indicator: "${keyword}"`);
    }
  }

  // ==========================================
  // LAYER 3: Participant cross-reference
  // ==========================================
  const matchedLead = existingLeads.find(lead => {
    const leadFullName = `${lead.firstName} ${lead.lastName}`.toLowerCase();
    // Check name match
    if (participantName && leadFullName.includes(participantName)) return true;
    if (participantName && participantName.includes(leadFullName)) return true;
    // Check LinkedIn URL match
    if (conversation.participantUrl && lead.linkedinUrl) {
      const convUrl = conversation.participantUrl.toLowerCase().replace(/\/$/, "");
      const leadUrl = lead.linkedinUrl.toLowerCase().replace(/\/$/, "");
      if (convUrl === leadUrl) return true;
    }
    return false;
  });

  if (matchedLead) {
    professionalScore += 0.4;
    reasons.push(`Participant matches lead: ${matchedLead.firstName} ${matchedLead.lastName} at ${matchedLead.company}`);
  }

  // ==========================================
  // SCORING & DECISION
  // ==========================================
  const totalScore = professionalScore + personalScore;
  const dominantScore = Math.max(professionalScore, personalScore);
  const confidence = totalScore > 0 ? dominantScore / totalScore : 0;

  // High confidence threshold for auto-classification
  if (confidence >= 0.7 && totalScore >= 0.3) {
    const classification: ConversationClassification =
      professionalScore > personalScore ? "professional" : "personal";

    return {
      classification,
      confidence: Math.min(confidence, 0.95),
      reasons,
      method: "auto",
    };
  }

  // Below threshold — mark as unclassified for manual review
  return {
    classification: "unclassified",
    confidence,
    reasons: reasons.length > 0
      ? [...reasons, "Confidence below threshold — needs manual review"]
      : ["No clear indicators found — needs manual review"],
    method: "auto",
  };
}

/**
 * Batch classify multiple conversations
 */
export function classifyConversations(
  conversations: LinkedInConversation[],
  rules: LinkedInFilterRule[],
  existingLeads: Lead[]
): Map<string, ClassificationResult> {
  const results = new Map<string, ClassificationResult>();
  for (const conv of conversations) {
    results.set(conv.id, classifyConversation(conv, rules, existingLeads));
  }
  return results;
}
