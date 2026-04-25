import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

/**
 * FabriFlow buttons.
 *  - default  → ink (primary CTA in topbar / hero CTAs)
 *  - clay     → clay (mid-priority action; "Aprobar", "Confirmar")
 *  - outline  → paper bordered (secondary actions; download, export)
 *  - ghost    → transparent (tertiary; menu items, cancel)
 *  - destructive → wine
 *  - link     → text link with underline-on-hover
 *  - secondary → kept for shadcn compatibility (paper-3 tinted)
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap font-medium gap-1.5 transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
  {
    variants: {
      variant: {
        default:
          "bg-ink text-paper border border-ink rounded-md hover:bg-ink-2",
        clay:
          "bg-clay text-paper border border-clay-deep rounded-md hover:bg-clay-deep",
        outline:
          "bg-paper text-ink border border-line-2 rounded-md hover:bg-paper-2",
        ghost:
          "bg-transparent text-ink-2 border border-transparent rounded-md hover:bg-paper-2 hover:text-ink",
        destructive:
          "bg-wine text-paper border border-wine rounded-md hover:bg-wine/90",
        secondary:
          "bg-secondary text-secondary-foreground border border-transparent rounded-md hover:bg-paper-3",
        link: "text-clay underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-9 px-3.5 text-[13px]",
        sm: "h-8 px-2.5 text-[12px]",
        xs: "h-7 px-2 text-[11.5px]",
        lg: "h-10 px-5 text-[14px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
