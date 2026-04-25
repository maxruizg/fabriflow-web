import * as React from "react";

import { cn } from "~/lib/utils";

export type StatDelta = {
  /** e.g. "+12.4%", "-3 días" */
  label: string;
  direction?: "up" | "dn" | "flat";
};

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** The big number / value. May be plain text or a `formatAmount(...)` result. */
  value: React.ReactNode;
  /** Optional currency prefix (small italic, e.g. "$"). */
  currency?: string;
  /** Optional delta block shown beneath the value. */
  delta?: StatDelta;
  /** SVG path data for the spark line (drawn 80×30, opacity 0.35). */
  sparkPath?: string;
  /** Tone of the spark line — defaults to clay. */
  sparkTone?: "clay" | "moss" | "rust" | "wine" | "ink";
}

const SPARK_STROKE: Record<NonNullable<StatCardProps["sparkTone"]>, string> = {
  clay: "var(--clay)",
  moss: "var(--moss)",
  rust: "var(--rust)",
  wine: "var(--wine)",
  ink: "var(--ink-3)",
};

export function StatCard({
  label,
  value,
  currency,
  delta,
  sparkPath,
  sparkTone = "clay",
  className,
  ...rest
}: StatCardProps) {
  return (
    <div className={cn("ff-stat", className)} {...rest}>
      {sparkPath ? (
        <svg
          aria-hidden="true"
          width="80"
          height="30"
          viewBox="0 0 80 30"
          className="absolute right-3.5 top-3.5 opacity-35"
        >
          <path
            d={sparkPath}
            fill="none"
            stroke={SPARK_STROKE[sparkTone]}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
      <div className="ff-stat-label">{label}</div>
      <div className="ff-stat-val ff-num">
        {currency ? (
          <span className="mr-1 text-[18px] italic font-normal text-ink-3 align-baseline">
            {currency}
          </span>
        ) : null}
        {value}
      </div>
      {delta ? (
        <div
          className={cn(
            "mt-2.5 inline-flex items-center gap-1 font-mono text-[11px]",
            delta.direction === "up" && "text-moss-deep",
            delta.direction === "dn" && "text-wine",
            (!delta.direction || delta.direction === "flat") && "text-ink-3",
          )}
        >
          {delta.direction === "up"
            ? "▲"
            : delta.direction === "dn"
              ? "▼"
              : "·"}{" "}
          {delta.label}
        </div>
      ) : null}
    </div>
  );
}
