import { useMemo, useState } from "react";
import type {
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import {
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
import { cn } from "~/lib/utils";
import {
  fetchActiveVendors,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TabsCount,
} from "~/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
    date: o.date,
    due: o.due ?? "",
    amount: totalWithTax,
    cur: normalizeCurrency(o.currency),
    status: STATUS_LABEL[o.status] ?? o.status,
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
    for (const v of vendors) vendorNameById.set(v.id, v.name);

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
        toSampleShape(o, vendorNameById, invoiceBalances, repsByInvoice),
      ),
      ordersRaw: response.data,
      vendors,
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

type StatusFilter = "all" | "open" | "transit" | "review" | "incident" | "closed";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Abiertas" },
  { value: "transit", label: "En tránsito" },
  { value: "review", label: "Revisión" },
  { value: "incident", label: "Incidencias" },
  { value: "closed", label: "Cerradas" },
];

function matchesFilter(o: SampleOrder, f: StatusFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "open":
      return ["Recibido", "Pendiente conf.", "Confirmado"].includes(o.status);
    case "transit":
      return o.status === "En tránsito";
    case "review":
      return o.status === "Revisión calidad";
    case "incident":
      return o.status === "Incidencia";
    case "closed":
      return o.status === "Cerrado";
  }
}

export default function OrdersPage() {
  const { orders, ordersRaw, vendors } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const { role } = useRole();
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
  const [selectedId, setSelectedId] = useState<string | null>(orders[0]?.id ?? null);

  const vendorOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const o of orders) {
      if (seen.has(o.vendorId)) continue;
      seen.add(o.vendorId);
      out.push({ id: o.vendorId, name: o.vendor });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: 0,
      open: 0,
      transit: 0,
      review: 0,
      incident: 0,
      closed: 0,
    };
    for (const o of orders) {
      c.all++;
      if (matchesFilter(o, "open")) c.open++;
      if (matchesFilter(o, "transit")) c.transit++;
      if (matchesFilter(o, "review")) c.review++;
      if (matchesFilter(o, "incident")) c.incident++;
      if (matchesFilter(o, "closed")) c.closed++;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matchesFilter(o, statusFilter)) return false;
      if (vendorFilter !== "all" && o.vendorId !== vendorFilter) return false;
      if (currencyFilter !== "all" && o.cur !== currencyFilter) return false;
      if (
        q &&
        !o.id.toLowerCase().includes(q) &&
        !o.vendor.toLowerCase().includes(q)
      )
        return false;
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
  const totalAmount = filtered.reduce((acc, o) => acc + o.amount, 0);

  const isVendor = role === "vendor";
  const subtitle = isVendor
    ? "Órdenes que has recibido — sube facturas, remitos y notas de crédito."
    : `${user?.companyName ?? "Tu empresa"} · ${counts.all} órdenes activas`;

  return (
    <AuthLayout>
      <div className="flex flex-col h-full min-h-0 min-w-0 max-w-full gap-4 overflow-hidden">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-3 min-w-0 shrink-0">
          <div className="min-w-0">
            <h1 className="ff-page-title">
              Órdenes de <em>compra</em>
            </h1>
            <p className="ff-page-sub">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Icon name="download" size={13} />
              Exportar
            </Button>
            {!isVendor ? (
              <Button variant="clay" size="sm">
                <Icon name="plus" size={13} />
                Nueva OC
              </Button>
            ) : (
              <Button variant="clay" size="sm">
                <Icon name="upload" size={13} />
                Subir documento
              </Button>
            )}
          </div>
        </header>

        <Toolbar className="min-w-0 flex-wrap shrink-0">
          <Toolbar.Search
            value={search}
            onChange={setSearch}
            placeholder="Folio, proveedor, artículo…"
          />
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Proveedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
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
            {filtered.length} resultado{filtered.length === 1 ? "" : "s"} · $
            {totalAmount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}{" "}
            <span className="ml-1 text-ink-4">MXN equivalente</span>
          </Toolbar.Summary>
        </Toolbar>

        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          className="flex-1 min-h-0 flex flex-col"
        >
          <TabsList className="shrink-0">
            {STATUS_FILTERS.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label}
                <TabsCount>{counts[s.value]}</TabsCount>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent
            value={statusFilter}
            className="mt-4 flex-1 min-h-0 data-[state=active]:flex flex-col"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] min-w-0 flex-1 min-h-0">
              <Card className="min-w-0 overflow-hidden flex flex-col min-h-0">
                <div className="min-w-0 flex-1 overflow-y-auto">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">Orden</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="w-[110px]">Fecha</TableHead>
                        <TableHead className="w-[120px]">Docs</TableHead>
                        <TableHead className="w-[140px] text-right">
                          Importe
                        </TableHead>
                        <TableHead className="w-[110px] pr-4">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((o) => {
                        const m = fmtCurrency(o.amount, o.cur);
                        const tone = STATUS_TONE[o.status] ?? "ink";
                        const active = o.id === selectedId;
                        const showCurrency = o.cur !== "MXN";
                        return (
                          <TableRow
                            key={o.id}
                            data-state={active ? "selected" : undefined}
                            className={cn(
                              "cursor-pointer hover:bg-paper-2",
                              active && "bg-paper-3",
                            )}
                            onClick={() => setSelectedId(o.id)}
                          >
                            <TableCell className="font-mono text-[12px]">
                              <div
                                className="font-medium text-ink truncate"
                                title={o.folio || o.id}
                              >
                                {o.folio || "—"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="truncate" title={o.vendor}>
                                {o.vendor}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-[11.5px] text-ink-3">
                              <div className="truncate" title={`Emitida ${fmtDate(o.date)}`}>
                                {fmtDate(o.date)}
                              </div>
                              <div
                                className="truncate text-[10.5px] text-ink-4"
                                title={`Vence ${fmtDate(o.due)}`}
                              >
                                vence {fmtDate(o.due)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <DocStrip docs={o.docs} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-mono font-medium truncate">
                                {m.symbol}
                                {m.integer}
                                <span className="text-ink-3">.{m.decimal}</span>
                              </div>
                              {showCurrency ? (
                                <div className="font-mono text-[10px] text-ink-3 truncate">
                                  {m.code}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="pr-4">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Badge tone={tone}>{o.status}</Badge>
                                {o.status === "Creada" ? (
                                  <span
                                    className="text-rust-700 shrink-0"
                                    title="Pendiente de autorización por un Super Admin"
                                    aria-label="Pendiente de autorización por un Super Admin"
                                  >
                                    <Icon name="warn" size={12} />
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-14"
                          >
                            <Icon
                              name="orders"
                              size={32}
                              className="mx-auto mb-2 text-ink-4"
                            />
                            <div className="text-[13px] font-medium text-ink-2">
                              Sin resultados
                            </div>
                            <div className="text-[11px] text-ink-3 mt-1">
                              Ajusta los filtros para ver más órdenes
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              <OrderDetailPanel
                key={selectedId ?? "empty"}
                order={selected}
                backend={selectedBackend}
                vendorContact={selectedVendor}
                userPermissions={user?.permissions ?? []}
              />
            </div>
          </TabsContent>
        </Tabs>
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
