import * as React from "react";

import { cn } from "~/lib/utils";

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface DeliveryHeatmapProps {
  /** 24 levels (2 years × 12 months) or any other 12-column-aligned series. */
  values: HeatLevel[];
  className?: string;
  /** Accessible summary label. */
  label?: string;
}

/**
 * 12-column CSS-grid heatmap. Each cell uses `data-v` to look up a shade
 * defined by `.ff-heatmap > div[data-v="…"]` in tailwind.css.
 */
export function DeliveryHeatmap({
  values,
  className,
  label,
}: DeliveryHeatmapProps) {
  return (
    <div
      role="img"
      aria-label={label ?? "Heatmap"}
      className={cn("ff-heatmap", className)}
    >
      {values.map((v, i) => (
        <div key={i} data-v={v > 0 ? String(v) : undefined} />
      ))}
    </div>
  );
}
