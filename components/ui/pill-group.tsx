import * as React from "react";

import { cn } from "~/lib/utils";

export interface PillOption<V extends string> {
  value: V;
  label: React.ReactNode;
}

export interface PillGroupProps<V extends string> {
  options: PillOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Segmented pill control matching the design's `Hoy / Semana / Mes / Trim.`
 * filter strip. Renders semantically as a radiogroup so the active option
 * is announced by screen readers.
 */
export function PillGroup<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: PillGroupProps<V>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("ff-pills", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            className="ff-pill"
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
