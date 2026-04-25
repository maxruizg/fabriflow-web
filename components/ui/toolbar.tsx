import * as React from "react";

import { cn } from "~/lib/utils";
import { Icon } from "~/components/ui/icon";

/**
 * Composition primitive for filter rows above tables and cards.
 *
 * Usage:
 *   <Toolbar>
 *     <Toolbar.Search value={q} onChange={setQ} placeholder="Buscar…" />
 *     <Toolbar.Spacer />
 *     <Toolbar.Summary>9 resultados · $798,550.50 MXN</Toolbar.Summary>
 *   </Toolbar>
 */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2.5 mb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SearchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  onChange: (next: string) => void;
}

function Search({ value, onChange, className, ...rest }: SearchProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-line-2 bg-paper px-3 py-1.5 min-w-[260px] focus-within:border-ink-3 transition-colors",
        className,
      )}
    >
      <Icon name="search" size={14} className="text-ink-3" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent border-0 outline-0 text-[13px] text-ink placeholder:text-ink-4"
        {...rest}
      />
    </label>
  );
}

function Spacer() {
  return <div className="ml-auto" />;
}

function Summary({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("font-mono text-[11px] text-ink-3", className)}>
      {children}
    </div>
  );
}

Toolbar.Search = Search;
Toolbar.Spacer = Spacer;
Toolbar.Summary = Summary;
