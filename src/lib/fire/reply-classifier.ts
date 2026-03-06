// ============================================================
// Balboa Fire — Reply Classifier
// Two-tier classification: rule-based (free, ~70%) + Claude AI (~30%)
// Classifies inbound replies into actionable intent categories.
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { insertReplyClassification } from "./db-fire";
import type {
  ClassificationResult,
  ReplyClassificationType,
  ObjectionSubType,
} from "./types";

// ─── Tier 1: Rule-Based Classification ───────────────────────
// Pattern matching handles clear-cut cases with high confidence.
// Ordered by specificity — first match wins.

interface ClassificationRule {
  classification: ReplyClassificationType;
  patterns: RegExp[];
  confidence: number;
  subClassification?: ObjectionSubType;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  // Auto-reply detection (highest priority — these aren't real replies)
  {
    classification: "auto_reply",
    patterns: [
      /out of (the )?office/i,
      /automatic reply/i,
      /auto[- ]?reply/i,
      /on (vacation|leave|holiday|PTO)/i,
      /currently (away|unavailable|out)/i,
      /will (respond|reply|get back) (to you )?(when|upon|after)/i,
      /limited access to email/i,
      /this is an automated/i,
      /do not reply to this/i,
      /no[- ]?reply/i,
    ],
    confidence: 0.95,
  },

  // Unsubscribe (must act immediately — legal requirement)
  {
    classification: "unsubscribe",
    patterns: [
      /unsubscribe/i,
      /remove me/i,
      /stop (emailing|contacting|sending|messaging)/i,
      /do not (contact|email|message)/i,
      /take me off/i,
      /opt[- ]?out/i,
      /don'?t (want|need) (any )?(more )?(emails|messages)/i,
      /no longer interested/i,
      /please (stop|remove|delete)/i,
    ],
    confidence: 0.95,
  },

  // Wrong person
  {
    classification: "wrong_person",
    patterns: [
      /wrong person/i,
      /no longer (at|with|work)/i,
      /left (the |this )?(company|organization|firm|team)/i,
      /not (the right|the correct|your) (person|contact)/i,
      /doesn'?t work here/i,
      /moved (on|to another)/i,
      /retired/i,
      /no longer (in|handle|manage|responsible)/i,
    ],
    confidence: 0.85,
  },

  // Referral (they're pointing us to someone else)
  {
    classification: "referral",
    patterns: [
      /reach out to/i,
      /speak with/i,
      /contact .{1,40} instead/i,
      /copied .{1,30} (on|in)/i,
      /cc'?d .{1,30}/i,
      /looping in/i,
      /adding .{1,30} (to|from)/i,
      /better person .{1,20} (is|would be)/i,
      /forward(ed|ing)? (this|your|it) to/i,
      /you should (talk|speak|connect) (to|with)/i,
    ],
    confidence: 0.75,
  },

  // Interested (positive buying signals)
  {
    classification: "interested",
    patterns: [
      /let'?s (chat|talk|meet|connect|discuss|schedule|set up)/i,
      /sounds (great|good|interesting|promising)/i,
      /i'?d (love|like) to (learn|hear|know|discuss|chat|talk)/i,
      /schedule (a |an )?(call|meeting|demo|time)/i,
      /free (this|next) (week|monday|tuesday|wednesday|thursday|friday)/i,
      /what (time|day|date) works/i,
      /send (me |us )?(more |some )?(info|information|details|a deck)/i,
      /tell me more/i,
      /when can we/i,
      /book (a |some )?time/i,
      /calendar link/i,
      /availab(le|ility)/i,
      /yes[,.]? (please|let'?s|i'?d|absolutely|definitely)/i,
    ],
    confidence: 0.80,
  },

  // Not now (timing objection — they're interested but not ready)
  {
    classification: "not_now",
    patterns: [
      /not (right now|at this time|currently|a good time)/i,
      /maybe (later|next quarter|in a few|down the road)/i,
      /check back (in|around|later|next)/i,
      /reach out (again )?(in|next|later|after)/i,
      /revisit (this|it) (in|next|later)/i,
      /not (a |our )?priority (right now|at the moment|currently)/i,
      /busy (right now|this quarter|at the moment)/i,
      /come back (to|in)/i,
      /circle back/i,
      /table(d)? (this|it) for now/i,
    ],
    confidence: 0.80,
  },

  // Objection — price
  {
    classification: "objection",
    subClassification: "price",
    patterns: [
      /too (expensive|costly|pricey|much)/i,
      /(price|cost|budget|pricing) (is |seems )?(too |very )?(high|steep|prohibitive)/i,
      /can'?t (afford|justify)/i,
      /out of (our |my )?(budget|price range)/i,
      /no budget/i,
      /cheaper (option|alternative)/i,
    ],
    confidence: 0.75,
  },

  // Objection — timing
  {
    classification: "objection",
    subClassification: "timing",
    patterns: [
      /bad timing/i,
      /middle of (a |an )/i,
      /already (committed|signed|locked|invested)/i,
      /just (signed|renewed|purchased|bought)/i,
      /contract (until|through|ends)/i,
      /renew(al|ing)? (is|in|comes)/i,
    ],
    confidence: 0.75,
  },

  // Objection — authority
  {
    classification: "objection",
    subClassification: "authority",
    patterns: [
      /not (my|the) (decision|call|responsibility)/i,
      /need to (check|ask|run it by|get approval)/i,
      /above my (pay grade|level)/i,
      /someone else (handles|decides|manages)/i,
      /i don'?t (handle|manage|decide)/i,
      /(boss|manager|director|VP|CEO) (would need|has to|decides)/i,
    ],
    confidence: 0.75,
  },

  // Objection — need
  {
    classification: "objection",
    subClassification: "need",
    patterns: [
      /don'?t (need|see the need|have a need)/i,
      /not (looking|searching|in the market)/i,
      /happy with (what|our current|existing)/i,
      /already (have|use|using)/i,
      /no (need|interest|use)/i,
      /not relevant/i,
      /doesn'?t (apply|fit|work for)/i,
    ],
    confidence: 0.75,
  },
];

/**
 * Tier 1: Rule-based classification.
 * Returns classification if a high-confidence match is found.
 */
function classifyByRules(
  subject: string,
  bodyPreview: string
): ClassificationResult | null {
  const text = `${subject} ${bodyPreview}`.trim();
  if (!text) return null;

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return {
          classification: rule.classification,
          confidence: rule.confidence,
          subClassification: rule.subClassification,
          classifiedBy: "rules",
        };
      }
    }
  }

  return null;
}

// ─── Tier 2: Claude AI Classification ────────────────────────
// Only called when rule-based classification fails or confidence is low.

async function classifyByAI(
  subject: string,
  bodyPreview: string
): Promise<ClassificationResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[reply-classifier] No ANTHROPIC_API_KEY — skipping AI classification");
    return null;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: `You are a sales email reply classifier. Classify the intent of this inbound reply into exactly one category. Respond with ONLY a JSON object, no other text.

Categories:
- interested: wants to meet, learn more, or engage
- objection: has a specific pushback (sub: price, timing, authority, need)
- not_now: interested but timing is wrong, wants to revisit later
- wrong_person: no longer at company or wrong contact
- auto_reply: out of office or automated response
- referral: pointing to someone else as the right contact
- unsubscribe: wants to stop receiving messages

Response format: {"classification":"<category>","confidence":<0.0-1.0>,"sub_classification":"<if objection>"}`,
        messages: [
          {
            role: "user",
            content: `Subject: ${subject}\n\nBody: ${bodyPreview}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("[reply-classifier] Claude API error:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) return null;

    const parsed = JSON.parse(content);

    return {
      classification: parsed.classification as ReplyClassificationType,
      confidence: Math.min(parsed.confidence || 0.7, 1.0),
      subClassification: parsed.sub_classification as ObjectionSubType | undefined,
      classifiedBy: "ai",
    };
  } catch (error) {
    console.error("[reply-classifier] AI classification error:", error);
    return null;
  }
}

// ─── Main Classification Function ────────────────────────────

/**
 * Classify an inbound reply using two-tier approach:
 * 1. Rule-based (instant, free) — if confidence >= 0.75, use it
 * 2. Claude AI (slower, paid) — only when rules fail or message is complex
 *
 * Returns classification result and stores it in reply_classifications table.
 */
export async function classifyReply(
  supabase: SupabaseClient,
  params: {
    userId: string;
    leadId?: string;
    touchpointEventId?: string;
    subject: string;
    bodyPreview: string;
  }
): Promise<ClassificationResult | null> {
  const { userId, leadId, touchpointEventId, subject, bodyPreview } = params;

  // Tier 1: Try rule-based first
  let result = classifyByRules(subject, bodyPreview);

  // Tier 2: Fall back to AI if rules didn't match or confidence is low
  const needsAI = !result ||
    result.confidence < 0.75 ||
    (bodyPreview && bodyPreview.length > 200);

  if (needsAI) {
    const aiResult = await classifyByAI(subject, bodyPreview);
    if (aiResult) {
      // Use AI result if rules didn't match, or if AI has higher confidence
      if (!result || aiResult.confidence > result.confidence) {
        result = aiResult;
      }
    }
  }

  // If we still have no result, default to a low-confidence neutral classification
  if (!result) {
    result = {
      classification: "interested", // err on the side of engagement
      confidence: 0.3,
      classifiedBy: "rules",
    };
  }

  // Determine routed action based on classification
  result.routedAction = getRoutedAction(result.classification, result.subClassification);

  // Store in database
  await insertReplyClassification(supabase, {
    user_id: userId,
    lead_id: leadId || null,
    touchpoint_event_id: touchpointEventId || null,
    classification: result.classification,
    confidence: result.confidence,
    sub_classification: result.subClassification || null,
    email_subject: subject || null,
    email_body_preview: bodyPreview?.slice(0, 500) || null,
    routed_action: result.routedAction || null,
    fire_action_id: null, // filled later when fire_action is created
    classified_by: result.classifiedBy,
  });

  console.log(
    `[reply-classifier] ${result.classifiedBy}: ${result.classification} ` +
    `(${(result.confidence * 100).toFixed(0)}%)` +
    `${result.subClassification ? ` [${result.subClassification}]` : ""}` +
    ` → ${result.routedAction}`
  );

  return result;
}

// ─── Action Routing ──────────────────────────────────────────

function getRoutedAction(
  classification: ReplyClassificationType,
  subClassification?: ObjectionSubType
): string {
  switch (classification) {
    case "interested":
      return "send_calendar_link";
    case "objection":
      return `counter_email_${subClassification || "general"}`;
    case "not_now":
      return "snooze_90_days";
    case "wrong_person":
      return "ask_for_referral";
    case "auto_reply":
      return "wait_for_real_reply";
    case "referral":
      return "add_referral_contact";
    case "unsubscribe":
      return "pause_and_mark";
    default:
      return "manual_review";
  }
}
