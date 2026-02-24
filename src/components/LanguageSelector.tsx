"use client";

import type { SupportedLanguage } from "@/lib/types";

interface LanguageSelectorProps {
  value: SupportedLanguage;
  onChange: (lang: SupportedLanguage) => void;
}

const langs: { key: SupportedLanguage; flag: string; label: string }[] = [
  { key: "english", flag: "🇺🇸", label: "EN" },
  { key: "spanish", flag: "🇪🇸", label: "ES" },
  { key: "portuguese", flag: "🇧🇷", label: "PT" },
];

export default function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {langs.map((l) => (
        <button
          key={l.key}
          onClick={() => onChange(l.key)}
          className={`lang-pill ${value === l.key ? "active" : ""}`}
        >
          {l.flag} {l.label}
        </button>
      ))}
    </div>
  );
}
