import * as React from "react";

import { cn } from "~/lib/utils";

export type DocType = "OC" | "FAC" | "REM" | "NC" | "PAGO" | "REP";

const SHORT: Record<DocType, string> = {
  OC: "OC",
  FAC: "FA",
  REM: "RE",
  NC: "NC",
  PAGO: "PG",
  REP: "CP",
};
const LONG: Record<DocType, string> = {
  OC: "Orden de compra",
  FAC: "Factura",
  REM: "Remito",
  NC: "Nota de crédito",
  PAGO: "Comprobante de pago",
  REP: "Complemento de Pago (CFDI)",
};

export interface DocChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  type: DocType;
  /** Render the chip in its faded "absent" state. */
  absent?: boolean;
}

export function DocChip({
  type,
  absent,
  className,
  title,
  ...rest
}: DocChipProps) {
  return (
    <span
      className={cn("ff-docchip", className)}
      data-absent={absent ? "true" : "false"}
      title={title ?? LONG[type]}
      {...rest}
    >
      {SHORT[type]}
    </span>
  );
}

export interface DocStripProps {
  /** Document types currently present on the entity. */
  docs: DocType[];
  className?: string;
}

const ALL_DOCS: DocType[] = ["OC", "FAC", "REM", "NC", "PAGO"];

export function DocStrip({ docs, className }: DocStripProps) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      {ALL_DOCS.map((t) => (
        <DocChip key={t} type={t} absent={!docs.includes(t)} />
      ))}
    </div>
  );
}
