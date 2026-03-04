import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase/auth-check";
import { trackEvent } from "@/lib/tracking";

const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;
const anthropic = HAS_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ── Sandbox fallback when API key isn't available ──

function generateSandboxResponse(
  latestMessage: string,
  context: string
): string {
  const msg = latestMessage.toLowerCase();

  // Extract pipeline numbers from context
  const totalMatch = context.match(/Total leads: (\d+)/);
  const hotMatch = context.match(/Hot leads: (\d+)/);
  const warmMatch = context.match(/Warm leads: (\d+)/);
  const draftsMatch = context.match(/Pending drafts.*?(\d+)/);
  const followupMatch = context.match(/Leads needing follow-up: (\d+)/);
  const dealsMatch = context.match(/Active deals: (\d+)/);
  const pipelineMatch = context.match(/Total pipeline value: \$([^\n]+)/);

  const total = totalMatch?.[1] || "15";
  const hot = hotMatch?.[1] || "6";
  const warm = warmMatch?.[1] || "5";
  const drafts = draftsMatch?.[1] || "4";
  const followups = followupMatch?.[1] || "3";
  const activeDeals = dealsMatch?.[1] || "3";
  const pipelineValue = pipelineMatch?.[1] || "450,000";

  // Extract hot lead names from context
  const hotLeadLines = context.match(/## HOT LEADS[\s\S]*?(?=##|$)/)?.[0] || "";
  const leadNames = hotLeadLines
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .slice(0, 3)
    .map((l) => {
      const nameMatch = l.match(/- (.+?) @/);
      return nameMatch?.[1] || "Lead";
    });

  // Priority / action plan
  if (msg.includes("priorit") || msg.includes("action plan") || msg.includes("this week")) {
    return `Here's your action plan:

**Respond first** (${drafts} pending drafts):
${leadNames.slice(0, 2).map((n) => `- ${n} — has a positive reply waiting. Don't let this go cold.`).join("\n")}

**Follow up today** (${followups} overdue):
- Leads that haven't heard from you in 5+ days are cooling off. Block 30 minutes to send personalized follow-ups.

**Pipeline hygiene**:
- ${hot} hot leads, ${warm} warm — focus energy on converting hot to meetings this week.
- ${activeDeals} active deals worth $${pipelineValue} in pipeline.

**Quick wins**:
- Review and send your ${drafts} pending draft messages.
- Check LinkedIn queue for connection requests to accept.

Start with the drafts — they're the fastest path to a reply.`;
  }

  // Pipeline overview
  if (msg.includes("pipeline") || msg.includes("how is") || msg.includes("how's")) {
    return `**Pipeline snapshot:**

- **${total} leads** in play — ${hot} hot, ${warm} warm
- **${activeDeals} active deals** worth **$${pipelineValue}**
- **${drafts} drafts** ready to send
- **${followups} leads** need follow-up (5+ days cold)

Your hot leads are your highest-leverage plays right now. ${parseInt(drafts) > 0 ? `You also have ${drafts} draft messages sitting unsent — quick wins waiting.` : "Pipeline is moving."}`;
  }

  // Deals at risk
  if (msg.includes("deals") && (msg.includes("risk") || msg.includes("at risk"))) {
    return `Looking at your ${activeDeals} active deals worth $${pipelineValue}:

**Watch closely:**
- Any deal without activity in the last 7 days is at risk of stalling.
- Check for multi-threading — if you're single-threaded with one contact, that's a risk factor.

**Next move:** Review each deal's last touchpoint. If it's been more than a week, send a value-add (case study, industry data, or a direct question about timeline).`;
  }

  // Outreach / draft
  if (msg.includes("outreach") || msg.includes("draft") || msg.includes("hottest")) {
    return `Your hottest leads right now:

${leadNames.map((n, i) => `${i + 1}. **${n}** — high ICP score, engaged recently.`).join("\n")}

${parseInt(drafts) > 0 ? `You have **${drafts} draft messages** ready — review and send those first for the fastest ROI.` : "Consider drafting personalized outreach for your top 3 hot leads."}

**Channel tip:** LinkedIn DMs get 3x the response rate for first touch. Email works better for follow-ups with value attachments.`;
  }

  // What's working
  if (msg.includes("working") || msg.includes("best")) {
    return `Based on your pipeline patterns:

**What's converting:**
- Leads with LinkedIn + email multi-channel outreach convert higher than single-channel.
- Personalized messages with company-specific pain points outperform generic templates.
- Follow-up within 48 hours of a positive signal doubles meeting rates.

**Your numbers:**
- ${hot} hot leads suggest your targeting is solid.
- ${followups} needing follow-up — this is where you're leaving value on the table.

**Action:** Prioritize the ${followups} overdue follow-ups. Each one is a lead that already showed interest.`;
  }

  // Default / generic
  return `I'm looking at your pipeline: **${total} leads** (${hot} hot, ${warm} warm), **${activeDeals} deals** worth **$${pipelineValue}**, and **${drafts} drafts** to review.

What would be most helpful right now?
- "Who should I prioritize today?"
- "Which deals are at risk?"
- "Draft an outreach for my hottest lead"
- "Give me my action plan for this week"

Just ask — I have full context on every lead, deal, and touchpoint.`;
}

// ── Main route ──

export async function POST(req: NextRequest) {
  // Parse body and auth up front so they're available in catch block
  let messages: { role: string; content: string }[] = [];
  let context = "";

  try {
    const { user, supabase, error: authError } = await getAuthUser();
    if (authError) return authError;

    const body = await req.json();
    messages = body.messages || [];
    context = body.context || "";

    // If no API key, use sandbox response
    if (!anthropic || !HAS_API_KEY) {
      const latestMessage = messages[messages.length - 1]?.content || "";
      const sandboxMessage = generateSandboxResponse(latestMessage, context);
      return NextResponse.json({ message: sandboxMessage, sandbox: true });
    }

    // Enrich context with email activity data from DB
    let emailContext = "";
    if (supabase && user) {
      try {
        const [convResult, inboundPending, sentCount, receivedCount] = await Promise.all([
          supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("channel", "email"),
          supabase
            .from("conversations")
            .select("id, subject, lead_id, last_message_date")
            .eq("user_id", user.id)
            .eq("channel", "email")
            .eq("last_message_direction", "inbound")
            .not("lead_id", "is", null)
            .order("last_message_date", { ascending: false })
            .limit(10),
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("channel", "email")
            .eq("direction", "outbound"),
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("channel", "email")
            .eq("direction", "inbound"),
        ]);

        const totalThreads = convResult.count || 0;
        const sent = sentCount.count || 0;
        const received = receivedCount.count || 0;
        const pendingReplies = inboundPending.data || [];

        if (totalThreads > 0) {
          emailContext = `\n## EMAIL ACTIVITY
- ${totalThreads} email threads synced from Gmail
- ${sent} emails sent, ${received} received
- ${pendingReplies.length} threads with unanswered inbound messages (needs reply)
${pendingReplies.length > 0 ? `- Threads needing reply:\n${pendingReplies.slice(0, 5).map(
  (t) => `  - "${t.subject}" (last message: ${t.last_message_date ? new Date(t.last_message_date as string).toLocaleDateString() : "unknown"})`
).join("\n")}` : ""}
`;
        }
      } catch (err) {
        console.error("[assistant] Error fetching email context:", err);
      }
    }

    const systemPrompt = `You are Vasco, the AI sales navigator inside the Balboa platform. Named after Vasco Nunez de Balboa — the explorer who crossed uncharted jungle to discover the Pacific Ocean. Like your namesake, you chart the path forward through complex territory.

You have complete real-time access to the user's sales pipeline, leads, deals, accounts, and email activity.

${context}
${emailContext}

## YOUR PERSONALITY
- Direct, confident, no fluff — like a seasoned navigator who knows the terrain
- Use data to back every recommendation
- Proactive — don't just answer, suggest the next move
- Brief but sharp. Every word earns its place.

## YOUR CAPABILITIES
1. **Pipeline Navigation** — "Who should I prioritize?" "Where are the risks?"
2. **Lead Intelligence** — Deep context on any lead, company, or stakeholder
3. **Outreach Strategy** — Draft messages, suggest channels, optimize timing
4. **Deal Strategy** — Risk assessment, next steps, stakeholder mapping
5. **Playbook Insights** — What's working, conversion patterns, best practices
6. **Action Planning** — Daily priorities, weekly action plans, follow-up reminders
7. **Sales Coaching** — Objection handling, negotiation tactics, industry intel

## RESPONSE FORMAT
- Lead with the insight or recommendation, not the data
- Use bullet points for action items
- Include specific lead/deal names when discussing pipeline
- When suggesting actions on leads, use: [ACTION:lead_id:action_type]
  Valid actions: [ACTION:lead-123:view], [ACTION:lead-123:send_email], [ACTION:lead-123:send_linkedin]
- Keep it concise. If they want more detail, they'll ask.
- Never repeat raw data back — interpret, analyze, recommend.`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Track event (fire-and-forget)
    if (user && supabase) {
      trackEvent(supabase, user.id, {
        eventCategory: "analysis",
        eventAction: "research_query",
        metadata: {
          source: "assistant",
          messageCount: messages.length,
        },
        source: "api",
      });
    }

    return NextResponse.json({ message: assistantMessage });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Assistant API error:", errMsg);

    // Graceful fallback: use sandbox response with whatever context we have
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1]?.content || "";
      const sandboxMessage = generateSandboxResponse(latestMessage, context);
      return NextResponse.json({ message: sandboxMessage, sandbox: true });
    }

    return NextResponse.json(
      {
        message: `I couldn't connect right now. Try asking me again in a moment.`,
        error: true,
      },
      { status: 500 }
    );
  }
}
