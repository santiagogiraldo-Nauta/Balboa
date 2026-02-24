import type { Lead, Deal, Account } from "./types";

export function buildAssistantContext(data: {
  leads: Lead[];
  deals: Deal[];
  accounts: Account[];
  selectedLead?: Lead | null;
  currentSection?: string;
}): string {
  // Build pipeline summary
  const hotLeads = data.leads.filter((l) => l.icpScore?.tier === "hot");
  const warmLeads = data.leads.filter((l) => l.icpScore?.tier === "warm");
  const pendingDrafts = data.leads.reduce(
    (acc, l) => acc + l.draftMessages.filter((d) => d.status === "draft").length,
    0
  );
  const needsFollowup = data.leads.filter((l) => {
    const lastTouch = l.touchpointTimeline?.[l.touchpointTimeline.length - 1];
    if (!lastTouch) return false;
    const daysSince = Math.floor(
      (Date.now() - new Date(lastTouch.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSince > 5 && l.contactStatus !== "positive";
  });

  let context = `## CURRENT PIPELINE STATE
- Total leads: ${data.leads.length}
- Hot leads: ${hotLeads.length}
- Warm leads: ${warmLeads.length}
- Pending drafts to review: ${pendingDrafts}
- Leads needing follow-up: ${needsFollowup.length}
- Active deals: ${data.deals.filter((d) => d.dealStage !== "closed_won" && d.dealStage !== "closed_lost").length}
- Total pipeline value: $${data.deals.reduce((acc, d) => acc + (d.amount || 0), 0).toLocaleString()}
`;

  // Add hot leads detail
  if (hotLeads.length > 0) {
    context += `\n## HOT LEADS (${hotLeads.length})\n`;
    hotLeads.slice(0, 10).forEach((l) => {
      const lastAction =
        l.touchpointTimeline?.[l.touchpointTimeline.length - 1];
      const daysSince = lastAction
        ? Math.floor(
            (Date.now() - new Date(lastAction.date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null;
      context += `- ${l.firstName} ${l.lastName} @ ${l.company} (${l.position}) — Score: ${l.icpScore?.overall || 0}, Status: ${l.status}, Contact: ${l.contactStatus}${daysSince !== null ? `, Last touch: ${daysSince}d ago` : ""}\n`;
    });
  }

  // Add deals detail
  if (data.deals.length > 0) {
    context += `\n## DEALS (${data.deals.length})\n`;
    data.deals.forEach((d) => {
      context += `- ${d.dealName}: $${(d.amount || 0).toLocaleString()} — Stage: ${d.dealStage}, Health: ${d.dealHealth || "unknown"}\n`;
    });
  }

  // Leads needing follow-up
  if (needsFollowup.length > 0) {
    context += `\n## NEEDS FOLLOW-UP (${needsFollowup.length})\n`;
    needsFollowup.slice(0, 8).forEach((l) => {
      const lastTouch =
        l.touchpointTimeline?.[l.touchpointTimeline.length - 1];
      const daysSince = lastTouch
        ? Math.floor(
            (Date.now() - new Date(lastTouch.date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 999;
      context += `- ${l.firstName} ${l.lastName} @ ${l.company} — ${daysSince}d since last contact, Status: ${l.contactStatus}\n`;
    });
  }

  // Selected lead detail
  if (data.selectedLead) {
    const sl = data.selectedLead;
    context += `\n## CURRENTLY VIEWING: ${sl.firstName} ${sl.lastName}
- Company: ${sl.company}
- Position: ${sl.position}
- ICP Score: ${sl.icpScore?.overall || 0} (${sl.icpScore?.tier || "unknown"})
- Status: ${sl.status}
- Contact Status: ${sl.contactStatus}
- Channels: ${sl.channels?.linkedin ? "LinkedIn" : ""}${sl.channels?.email ? " Email" : ""}
- Email: ${sl.email || "N/A"}
- LinkedIn: ${sl.linkedinUrl || "N/A"}
- Draft Messages: ${sl.draftMessages.length}
- Notes: ${sl.notes || "None"}
${
  sl.companyIntel
    ? `- Industry: ${sl.companyIntel.industry}
- Revenue: ${sl.companyIntel.estimatedRevenue}
- Pain Points: ${sl.companyIntel.painPoints?.join(", ") || "Unknown"}`
    : ""
}
`;
  }

  if (data.currentSection) {
    context += `\nUser is currently on the "${data.currentSection}" section of the dashboard.\n`;
  }

  return context;
}
