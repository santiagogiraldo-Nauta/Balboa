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
  tooltip = "Ask Vasco about this",
  size = 14,
  style,
  onClick,
}: VascoContextButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      title={tooltip}
      onClick={() => onClick(prompt)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        border: "none",
        background: isHovered ? "rgba(59,91,219,0.08)" : "transparent",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        transition: "background 0.15s ease",
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        style={{
          color: isHovered ? "#3b5bdb" : "#adb5bd",
          transition: "color 0.15s ease",
        }}
      >
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        <path d="M8 2L9.2 6.8H6.8L8 2Z" fill="currentColor" opacity="0.9" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" opacity="0.8" />
      </svg>
    </button>
  );
}
