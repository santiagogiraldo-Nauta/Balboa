"use client";

import type { SlideContent } from "@/lib/types";

interface VideoSlidesRendererProps {
  slides: SlideContent[];
  leadName: string;
  company: string;
}

export default function VideoSlidesRenderer({ slides, leadName, company }: VideoSlidesRendererProps) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "var(--balboa-text-muted)", marginBottom: 8 }}>
        {slides.length} slides for {leadName} at {company} — scroll to browse
      </p>
      <div className="slide-deck">
        {slides.map((slide, idx) => (
          <div key={idx} className="slide-card">
            <div className="slide-header">
              <h3>{slide.title}</h3>
              {slide.subtitle && <p>{slide.subtitle}</p>}
            </div>
            <div className="slide-body">
              {slide.bullets && slide.bullets.length > 0 && (
                <ul>
                  {slide.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
            {slide.highlightStat && (
              <div className="slide-highlight-stat">
                <div className="stat-value">{slide.highlightStat}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
