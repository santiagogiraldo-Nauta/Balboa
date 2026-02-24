import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Generate recommended action based on signal
 */
export async function generateActionFromSignal(
  signalType: string,
  signalDescription: string,
  leadName: string,
  company: string,
  leadTier: string
): Promise<{
  actionType: string;
  actionDescription: string;
  actionUrgency: "immediate" | "high" | "medium" | "low";
  recommendedTiming: string;
  recommendedChannel: "email" | "linkedin";
}> {
  const prompt = `
You are a sales automation expert. Based on the following signal, generate a recommended action for an account executive to take.

Signal Type: ${signalType}
Signal Description: ${signalDescription}
Lead Name: ${leadName}
Company: ${company}
Lead Tier: ${leadTier}

Generate a JSON response with the following structure:
{
  "actionType": "send_email|send_linkedin_message|call|schedule_demo",
  "actionDescription": "Brief description of what the AE should do",
  "actionUrgency": "immediate|high|medium|low",
  "recommendedTiming": "within_24h|within_48h|this_week|next_week",
  "recommendedChannel": "email|linkedin"
}

Consider best practices for B2B sales outreach. Return ONLY valid JSON, no markdown.
`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      actionType: parsed.actionType || "send_email",
      actionDescription: parsed.actionDescription || "Follow up with lead",
      actionUrgency: parsed.actionUrgency || "medium",
      recommendedTiming: parsed.recommendedTiming || "within_48h",
      recommendedChannel: parsed.recommendedChannel || "email",
    };
  } catch (error) {
    console.error("Error generating action:", error);
    return {
      actionType: "send_email",
      actionDescription: "Follow up with lead",
      actionUrgency: "medium",
      recommendedTiming: "within_48h",
      recommendedChannel: "email",
    };
  }
}

/**
 * Signal type mapping to common actions
 */
export const signalToActionMap: Record<string, any> = {
  email_open: {
    actionType: "send_email",
    actionDescription: "Send follow-up email while lead is engaged",
    actionUrgency: "high",
    recommendedTiming: "within_24h",
    recommendedChannel: "email",
  },
  linkedin_view: {
    actionType: "send_linkedin_message",
    actionDescription: "Capitalize on profile view with personalized message",
    actionUrgency: "high",
    recommendedTiming: "within_6h",
    recommendedChannel: "linkedin",
  },
  linkedin_engagement: {
    actionType: "send_linkedin_message",
    actionDescription: "Reply to their engagement or send message",
    actionUrgency: "high",
    recommendedTiming: "within_24h",
    recommendedChannel: "linkedin",
  },
  hubspot_stage_change: {
    actionType: "call",
    actionDescription: "Schedule call to align on next steps",
    actionUrgency: "high",
    recommendedTiming: "within_48h",
    recommendedChannel: "email",
  },
  marketing_signal: {
    actionType: "send_email",
    actionDescription: "Reach out with relevant content based on signal",
    actionUrgency: "medium",
    recommendedTiming: "within_48h",
    recommendedChannel: "email",
  },
};

/**
 * Get quick action for a signal
 */
export function getQuickActionForSignal(signalType: string) {
  return signalToActionMap[signalType] || signalToActionMap.email_open;
}
