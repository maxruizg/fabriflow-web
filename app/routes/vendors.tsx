import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

import { requireUser } from "~/lib/session.server";
import { cn } from "~/lib/utils";
import {
  SAMPLE_VENDORS,
  fmtCurrency,
  STATUS_TONE,
  type SampleVendor,
} from "~/lib/sample-data";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { StatCard } from "~/components/ui/stat-card";
import { Toolbar } from "~/components/ui/toolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { AgingBar } from "~/components/ui/aging-bar";
import { PillGroup } from "~/components/ui/pill-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { VendorDetailPanel } from "~/components/vendors/vendor-detail-panel";

export const meta: MetaFunction = () => [
  { title: "Proveedores — FabriFlow" },
  {
    name: "description",
    content: "Directorio de proveedores con desempeño, riesgo y saldo",
  },
];

export const handle = {
  crumb: ["Maestros", "Proveedores"],
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Backend is ready: list comes from existing `/api/vendors` (companies);
  // per-vendor scorecard from `procurement-api.server.ts#fetchVendorScorecard`.
  await requireUser(request);
  return json({ vendors: SAMPLE_VENDORS });
}

const RISK_TONE = {
  Bajo: "moss",
  Medio: "rust",
  Alto: "wine",
} as const;

function onTimeBarTone(pct: number): "moss" | "clay" | "rust" {
  if (pct >= 90) return "moss";
  if (pct >= 80) return "clay";
  return "rust";
}

type ViewMode = "table" | "cards";

export default function VendorsPage() {
  const { vendors } = useLoaderData<typeof loader>();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [selectedId, setSelectedId] = useState<string | null>(vendors[0]?.id ?? null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) set.add(v.category);
    return Array.from(set);
  }, [vendors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (riskFilter !== "all" && v.risk !== riskFilter) return false;
      if (
        q &&
        !v.name.toLowerCase().includes(q) &&
        !v.short.toLowerCase().includes(q) &&
        !v.contact.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [vendors, search, categoryFilter, statusFilter, riskFilter]);

  const selected = vendors.find((v) => v.id === selectedId) ?? null;

  // KPIs
  const activos = vendors.filter((v) => v.status === "Activo").length;
  const onTimeAvg = Math.round(
    vendors.reduce((acc, v) => acc + v.onTime, 0) / Math.max(vendors.length, 1),
  );
  const totalOutstandingMxn = vendors.reduce((acc, v) => {
    if (v.currency === "USD") return acc + v.outstanding * 17.42;
    if (v.currency === "EUR") return acc + v.outstanding * 18.7;
    return acc + v.outstanding;
  }, 0);
  const highRisk = vendors.filter((v) => v.risk === "Alto").length;

  return (
    <AuthLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Directorio de <em>proveedores</em>
            </h1>
            <p className="ff-page-sub">
              {vendors.length} proveedores · {activos} activos · saldo total{" "}
              {fmtCurrency(totalOutstandingMxn, "MXN").symbol}
              {(totalOutstandingMxn / 1000).toFixed(1)}K MXN
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Icon name="download" size={13} />
              Exportar catálogo
            </Button>
            <Button variant="clay" size="sm">
              <Icon name="plus" size={13} />
              Nuevo proveedor
            </Button>
          </div>
        </header>

        {/* KPI strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Activos"
            value={
              <>
                {activos}
                <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
                  {" "}/ {vendors.length}
                </span>
              </>
            }
            delta={{ label: "+2 este mes", direction: "up" }}
          />
          <StatCard
            label="A tiempo (promedio)"
            value={`${onTimeAvg}%`}
            delta={{
              label: onTimeAvg >= 85 ? "estable" : "atención",
              direction: onTimeAvg >= 85 ? "flat" : "dn",
            }}
            sparkPath="M0 22 L10 18 L20 14 L30 16 L40 8 L50 12 L60 6 L70 10 L80 4"
            sparkTone="moss"
          />
          <StatCard
            label="Saldo pendiente"
            currency="$"
            value={
              <>
                {(totalOutstandingMxn / 1000).toFixed(1)}
                <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
                  K
                </span>
              </>
            }
            delta={{ label: "MXN equivalente" }}
          />
          <StatCard
            label="Riesgo alto"
            value={String(highRisk)}
            delta={{
              label: `${highRisk} proveedor${highRisk === 1 ? "" : "es"}`,
              direction: highRisk > 0 ? "dn" : "flat",
            }}
            sparkTone="wine"
          />
        </div>

        {/* Toolbar */}
        <Toolbar>
          <Toolbar.Search
            value={search}
            onChange={setSearch}
            placeholder="Buscar proveedor, contacto, RFC…"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Activo">Activo</SelectItem>
              <SelectItem value="En revisión">En revisión</SelectItem>
              <SelectItem value="Atrasado">Atrasado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Riesgo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Bajo">Bajo</SelectItem>
              <SelectItem value="Medio">Medio</SelectItem>
              <SelectItem value="Alto">Alto</SelectItem>
            </SelectContent>
          </Select>
          <Toolbar.Spacer />
          <PillGroup
            ariaLabel="Modo de vista"
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: "Tabla" },
              { value: "cards", label: "Tarjetas" },
            ]}
          />
        </Toolbar>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {view === "table" ? (
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead className="w-[140px]">A tiempo</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead>Riesgo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((v) => {
                      const m = fmtCurrency(v.outstanding, v.currency);
                      const active = v.id === selectedId;
                      return (
                        <TableRow
                          key={v.id}
                          data-state={active ? "selected" : undefined}
                          className={cn(
                            "cursor-pointer",
                            active && "bg-paper-3",
                          )}
                          onClick={() => setSelectedId(v.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay-deep font-display text-[12px] font-semibold flex-shrink-0">
                                {v.short}
                              </span>
                              <div className="min-w-0">
                                <div className="font-medium text-[13px] truncate max-w-[200px]">
                                  {v.name}
                                </div>
                                <div className="font-mono text-[10.5px] text-ink-3">
                                  {v.id} · desde {v.since}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-block rounded-full border border-line-2 bg-paper px-2 py-0.5 text-[11px] text-ink-2">
                              {v.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-[12px] text-ink-2">
                            {v.city}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] w-8">
                                {v.onTime}%
                              </span>
                              <AgingBar
                                pct={v.onTime}
                                tone={onTimeBarTone(v.onTime)}
                                className="flex-1"
                                label={`A tiempo ${v.name}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono font-medium">
                              {m.symbol}
                              {m.integer}
                              <span className="text-ink-3">.{m.decimal}</span>
                            </span>
                            <span className="ml-1 font-mono text-[10px] text-ink-3">
                              {m.code}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge tone={RISK_TONE[v.risk]}>{v.risk}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge tone={STATUS_TONE[v.status] ?? "ink"}>
                              {v.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-14">
                          <Icon
                            name="vendors"
                            size={32}
                            className="mx-auto mb-2 text-ink-4"
                          />
                          <div className="text-[13px] font-medium text-ink-2">
                            Sin resultados
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((v) => (
                <VendorCard
                  key={v.id}
                  vendor={v}
                  active={v.id === selectedId}
                  onClick={() => setSelectedId(v.id)}
                />
              ))}
            </div>
          )}

          <VendorDetailPanel vendor={selected} />
        </div>
      </div>
    </AuthLayout>
  );
}

function VendorCard({
  vendor,
  active,
  onClick,
}: {
  vendor: SampleVendor;
  active: boolean;
  onClick: () => void;
}) {
  const m = fmtCurrency(vendor.outstanding, vendor.currency);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-clay bg-paper-2"
          : "border-line bg-paper hover:border-line-2",
      )}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-clay-soft text-clay-deep font-display text-[13px] font-semibold flex-shrink-0">
          {vendor.short}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{vendor.name}</div>
          <div className="text-[10.5px] text-ink-3 font-mono truncate">
            {vendor.city} · {vendor.category}
          </div>
        </div>
        <Badge tone={STATUS_TONE[vendor.status] ?? "ink"}>{vendor.status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-md bg-paper-2 px-2.5 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            A tiempo
          </div>
          <div className="font-mono text-[14px] mt-0.5">{vendor.onTime}%</div>
        </div>
        <div className="rounded-md bg-paper-2 px-2.5 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            Saldo
          </div>
          <div className="font-mono text-[14px] mt-0.5">
            {m.symbol}
            {m.integer}
          </div>
        </div>
      </div>
    </button>
  );
}
