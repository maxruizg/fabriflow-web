import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { DeliveryHeatmap, type HeatLevel } from "~/components/ui/delivery-heatmap";
import {
  fmtCurrency,
  STATUS_TONE,
  type SampleVendor,
} from "~/lib/sample-data";
import { cn } from "~/lib/utils";

interface VendorDetailPanelProps {
  vendor: SampleVendor | null;
  className?: string;
}

const RISK_TONE = {
  Bajo: "moss",
  Medio: "rust",
  Alto: "wine",
} as const;

// Pseudo-deterministic heatmap series so the same vendor always shows the
// same shape until Phase 4 wires the real `vendor_scorecard` endpoint.
function vendorHeatmap(seed: string): HeatLevel[] {
  const out: HeatLevel[] = [];
  for (let i = 0; i < 24; i++) {
    const code = (seed.charCodeAt(i % seed.length) + i * 13) % 5;
    out.push(code as HeatLevel);
  }
  return out;
}

export function VendorDetailPanel({ vendor, className }: VendorDetailPanelProps) {
  if (!vendor) {
    return (
      <aside
        className={cn(
          "rounded-lg border border-line bg-paper p-6 text-center",
          className,
        )}
      >
        <Icon name="vendors" size={28} className="mx-auto text-ink-4 mb-3" />
        <div className="text-[13px] font-medium text-ink-2">
          Selecciona un proveedor
        </div>
        <div className="text-[11px] text-ink-3 mt-1">
          Haz clic en una fila para ver detalles
        </div>
      </aside>
    );
  }

  const m = fmtCurrency(vendor.outstanding, vendor.currency);
  const statusTone = STATUS_TONE[vendor.status] ?? "ink";

  return (
    <aside
      className={cn(
        "rounded-lg border border-line bg-paper",
        "lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto",
        className,
      )}
    >
      {/* Header */}
      <div className="p-5 border-b border-line">
        <div className="flex items-start gap-3">
          <span className="grid h-13 w-13 place-items-center rounded-md bg-clay-soft text-clay-deep font-display text-[18px] font-semibold flex-shrink-0" style={{ width: 52, height: 52 }}>
            {vendor.short}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-[18px] font-medium leading-tight">
              {vendor.name}
            </h3>
            <div className="text-[12px] text-ink-3 mt-0.5 truncate">
              {vendor.city} · {vendor.category}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge tone={statusTone}>{vendor.status}</Badge>
              <Badge tone={RISK_TONE[vendor.risk]}>Riesgo {vendor.risk}</Badge>
              <span className="text-[10.5px] font-mono text-ink-3">
                · desde {vendor.since}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 p-5 border-b border-line">
        <Field label="Contacto" value={vendor.contact} />
        <Field label="Órdenes activas" value={String(vendor.active)} />
        <Field
          label="Calificación"
          value={
            <>
              {vendor.rating.toFixed(1)}
              <span className="ml-1 text-[10.5px] text-ink-3">/ 5.0</span>
            </>
          }
        />
        <Field label="Moneda" value={<span className="font-mono">{vendor.currency}</span>} />
      </div>

      {/* Outstanding */}
      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-1.5">
          Saldo pendiente
        </div>
        <div className="ff-stat-val ff-num">
          <span className="text-[18px] italic font-normal text-ink-3 mr-1">
            {m.symbol}
          </span>
          {m.integer}
          <span className="text-ink-3 text-[20px]">.{m.decimal}</span>
          <span className="ml-1.5 text-[12px] font-mono text-ink-3 align-baseline">
            {m.code}
          </span>
        </div>
        <div className="text-[11px] text-ink-3 mt-1.5 font-mono">
          {vendor.active} órdenes abiertas · próx. vence 12 may 2026
        </div>
      </div>

      {/* Heatmap */}
      <div className="p-5 border-b border-line">
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
            Entregas últimos 24 meses
          </div>
          <div className="flex items-center gap-2 text-[10.5px] text-ink-3 font-mono">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-moss" /> A tiempo
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-rust" /> Retraso
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-wine" /> Falla
            </span>
          </div>
        </div>
        <DeliveryHeatmap
          values={vendorHeatmap(vendor.id)}
          label={`Desempeño mensual de ${vendor.name}`}
        />
        <div className="mt-2 font-mono text-[11px] text-ink-3">
          Promedio a tiempo: <span className="text-ink">{vendor.onTime}%</span>
        </div>
      </div>

      {/* Documents registry */}
      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-3">
          Documentos registrados
        </div>
        <ul className="divide-y divide-line text-[12.5px]">
          {[
            { icon: "paper", label: "Alta fiscal", meta: "RFC validado" },
            { icon: "book", label: "Contrato marco", meta: "vence 31 dic 2026" },
            { icon: "check", label: "Certificación ISO 9001", meta: "vigente" },
            { icon: "coin", label: "Datos bancarios", meta: "actualizados" },
          ].map((d) => (
            <li
              key={d.label}
              className="flex items-center gap-3 py-2"
            >
              <Icon name={d.icon as never} size={13} className="text-ink-3" />
              <span className="flex-1 truncate">{d.label}</span>
              <span className="text-[11px] text-ink-3 font-mono">{d.meta}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="p-5 flex flex-col gap-2">
        <Button variant="outline" size="sm" className="w-full justify-center">
          <Icon name="clock" size={13} />
          Ver histórico
        </Button>
        <Button variant="clay" size="sm" className="w-full justify-center">
          <Icon name="file" size={13} />
          Abrir expediente
        </Button>
      </div>
    </aside>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-0.5">
        {label}
      </span>
      <span className="text-[13.5px] text-ink font-medium">{value}</span>
    </div>
  );
}
