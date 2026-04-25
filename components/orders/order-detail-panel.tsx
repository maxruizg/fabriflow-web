import { Link } from "@remix-run/react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { Timeline } from "~/components/ui/timeline";
import { Dropzone } from "~/components/ui/dropzone";
import { DocChip, type DocType } from "~/components/ui/doc-chip";
import {
  fmtCurrency,
  fmtDate,
  STATUS_TONE,
  type SampleOrder,
} from "~/lib/sample-data";
import { cn } from "~/lib/utils";

interface OrderDetailPanelProps {
  order: SampleOrder | null;
  className?: string;
}

interface DocRowSpec {
  type: DocType;
  label: string;
  fileName?: string;
  meta?: string;
  state: "ok" | "pending";
  byline?: string;
}

function docRowsFor(order: SampleOrder): DocRowSpec[] {
  return [
    {
      type: "OC",
      label: "Orden de compra",
      fileName: order.docs.includes("OC") ? `${order.id}.pdf` : undefined,
      meta: order.docs.includes("OC") ? "v1 · 142 KB" : undefined,
      state: order.docs.includes("OC") ? "ok" : "pending",
      byline: order.docs.includes("OC") ? "Marta I. · 18 abr 2026" : undefined,
    },
    {
      type: "FAC",
      label: "Factura (CFDI)",
      fileName: order.docs.includes("FAC")
        ? `FAC-${order.id.slice(-3)}.xml`
        : undefined,
      meta: order.docs.includes("FAC") ? "CFDI 4.0 · validado" : undefined,
      state: order.docs.includes("FAC") ? "ok" : "pending",
      byline: order.docs.includes("FAC") ? "automático · CFDI OK" : undefined,
    },
    {
      type: "REM",
      label: "Remito de entrega",
      fileName: order.docs.includes("REM")
        ? `REM-${order.id.slice(-3)}.pdf`
        : undefined,
      meta: order.docs.includes("REM") ? "1 página · firma" : undefined,
      state: order.docs.includes("REM") ? "ok" : "pending",
      byline: order.docs.includes("REM") ? "Almacén · 19 abr 2026" : undefined,
    },
    {
      type: "NC",
      label: "Nota de crédito",
      fileName: order.docs.includes("NC") ? `NC-${order.id.slice(-3)}.xml` : undefined,
      meta: order.docs.includes("NC") ? "Ajuste de cantidad" : undefined,
      state: order.docs.includes("NC") ? "ok" : "pending",
    },
  ];
}

function DocRow({ doc }: { doc: DocRowSpec }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-line bg-paper-2 p-2.5">
      <DocChip type={doc.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-ink truncate">
            {doc.label}
          </span>
          <Badge tone={doc.state === "ok" ? "moss" : "rust"} noDot>
            {doc.state === "ok" ? "Subido" : "Pendiente"}
          </Badge>
        </div>
        <div className="text-[11px] text-ink-3 mt-0.5 truncate">
          {doc.fileName ? (
            <span className="font-mono">{doc.fileName}</span>
          ) : (
            <span>Aún no recibido</span>
          )}
          {doc.meta ? <span className="ml-2 text-ink-4">· {doc.meta}</span> : null}
        </div>
        {doc.byline ? (
          <div className="text-[10.5px] text-ink-4 mt-0.5 font-mono">
            {doc.byline}
          </div>
        ) : null}
      </div>
      <Button
        size="xs"
        variant={doc.state === "ok" ? "outline" : "clay"}
        aria-label={doc.state === "ok" ? "Ver documento" : "Subir documento"}
      >
        <Icon name={doc.state === "ok" ? "eye" : "upload"} size={12} />
      </Button>
    </div>
  );
}

export function OrderDetailPanel({ order, className }: OrderDetailPanelProps) {
  if (!order) {
    return (
      <aside
        className={cn(
          "rounded-lg border border-line bg-paper p-6 text-center",
          className,
        )}
      >
        <Icon name="orders" size={28} className="mx-auto text-ink-4 mb-3" />
        <div className="text-[13px] font-medium text-ink-2">
          Selecciona una orden
        </div>
        <div className="text-[11px] text-ink-3 mt-1">
          Haz clic en una fila para ver detalles
        </div>
      </aside>
    );
  }

  const tone = STATUS_TONE[order.status] ?? "ink";
  const m = fmtCurrency(order.amount, order.cur);
  const docs = docRowsFor(order);
  const allDocs = order.docs.length === 4;

  return (
    <aside
      className={cn(
        "rounded-lg border border-line bg-paper",
        "lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto",
        className,
      )}
    >
      <div className="p-5 border-b border-line">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-ink-3 uppercase tracking-wider">
            {order.id}
          </span>
          <Badge tone={tone}>{order.status}</Badge>
        </div>
        <h3 className="mt-2 font-display text-[20px] font-medium leading-tight">
          {order.vendor}
        </h3>
        <div className="mt-1 text-[11.5px] text-ink-3 font-mono">
          {order.items} líneas · emitida {fmtDate(order.date)} · vence{" "}
          {fmtDate(order.due)}
        </div>
      </div>

      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-1">
          Importe
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
      </div>

      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-3">
          Documentos
        </div>
        <div className="space-y-2">
          {docs.map((d) => (
            <DocRow key={d.type} doc={d} />
          ))}
        </div>
        {!allDocs ? (
          <Dropzone
            className="mt-3"
            title="Sube los documentos faltantes"
            hint="Arrastra REM o NC aquí"
          />
        ) : null}
      </div>

      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-3">
          Historial
        </div>
        <Timeline>
          <Timeline.Item tone="clay" meta={`${fmtDate(order.date)} · Marta I.`}>
            OC emitida y enviada al proveedor
          </Timeline.Item>
          {order.docs.includes("FAC") ? (
            <Timeline.Item tone="moss" meta="hoy · CFDI OK">
              Factura recibida y validada
            </Timeline.Item>
          ) : null}
          {order.docs.includes("REM") ? (
            <Timeline.Item tone="moss" meta="ayer · Almacén">
              Remito subido y conciliado
            </Timeline.Item>
          ) : null}
          {order.status === "Incidencia" ? (
            <Timeline.Item tone="wine" meta="hoy">
              Proveedor reportó incidencia
            </Timeline.Item>
          ) : null}
        </Timeline>
      </div>

      <div className="p-5 flex flex-col gap-2">
        <Button variant="outline" size="sm" className="w-full justify-center">
          <Icon name="download" size={13} />
          Descargar paquete
        </Button>
        <Button variant="clay" size="sm" className="w-full justify-center" asChild>
          <Link to={`/payments/new?order=${order.id}`}>
            <Icon name="coin" size={13} />
            Registrar pago
          </Link>
        </Button>
      </div>
    </aside>
  );
}
