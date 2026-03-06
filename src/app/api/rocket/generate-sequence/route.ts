import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth-check";
import Anthropic from "@anthropic-ai/sdk";
import {
  PERSONA_OPENERS,
  SEQUENCE_TEMPLATE_13_TOUCH,
  ANTI_AI_RULES,
  BANNED_WORDS,
  PREFERRED_WORDS,
  COMPETITIVE_RESPONSES,
  DISCOVERY_QUESTIONS,
  SENIORITY_BUCKETS,
} from "@/lib/rocket-constants";
import type { PersonaType, RocketSegment, CompanyResearch, SequenceTouch } from "@/lib/types";

/**
 * POST /api/rocket/generate-sequence
 *
 * Generates a full 13-touch outreach sequence for a segment using AI.
 * Enforces anti-AI detection rules, angle rotation, and brand voice.
 *
 * Body: { segment: RocketSegment, companyResearch: CompanyResearch[], personaType: PersonaType }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const segment: RocketSegment = body.segment;
    const companyResearch: CompanyResearch[] = body.companyResearch || [];
    const personaType: PersonaType = body.personaType || "vp-procurement";

    if (!segment) {
      return NextResponse.json({ error: "Segment required" }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({
        error: "ANTHROPIC_API_KEY not configured",
        sequence: [],
      }, { status: 200 });
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const persona = PERSONA_OPENERS[personaType];
    const seniority = SENIORITY_BUCKETS[segment.seniority];

    // Build research context
    const researchContext = companyResearch.length > 0
      ? companyResearch.map((r) => {
          const parts = [`Company: ${r.companyName}`];
          if (r.assignedSP) parts.push(`Strategic Priority: ${r.assignedSP}`);
          if (r.assignedBC) parts.push(`Business Challenge: ${r.assignedBC}`);
          if (r.spReasoning) parts.push(`SP Context: ${r.spReasoning}`);
          if (r.bcReasoning) parts.push(`BC Context: ${r.bcReasoning}`);
          if (r.signals.length) parts.push(`Signals: ${r.signals.join(", ")}`);
          return parts.join("\n");
        }).join("\n\n")
      : "No specific company research available. Use general supply chain distribution context.";

    // Build the sequence template description
    const touchTemplate = SEQUENCE_TEMPLATE_13_TOUCH.map((t) =>
      `Touch ${t.touchNumber} (Day ${t.dayOffset}, ${t.channel}): ${t.label}`
    ).join("\n");

    // Build discovery questions for call scripts
    const discoveryQs = DISCOVERY_QUESTIONS.map((q) =>
      `Q: ${q.question}\nListen for: ${q.listenFor}`
    ).join("\n\n");

    // Competitive positioning
    const competitiveContext = Object.values(COMPETITIVE_RESPONSES)
      .map((c) => `${c.name}: ${c.response}`)
      .join("\n\n");

    const prompt = `You are a senior B2B sales copywriter for Nauta, a supply chain automation platform for wholesale distributors.

Generate a complete 13-touch outreach sequence for this segment.

SEGMENT: ${segment.segmentKey}
PERSONA: ${persona?.label || personaType}
SENIORITY: ${seniority?.label || segment.seniority}
TONE: ${seniority?.tone || "Professional and direct"}

PERSONA OPENER (use as inspiration, don't copy):
"${persona?.opener || ""}"

CAPABILITIES TO REFERENCE (rotate across touches):
${persona?.capabilities?.join(", ") || "Supply chain automation, inventory optimization, procurement intelligence"}

ROI ANGLE: ${persona?.roiAngle || "Significant operational cost savings"}
ROLE: ${persona?.role || "Decision maker"}

COMPANY RESEARCH:
${researchContext}

SEQUENCE STRUCTURE (must follow exactly):
${touchTemplate}

ANTI-AI DETECTION RULES (CRITICAL - follow strictly):
- Email subjects: Maximum ${ANTI_AI_RULES.subjectMaxWords} words, lowercase unless grammar requires
- First email: Maximum ${ANTI_AI_RULES.email1MaxWords} words
- Follow-up emails: Maximum ${ANTI_AI_RULES.followUpMaxWords} words
- Call scripts: Maximum ${ANTI_AI_RULES.callScriptMaxWords} words
- ${ANTI_AI_RULES.openingLine}
- ${ANTI_AI_RULES.paragraphs}
- Sign off: ${ANTI_AI_RULES.signOff}
- Language rules:
${ANTI_AI_RULES.languageRules.map((r) => `  * ${r}`).join("\n")}

BANNED WORDS (never use): ${BANNED_WORDS.join(", ")}

PREFERRED WORDS (use naturally): ${PREFERRED_WORDS.join(", ")}

ANGLE ROTATION RULE: Each touch must reference a DIFFERENT capability/research field. Never repeat the same angle in consecutive touches.

DISCOVERY QUESTIONS (for call scripts):
${discoveryQs}

COMPETITIVE POSITIONING (reference when relevant):
${competitiveContext}

Generate the sequence as JSON:
{
  "sequence": [
    {
      "touchNumber": 1,
      "channel": "email",
      "dayOffset": 1,
      "label": "Cold Email",
      "subject": "supply chain question",
      "body": "...",
      "researchFieldUsed": "fillRate",
      "variant": "A"
    },
    {
      "touchNumber": 2,
      "channel": "call",
      "dayOffset": 2,
      "label": "Call #1",
      "body": "...",
      "callScript": "...",
      "researchFieldUsed": "supplierScoring"
    }
  ]
}

Also generate variant B for email subjects and opening lines:
{
  "variants": {
    "1": { "subject": "alt subject", "openingLine": "alt opening..." },
    "3": { "subject": "alt subject", "openingLine": "alt opening..." }
  }
}

Return both in a single JSON response.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    let sequence: SequenceTouch[] = [];

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const rawSequence = parsed.sequence || [];

        sequence = rawSequence.map((touch: Record<string, unknown>) => ({
          touchNumber: touch.touchNumber as number,
          channel: touch.channel as "email" | "call" | "linkedin",
          dayOffset: touch.dayOffset as number,
          label: (touch.label as string) || SEQUENCE_TEMPLATE_13_TOUCH[(touch.touchNumber as number) - 1]?.label || "",
          subject: (touch.subject as string) || undefined,
          body: (touch.body as string) || "",
          callScript: (touch.callScript as string) || undefined,
          researchFieldUsed: (touch.researchFieldUsed as string) || "",
          variant: (touch.variant as "A" | "B") || undefined,
        }));

        // Validate against anti-AI rules
        for (const touch of sequence) {
          if (touch.channel === "email") {
            // Check subject word count
            if (touch.subject && touch.subject.split(/\s+/).length > ANTI_AI_RULES.subjectMaxWords) {
              touch.subject = touch.subject.split(/\s+/).slice(0, ANTI_AI_RULES.subjectMaxWords).join(" ");
            }

            // Check for banned words
            for (const banned of BANNED_WORDS) {
              if (touch.body.toLowerCase().includes(banned.toLowerCase())) {
                console.warn(`[Sequence Gen] Banned word "${banned}" found in touch ${touch.touchNumber}`);
              }
            }
          }
        }
      } catch (parseErr) {
        console.error("[Sequence Gen] Parse error:", parseErr);
      }
    }

    // If parsing failed, generate fallback from template
    if (sequence.length === 0) {
      sequence = SEQUENCE_TEMPLATE_13_TOUCH.map((t) => ({
        touchNumber: t.touchNumber,
        channel: t.channel,
        dayOffset: t.dayOffset,
        label: t.label,
        subject: t.channel === "email" ? "quick question" : undefined,
        body: t.channel === "email"
          ? `Hi [Name],\n\n${persona?.opener || "Quick question about your supply chain operations."}\n\nBest,\n[Your Name]`
          : t.channel === "call"
          ? DISCOVERY_QUESTIONS[Math.min(t.touchNumber - 1, DISCOVERY_QUESTIONS.length - 1)]?.question || "Follow up on previous outreach."
          : `Hi [Name], I came across your work at [Company] and thought there might be a connection worth exploring around supply chain operations. Open to connecting?`,
        callScript: t.channel === "call"
          ? DISCOVERY_QUESTIONS[Math.min(t.touchNumber - 1, DISCOVERY_QUESTIONS.length - 1)]?.question
          : undefined,
        researchFieldUsed: persona?.capabilities?.[t.touchNumber % persona.capabilities.length] || "general",
      }));
    }

    return NextResponse.json({
      success: true,
      sequence,
      touchCount: sequence.length,
      segmentKey: segment.segmentKey,
    });
  } catch (err) {
    console.error("[Sequence Gen] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sequence generation failed" },
      { status: 500 }
    );
  }
}
