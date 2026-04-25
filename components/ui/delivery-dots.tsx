import * as React from "react";

import { cn } from "~/lib/utils";

export type DeliveryState = "on" | "late" | "miss" | "none";

export interface DeliveryDotsProps {
  /** One state per dot, left-to-right. */
  states: DeliveryState[];
  className?: string;
  /** Accessible label, e.g. "Últimas 12 entregas". */
  label?: string;
}

export function DeliveryDots({ states, className, label }: DeliveryDotsProps) {
  return (
    <span
      className={cn("ff-dots", className)}
      role="img"
      aria-label={label ?? "delivery performance"}
    >
      {states.map((s, i) => (
        <span key={i} data-state={s === "none" ? undefined : s} />
      ))}
    </span>
  );
}
