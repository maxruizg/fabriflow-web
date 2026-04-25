import { useState } from "react";
import type { MetaFunction } from "@remix-run/cloudflare";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TabsCount,
} from "~/components/ui/tabs";
import { Input } from "~/components/ui/input";
import { Icon } from "~/components/ui/icon";
import { DocChip, DocStrip } from "~/components/ui/doc-chip";
import { StatCard } from "~/components/ui/stat-card";
import { PillGroup } from "~/components/ui/pill-group";
import { AgingBar } from "~/components/ui/aging-bar";
import { DeliveryDots } from "~/components/ui/delivery-dots";
import {
  DeliveryHeatmap,
  type HeatLevel,
} from "~/components/ui/delivery-heatmap";
import { Dropzone } from "~/components/ui/dropzone";
import { Timeline } from "~/components/ui/timeline";
import { Toolbar } from "~/components/ui/toolbar";
import { ChartBars } from "~/components/ui/chart-bars";

export const meta: MetaFunction = () => [
  { title: "FabriFlow / preview" },
  { name: "robots", content: "noindex" },
];

const HEAT_DATA: HeatLevel[] = [
  3, 4, 4, 3, 4, 4, 3, 4, 3, 2, 3, 4,
  4, 3, 4, 3, 4, 4, 3, 4, 4, 4, 4, 3,
];

export default function PreviewPage() {
  const [period, setPeriod] = useState<"hoy" | "semana" | "mes" | "trim">(
    "mes",
  );
  const [search, setSearch] = useState("");

  return (
    <div className="min-h-screen px-6 py-10 lg:px-10 max-w-[1200px] mx-auto space-y-12">
      <header>
        <h1 className="ff-page-title">
          Component <em>Preview</em>
        </h1>
        <p className="ff-page-sub">
          Sandbox for the FabriFlow design-system primitives. Not linked from
          the main shell; visit <code>/_dev/preview</code> directly during
          development.
        </p>
      </header>

      {/* Tone palette */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">
          Tone <em className="not-italic text-clay">tokens</em>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(
            [
              { label: "Paper", bg: "var(--paper)", fg: "var(--ink)" },
              { label: "Paper-2", bg: "var(--paper-2)", fg: "var(--ink)" },
              { label: "Paper-3", bg: "var(--paper-3)", fg: "var(--ink)" },
              { label: "Ink", bg: "var(--ink)", fg: "var(--paper)" },
              { label: "Clay", bg: "var(--clay)", fg: "var(--paper)" },
              {
                label: "Clay-soft",
                bg: "var(--clay-soft)",
                fg: "var(--clay-deep)",
              },
              { label: "Moss", bg: "var(--moss)", fg: "var(--paper)" },
              {
                label: "Moss-soft",
                bg: "var(--moss-soft)",
                fg: "var(--moss-deep)",
              },
              { label: "Rust", bg: "var(--rust)", fg: "var(--paper)" },
              { label: "Wine", bg: "var(--wine)", fg: "var(--paper)" },
            ] as const
          ).map((s) => (
            <div
              key={s.label}
              className="rounded-md border border-line p-3 flex flex-col gap-1"
              style={{ background: s.bg, color: s.fg }}
            >
              <div className="font-mono text-[10.5px] uppercase tracking-wider opacity-90">
                {s.label}
              </div>
              <div className="font-display text-[16px]">FabriFlow</div>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Buttons</h2>
        <div className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button variant="clay">Clay</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">Small</Button>
          <Button size="xs">Extra small</Button>
          <Button size="icon" variant="outline" aria-label="More">
            <Icon name="dots" size={14} />
          </Button>
        </div>
      </section>

      {/* Badges */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Badges (tones)</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="moss">Recibido</Badge>
          <Badge tone="clay">En tránsito</Badge>
          <Badge tone="rust">Revisión calidad</Badge>
          <Badge tone="wine">Incidencia</Badge>
          <Badge tone="ink">Cerrado</Badge>
          <Badge tone="moss" noDot>
            Sin punto
          </Badge>
        </div>
      </section>

      {/* Doc chips */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">
          Document chips
        </h2>
        <div className="flex items-center gap-3">
          <DocChip type="OC" />
          <DocChip type="FAC" />
          <DocChip type="REM" />
          <DocChip type="NC" absent />
          <DocStrip docs={["OC", "FAC", "REM"]} />
        </div>
      </section>

      {/* Stats */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Stat cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Cuentas por pagar"
            currency="$"
            value="906,200"
            delta={{ label: "+4.2% vs mes anterior", direction: "up" }}
            sparkPath="M0 22 L10 18 L20 14 L30 16 L40 8 L50 12 L60 6 L70 10 L80 4"
          />
          <StatCard
            label="Pagos emitidos"
            currency="$"
            value="412,800"
            delta={{ label: "-1.8%", direction: "dn" }}
            sparkTone="wine"
            sparkPath="M0 4 L10 8 L20 6 L30 12 L40 10 L50 18 L60 14 L70 22 L80 18"
          />
          <StatCard
            label="Facturas por conciliar"
            value="38"
            delta={{ label: "↑ 3 esta semana", direction: "up" }}
          />
          <StatCard
            label="Calificación"
            value="4.7"
            delta={{ label: "estable", direction: "flat" }}
          />
        </div>
      </section>

      {/* Pill group */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Pill group</h2>
        <PillGroup
          ariaLabel="Período"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "hoy", label: "Hoy" },
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mes" },
            { value: "trim", label: "Trim." },
          ]}
        />
        <div className="text-[12px] text-ink-3 mt-1">
          active: <strong>{period}</strong>
        </div>
      </section>

      {/* Toolbar + tabs + table */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">
          Toolbar + tabs + table
        </h2>
        <Card>
          <CardHeader>
            <CardTitle>Órdenes recientes</CardTitle>
            <CardDescription>9 resultados · $798,550.50 MXN</CardDescription>
          </CardHeader>
          <CardContent>
            <Toolbar>
              <Toolbar.Search
                value={search}
                onChange={setSearch}
                placeholder="Folio, proveedor, artículo…"
              />
              <Button variant="outline" size="sm">
                <Icon name="filter" size={13} />
                Filtros
              </Button>
              <Toolbar.Spacer />
              <Toolbar.Summary>9 resultados · $798,550.50 MXN</Toolbar.Summary>
            </Toolbar>

            <Tabs defaultValue="all" className="mb-4">
              <TabsList>
                <TabsTrigger value="all">
                  Todas <TabsCount>9</TabsCount>
                </TabsTrigger>
                <TabsTrigger value="open">
                  Abiertas <TabsCount>6</TabsCount>
                </TabsTrigger>
                <TabsTrigger value="transit">
                  En tránsito <TabsCount>2</TabsCount>
                </TabsTrigger>
                <TabsTrigger value="review">
                  Revisión <TabsCount>3</TabsCount>
                </TabsTrigger>
                <TabsTrigger value="incident">
                  Incidencias <TabsCount>1</TabsCount>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="all" />
            </Tabs>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono text-[12px]">
                    OC-2026-00418
                  </TableCell>
                  <TableCell>Algodones del Valle S.A.</TableCell>
                  <TableCell>
                    <DocStrip docs={["OC", "FAC", "REM"]} />
                  </TableCell>
                  <TableCell className="font-mono text-right">
                    $124,500.00
                  </TableCell>
                  <TableCell>
                    <Badge tone="moss">Recibido</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-[12px]">
                    OC-2026-00417
                  </TableCell>
                  <TableCell>Hilados del Norte S.A.</TableCell>
                  <TableCell>
                    <DocStrip docs={["OC", "FAC"]} />
                  </TableCell>
                  <TableCell className="font-mono text-right">
                    $88,200.00
                  </TableCell>
                  <TableCell>
                    <Badge tone="clay">En tránsito</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono text-[12px]">
                    OC-2026-00405
                  </TableCell>
                  <TableCell>Metales Tijuana</TableCell>
                  <TableCell>
                    <DocStrip docs={["OC", "FAC"]} />
                  </TableCell>
                  <TableCell className="font-mono text-right">
                    $23,410.00
                  </TableCell>
                  <TableCell>
                    <Badge tone="wine">Incidencia</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Aging bars */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Aging</h2>
        <Card>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4">
            {[
              { label: "Corriente", pct: 100, tone: "moss" as const, amt: 412800 },
              { label: "1–30", pct: 80, tone: "clay" as const, amt: 284300 },
              { label: "31–60", pct: 60, tone: "rust" as const, amt: 126400 },
              { label: "61–90", pct: 30, tone: "wine" as const, amt: 58200 },
              { label: "+90", pct: 12, tone: "wine" as const, amt: 24500 },
            ].map((b) => (
              <div key={b.label} className="flex flex-col gap-1.5">
                <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  {b.label}
                </div>
                <div className="font-mono text-[15px] text-ink">
                  ${b.amt.toLocaleString()}
                </div>
                <AgingBar pct={b.pct} tone={b.tone} label={b.label} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Heatmap + dots */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">
          Delivery heatmap + dots
        </h2>
        <Card>
          <CardContent className="space-y-4 p-4">
            <DeliveryHeatmap
              values={HEAT_DATA}
              label="Entregas últimos 24 meses"
            />
            <div className="flex items-center gap-3 text-[12px] text-ink-3">
              <span>Últimas 12:</span>
              <DeliveryDots
                states={[
                  "on",
                  "on",
                  "late",
                  "on",
                  "on",
                  "miss",
                  "on",
                  "on",
                  "on",
                  "late",
                  "on",
                  "on",
                ]}
                label="Última docena"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Dropzone */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Dropzone</h2>
        <Card>
          <CardContent className="p-4">
            <Dropzone />
          </CardContent>
        </Card>
      </section>

      {/* Timeline */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Timeline</h2>
        <Card>
          <CardContent className="p-4">
            <Timeline>
              <Timeline.Item
                tone="clay"
                meta="hoy 09:24 · Marta I."
              >
                <strong>Marta I.</strong> aprobó nota de crédito{" "}
                <span className="font-mono">NC-00081</span>
              </Timeline.Item>
              <Timeline.Item tone="moss" meta="hoy 08:51 · sistema">
                Pago confirmado a <strong>Algodones del Valle</strong>
              </Timeline.Item>
              <Timeline.Item tone="rust" meta="ayer 17:02">
                Proveedor reportó retraso en <span className="font-mono">OC-00405</span>
              </Timeline.Item>
              <Timeline.Item meta="ayer 14:30">
                Documento <span className="font-mono">REM-00412</span> subido
              </Timeline.Item>
            </Timeline>
          </CardContent>
        </Card>
      </section>

      {/* Chart bars */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">
          OTIF stacked bars
        </h2>
        <Card>
          <CardContent className="p-2">
            <ChartBars
              columns={[
                "may",
                "jun",
                "jul",
                "ago",
                "sep",
                "oct",
                "nov",
                "dic",
                "ene",
                "feb",
                "mar",
                "abr",
              ].map((m, i) => ({
                label: m,
                segments: [
                  { share: 0.7 + (i % 3) * 0.05, tone: "moss" as const },
                  { share: 0.18 - (i % 3) * 0.04, tone: "rust" as const },
                  { share: 0.04 + (i % 4) * 0.02, tone: "wine" as const },
                ],
              }))}
            />
          </CardContent>
        </Card>
      </section>

      {/* Inputs */}
      <section className="space-y-3">
        <h2 className="font-display text-[20px] font-medium">Inputs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-[640px]">
          <Input placeholder="Nombre" />
          <Input placeholder="Email" type="email" />
          <Input placeholder="Buscar…" />
        </div>
      </section>
    </div>
  );
}
