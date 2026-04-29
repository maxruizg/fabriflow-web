import { useMemo } from "react";

import { Button } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";

export interface OrderLineDraft {
  description: string;
  sku: string;
  qty: string;
  unit: string;
  unitPrice: string;
  discount: string;
}

export function emptyLine(): OrderLineDraft {
  return {
    description: "",
    sku: "",
    qty: "1",
    unit: "PZA",
    unitPrice: "0",
    discount: "0",
  };
}

function safeNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function lineTotal(line: OrderLineDraft): number {
  return Math.round((safeNum(line.qty) * safeNum(line.unitPrice) - safeNum(line.discount)) * 100) / 100;
}

interface OrderItemsTableProps {
  lines: OrderLineDraft[];
  onChange: (next: OrderLineDraft[]) => void;
  currency: string;
}

export function OrderItemsTable({ lines, onChange, currency }: OrderItemsTableProps) {
  const updateLine = (idx: number, patch: Partial<OrderLineDraft>) => {
    const next = lines.map((line, i) => (i === idx ? { ...line, ...patch } : line));
    onChange(next);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) {
      onChange([emptyLine()]);
      return;
    }
    onChange(lines.filter((_, i) => i !== idx));
  };

  const addLine = () => onChange([...lines, emptyLine()]);

  const subtotal = useMemo(() => lines.reduce((acc, l) => acc + lineTotal(l), 0), [lines]);
  const iva = useMemo(() => Math.round(subtotal * 0.16 * 100) / 100, [subtotal]);
  const total = useMemo(() => Math.round((subtotal + iva) * 100) / 100, [subtotal, iva]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-paper-2 font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-right">Cant.</th>
              <th className="px-3 py-2 text-left">Unidad</th>
              <th className="px-3 py-2 text-right">Precio U.</th>
              <th className="px-3 py-2 text-right">Desc.</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="border-t border-line">
                <td className="px-3 py-1.5 font-mono text-[11px] text-ink-3 align-middle">
                  {idx + 1}
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`SKU línea ${idx + 1}`}
                    value={line.sku}
                    onChange={(e) => updateLine(idx, { sku: e.target.value })}
                    placeholder="—"
                    className="h-8 text-[12px]"
                  />
                </td>
                <td className="px-2 py-1.5 align-middle min-w-[260px]">
                  <Input
                    aria-label={`Descripción línea ${idx + 1}`}
                    value={line.description}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                    placeholder="Insumo / servicio"
                    className="h-8 text-[12.5px]"
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`Cantidad línea ${idx + 1}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={line.qty}
                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                    className="h-8 w-20 text-right font-mono text-[12px]"
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`Unidad línea ${idx + 1}`}
                    value={line.unit}
                    onChange={(e) => updateLine(idx, { unit: e.target.value })}
                    className="h-8 w-20 text-[12px]"
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`Precio unitario línea ${idx + 1}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                    className="h-8 w-28 text-right font-mono text-[12px]"
                  />
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <Input
                    aria-label={`Descuento línea ${idx + 1}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={line.discount}
                    onChange={(e) => updateLine(idx, { discount: e.target.value })}
                    className="h-8 w-24 text-right font-mono text-[12px]"
                  />
                </td>
                <td className="px-3 py-1.5 align-middle text-right font-mono text-[12.5px] text-ink whitespace-nowrap">
                  {formatMoney(lineTotal(line))}
                </td>
                <td className="px-2 py-1.5 align-middle">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    aria-label={`Eliminar línea ${idx + 1}`}
                    className="rounded-md p-1.5 text-ink-3 hover:text-wine hover:bg-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Icon name="plus" size={12} />
          Agregar línea
        </Button>

        <div className="ml-auto min-w-[260px] rounded-md border border-line bg-paper-2 px-4 py-3 text-[13px]">
          <Row label="Subtotal" value={formatMoney(subtotal)} currency={currency} />
          <Row label="IVA 16%" value={formatMoney(iva)} currency={currency} />
          <div className="mt-2 border-t border-line pt-2">
            <Row label="Total" value={formatMoney(total)} currency={currency} bold />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  currency,
  bold,
}: {
  label: string;
  value: string;
  currency: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span
        className={`font-mono text-[10.5px] uppercase tracking-wider ${
          bold ? "text-ink" : "text-ink-3"
        }`}
      >
        {label}
      </span>
      <span
        className={`font-mono ${
          bold ? "text-[14px] font-semibold text-ink" : "text-[12.5px] text-ink-2"
        }`}
      >
        {value} <span className="text-ink-3">{currency}</span>
      </span>
    </div>
  );
}

function formatMoney(n: number): string {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    currencyDisplay: "symbol",
  }).replace(/\s?MXN/, "");
}
