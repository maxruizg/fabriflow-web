import { useMemo, useState } from "react";
import type {
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
  Link,
  useLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  ErrorScreen,
  type ErrorScreenAction,
} from "~/components/ui/error-screen";

import { requireUser, getFullSession } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import { useRole } from "~/lib/role-context";
import { useSidebar } from "~/lib/sidebar-context";
import { cn } from "~/lib/utils";
import {
  fetchActiveVendors,
  fetchCompany,
  fetchInvoiceBalance,
  fetchOrders,
  type ActiveVendorSummary,
  type InvoiceBalance,
  type OrderBackend,
  type OrderStatusBackend,
} from "~/lib/procurement-api.server";
// `OrderBackend` is referenced in the loader's typed json fallback below.
import {
  fmtCurrency,
  fmtDate,
  STATUS_TONE,
  type SampleOrder,
} from "~/lib/sample-data";
import type { DocType } from "~/components/ui/doc-chip";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Toolbar } from "~/components/ui/toolbar";
import { DocStrip } from "~/components/ui/doc-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { OrderDetailPanel } from "~/components/orders/order-detail-panel";
import { listPaymentComplementsForInvoice } from "~/lib/payment-complements-api.server";

export const meta: MetaFunction = () => [
  { title: "Órdenes — FabriFlow" },
  {
    name: "description",
    content: "Gestiona órdenes de compra, documentos y proveedores",
  },
];

export const handle = {
  crumb: ["Operación", "Órdenes"],
  cta: null, // Deshabilitamos el CTA automático porque ya tenemos el botón en el header
};

const STATUS_LABEL: Record<OrderStatusBackend, string> = {
  creada: "Creada",
  autorizada: "Autorizada",
  facturada: "Facturada",
  recibido: "Recibido",
  en_transito: "En tránsito",
  confirmado: "Confirmado",
  revision_calidad: "Revisión calidad",
  cerrado: "Cerrado",
  incidencia: "Incidencia",
  pendiente_conf: "Pendiente conf.",
  rechazado: "Rechazado",
  pagada: "Pagada",
};

function stripCompanyPrefix(id: string): string {
  return id.startsWith("company:") ? id.slice("company:".length) : id;
}

const CURRENCY_FALLBACK: SampleOrder["cur"] = "MXN";
function normalizeCurrency(c: string): SampleOrder["cur"] {
  if (c === "USD" || c === "EUR" || c === "MXN") return c;
  return CURRENCY_FALLBACK;
}

interface RepSummary {
  count: number;
  firstFolio: string | null;
  firstId: string | null;
}

function toSampleShape(
  o: OrderBackend,
  vendorNameById: Map<string, string>,
  companyNameById: Map<string, string>,
  invoiceBalances: Map<string, InvoiceBalance>,
  repsByInvoice: Map<string, RepSummary>,
): SampleOrder {
  const docs: DocType[] = [];
  // The OC is the order itself — once a row exists, the OC document exists,
  // even if the backend hasn't materialized the PDF yet (`docState.ocUrl` is
  // populated lazily on first /pdf or /send call). Always show its chip as
  // active so operators can tell at a glance the OC is in hand.
  docs.push("OC");
  if (o.docState.facInvoiceId) docs.push("FAC");
  if (o.docState.remUrl) docs.push("REM");
  if (o.docState.ncUrl) docs.push("NC");
  if (o.docState.paymentReceiptUrl) docs.push("PAGO");
  const invoiceId = o.docState.facInvoiceId;
  const rep = invoiceId ? repsByInvoice.get(invoiceId) : undefined;
  if (rep && rep.count > 0) docs.push("REP");

  const vendorId = stripCompanyPrefix(o.vendor);
  const vendorName =
    vendorNameById.get(vendorId) ?? "Proveedor desconocido";

  const companyId = stripCompanyPrefix(o.company);
  const companyName = companyNameById.get(companyId) ?? undefined;

  // `o.amount` viene del backend como SUBTOTAL (suma de line_total sin IVA).
  // Para la UI mostramos el TOTAL con IVA — eso es lo que el usuario ve en
  // el PDF y lo que se compara contra la factura. iva_rate default 16 %.
  const ivaRate = typeof o.ivaRate === "number" ? o.ivaRate : 16;
  const totalWithTax = Math.round(o.amount * (1 + ivaRate / 100) * 100) / 100;

  const invoiceBalance = invoiceId
    ? invoiceBalances.get(invoiceId) ?? null
    : null;

  return {
    id: o.id,
    vendor: vendorName,
    vendorId,
    company: companyName,
    companyId,
    date: o.date,
    due: o.due ?? "",
    amount: totalWithTax,
    cur: normalizeCurrency(o.currency),
    status: o.status, // Mantener el status original del backend para STATUS_TONE
    items: o.itemsCount,
    docs,
    history: o.history,
    docState: o.docState,
    folio: o.folio,
    invoiceBalance,
    paymentMethod: o.paymentMethod ?? null,
    paymentComplementsCount: rep?.count ?? 0,
    paymentComplementFirstFolio: rep?.firstFolio ?? null,
    paymentComplementFirstId: rep?.firstId ?? null,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({
      orders: [] as SampleOrder[],
      ordersRaw: [] as OrderBackend[],
      vendors: [] as ActiveVendorSummary[],
    });
  }

  try {
    const [response, vendors] = await Promise.all([
      fetchOrders(session.accessToken, user.company, { limit: 50 }),
      fetchActiveVendors(session.accessToken, user.company).catch(
        (e: unknown) => {
          console.warn("[orders] fetchActiveVendors failed:", e);
          return [] as ActiveVendorSummary[];
        },
      ),
    ]);
    const vendorNameById = new Map<string, string>();
    for (const v of vendors) {
      // Usar vendorLegalName (nombre de la empresa) si existe, sino usar name (nombre del contacto)
      const displayName = v.vendorLegalName || v.name;
      vendorNameById.set(v.id, displayName);
    }

    // Para vendors: obtener los nombres de las companies (clientes)
    const companyIds = Array.from(
      new Set(
        response.data
          .map((o) => stripCompanyPrefix(o.company))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const companyPairs = await Promise.all(
      companyIds.map((id) =>
        fetchCompany(session.accessToken!, id)
          .then((company) => [id, company.name] as const)
          .catch((e: unknown) => {
            console.warn(`[orders] fetchCompany(${id}) failed:`, e);
            return null;
          }),
      ),
    );
    const companyNameById = new Map<string, string>();
    for (const pair of companyPairs) {
      if (pair) companyNameById.set(pair[0], pair[1]);
    }

    // Para cada OC con factura vinculada, traemos el saldo en paralelo. Es
    // no-fatal: si una falla, esa OC simplemente no muestra balance. Reuso
    // el Map para evitar fetches duplicados si dos OCs comparten factura.
    const invoiceIds = Array.from(
      new Set(
        response.data
          .map((o) => o.docState.facInvoiceId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const balancePairs = await Promise.all(
      invoiceIds.map((id) =>
        fetchInvoiceBalance(session.accessToken!, user.company!, id)
          .then((bal) => [id, bal] as const)
          .catch((e: unknown) => {
            console.warn(`[orders] fetchInvoiceBalance(${id}) failed:`, e);
            return null;
          }),
      ),
    );
    const invoiceBalances = new Map<string, InvoiceBalance>();
    for (const pair of balancePairs) {
      if (pair) invoiceBalances.set(pair[0], pair[1]);
    }

    // Para OCs con factura PPD, traemos los REPs (Complementos de Pago) en
    // paralelo. Es no-fatal: si una falla, esa OC simplemente reporta 0 REPs.
    const ppdInvoiceIds = response.data
      .filter((o) => o.paymentMethod === "PPD" && o.docState.facInvoiceId)
      .map((o) => o.docState.facInvoiceId!)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);
    const repPairs = await Promise.all(
      ppdInvoiceIds.map((id) => {
        const uuid = id.startsWith("invoice:") ? id.slice("invoice:".length) : id;
        return listPaymentComplementsForInvoice(
          session.accessToken!,
          user.company!,
          uuid,
        )
          .then((page) => [id, page] as const)
          .catch((e: unknown) => {
            console.warn(
              `[orders] listPaymentComplementsForInvoice(${uuid}) failed:`,
              e,
            );
            return null;
          });
      }),
    );
    const repsByInvoice = new Map<string, RepSummary>();
    for (const pair of repPairs) {
      if (!pair) continue;
      const [invId, page] = pair;
      repsByInvoice.set(invId, {
        count: page.data.length,
        firstFolio: page.data[0]?.folio ?? null,
        firstId: page.data[0]?.id ?? null,
      });
    }

    return json({
      orders: response.data.map((o) =>
        toSampleShape(o, vendorNameById, companyNameById, invoiceBalances, repsByInvoice),
      ),
      ordersRaw: response.data,
      vendors,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error("[orders] fetchOrders failed:", error);
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status) || 500
        : 500;
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las órdenes";
    throw new Response(message, { status });
  }
}

type StatusFilter = "all" | "creada" | "autorizada" | "en_proceso" | "facturada" | "pagada" | "completada" | "rechazada";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "creada", label: "Creada" },
  { value: "autorizada", label: "Autorizada" },
  { value: "en_proceso", label: "En proceso" },
  { value: "facturada", label: "Facturada" },
  { value: "pagada", label: "Pagada" },
  { value: "completada", label: "Completada" },
  { value: "rechazada", label: "Rechazada" },
];

function matchesFilter(o: SampleOrder, f: StatusFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "creada":
      return o.status === "creada";
    case "autorizada":
      return o.status === "autorizada";
    case "en_proceso":
      return ["recibido", "en_transito", "confirmado", "pendiente_conf", "revision_calidad"].includes(o.status);
    case "facturada":
      return o.status === "facturada";
    case "pagada":
      return o.status === "pagada";
    case "completada":
      return o.status === "cerrado";
    case "rechazada":
      return o.status === "rechazado";
  }
}

export default function OrdersPage() {
  const { orders, ordersRaw, vendors } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const { role } = useRole();
  const { sidebarOpen } = useSidebar();
  const isVendor = role === "vendor";

  const orderBackendById = useMemo(() => {
    const m = new Map<string, OrderBackend>();
    for (const o of ordersRaw) m.set(o.id, o);
    return m;
  }, [ordersRaw]);
  const vendorContactById = useMemo(() => {
    const m = new Map<string, ActiveVendorSummary>();
    for (const v of vendors) m.set(v.id, v);
    return m;
  }, [vendors]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(orders[0]?.id ?? null);

  const vendorOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const o of orders) {
      if (isVendor) {
        // Para vendors, mostrar clientes únicos
        if (!o.companyId || !o.company) continue;
        if (seen.has(o.companyId)) continue;
        seen.add(o.companyId);
        out.push({ id: o.companyId, name: o.company });
      } else {
        // Para factories, mostrar vendors únicos
        if (seen.has(o.vendorId)) continue;
        seen.add(o.vendorId);
        out.push({ id: o.vendorId, name: o.vendor });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [orders, isVendor]);

  const countsAndAmounts = useMemo(() => {
    const c: Record<StatusFilter, { count: number; amount: number }> = {
      all: { count: 0, amount: 0 },
      creada: { count: 0, amount: 0 },
      autorizada: { count: 0, amount: 0 },
      en_proceso: { count: 0, amount: 0 },
      facturada: { count: 0, amount: 0 },
      pagada: { count: 0, amount: 0 },
      completada: { count: 0, amount: 0 },
      rechazada: { count: 0, amount: 0 },
    };
    for (const o of orders) {
      c.all.count++;
      c.all.amount += o.amount;

      if (matchesFilter(o, "creada")) {
        c.creada.count++;
        c.creada.amount += o.amount;
      }
      if (matchesFilter(o, "autorizada")) {
        c.autorizada.count++;
        c.autorizada.amount += o.amount;
      }
      if (matchesFilter(o, "en_proceso")) {
        c.en_proceso.count++;
        c.en_proceso.amount += o.amount;
      }
      if (matchesFilter(o, "facturada")) {
        c.facturada.count++;
        c.facturada.amount += o.amount;
      }
      if (matchesFilter(o, "pagada")) {
        c.pagada.count++;
        c.pagada.amount += o.amount;
      }
      if (matchesFilter(o, "completada")) {
        c.completada.count++;
        c.completada.amount += o.amount;
      }
      if (matchesFilter(o, "rechazada")) {
        c.rechazada.count++;
        c.rechazada.amount += o.amount;
      }
    }
    return c;
  }, [orders]);

  // KPIs útiles separados por moneda - USA MAPEO CORRECTO
  const kpis = useMemo(() => {
    // Pendientes de facturar (autorizada + en_proceso)
    // en_proceso = recibido, en_transito, confirmado, pendiente_conf, revision_calidad
    const pendientesMXN = orders.filter(o =>
      (matchesFilter(o, "autorizada") || matchesFilter(o, "en_proceso")) && o.cur === "MXN"
    ).reduce((sum, o) => sum + o.amount, 0);

    const pendientesUSD = orders.filter(o =>
      (matchesFilter(o, "autorizada") || matchesFilter(o, "en_proceso")) && o.cur === "USD"
    ).reduce((sum, o) => sum + o.amount, 0);

    const pendientesEUR = orders.filter(o =>
      (matchesFilter(o, "autorizada") || matchesFilter(o, "en_proceso")) && o.cur === "EUR"
    ).reduce((sum, o) => sum + o.amount, 0);

    // Sin facturar aún (autorizadas que no tienen factura vinculada)
    const sinFactura = orders.filter(o =>
      matchesFilter(o, "autorizada") && !o.docState?.facInvoiceId
    ).length;

    // Pendientes de autorización
    const porAutorizar = orders.filter(o => matchesFilter(o, "creada")).length;

    return {
      pendientesMXN,
      pendientesUSD,
      pendientesEUR,
      sinFactura,
      porAutorizar,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matchesFilter(o, statusFilter)) return false;
      // Filtro de vendor/cliente según el rol del usuario
      if (vendorFilter !== "all") {
        if (isVendor && o.companyId !== vendorFilter) return false;
        if (!isVendor && o.vendorId !== vendorFilter) return false;
      }
      if (currencyFilter !== "all" && o.cur !== currencyFilter) return false;
      if (q) {
        const matchesId = o.id.toLowerCase().includes(q);
        const matchesVendor = !isVendor && o.vendor.toLowerCase().includes(q);
        const matchesCompany = isVendor && o.company?.toLowerCase().includes(q);
        if (!matchesId && !matchesVendor && !matchesCompany) return false;
      }
      return true;
    });
  }, [orders, statusFilter, vendorFilter, currencyFilter, search]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const selectedBackend = selectedId
    ? orderBackendById.get(selectedId) ?? null
    : null;
  const selectedVendor = selectedBackend
    ? vendorContactById.get(stripCompanyPrefix(selectedBackend.vendor)) ?? null
    : null;

  // Totales separados por moneda (NO mezclar)
  const filteredMXN = filtered.filter(o => o.cur === "MXN").reduce((sum, o) => sum + o.amount, 0);
  const filteredUSD = filtered.filter(o => o.cur === "USD").reduce((sum, o) => sum + o.amount, 0);
  const filteredEUR = filtered.filter(o => o.cur === "EUR").reduce((sum, o) => sum + o.amount, 0);

  const subtitle = isVendor
    ? "Órdenes que has recibido — sube facturas, remitos y notas de crédito."
    : `${user?.companyName ?? "Tu empresa"} · ${countsAndAmounts.all.count} órdenes activas`;

  return (
    <AuthLayout>
      <div className="flex flex-col h-full min-h-0 min-w-0 max-w-full gap-3 overflow-hidden">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-2 min-w-0 shrink-0">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold text-ink">
              Órdenes de <em>compra</em>
            </h1>
            <p className="text-[12px] text-ink-3 mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Icon name="download" size={13} />
              Exportar
            </Button>
            {!isVendor && (
              <Button variant="clay" size="sm" asChild>
                <Link to="/orders/new">
                  <Icon name="plus" size={13} />
                  Nueva OC
                </Link>
              </Button>
            )}
          </div>
        </header>

        {/* Dashboard por estado - Diseño elegante */}
        <div className="bg-paper border border-line rounded-lg p-4 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6">
            {/* Creada */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                <div className="text-[11px] font-medium text-ink-2">Creada</div>
              </div>
              <div className="text-[15px] font-bold text-ink">{countsAndAmounts.creada.count}</div>
              {countsAndAmounts.creada.amount > 0 && (
                <div className="text-[10px] font-mono text-ink-3">
                  ${countsAndAmounts.creada.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            {/* Autorizada */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <div className="text-[11px] font-medium text-ink-2">Autorizada</div>
              </div>
              <div className="text-[15px] font-bold text-ink">{countsAndAmounts.autorizada.count}</div>
              {countsAndAmounts.autorizada.amount > 0 && (
                <div className="text-[10px] font-mono text-ink-3">
                  ${countsAndAmounts.autorizada.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            {/* En Proceso */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                <div className="text-[11px] font-medium text-ink-2">En Proceso</div>
              </div>
              <div className="text-[15px] font-bold text-ink">{countsAndAmounts.en_proceso.count}</div>
              {countsAndAmounts.en_proceso.amount > 0 && (
                <div className="text-[10px] font-mono text-ink-3">
                  ${countsAndAmounts.en_proceso.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            {/* Facturada */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                <div className="text-[11px] font-medium text-ink-2">Facturada</div>
              </div>
              <div className="text-[15px] font-bold text-ink">{countsAndAmounts.facturada.count}</div>
              {countsAndAmounts.facturada.amount > 0 && (
                <div className="text-[10px] font-mono text-ink-3">
                  ${countsAndAmounts.facturada.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            {/* Pagada */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <div className="text-[11px] font-medium text-ink-2">Pagada</div>
              </div>
              <div className="text-[15px] font-bold text-ink">{countsAndAmounts.pagada.count}</div>
              {countsAndAmounts.pagada.amount > 0 && (
                <div className="text-[10px] font-mono text-ink-3">
                  ${countsAndAmounts.pagada.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            {/* Completada */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-teal-500"></div>
                <div className="text-[11px] font-medium text-ink-2">Completada</div>
              </div>
              <div className="text-[15px] font-bold text-ink">{countsAndAmounts.completada.count}</div>
              {countsAndAmounts.completada.amount > 0 && (
                <div className="text-[10px] font-mono text-ink-3">
                  ${countsAndAmounts.completada.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
              )}
            </div>

            {/* Rechazada */}
            {countsAndAmounts.rechazada.count > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-600"></div>
                  <div className="text-[11px] font-medium text-ink-2">Rechazada</div>
                </div>
                <div className="text-[15px] font-bold text-ink">{countsAndAmounts.rechazada.count}</div>
                {countsAndAmounts.rechazada.amount > 0 && (
                  <div className="text-[10px] font-mono text-ink-3">
                    ${countsAndAmounts.rechazada.amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={cn(
          "grid gap-4 min-w-0 shrink-0 items-start",
          "lg:grid-cols-[minmax(0,1fr)_auto]"
        )}>
          <Toolbar className="min-w-0 flex-wrap">
            <Toolbar.Search
              value={search}
              onChange={setSearch}
              placeholder={isVendor ? "Folio, artículo…" : "Folio, proveedor, artículo…"}
            />
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder={isVendor ? "Clientes" : "Proveedores"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {isVendor ? "Todos los clientes" : "Todos los proveedores"}
                </SelectItem>
                {vendorOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Moneda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="MXN">MXN</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Icon name="filter" size={13} />
              Más filtros
            </Button>
            <Toolbar.Spacer />
            <Toolbar.Summary>
              {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              {filteredMXN > 0 && <> · ${filteredMXN.toLocaleString("es-MX", { minimumFractionDigits: 0 })} MXN</>}
              {filteredUSD > 0 && <> · ${filteredUSD.toLocaleString("en-US", { minimumFractionDigits: 0 })} USD</>}
              {filteredEUR > 0 && <> · €{filteredEUR.toLocaleString("es-MX", { minimumFractionDigits: 0 })} EUR</>}
            </Toolbar.Summary>
          </Toolbar>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanelOpen(!panelOpen)}
            className="gap-1.5 hidden lg:flex"
          >
            <Icon name="menu" size={14} />
            {panelOpen ? "Ocultar" : "Mostrar"} detalles
          </Button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="mt-4 flex-1 min-h-0 flex flex-col">
            <div className={cn(
              "grid gap-4 min-w-0 flex-1 min-h-0 transition-all duration-300",
              panelOpen ? "lg:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"
            )}>
              {/* Lista de órdenes */}
              <div className="min-w-0 overflow-hidden flex flex-col min-h-0">
                {/* Lista scrolleable - Diseño mejorado */}
                <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
                  {filtered.map((o) => {
                    const m = fmtCurrency(o.amount, o.cur);
                    const active = o.id === selectedId;
                    const backend = orderBackendById.get(o.id);
                    // Usar el balance desde la base de datos
                    const saldoAmount = backend?.balance ?? o.amount;
                    const saldoFmt = fmtCurrency(saldoAmount, o.cur);
                    const isPaid = saldoAmount <= 0.01;

                    // Obtener el tono usando el label capitalizado
                    const statusLabel = STATUS_LABEL[o.status as OrderStatusBackend];
                    const statusTone = STATUS_TONE[statusLabel] ?? "ink";

                    // Calcular días hasta vencimiento
                    const today = new Date();
                    const dueDate = new Date(o.due);
                    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const isOverdue = daysUntilDue < 0 && o.status !== "pagada" && o.status !== "cerrado";

                    return (
                      <div
                        key={o.id}
                        className={cn(
                          "cursor-pointer transition-all rounded-md border",
                          active
                            ? "bg-clay/5 border-clay/40 shadow-sm"
                            : "bg-paper border-line hover:border-clay/40 hover:shadow-sm"
                        )}
                        onClick={() => setSelectedId(o.id)}
                      >
                        <div className={cn(
                          "flex items-start px-4",
                          panelOpen ? "gap-3 py-2.5" : "gap-4 py-3"
                        )}>
                          {/* Proveedor/Cliente */}
                          <div className={cn(
                            "min-w-0 shrink-0",
                            panelOpen ? "w-[85px]" : "w-[160px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>{isVendor ? "Cliente" : "Proveedor"}</div>
                            <div className={cn(
                              "flex items-center min-w-0",
                              panelOpen ? "gap-1.5" : "gap-2.5"
                            )}>
                              <span className={cn(
                                "grid place-items-center rounded-full bg-clay-soft text-clay-deep font-display font-semibold flex-shrink-0",
                                panelOpen ? "h-7 w-7 text-[11px]" : "h-7 w-7 text-[11px]"
                              )}>
                                {(() => {
                                  const displayName = isVendor ? (o.company || "Cliente") : o.vendor;
                                  return (displayName || "??").slice(0, 2).toUpperCase();
                                })()}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className={cn(
                                  "font-semibold text-ink truncate",
                                  panelOpen ? "text-[12px]" : "text-[13px]"
                                )} title={isVendor ? (o.company || "Cliente") : o.vendor}>
                                  {!isVendor && o.vendor}
                                  {isVendor && (o.company || "Cliente")}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Folio */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[65px]" : "w-[130px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>Folio</div>
                            <div className={cn(
                              "font-mono font-bold text-ink truncate",
                              panelOpen ? "text-[13px]" : "text-[15px]"
                            )} style={{ direction: 'rtl', textAlign: 'left' }}>
                              {o.folio || `#${o.id.slice(-8)}`}
                            </div>
                          </div>

                          {/* F. Emisión */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[60px]" : "w-[70px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>F. Emi</div>
                            <div className={cn(
                              "font-medium text-ink",
                              panelOpen ? "text-[12px]" : "text-[13px]"
                            )}>
                              {fmtDate(o.date)}
                            </div>
                          </div>

                          {/* F. Carga */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[60px]" : "w-[70px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>F. Carga</div>
                            <div className={cn(
                              "font-medium text-ink",
                              panelOpen ? "text-[12px]" : "text-[13px]"
                            )}>
                              {(() => {
                                const backend = orderBackendById.get(o.id);
                                if (!backend?.createdAt) return "-";
                                const d = new Date(backend.createdAt);
                                const day = d.getDate().toString().padStart(2, '0');
                                const month = (d.getMonth() + 1).toString().padStart(2, '0');
                                const year = d.getFullYear();
                                return `${day}/${month}/${year}`;
                              })()}
                            </div>
                          </div>

                          {/* F. Vencimiento */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[65px]" : "w-[75px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>F. Venc</div>
                            <div className={cn(
                              "font-medium",
                              panelOpen ? "text-[12px]" : "text-[13px]",
                              isOverdue ? "text-rust" : daysUntilDue <= 7 ? "text-amber-600" : "text-ink"
                            )}>
                              {fmtDate(o.due)}
                              {isOverdue && <span className="text-[10px] ml-0.5">(venc)</span>}
                              {!isOverdue && daysUntilDue <= 7 && <span className="text-[10px] ml-0.5">({daysUntilDue}d)</span>}
                            </div>
                          </div>

                          {/* Documentos */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[150px]" : "w-[200px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>Docs</div>
                            <DocStrip docs={o.docs} size={panelOpen ? "small" : "normal"} />
                          </div>

                          {/* Condiciones de pago (si existen) */}
                          {o.paymentMethod && (
                            <div className={cn(
                              "shrink-0 ml-2",
                              panelOpen ? "w-[45px]" : "w-[55px]"
                            )}>
                              <div className={cn(
                                "text-ink-3 mb-0.5",
                                panelOpen ? "text-[10px]" : "text-[11px]"
                              )}>Cond.</div>
                              <div className={cn(
                                "font-mono font-medium text-ink truncate",
                                panelOpen ? "text-[12px]" : "text-[13px]"
                              )}>
                                {o.paymentMethod}
                              </div>
                            </div>
                          )}

                          {/* Total */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[75px]" : "w-[95px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>Total</div>
                            <div className={cn(
                              "font-mono font-semibold text-ink leading-none",
                              panelOpen ? "text-[12px]" : "text-[14px]"
                            )}>
                              {m.symbol}{m.integer}.{m.decimal}
                            </div>
                            <div className={cn(
                              "text-ink-3 font-medium mt-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>
                              {o.cur}
                            </div>
                          </div>

                          {/* Saldo */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[65px]" : "w-[80px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>Saldo</div>
                            <div className={cn(
                              "font-mono font-semibold",
                              panelOpen ? "text-[12px]" : "text-[14px]"
                            )}>
                              {isPaid ? (
                                <span className="text-green-600">$0.00</span>
                              ) : (
                                <span className="text-orange-600">
                                  {saldoFmt.symbol}{saldoFmt.integer}.{saldoFmt.decimal}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Estado */}
                          <div className={cn(
                            "shrink-0",
                            panelOpen ? "w-[80px]" : "w-[85px]"
                          )}>
                            <div className={cn(
                              "text-ink-3 mb-0.5",
                              panelOpen ? "text-[10px]" : "text-[11px]"
                            )}>Estado</div>
                            <Badge tone={statusTone} className={cn(
                              "font-medium truncate",
                              panelOpen ? "text-[9px] px-1.5 py-1" : "text-[10px] px-2 py-1"
                            )}>
                              {STATUS_LABEL[o.status as OrderStatusBackend]}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className="bg-paper border border-line rounded-lg p-14 text-center">
                      <Icon name="orders" size={40} className="mx-auto mb-3 text-ink-4" />
                      <div className="text-[14px] font-medium text-ink-2">Sin órdenes</div>
                      <div className="text-[12px] text-ink-3 mt-1">
                        Ajusta los filtros para ver más resultados
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {panelOpen && (
                <OrderDetailPanel
                  key={`${selectedId ?? "empty"}-${selectedBackend?.docState?.paymentReceiptUrl ?? "no-payment"}-${selectedBackend?.docState?.remUrl ?? "no-rem"}`}
                  order={selected}
                  backend={selectedBackend}
                  vendorContact={selectedVendor}
                  userPermissions={user?.permissions ?? []}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isResponse = isRouteErrorResponse(error);
  const status = isResponse ? error.status : 500;
  const message = isResponse
    ? typeof error.data === "string"
      ? error.data
      : error.statusText
    : error instanceof Error
      ? error.message
      : "Error inesperado";

  const titleByStatus: Record<number, string> = {
    401: "Tu sesión ya no es válida.",
    403: "No tienes permisos para ver órdenes.",
    404: "No encontramos órdenes.",
    500: "Algo se rompió al cargar las órdenes.",
  };
  const descriptionByStatus: Record<number, string> = {
    401: "Inicia sesión nuevamente para continuar.",
    403: "Pide a un administrador que ajuste tus permisos.",
    404: "Verifica el enlace o vuelve al inicio.",
    500: "Vuelve a intentarlo en unos segundos. Si persiste, revisa la consola para más detalles.",
  };

  const actions: ErrorScreenAction[] = [
    {
      label: "Volver al inicio",
      href: "/dashboard",
      variant: "clay",
      icon: <ArrowLeft className="h-3.5 w-3.5" />,
    },
    {
      label: "Reintentar",
      onClick: () => {
        if (typeof window !== "undefined") window.location.reload();
      },
      variant: "outline",
      icon: <RefreshCw className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)]">
        <ErrorScreen
          status={status}
          title={titleByStatus[status]}
          description={descriptionByStatus[status]}
          detail={message && message !== titleByStatus[status] ? message : undefined}
          actions={actions}
          fullScreen={false}
          className="h-full"
        />
      </div>
    </AuthLayout>
  );
}
