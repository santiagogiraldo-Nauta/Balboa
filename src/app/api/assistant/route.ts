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
    const selectedLeadId: string | null = body.selectedLeadId || null;

    // If no API key, use sandbox response
    if (!anthropic || !HAS_API_KEY) {
      const latestMessage = messages[messages.length - 1]?.content || "";
      const sandboxMessage = generateSandboxResponse(latestMessage, context);
      return NextResponse.json({ message: sandboxMessage, sandbox: true });
    }

    // ── Enrich context with server-side data from DB ──
    let enrichedContext = "";
    if (supabase && user) {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Build all queries in parallel for performance
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queries: PromiseLike<any>[] = [
          // [0] Email thread count
          supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("channel", "email"),
          // [1] Inbound pending (threads needing reply)
          supabase
            .from("conversations")
            .select("id, subject, lead_id, last_message_date")
            .eq("user_id", user.id)
            .eq("channel", "email")
            .eq("last_message_direction", "inbound")
            .not("lead_id", "is", null)
            .order("last_message_date", { ascending: false })
            .limit(10),
          // [2] Sent email count
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("channel", "email")
            .eq("direction", "outbound"),
          // [3] Received email count
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("channel", "email")
            .eq("direction", "inbound"),
          // [4] Messages today count
          supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("created_at", todayStart.toISOString()),
          // [5] Active signals (pending, last 15)
          supabase
            .from("signals_and_actions")
            .select("signal_type, signal_description, action_description, action_urgency, lead_id, recommended_channel, created_at")
            .eq("user_id", user.id)
            .eq("action_status", "pending")
            .order("created_at", { ascending: false })
            .limit(15),
          // [6] Lead notes — fetch leads with raw_data that has notes
          supabase
            .from("leads")
            .select("id, first_name, last_name, company, raw_data")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .limit(100),
        ];

        // [7] Selected lead messages (only if a lead is selected)
        if (selectedLeadId) {
          queries.push(
            supabase
              .from("messages")
              .select("created_at, direction, subject, body, channel")
              .eq("user_id", user.id)
              .eq("lead_id", selectedLeadId)
              .order("created_at", { ascending: false })
              .limit(10)
          );
          // [8] Selected lead raw_data for amplemarket
          queries.push(
            supabase
              .from("leads")
              .select("raw_data")
              .eq("user_id", user.id)
              .eq("id", selectedLeadId)
              .single()
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = await Promise.all(queries) as Array<{ data?: any; count?: number | null; error?: unknown }>;

        const convResult = results[0];
        const inboundPending = results[1];
        const sentCount = results[2];
        const receivedCount = results[3];
        const todayMessages = results[4];
        const signalsResult = results[5];
        const leadsWithNotes = results[6];
        const selectedLeadMessages = selectedLeadId ? results[7] : null;
        const selectedLeadRaw = selectedLeadId ? results[8] : null;

        // ── A. EMAIL ACTIVITY SUMMARY ──
        const totalThreads = convResult.count || 0;
        const sent = sentCount.count || 0;
        const received = receivedCount.count || 0;
        const msgToday = todayMessages.count || 0;
        const pendingReplies = (inboundPending.data || []) as Array<{ subject?: string; last_message_date?: string }>;
        const responseRate = sent > 0 ? Math.round((received / sent) * 100) : 0;

        if (totalThreads > 0 || sent > 0) {
          enrichedContext += `\n## EMAIL ACTIVITY SUMMARY
- ${totalThreads} email threads synced
- ${sent} sent, ${received} received (${responseRate}% response rate)
- ${msgToday} messages today
- ${pendingReplies.length} threads awaiting your reply
${pendingReplies.length > 0 ? pendingReplies.slice(0, 5).map(
  (t) => `  - "${t.subject || "(no subject)"}" (${t.last_message_date ? new Date(t.last_message_date).toLocaleDateString() : "unknown"})`
).join("\n") : ""}
`;
        }

        // ── B. SELECTED LEAD EMAIL HISTORY ──
        if (selectedLeadId && selectedLeadMessages?.data) {
          const msgs = selectedLeadMessages.data as Array<{
            created_at: string;
            direction: string;
            subject: string | null;
            body: string;
            channel: string;
          }>;
          if (msgs.length > 0) {
            enrichedContext += `\n## SELECTED LEAD EMAIL HISTORY (last ${msgs.length} messages)\n`;
            msgs.forEach((m) => {
              const date = new Date(m.created_at).toLocaleDateString();
              const dir = m.direction === "outbound" ? "SENT" : "RECEIVED";
              const subj = m.subject ? `"${m.subject}"` : "(no subject)";
              const bodyTrunc = (m.body || "").replace(/\n/g, " ").slice(0, 200);
              enrichedContext += `- [${date}] ${dir} via ${m.channel} | ${subj} | ${bodyTrunc}${(m.body || "").length > 200 ? "..." : ""}\n`;
            });
          }
        }

        // ── C. LEAD NOTES ──
        if (leadsWithNotes?.data) {
          const allLeads = leadsWithNotes.data as Array<{
            id: string;
            first_name: string;
            last_name: string;
            company: string;
            raw_data?: Record<string, unknown>;
          }>;
          const leadsWithActualNotes = allLeads
            .filter((l) => l.raw_data?.notes && typeof l.raw_data.notes === "string" && (l.raw_data.notes as string).trim().length > 0)
            .slice(0, 20);

          if (leadsWithActualNotes.length > 0) {
            enrichedContext += `\n## LEAD NOTES (${leadsWithActualNotes.length} leads with notes)\n`;
            leadsWithActualNotes.forEach((l) => {
              const note = ((l.raw_data?.notes as string) || "").replace(/\n/g, " ").slice(0, 100);
              enrichedContext += `- ${l.first_name} ${l.last_name} @ ${l.company}: ${note}${((l.raw_data?.notes as string) || "").length > 100 ? "..." : ""}\n`;
            });
          }
        }

        // ── D. ACTIVE SIGNALS ──
        if (signalsResult?.data) {
          const signals = signalsResult.data as Array<{
            signal_type: string;
            signal_description: string | null;
            action_description: string | null;
            action_urgency: string | null;
            lead_id: string | null;
            recommended_channel: string | null;
            created_at: string;
          }>;
          if (signals.length > 0) {
            // Cross-reference lead names from the leads data we already fetched
            const leadMap = new Map<string, string>();
            if (leadsWithNotes?.data) {
              (leadsWithNotes.data as Array<{ id: string; first_name: string; last_name: string; company: string }>)
                .forEach((l) => leadMap.set(l.id, `${l.first_name} ${l.last_name}`));
            }

            enrichedContext += `\n## ACTIVE SIGNALS (${signals.length} pending)\n`;
            signals.slice(0, 10).forEach((s) => {
              const leadName = s.lead_id ? (leadMap.get(s.lead_id) || "Unknown") : "General";
              const urgency = s.action_urgency || "medium";
              const action = (s.action_description || s.signal_description || "").slice(0, 120);
              enrichedContext += `- [${urgency.toUpperCase()}] ${s.signal_type} — ${leadName}: ${action}\n`;
            });
          }
        }

        // ── E. AMPLEMARKET DATA FOR SELECTED LEAD ──
        if (selectedLeadId && selectedLeadRaw?.data) {
          const rawData = (selectedLeadRaw.data as { raw_data?: Record<string, unknown> })?.raw_data;
          if (rawData?.amplemarket) {
            const amp = rawData.amplemarket as Record<string, unknown>;
            enrichedContext += `\n## AMPLEMARKET DATA (selected lead)\n`;
            if (amp.company_enrichment) {
              const ce = amp.company_enrichment as Record<string, unknown>;
              const parts: string[] = [];
              if (ce.industry) parts.push(`Industry: ${ce.industry}`);
              if (ce.employee_count) parts.push(`Employees: ${ce.employee_count}`);
              if (ce.revenue) parts.push(`Revenue: ${ce.revenue}`);
              if (ce.founded) parts.push(`Founded: ${ce.founded}`);
              if (ce.headquarters) parts.push(`HQ: ${ce.headquarters}`);
              if (parts.length > 0) enrichedContext += `- Company: ${parts.join(", ")}\n`;
            }
            if (amp.sequence_enrollment) {
              const se = amp.sequence_enrollment as Record<string, unknown>;
              const seqParts: string[] = [];
              if (se.sequence_name) seqParts.push(`Sequence: ${se.sequence_name}`);
              if (se.status) seqParts.push(`Status: ${se.status}`);
              if (se.current_step) seqParts.push(`Step: ${se.current_step}`);
              if (seqParts.length > 0) enrichedContext += `- Enrollment: ${seqParts.join(", ")}\n`;
            }
            if (amp.call_transcription) {
              const ct = String(amp.call_transcription).replace(/\n/g, " ").slice(0, 300);
              enrichedContext += `- Call highlights: ${ct}${String(amp.call_transcription).length > 300 ? "..." : ""}\n`;
            }
          }
        }

      } catch (err) {
        console.error("[assistant] Error fetching enriched context:", err);
      }
    }

    const systemPrompt = `You are Vasco, the AI sales navigator inside the Balboa platform. Named after Vasco Nunez de Balboa — the explorer who crossed uncharted jungle to discover the Pacific Ocean. Like your namesake, you chart the path forward through complex territory.

You have complete real-time access to the user's sales pipeline, leads, deals, accounts, email activity, signals, and conversation history.

${context}
${enrichedContext}

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
