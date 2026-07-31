import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

/**
 * Two badge styles coexist:
 *
 *  - `tone` (FabriFlow design system) — small mono caps with a colored dot.
 *    Use for status, document state, risk, and other categorical signals.
 *  - `variant` (legacy shadcn) — rounded-full pill. Kept for backwards
 *    compatibility with components written before the design refactor.
 *
 * If `tone` is set it takes precedence.
 */

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeTone = "ink" | "clay" | "moss" | "rust" | "wine" | "amber" | "blue" | "orange" | "purple" | "green" | "teal" | "red";

const TONE_CLASS: Record<BadgeTone, string> = {
  ink: "ff-badge ff-badge-ink",
  clay: "ff-badge ff-badge-clay",
  moss: "ff-badge ff-badge-moss",
  rust: "ff-badge ff-badge-rust",
  wine: "ff-badge ff-badge-wine",
  amber: "ff-badge bg-amber-100 text-amber-800 border-amber-300",
  blue: "ff-badge bg-blue-100 text-blue-800 border-blue-300",
  orange: "ff-badge bg-orange-100 text-orange-800 border-orange-300",
  purple: "ff-badge bg-purple-100 text-purple-800 border-purple-300",
  green: "ff-badge bg-green-100 text-green-800 border-green-300",
  teal: "ff-badge bg-teal-100 text-teal-800 border-teal-300",
  red: "ff-badge bg-red-100 text-red-800 border-red-300",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: BadgeTone;
  /** Hides the leading colored dot when using tone-style badges. */
  noDot?: boolean;
}

function Badge({ className, variant, tone, noDot, ...props }: BadgeProps) {
  if (tone) {
    return (
      <span
        className={cn(TONE_CLASS[tone], noDot && "ff-no-dot", className)}
        {...props}
      />
    );
  }
  return (
    <span
      className={cn(badgeVariants({ variant: className ? undefined : variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
