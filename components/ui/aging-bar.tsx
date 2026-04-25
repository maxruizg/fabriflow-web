import * as React from "react";

import { cn } from "~/lib/utils";

export type AgingTone = "moss" | "clay" | "rust" | "wine";

export interface AgingBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0 to 100 inclusive. Values outside the range are clamped. */
  pct: number;
  tone?: AgingTone;
  /** Accessible label for assistive tech. */
  label?: string;
}

/**
 * Horizontal progress bar used by aging buckets, vendor on-time scores,
 * and payment partial-allocation indicators.
 */
export function AgingBar({
  pct,
  tone = "moss",
  label,
  className,
  ...rest
}: AgingBarProps) {
  const safe = Math.min(100, Math.max(0, pct));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe)}
      aria-label={label}
      className={cn(
        "ff-bar",
        tone === "clay" && "ff-bar-clay",
        tone === "rust" && "ff-bar-rust",
        tone === "wine" && "ff-bar-wine",
        className,
      )}
      {...rest}
    >
      <span style={{ width: `${safe}%` }} />
    </div>
  );
}
