"use client";

import { useState } from "react";

interface VascoContextButtonProps {
  prompt: string;
  tooltip?: string;
  size?: number;
  style?: React.CSSProperties;
  onClick: (prompt: string) => void;
}

export default function VascoContextButton({
  prompt,
  tooltip = "Ask Vasco",
  size = 18,
  style,
  onClick,
}: VascoContextButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      title={tooltip}
      onClick={(e) => {
        e.stopPropagation();
        onClick(prompt);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: size + 12,
        height: size + 12,
        borderRadius: "50%",
        border: isHovered ? "1.5px solid rgba(59,91,219,0.4)" : "1.5px solid rgba(59,91,219,0.15)",
        background: isHovered
          ? "linear-gradient(135deg, rgba(59,91,219,0.15), rgba(99,102,241,0.12))"
          : "linear-gradient(135deg, rgba(59,91,219,0.06), rgba(99,102,241,0.04))",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        transition: "all 0.2s ease",
        flexShrink: 0,
        transform: isHovered ? "scale(1.12)" : "scale(1)",
        boxShadow: isHovered
          ? "0 2px 8px rgba(59,91,219,0.25), 0 0 0 3px rgba(59,91,219,0.08)"
          : "0 1px 3px rgba(59,91,219,0.08)",
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        style={{
          color: isHovered ? "#3b5bdb" : "#5c6bc0",
          transition: "color 0.2s ease",
          filter: isHovered ? "drop-shadow(0 0 2px rgba(59,91,219,0.3))" : "none",
        }}
      >
        {/* Outer ring */}
        <circle cx="16" cy="16" r="14.5" stroke="currentColor" strokeWidth="1.5" opacity={isHovered ? 0.5 : 0.35} />
        {/* Inner ring */}
        <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1" opacity={isHovered ? 0.35 : 0.2} />
        {/* North pointer (main — prominent) */}
        <path d="M16 3L18.5 13H13.5L16 3Z" fill="currentColor" opacity="0.95" />
        {/* South pointer */}
        <path d="M16 29L13.5 19H18.5L16 29Z" fill="currentColor" opacity="0.45" />
        {/* East pointer */}
        <path d="M29 16L19 13.5V18.5L29 16Z" fill="currentColor" opacity="0.45" />
        {/* West pointer */}
        <path d="M3 16L13 18.5V13.5L3 16Z" fill="currentColor" opacity="0.45" />
        {/* NE diagonal */}
        <path d="M25.2 6.8L19.5 14L18 12.5L25.2 6.8Z" fill="currentColor" opacity="0.3" />
        {/* NW diagonal */}
        <path d="M6.8 6.8L14 12.5L12.5 14L6.8 6.8Z" fill="currentColor" opacity="0.3" />
        {/* SE diagonal */}
        <path d="M25.2 25.2L18 19.5L19.5 18L25.2 25.2Z" fill="currentColor" opacity="0.3" />
        {/* SW diagonal */}
        <path d="M6.8 25.2L12.5 18L14 19.5L6.8 25.2Z" fill="currentColor" opacity="0.3" />
        {/* Center dot */}
        <circle cx="16" cy="16" r="2.5" fill="currentColor" opacity="0.9" />
        <circle cx="16" cy="16" r="1.2" fill="currentColor" />
      </svg>
    </button>
  );
}
