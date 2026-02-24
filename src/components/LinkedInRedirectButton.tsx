"use client";

import { Linkedin, ExternalLink } from "lucide-react";
import type { Lead } from "@/lib/types";
import { trackEventClient } from "@/lib/tracking";

interface LinkedInRedirectButtonProps {
  lead: Lead;
  onCopy?: (text: string) => void;
  style?: React.CSSProperties;
}

export default function LinkedInRedirectButton({ lead, style }: LinkedInRedirectButtonProps) {
  const hasUrl = !!lead.linkedinUrl;

  const handleClick = () => {
    trackEventClient({ eventCategory: "outreach", eventAction: "linkedin_redirect_clicked", leadId: lead.id, channel: "linkedin", metadata: { hasLinkedInUrl: !!lead.linkedinUrl } });
    if (lead.linkedinUrl) {
      window.open(lead.linkedinUrl, "_blank");
    } else if (lead.firstName && lead.lastName) {
      window.open(
        `https://linkedin.com/search/results/people/?keywords=${encodeURIComponent(
          lead.firstName + " " + lead.lastName + " " + lead.company
        )}`,
        "_blank"
      );
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 12px", borderRadius: 8, flex: 1,
        background: "linear-gradient(135deg, #0077b5, #00a0dc)",
        color: "white",
        border: "none", cursor: "pointer",
        fontSize: 11, fontWeight: 600,
        transition: "all 0.2s ease",
        boxShadow: "0 2px 6px rgba(0,119,181,0.2)",
        ...style,
      }}
    >
      <Linkedin className="w-3.5 h-3.5" style={{ flexShrink: 0 }} />
      {hasUrl ? "Open Profile" : "Search LinkedIn"}
      <ExternalLink className="w-3 h-3" style={{ marginLeft: "auto", opacity: 0.7 }} />
    </button>
  );
}
