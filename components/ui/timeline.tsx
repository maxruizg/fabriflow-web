import * as React from "react";

import { cn } from "~/lib/utils";

export type TimelineDotTone = "ink" | "clay" | "moss" | "rust" | "wine";

export interface TimelineItemProps {
  /** Color of the dot — drives semantic meaning. */
  tone?: TimelineDotTone;
  /** Top-line content; usually a short sentence. */
  children: React.ReactNode;
  /** Meta line (timestamp, actor, doc reference). */
  meta?: React.ReactNode;
  className?: string;
}

const DOT_CLASS: Record<TimelineDotTone, string> = {
  ink: "",
  clay: "ff-tl-clay",
  moss: "ff-tl-moss",
  rust: "ff-tl-rust",
  wine: "ff-tl-wine",
};

function Item({ tone = "ink", children, meta, className }: TimelineItemProps) {
  return (
    <div className={cn("ff-tl-item", className)}>
      <span className={cn("ff-tl-dot", DOT_CLASS[tone])} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-[13px] text-ink leading-relaxed">{children}</div>
        {meta ? (
          <div className="font-mono text-[11px] text-ink-3 mt-0.5">{meta}</div>
        ) : null}
      </div>
    </div>
  );
}

export function Timeline({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)} role="list">
      {children}
    </div>
  );
}

Timeline.Item = Item;
