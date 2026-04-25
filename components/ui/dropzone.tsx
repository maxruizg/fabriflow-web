import * as React from "react";

import { cn } from "~/lib/utils";
import { Icon, type IconName } from "~/components/ui/icon";

export interface DropzoneProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Heading text. */
  title?: React.ReactNode;
  /** Sub-text below the heading. */
  hint?: React.ReactNode;
  icon?: IconName;
  /** Render as a button (e.g. trigger a file picker) when interactive. */
  as?: "div" | "button";
  /** Hover-state: draws a more pronounced clay border when something is dragged over. */
  active?: boolean;
}

/**
 * Striped dashed empty-state used for document/receipt uploads.
 * Pair with `<input type="file" />` and the file-picker hooks already
 * in the codebase to keep upload logic centralized.
 */
export function Dropzone({
  title = "Arrastra un archivo o haz clic para subirlo",
  hint = "PDF, XML o JPG hasta 10 MB",
  icon = "upload",
  as = "div",
  active,
  className,
  children,
  ...rest
}: DropzoneProps) {
  const Tag = as as "div";
  return (
    <Tag
      className={cn(
        "ff-dropzone flex flex-col items-center justify-center gap-1.5 transition-colors",
        active && "border-clay text-ink",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={20} className="text-ink-3" />
      <div className="text-[13px] font-medium text-ink-2">{title}</div>
      {hint ? <div className="text-[11px] text-ink-3">{hint}</div> : null}
      {children}
    </Tag>
  );
}
