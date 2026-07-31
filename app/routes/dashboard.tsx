import { useMemo, useState } from "react";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useNavigation, useRevalidator } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";

import {
  requireUser,
  getFullSession,
} from "~/lib/session.server";
import {
  fetchInvoices,
  fetchAllInvoices,
  fetchPendingBuyerActivation,
  apiRequest,
  type PendingBuyerActivation,
} from "~/lib/api.server";
import { useUser } from "~/lib/auth-context";
import { useRole } from "~/lib/role-context";
import { cn, statusTone, statusLabel } from "~/lib/utils";

import { AuthLayout } from "~/components/layout/auth-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Icon } from "~/components/ui/icon";
import { StatCard } from "~/components/ui/stat-card";
import { PillGroup } from "~/components/ui/pill-group";
import { AgingBar } from "~/components/ui/aging-bar";
import { Timeline } from "~/components/ui/timeline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { DocStrip, type DocType } from "~/components/ui/doc-chip";
import { DataLoadError } from "~/components/ui/error-state";
import { DashboardLoadingSkeleton } from "~/components/ui/loading-state";
import { MultiPaymentDialog } from "~/components/dashboard/multi-payment-dialog";

import type { Invoice, InvoiceBackend } from "~/types";

interface ActivityEvent {
  sourceId: string;
  kind: string;
  ts: string;
  description: string;
  action: string;
  actor?: string | null;
  entityRef?: string | null;
  entityType?: string | null;
}

export const meta: MetaFunction = () => [
  { title: "Panel — FabriFlow" },
  {
    name: "description",
    content: "Visión general financiera y métricas clave",
  },
];

// ---------- helpers ----------

function getRoleType(
  role: string | undefined,
): "super_admin" | "admin" | "proveedor" | "unknown" {
  const r = (role || "").toLowerCase().trim();
  if (r === "super admin" || r === "superadmin") return "super_admin";
  if (r.includes("admin") || r.includes("administrador")) return "admin";
  if (r.includes("proveedor") || r.includes("vendor")) return "proveedor";
  return "unknown";
}

interface VendorMetrics {
  totalInvoices: number;
  totalMXN: number;
  totalUSD: number;
  pendiente: number;
  recibido: number;
  pagado: number;
  completado: number;
  rechazado: number;
  ultimaFactura: string | null;
  porCobrarMXN: number; // Para vendors: dinero que esperan recibir
  porCobrarUSD: number;
}

function emptyVendorMetrics(): VendorMetrics {
  return {
    totalInvoices: 0,
    totalMXN: 0,
    totalUSD: 0,
    pendiente: 0,
    recibido: 0,
    pagado: 0,
    completado: 0,
    rechazado: 0,
    ultimaFactura: null,
    porCobrarMXN: 0,
    porCobrarUSD: 0,
  };
}

function calculateVendorMetrics(invoices: InvoiceBackend[]): VendorMetrics {
  const m = emptyVendorMetrics();
  let latest: Date | null = null;

  for (const inv of invoices) {
    // Total facturado (histórico)
    if (inv.moneda === "MXN") m.totalMXN += inv.total;
    else if (inv.moneda === "USD") m.totalUSD += inv.total;

    const e = (inv.estado || "pendiente").toLowerCase();
    if (e === "pendiente") m.pendiente++;
    else if (e === "recibido") m.recibido++;
    else if (e === "pagado") m.pagado++;
    else if (e === "completado") m.completado++;
    else if (e === "rechazado") m.rechazado++;

    // Por cobrar: solo facturas pendientes o recibidas (no pagadas)
    if (e === "pendiente" || e === "recibido") {
      if (inv.moneda === "MXN") m.porCobrarMXN += inv.total;
      else if (inv.moneda === "USD") m.porCobrarUSD += inv.total;
    }

    const d = new Date(inv.fechaEntrada || inv.createdAt);
    if (!latest || d > latest) {
      latest = d;
      m.ultimaFactura = inv.fechaEntrada || inv.createdAt;
    }
  }
  m.totalInvoices = invoices.length;
  return m;
}

interface AgingBucket {
  label: string;
  amount: number;
  count: number;
  share: number;
}

/**
 * Compute aging buckets from invoices client-side as a Phase-2 placeholder.
 * Phase 3 will replace this with a real `/api/aging` endpoint computed on
 * the server with multi-currency conversion.
 */
function computeAging(invoices: InvoiceBackend[], now = new Date()): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: "Corriente", amount: 0, count: 0, share: 0 },
    { label: "1–30 días", amount: 0, count: 0, share: 0 },
    { label: "31–60 días", amount: 0, count: 0, share: 0 },
    { label: "61–90 días", amount: 0, count: 0, share: 0 },
    { label: "+90 días", amount: 0, count: 0, share: 0 },
  ];
  let total = 0;
  for (const inv of invoices) {
    const e = (inv.estado || "pendiente").toLowerCase();
    if (e === "pagado" || e === "completado" || e === "rechazado") continue;
    const issueDate = new Date(inv.fechaEntrada || inv.fechaEmision || inv.createdAt);
    const days = Math.floor((now.getTime() - issueDate.getTime()) / 86_400_000);
    const idx = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    buckets[idx].amount += inv.total;
    buckets[idx].count += 1;
    total += inv.total;
  }
  if (total > 0) {
    for (const b of buckets) b.share = Math.round((b.amount / total) * 100);
  }
  return buckets;
}

function formatMoney(n: number, currency = "MXN"): { symbol: string; integer: string; decimal: string } {
  const sym = currency === "USD" ? "US$" : currency === "EUR" ? "€" : "$";
  const [intPart, decPart] = n.toFixed(2).split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return { symbol: sym, integer: formatted, decimal: decPart };
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

function dayPart(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// Inferred document presence from invoice keys
function inferDocs(inv: InvoiceBackend): DocType[] {
  const docs: DocType[] = [];

  // Si la factura está vinculada a una orden de compra, siempre hay OC
  if (inv.purchaseOrder || inv.ordenCompraKey || inv.ordenCompraUrl) {
    docs.push("OC");
  }

  // Si hay factura vinculada a una orden, asumir que también hay REM
  if (inv.purchaseOrder) {
    docs.push("REM");
  }

  // La factura (XML/PDF) siempre está presente si existe el registro
  if (inv.pdfKey || inv.xmlKey || inv.pdfUrl || inv.xmlUrl) {
    docs.push("FAC");
  }

  // Si el estado es "pagada" o "completada", mostrar ícono de pago
  if (inv.estado === "pagada" || inv.estado === "completada") {
    docs.push("PAGO");
  }

  return docs;
}

// ---------- loader ----------

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  const token = session?.accessToken;
  const companyId = user.company;

  const roleType = getRoleType(user.role);
  const permissions = user.permissions || [];
  const isVendor = roleType === "proveedor";

  let recentInvoices: InvoiceBackend[] = [];
  let allInvoices: InvoiceBackend[] = [];
  let vendorMetrics: VendorMetrics | null = null;

  let totalRevenue = 0;
  let totalInvoices = 0;
  let activeProviders = 0;
  let balanceUSD = 0;
  let balanceMXN = 0;
  let porPagarMXN = 0;
  let porPagarUSD = 0;
  let facturasVencidas = 0;
  let montoVencidoMXN = 0;
  let venceEn7Dias = 0;
  let montoVenceEn7Dias = 0;
  let venceEn30Dias = 0;
  let montoVenceEn30Dias = 0;
  let dpo = 0;
  let porcentajePagadoATiempo = 0;
  let topProveedores: Array<{ nombre: string; monto: number; facturas: number }> = [];
  let activity: ActivityEvent[] = [];

  let errorMsg: string | null = null;
  let pendingBuyerActivation: PendingBuyerActivation | null = null;

  // Solo mostramos el banner de activación a usuarios cuyo rol activo es
  // Vendor. Para Admins/SuperAdmins no aplica: ya operan como comprador.
  if (isVendor && token) {
    pendingBuyerActivation = await fetchPendingBuyerActivation(token);
  }

  try {
    if (!token || !companyId) {
      errorMsg = "Sesión incompleta — vuelve a iniciar sesión.";
    } else if (isVendor) {
      const r = await fetchInvoices(token, companyId, { limit: 100 });
      const invs = r.data || [];
      recentInvoices = invs.slice(0, 6);
      allInvoices = invs;
      vendorMetrics = calculateVendorMetrics(invs);
    } else {
      const r = await fetchAllInvoices(token, companyId, { limit: 100 });
      const invs = r.data || [];
      allInvoices = invs;
      recentInvoices = invs.slice(0, 6);

      const now = new Date();
      const en7Dias = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const en30Dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      let totalDiasPago = 0;
      let facturasPagadas = 0;
      let facturasATiempo = 0;

      // Map para agrupar por proveedor
      const porProveedor = new Map<string, { nombre: string; monto: number; facturas: number }>();

      for (const inv of invs) {
        const estado = (inv.estado || "pendiente").toLowerCase();
        const isPending = estado === "pendiente" || estado === "recibido";
        const fechaEmision = new Date(inv.fechaEmision || inv.createdAt);
        const diasTranscurridos = Math.floor((now.getTime() - fechaEmision.getTime()) / (24 * 60 * 60 * 1000));

        // Totales históricos
        if (inv.moneda === "USD") {
          balanceUSD += inv.total;
        } else {
          balanceMXN += inv.total;
        }
        totalRevenue += inv.total;

        // PASIVO: Por pagar (solo facturas pendientes/recibidas)
        if (isPending) {
          if (inv.moneda === "USD") {
            porPagarUSD += inv.total;
          } else {
            porPagarMXN += inv.total;
          }

          // Vencidas (más de 30 días desde emisión)
          if (diasTranscurridos > 30) {
            facturasVencidas++;
            if (inv.moneda === "MXN") montoVencidoMXN += inv.total;
          }

          // Vencen en 7 días (entre 23 y 30 días)
          if (diasTranscurridos >= 23 && diasTranscurridos <= 30) {
            venceEn7Dias++;
            if (inv.moneda === "MXN") montoVenceEn7Dias += inv.total;
          }

          // Vencen en 30 días (entre 0 y 30 días)
          if (diasTranscurridos >= 0 && diasTranscurridos <= 30) {
            venceEn30Dias++;
            if (inv.moneda === "MXN") montoVenceEn30Dias += inv.total;
          }

          // Agrupar por proveedor
          const proveedorNombre = inv.nombreEmisor || "Proveedor desconocido";
          const existing = porProveedor.get(proveedorNombre) || { nombre: proveedorNombre, monto: 0, facturas: 0 };
          existing.monto += inv.moneda === "MXN" ? inv.total : 0; // Solo MXN por ahora
          existing.facturas += 1;
          porProveedor.set(proveedorNombre, existing);
        }

        // DPO y % pagado a tiempo (solo facturas ya pagadas)
        if (estado === "pagado" || estado === "completado") {
          const fechaPago = new Date(inv.updatedAt);
          const diasPago = Math.floor((fechaPago.getTime() - fechaEmision.getTime()) / (24 * 60 * 60 * 1000));
          totalDiasPago += diasPago;
          facturasPagadas++;

          // Pagado a tiempo si fue antes de 30 días
          if (diasPago <= 30) facturasATiempo++;
        }
      }

      totalInvoices = invs.length;
      activeProviders = new Set(invs.map((i) => i.vendor).filter(Boolean)).size;
      dpo = facturasPagadas > 0 ? Math.round(totalDiasPago / facturasPagadas) : 0;
      porcentajePagadoATiempo = facturasPagadas > 0 ? Math.round((facturasATiempo / facturasPagadas) * 100) : 0;

      // Top 5 proveedores
      topProveedores = Array.from(porProveedor.values())
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 5);
    }

    // Obtener actividad reciente (últimos 10 eventos)
    if (token && companyId) {
      try {
        activity = await apiRequest<ActivityEvent[]>(
          "/api/activity?limit=10",
          {
            method: "GET",
            headers: { "X-Company-Id": companyId },
          },
          token
        );
      } catch (activityError) {
        console.error("Error loading activity:", activityError);
        // No bloqueamos el dashboard si falla activity
      }
    }
  } catch (e) {
    console.error("Dashboard loader error:", e);
    errorMsg = "Error al cargar los datos del panel.";
  }

  const aging = computeAging(allInvoices);

  return json({
    error: errorMsg,
    user,
    roleType,
    permissions,
    pendingBuyerActivation,
    vendorMetrics,
    metrics: {
      totalRevenue,
      totalInvoices,
      activeProviders,
      balanceUSD,
      balanceMXN,
      porPagarMXN,
      porPagarUSD,
      facturasVencidas,
      montoVencidoMXN,
      venceEn7Dias,
      montoVenceEn7Dias,
      venceEn30Dias,
      montoVenceEn30Dias,
      dpo,
      porcentajePagadoATiempo,
      topProveedores,
    },
    recentInvoices,
    aging,
    activity,
  });
}

// ---------- view ----------

type Period = "hoy" | "semana" | "mes" | "trim";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
  { value: "trim", label: "Trim." },
];

const AGING_TONES = ["moss", "clay", "rust", "wine", "wine"] as const;

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  if (data.error) {
    return (
      <AuthLayout>
        <DataLoadError
          resource="Dashboard"
          onRetry={() => revalidator.revalidate()}
        />
      </AuthLayout>
    );
  }
  if (!data.metrics && !data.vendorMetrics) {
    return (
      <AuthLayout>
        <DashboardLoadingSkeleton />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <DashboardBody data={data} />
    </AuthLayout>
  );
}

interface DashboardBodyProps {
  data: ReturnType<typeof useLoaderData<typeof loader>>;
}

function DashboardBody({ data }: DashboardBodyProps) {
  const { user } = useUser();
  const { role: perspective } = useRole();
  const [period, setPeriod] = useState<Period>("mes");
  const [multiPayOpen, setMultiPayOpen] = useState(false);

  const isVendor = data.roleType === "proveedor";
  const showVendorView = isVendor || perspective === "vendor";

  const greeting = `${dayPart()}, ${user?.name?.split(" ")[0] ?? "—"}`;
  const subtitle = showVendorView
    ? `${user?.companyName ?? "Tu empresa"} · facturas y pagos recibidos`
    : `${user?.companyName ?? "Tu empresa"} · Control de facturas y pagos a proveedores`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ff-page-title">
            {greeting.split(",")[0]},{" "}
            <em>{greeting.split(",")[1]?.trim() ?? "—"}</em>
          </h1>
          <p className="ff-page-sub">{subtitle}</p>
        </div>
        <PillGroup
          ariaLabel="Período"
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS}
        />
      </header>

      {showVendorView && data.pendingBuyerActivation ? (
        <BuyerModeBanner activation={data.pendingBuyerActivation} />
      ) : null}

      {showVendorView && data.vendorMetrics ? (
        <VendorKpis metrics={data.vendorMetrics} />
      ) : (
        <FactoryKpis metrics={data.metrics} />
      )}

      {/* Top proveedores - solo para admins */}
      {!showVendorView && data.metrics.topProveedores.length > 0 && (
        <TopProveedoresCard proveedores={data.metrics.topProveedores} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <RecentInvoicesCard
          invoices={data.recentInvoices}
          isVendor={showVendorView}
        />
        <div className="flex flex-col gap-4">
          <AgingCard buckets={data.aging} />
          <ActivityCard isVendor={showVendorView} activity={data.activity || []} />
        </div>
      </div>

      <MultiPaymentDialog
        open={multiPayOpen}
        onOpenChange={setMultiPayOpen}
        invoices={[] as Invoice[]}
      />
    </div>
  );
}

// ---------- KPI grids ----------

function VendorKpis({ metrics }: { metrics: VendorMetrics }) {
  const porCobrarMXN = formatMoney(metrics.porCobrarMXN, "MXN");
  const porCobrarUSD = formatMoney(metrics.porCobrarUSD, "USD");
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Por cobrar (MXN)"
        currency={porCobrarMXN.symbol}
        value={
          <>
            {porCobrarMXN.integer}
            <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
              .{porCobrarMXN.decimal}
            </span>
          </>
        }
        delta={{
          label: `${metrics.pendiente + metrics.recibido} facturas pendientes`,
        }}
        sparkPath="M0 22 L10 18 L20 14 L30 16 L40 8 L50 12 L60 6 L70 10 L80 4"
      />
      <StatCard
        label="Por cobrar (USD)"
        currency={porCobrarUSD.symbol}
        value={
          <>
            {porCobrarUSD.integer}
            <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
              .{porCobrarUSD.decimal}
            </span>
          </>
        }
        delta={{ label: `Solo facturas pendientes de pago` }}
      />
      <StatCard
        label="Facturas cobradas"
        value={String(metrics.pagado + metrics.completado)}
        delta={{
          label: `${metrics.completado} completadas · ${metrics.pagado} pagadas`,
          direction: "up",
        }}
      />
      <StatCard
        label="Última factura"
        value={formatDateShort(metrics.ultimaFactura)}
        delta={{
          label: metrics.ultimaFactura
            ? "Última subida"
            : "Aún no has subido facturas",
        }}
      />
    </div>
  );
}

interface FactoryMetrics {
  totalRevenue: number;
  totalInvoices: number;
  activeProviders: number;
  balanceUSD: number;
  balanceMXN: number;

  // Pasivo total (lo que DEBEMOS a proveedores)
  porPagarMXN: number; // Solo facturas pendientes/recibidas
  porPagarUSD: number;

  // Vencimientos
  facturasVencidas: number;
  montoVencidoMXN: number;
  venceEn7Dias: number; // Cantidad de facturas
  montoVenceEn7Dias: number;
  venceEn30Dias: number;
  montoVenceEn30Dias: number;

  // Métricas de eficiencia
  dpo: number; // Days Payable Outstanding
  porcentajePagadoATiempo: number;

  // Top proveedores
  topProveedores: Array<{ nombre: string; monto: number; facturas: number }>;
}

function FactoryKpis({ metrics }: { metrics: FactoryMetrics }) {
  const porPagar = formatMoney(metrics.porPagarMXN, "MXN");
  const vencido = formatMoney(metrics.montoVencidoMXN, "MXN");
  const vence7dias = formatMoney(metrics.montoVenceEn7Dias, "MXN");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
      {/* Pasivo total por pagar */}
      <StatCard
        label="Pasivo total (MXN)"
        currency={porPagar.symbol}
        value={
          <>
            {porPagar.integer}
            <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
              .{porPagar.decimal}
            </span>
          </>
        }
        delta={{
          label: `${metrics.activeProviders} proveedores activos`,
        }}
        sparkPath="M0 22 L10 18 L20 14 L30 16 L40 8 L50 12 L60 6 L70 10 L80 4"
      />

      {/* Facturas vencidas */}
      <StatCard
        label="Vencidas (+30d)"
        value={String(metrics.facturasVencidas)}
        delta={{
          label: metrics.facturasVencidas > 0
            ? `${vencido.symbol}${vencido.integer}.${vencido.decimal} adeudado`
            : "✓ Sin facturas vencidas",
          direction: metrics.facturasVencidas > 0 ? "dn" : "up",
        }}
      />

      {/* Vencen en 7 días */}
      <StatCard
        label="Vencen en 7 días"
        value={String(metrics.venceEn7Dias)}
        delta={{
          label: metrics.venceEn7Dias > 0
            ? `${vence7dias.symbol}${vence7dias.integer}.${vence7dias.decimal} a pagar`
            : "Ninguna próxima",
        }}
      />

      {/* DPO - Days Payable Outstanding */}
      <StatCard
        label="DPO"
        value={`${metrics.dpo}d`}
        delta={{
          label: metrics.dpo > 0
            ? `Días promedio de pago`
            : "Sin datos históricos",
          direction: metrics.dpo > 45 ? "up" : metrics.dpo > 30 ? "flat" : metrics.dpo > 0 ? "dn" : undefined,
        }}
      />

      {/* Eficiencia de pago */}
      <StatCard
        label="Pagado a tiempo"
        value={`${metrics.porcentajePagadoATiempo}%`}
        delta={{
          label: metrics.porcentajePagadoATiempo >= 80
            ? "✓ Excelente cumplimiento"
            : metrics.porcentajePagadoATiempo >= 60
            ? "Cumplimiento aceptable"
            : "Requiere atención",
          direction: metrics.porcentajePagadoATiempo >= 80 ? "up" : metrics.porcentajePagadoATiempo >= 60 ? "flat" : "dn",
        }}
      />
    </div>
  );
}

// ---------- Recent invoices ----------

function RecentInvoicesCard({
  invoices,
  isVendor,
}: {
  invoices: InvoiceBackend[];
  isVendor: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isVendor ? "Mis facturas recientes" : "Facturas recientes"}</CardTitle>
        <CardDescription>
          Últimas 6 facturas por fecha de entrada
        </CardDescription>
        <Link
          to="/invoices"
          className="ml-auto inline-flex items-center gap-1 text-[12px] text-clay hover:underline"
        >
          Ver todas <Icon name="arrow" size={12} />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {invoices.length === 0 ? (
          <div className="p-6 text-[13px] text-ink-3 text-center">
            Sin facturas recientes
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>{isVendor ? "Cliente" : "Proveedor"}</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const tone = statusTone(inv.estado);
                const m = formatMoney(inv.total, inv.moneda);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-[12px]">
                      <Link
                        to={`/invoice/${inv.id}`}
                        className="hover:text-clay"
                      >
                        {inv.folio}
                      </Link>
                    </TableCell>
                    <TableCell className="truncate max-w-[180px]">
                      {isVendor ? inv.nombreReceptor : inv.nombreEmisor}
                    </TableCell>
                    <TableCell>
                      <DocStrip docs={inferDocs(inv)} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {m.symbol}
                      {m.integer}
                      <span className="text-ink-3">.{m.decimal}</span>
                      <span className="ml-1 text-ink-3 text-[11px]">{inv.moneda}</span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={tone}>{statusLabel(inv.estado)}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Aging ----------

function AgingCard({ buckets }: { buckets: AgingBucket[] }) {
  const total = buckets.reduce((acc, b) => acc + b.amount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Antigüedad de saldos (AP Aging)</CardTitle>
        <CardDescription>Pasivos por antigüedad de emisión</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {buckets.map((b, i) => {
          const pct = total > 0 ? (b.amount / total) * 100 : 0;
          const tone = AGING_TONES[i] ?? "moss";
          const m = formatMoney(b.amount, "MXN");
          return (
            <div key={b.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="font-mono uppercase tracking-wider text-ink-3">
                  {b.label}
                </span>
                <span className="font-mono text-ink">
                  {m.symbol}
                  {m.integer}
                  <span className="text-ink-3">.{m.decimal}</span>
                  <span className="ml-1 text-ink-3 text-[10px]">
                    {b.count} fact · {b.share}%
                  </span>
                </span>
              </div>
              <AgingBar pct={pct} tone={tone} label={b.label} />
            </div>
          );
        })}
        {total === 0 ? (
          <div className="text-[12px] text-ink-3 text-center pt-2">
            Sin saldos abiertos
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------- Activity feed ----------

function TopProveedoresCard({
  proveedores,
}: {
  proveedores: Array<{ nombre: string; monto: number; facturas: number }>;
}) {
  const total = proveedores.reduce((acc, p) => acc + p.monto, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top proveedores por monto adeudado</CardTitle>
        <CardDescription>
          Concentración de pasivos por proveedor
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {proveedores.map((prov, i) => {
          const m = formatMoney(prov.monto, "MXN");
          const pct = total > 0 ? Math.round((prov.monto / total) * 100) : 0;
          const tone = i === 0 ? "wine" : i === 1 ? "rust" : i === 2 ? "clay" : "moss";

          return (
            <div key={prov.nombre} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="font-medium text-ink truncate">
                  {i + 1}. {prov.nombre}
                </span>
                <span className="font-mono text-ink">
                  {m.symbol}
                  {m.integer}
                  <span className="text-ink-3">.{m.decimal}</span>
                  <span className="ml-1.5 text-ink-3 text-[10px]">
                    {prov.facturas} fact · {pct}%
                  </span>
                </span>
              </div>
              <AgingBar pct={pct} tone={tone} label={prov.nombre} />
            </div>
          );
        })}
        {proveedores.length === 0 && (
          <div className="text-[12px] text-ink-3 text-center pt-2">
            Sin proveedores con saldo pendiente
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityCard({ isVendor, activity }: { isVendor: boolean; activity: ActivityEvent[] }) {
  // Mapear eventos reales a formato de UI
  const items = activity.map((event) => {
    // Determinar el tono según el tipo de acción
    let tone: "moss" | "clay" | "rust" | "wine" | "ink" = "ink";
    if (event.action.includes("payment") || event.action.includes("confirm")) {
      tone = "moss";
    } else if (event.action.includes("create") || event.action.includes("upload")) {
      tone = "clay";
    } else if (event.action.includes("reject") || event.action.includes("delete")) {
      tone = "wine";
    } else if (event.action.includes("approve")) {
      tone = "moss";
    }

    // Formatear timestamp a algo más legible
    const formatTime = (ts: string) => {
      try {
        const date = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (days > 1) return `hace ${days} días`;
        if (days === 1) return "ayer";
        if (hours > 0) return `hace ${hours}h`;
        return "hace poco";
      } catch {
        return "";
      }
    };

    return {
      tone,
      body: event.description || event.action,
      meta: formatTime(event.ts),
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad reciente</CardTitle>
        <CardDescription>Eventos y alertas del sistema</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-ink-3">
            Sin actividad reciente
          </div>
        ) : (
          <Timeline>
            {items.map((it, i) => (
              <Timeline.Item key={i} tone={it.tone} meta={it.meta}>
                {it.body}
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Buyer-mode activation banner ----------

function BuyerModeBanner({
  activation,
}: {
  activation: PendingBuyerActivation;
}) {
  const navigation = useNavigation();
  const isActivating =
    navigation.state !== "idle" &&
    navigation.formAction === "/dashboard/activate-buyer-mode";

  return (
    <Card className="border-clay/30 bg-clay-soft">
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-clay text-paper">
            <Icon name="vendors" size={16} />
          </span>
          <div>
            <p className="text-[13px] font-medium text-clay-deep">
              ¿Quieres que tus proveedores te entreguen como tú entregas?
            </p>
            <p className="mt-0.5 text-[12px] text-ink-2">
              Activa la operación de comprador para{" "}
              <strong>{activation.companyName}</strong> y empieza a invitar a
              tus propios proveedores. Usaremos los mismos datos que ya nos
              compartiste.
            </p>
          </div>
        </div>
        <Form method="post" action="/dashboard/activate-buyer-mode">
          <input
            type="hidden"
            name="companyId"
            value={activation.companyId}
          />
          <Button
            type="submit"
            variant="clay"
            className="whitespace-nowrap"
            disabled={isActivating}
          >
            {isActivating ? "Activando…" : "Activar modo comprador"}
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
