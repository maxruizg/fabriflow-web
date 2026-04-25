import { useState } from "react";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { requireUser } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Icon } from "~/components/ui/icon";
import { PillGroup } from "~/components/ui/pill-group";
import { AgingBar } from "~/components/ui/aging-bar";
import { ChartBars } from "~/components/ui/chart-bars";
import type { ChartBarsColumn } from "~/components/ui/chart-bars";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Reportes — FabriFlow" },
    { name: "description", content: "Plantillas de reportes financieros y constructor a medida" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

// ---------- static placeholder data ----------

const AGING_BUCKETS = [
  { bucket: "Corriente", amount: 412800, share: 46 },
  { bucket: "1–30 días", amount: 284300, share: 31 },
  { bucket: "31–60 días", amount: 126400, share: 14 },
  { bucket: "61–90 días", amount: 58200, share: 6 },
  { bucket: "+90 días", amount: 24500, share: 3 },
];

const AGING_VENDORS = [
  { name: "Metalúrgica del Norte", short: "MN", buckets: [214256, 115603, 65568, 30183, 12712] },
  { name: "Plásticos Integrales", short: "PI", buckets: [87654, 58200, 24300, 10800, 4500] },
  { name: "Aceros Especiales S.A.", short: "AE", buckets: [66420, 48750, 19800, 8820, 3710] },
  { name: "Distribuidora Omega", short: "DO", buckets: [24090, 32400, 9800, 5200, 2180] },
  { name: "Química Industrial", short: "QI", buckets: [15120, 18300, 6800, 3200, 1250] },
  { name: "Logística Integral", short: "LI", buckets: [5260, 11047, 132, 0, 148] },
];

const MONTHS = ["May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic", "Ene", "Feb", "Mar", "Abr"];

const OTIF_COLUMNS: ChartBarsColumn[] = MONTHS.map((label, i) => ({
  label,
  segments: [
    { share: 40 + (i * 3) % 30, tone: "moss" },
    { share: 20 + (i * 5) % 20, tone: "rust" },
    { share: 10 + (i * 2) % 15, tone: "wine" },
  ],
}));

const SCHEDULED_REPORTS = [
  { name: "Aging semanal — Tesorería", freq: "Lunes 08:00", dest: "3 personas", fmt: "PDF + Excel", next: "Lun 27 abr", status: "activo" },
  { name: "IVA acreditable mensual", freq: "Último día hábil", dest: "Contabilidad", fmt: "XML + PDF", next: "Jue 30 abr", status: "activo" },
  { name: "Cierre mensual completo", freq: "Día 5 del mes", dest: "Dirección", fmt: "Paquete ZIP", next: "Mar 5 may", status: "activo" },
  { name: "Desempeño proveedores", freq: "Trimestral", dest: "Compras", fmt: "PDF", next: "30 jun", status: "pausado" },
];

const COLUMN_CHIPS = ["Folio", "Proveedor", "Fecha", "Vencimiento", "Moneda", "Importe", "IVA", "Retención", "Saldo", "Días", "Centro costo"];
const GROUPBY_OPTIONS = ["Proveedor", "Categoría", "Moneda", "Centro de costo", "Mes"];

// ---------- types ----------

type TemplateKey = "aging" | "vendor" | "history" | "tax" | "close" | "custom";
type PeriodKey = "M" | "T" | "S" | "A" | "Custom";

interface Template {
  k: TemplateKey;
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  desc: string;
  tag: string;
  tagTone: "ink" | "clay" | "moss" | "rust" | "wine";
}

const TEMPLATES: Template[] = [
  { k: "aging",   icon: "clock",    title: "Antigüedad de saldos",       desc: "Cuentas por pagar por rango de días",          tag: "AP",     tagTone: "clay" },
  { k: "vendor",  icon: "vendors",  title: "Desempeño de proveedores",   desc: "OTIF, calidad, incidencias",                   tag: "KPI",    tagTone: "moss" },
  { k: "history", icon: "book",     title: "Historial de pagos",         desc: "Movimientos por proveedor / periodo",           tag: "AP",     tagTone: "clay" },
  { k: "tax",     icon: "tag",      title: "IVA / retenciones",          desc: "Impuestos acreditables y retenidos",            tag: "FISCAL", tagTone: "rust" },
  { k: "close",   icon: "calendar", title: "Cierre mensual",             desc: "Paquete de cierre contable",                   tag: "CONTA",  tagTone: "wine" },
  { k: "custom",  icon: "settings", title: "Reporte a medida",           desc: "Constructor con campos y filtros",              tag: "CUSTOM", tagTone: "ink" },
];

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "M", label: "M" },
  { value: "T", label: "T" },
  { value: "S", label: "S" },
  { value: "A", label: "A" },
  { value: "Custom", label: "Custom" },
];

// ---------- helpers ----------

function fmtCurrency(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const AGING_TONES: Array<"moss" | "clay" | "rust" | "wine"> = ["moss", "clay", "rust", "wine", "wine"];

// ---------- sub-components ----------

function TemplateCard({
  t,
  selected,
  onClick,
}: {
  t: Template;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border bg-paper p-4 transition-all duration-150 cursor-pointer",
        "hover:shadow-md hover:border-clay/40",
        selected
          ? "border-clay shadow-[0_0_0_2px_oklch(0.88_0.05_45)] bg-clay-soft/30"
          : "border-line",
      )}
    >
      <div className="flex items-start gap-3 mb-2">
        <div className="flex-shrink-0 w-[34px] h-[34px] rounded-[7px] bg-paper-3 grid place-items-center">
          <Icon name={t.icon} size={16} className="text-ink-2" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-ink leading-snug">{t.title}</div>
          <div className="text-[11px] text-ink-3 font-mono mt-0.5 truncate">{t.desc}</div>
        </div>
        <Badge tone={t.tagTone} noDot className="flex-shrink-0 text-[9px] font-mono uppercase tracking-wider">
          {t.tag}
        </Badge>
      </div>
    </button>
  );
}

function AgingPreview() {
  const totalAging = AGING_BUCKETS.reduce((a, b) => a + b.amount, 0);
  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-semibold text-[14px] text-ink">Antigüedad de saldos · Q1 2026</div>
          <div className="text-[11px] text-ink-3 font-mono mt-0.5">Corte: 31 mar 2026 · Base MXN · 8 proveedores</div>
        </div>
        <span className="text-[11px] text-ink-3 font-mono">Mostrando 1–6 de 8</span>
      </div>

      {/* KPI buckets */}
      <div className="grid grid-cols-5 gap-2 mb-5">
        {AGING_BUCKETS.map((b, i) => {
          const tone = AGING_TONES[i] ?? "moss";
          const pct = totalAging > 0 ? Math.round((b.amount / totalAging) * 100) : 0;
          return (
            <div key={b.bucket} className="rounded-lg border border-line bg-paper p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-1">{b.bucket}</div>
              <div className="font-display text-[17px] font-medium text-ink leading-tight">
                {fmtCurrency(b.amount)}
              </div>
              <AgingBar pct={pct} tone={tone} label={b.bucket} className="mt-2" />
              <div className="text-[10px] text-ink-3 font-mono mt-1">{b.share}%</div>
            </div>
          );
        })}
      </div>

      {/* Aging table */}
      <div className="overflow-x-auto rounded-lg border border-line">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right font-mono text-[11px]">Corriente</TableHead>
              <TableHead className="text-right font-mono text-[11px]">1–30</TableHead>
              <TableHead className="text-right font-mono text-[11px]">31–60</TableHead>
              <TableHead className="text-right font-mono text-[11px]">61–90</TableHead>
              <TableHead className="text-right font-mono text-[11px]">+90</TableHead>
              <TableHead className="text-right font-mono text-[11px]">Total MXN</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AGING_VENDORS.map((v) => {
              const total = v.buckets.reduce((a, b) => a + b, 0);
              return (
                <TableRow key={v.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="inline-grid w-6 h-6 place-items-center rounded-[4px] bg-paper-3 text-[10px] font-mono text-ink-2 font-semibold">
                        {v.short}
                      </span>
                      <span className="font-medium text-[13px]">{v.name}</span>
                    </div>
                  </TableCell>
                  {v.buckets.map((b, j) => (
                    <TableCell
                      key={j}
                      className={cn(
                        "text-right font-mono text-[12px]",
                        j >= 4 ? "text-wine" : j >= 3 ? "text-wine" : j >= 2 ? "text-rust-deep" : "text-ink-2",
                      )}
                    >
                      {fmtCurrency(b)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-mono text-[13px] font-semibold text-ink">
                    {fmtCurrency(total)}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-paper-2">
              <TableCell className="font-semibold text-[13px]">Total</TableCell>
              <TableCell className="text-right font-mono text-[12px] font-semibold">$412,800.00</TableCell>
              <TableCell className="text-right font-mono text-[12px] font-semibold">$284,300.00</TableCell>
              <TableCell className="text-right font-mono text-[12px] font-semibold text-rust-deep">$126,400.00</TableCell>
              <TableCell className="text-right font-mono text-[12px] font-semibold text-wine">$58,200.00</TableCell>
              <TableCell className="text-right font-mono text-[12px] font-semibold text-wine">$24,500.00</TableCell>
              <TableCell className="text-right font-mono text-[13px] font-bold">$906,200.00</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function OtifPreview() {
  return (
    <>
      <div className="font-semibold text-[14px] text-ink mb-4">Desempeño · OTIF últimos 12 meses</div>
      <div className="rounded-xl border border-line overflow-hidden bg-paper">
        <div className="px-4 py-3">
          <ChartBars columns={OTIF_COLUMNS} height={180} />
        </div>
      </div>
      <div className="flex gap-6 mt-3">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3 font-mono">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: "var(--moss)" }} />
          A tiempo
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3 font-mono">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: "var(--rust-soft)" }} />
          Con retraso
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3 font-mono">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: "var(--wine-soft)" }} />
          No entregadas
        </span>
      </div>
    </>
  );
}

function PlaceholderPreview({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center gap-3 rounded-xl border-2 border-dashed border-line">
      <div className="w-12 h-12 rounded-full bg-paper-3 grid place-items-center">
        <Icon name="reports" size={22} className="text-ink-3" />
      </div>
      <div className="font-medium text-[14px] text-ink">{title}</div>
      <div className="text-[12px] text-ink-3 font-mono">Ajusta columnas y filtros a la izquierda.</div>
    </div>
  );
}

// ---------- main component ----------

export default function Reports() {
  const [selected, setSelected] = useState<TemplateKey>("aging");
  const [period, setPeriod] = useState<PeriodKey>("T");
  const [groupBy, setGroupBy] = useState<Record<string, boolean>>({
    Proveedor: true,
    Categoría: true,
    Moneda: false,
    "Centro de costo": false,
    Mes: false,
  });
  const [activeColumns, setActiveColumns] = useState<Set<string>>(
    new Set(["Folio", "Proveedor", "Fecha", "Vencimiento", "Moneda", "Importe", "IVA", "Retención"]),
  );

  const selectedTemplate = TEMPLATES.find((t) => t.k === selected) ?? TEMPLATES[0];

  const toggleColumn = (col: string) => {
    setActiveColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const toggleGroup = (g: string) => {
    setGroupBy((prev) => ({ ...prev, [g]: !prev[g] }));
  };

  return (
    <AuthLayout>
      <div className="space-y-6">

        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="ff-page-title">
              Reportes para <em>contabilidad</em>
            </h1>
            <p className="ff-page-sub">
              Plantillas listas, constructor a medida y exportación a Excel, PDF o XML contable.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Icon name="calendar" size={13} className="mr-1.5" />
              Programar
            </Button>
            <Button variant="outline" size="sm">
              <Icon name="download" size={13} className="mr-1.5" />
              Excel
            </Button>
            <Button variant="clay" size="sm">
              <Icon name="download" size={13} className="mr-1.5" />
              Exportar PDF
            </Button>
          </div>
        </header>

        {/* Template gallery */}
        <section>
          <p className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-ink-3 mb-2.5">
            Plantillas
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t) => (
              <TemplateCard
                key={t.k}
                t={t}
                selected={selected === t.k}
                onClick={() => setSelected(t.k)}
              />
            ))}
          </div>
        </section>

        {/* Report builder */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Constructor · {selectedTemplate.title}</CardTitle>
                <CardDescription>
                  Ajusta periodo, moneda, filtros y agrupación. Vista previa en vivo.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="moss" noDot>Guardado automático</Badge>
                <Button variant="outline" size="sm">Guardar plantilla</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div
              className="grid min-h-[420px]"
              style={{ gridTemplateColumns: "280px 1fr" }}
            >
              {/* Controls panel */}
              <div className="border-r border-line p-[18px] space-y-4">

                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3 mb-2">Periodo</p>
                  <PillGroup
                    ariaLabel="Periodo"
                    value={period}
                    onChange={setPeriod}
                    options={PERIOD_OPTIONS}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    defaultValue="01 ene 2026"
                    className="h-8 rounded-md border border-line bg-paper px-2.5 text-[12px] font-mono text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-clay/50"
                  />
                  <input
                    type="text"
                    defaultValue="31 mar 2026"
                    className="h-8 rounded-md border border-line bg-paper px-2.5 text-[12px] font-mono text-ink placeholder:text-ink-3 focus:outline-none focus:ring-1 focus:ring-clay/50"
                  />
                </div>

                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3 mb-2">Moneda</p>
                  <select className="w-full h-8 rounded-md border border-line bg-paper px-2.5 text-[12px] text-ink focus:outline-none focus:ring-1 focus:ring-clay/50">
                    <option>MXN (convertir al tipo de cambio DOF)</option>
                    <option>USD</option>
                  </select>
                </div>

                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3 mb-2">Agrupar por</p>
                  <div className="space-y-1.5">
                    {GROUPBY_OPTIONS.map((g) => (
                      <label key={g} className="flex items-center gap-2 text-[12px] text-ink-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!groupBy[g]}
                          onChange={() => toggleGroup(g)}
                          className="rounded border-line accent-clay"
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3 mb-2">Columnas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {COLUMN_CHIPS.map((c) => {
                      const active = activeColumns.has(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleColumn(c)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono transition-colors",
                            active
                              ? "bg-clay-soft text-clay-deep"
                              : "bg-paper-3 text-ink-3 hover:bg-paper-2",
                          )}
                        >
                          {c}
                          {active && <span className="opacity-60">×</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <hr className="border-line" />

                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-ink-3 mb-2">Filtros</p>
                  <div className="space-y-2">
                    {[
                      ["Proveedor", "8 seleccionados"],
                      ["Categoría", "Todas"],
                      ["Estado", "Abiertas + Cerradas"],
                      ["Importe mínimo", "$0.00"],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[12px] text-ink-3">{label}</span>
                        <span className="text-[11px] font-mono text-ink-2">{val}</span>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="xs" className="w-full mt-3">
                    <Icon name="plus" size={12} className="mr-1" />
                    Añadir filtro
                  </Button>
                </div>
              </div>

              {/* Preview panel */}
              <div className="p-[18px] overflow-auto">
                {selected === "aging" && <AgingPreview />}
                {selected === "vendor" && <OtifPreview />}
                {selected !== "aging" && selected !== "vendor" && (
                  <PlaceholderPreview title="Vista previa disponible al confirmar campos" />
                )}
              </div>
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-between border-t border-line px-[18px] py-3">
              <span className="text-[11px] text-ink-3 font-mono">
                Última ejecución: hoy 09:24 · 182 filas · 8 columnas
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="xs">Formato XML contable</Button>
                <Button variant="outline" size="xs">CSV</Button>
                <Button variant="outline" size="xs">Excel</Button>
                <Button variant="clay" size="xs">PDF oficial</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scheduled reports */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Reportes programados</CardTitle>
                <CardDescription>
                  Genera y entrega reportes de forma automática a tu equipo.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Icon name="plus" size={12} className="mr-1.5" />
                Programar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Frecuencia</TableHead>
                  <TableHead>Destinatarios</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Próxima ejecución</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SCHEDULED_REPORTS.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium text-[13px]">{r.name}</TableCell>
                    <TableCell className="font-mono text-[11px] text-ink-3">{r.freq}</TableCell>
                    <TableCell className="text-[13px] text-ink-2">{r.dest}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-mono text-ink-2">
                        {r.fmt}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-ink-3">{r.next}</TableCell>
                    <TableCell>
                      <Badge tone={r.status === "activo" ? "moss" : "ink"}>
                        {r.status === "activo" ? "Activo" : "Pausado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="xs">Editar</Button>
                        <Button variant="ghost" size="xs" className="text-ink-3">
                          {r.status === "activo" ? "Pausar" : "Activar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </AuthLayout>
  );
}
