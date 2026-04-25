import * as React from "react";

import { cn } from "~/lib/utils";

export interface ChartBarsSegment {
  /** 0..1 share of the column. */
  share: number;
  tone: "moss" | "clay" | "rust" | "wine" | "ink";
}

export interface ChartBarsColumn {
  label: string;
  segments: ChartBarsSegment[];
}

const SEG_BG: Record<ChartBarsSegment["tone"], string> = {
  moss: "var(--moss)",
  clay: "var(--clay)",
  rust: "var(--rust-soft)",
  wine: "var(--wine-soft)",
  ink: "var(--paper-3)",
};

export interface ChartBarsProps {
  columns: ChartBarsColumn[];
  /** Chart height in pixels. */
  height?: number;
  className?: string;
}

/**
 * Stacked-bar mini chart used by the Reports preview (OTIF) and dashboard
 * deltas. Pure SVG-free CSS layout — no animation libs, no recharts.
 */
export function ChartBars({
  columns,
  height = 180,
  className,
}: ChartBarsProps) {
  return (
    <div
      className={cn("flex items-end gap-2.5 px-4", className)}
      style={{ height }}
    >
      {columns.map((c, i) => {
        const total = c.segments.reduce((acc, s) => acc + s.share, 0) || 1;
        return (
          <div
            key={i}
            className="flex flex-1 flex-col justify-end h-full"
            style={{ gap: "2px" }}
          >
            {c.segments.map((seg, j) => (
              <div
                key={j}
                style={{
                  height: `${(seg.share / total) * 100}%`,
                  background: SEG_BG[seg.tone],
                  borderRadius: j === 0 ? "2px 2px 0 0" : 0,
                }}
              />
            ))}
            <div className="font-mono text-[10px] text-ink-3 text-center mt-1.5">
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
