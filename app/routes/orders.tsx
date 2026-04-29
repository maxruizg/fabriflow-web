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
  fetchOrders,
  type OrderBackend,
  type OrderStatusBackend,
} from "~/lib/procurement-api.server";
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

// SurrealId values (e.g. "company:abc") arrive prefixed; strip for display + ids.
function stripPrefix(id: string, table: string): string {
  const prefix = `${table}:`;
  const trimmed = id.startsWith(prefix) ? id.slice(prefix.length) : id;
  return trimmed.replace(/[⟨⟩\\]/g, "");
}

const STATUS_LABEL: Record<OrderStatusBackend, string> = {
  recibido: "Recibido",
  en_transito: "En tránsito",
  confirmado: "Confirmado",
  revision_calidad: "Revisión calidad",
  cerrado: "Cerrado",
  incidencia: "Incidencia",
  pendiente_conf: "Pendiente conf.",
  rechazado: "Rechazado",
};

const CURRENCY_FALLBACK: SampleOrder["cur"] = "MXN";
function normalizeCurrency(c: string): SampleOrder["cur"] {
  if (c === "USD" || c === "EUR" || c === "MXN") return c;
  return CURRENCY_FALLBACK;
}

function toSampleShape(o: OrderBackend): SampleOrder {
  const docs: DocType[] = [];
  if (o.docState.ocUrl) docs.push("OC");
  if (o.docState.facInvoiceId) docs.push("FAC");
  if (o.docState.remUrl) docs.push("REM");
  if (o.docState.ncUrl) docs.push("NC");

  // The vendor field is a SurrealId reference. Until a vendor-name join lands
  // on the backend, use the bare id for both the display label and the filter
  // key. The dropdown will still group orders by vendor correctly.
  const vendorId = stripPrefix(o.vendor, "company");

  return {
    id: stripPrefix(o.id, "order"),
    vendor: vendorId,
    vendorId,
    date: o.date,
    due: o.due ?? "",
    amount: o.amount,
    cur: normalizeCurrency(o.currency),
    status: STATUS_LABEL[o.status] ?? o.status,
    items: o.itemsCount,
    docs,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({ orders: [] as SampleOrder[] });
  }

  try {
    const response = await fetchOrders(session.accessToken, user.company, {
      limit: 50,
    });
    return json({ orders: response.data.map(toSampleShape) });
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
  const { orders } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const { role } = useRole();
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
  const totalAmount = filtered.reduce((acc, o) => acc + o.amount, 0);

  const isVendor = role === "vendor";
  const subtitle = isVendor
    ? "Órdenes que has recibido — sube facturas, remitos y notas de crédito."
    : `${user?.companyName ?? "Tu empresa"} · ${counts.all} órdenes activas`;

  return (
    <AuthLayout>
      <div className="space-y-5">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
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

        <Toolbar>
          <Toolbar.Search
            value={search}
            onChange={setSearch}
            placeholder="Folio, proveedor, artículo…"
          />
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[200px] h-9">
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
        >
          <TabsList>
            {STATUS_FILTERS.map((s) => (
              <TabsTrigger key={s.value} value={s.value}>
                {s.label}
                <TabsCount>{counts[s.value]}</TabsCount>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={statusFilter} className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
              <Card>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Orden</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Vence</TableHead>
                        <TableHead>Docs</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((o) => {
                        const m = fmtCurrency(o.amount, o.cur);
                        const tone = STATUS_TONE[o.status] ?? "ink";
                        const active = o.id === selectedId;
                        return (
                          <TableRow
                            key={o.id}
                            data-state={active ? "selected" : undefined}
                            className={cn(
                              "cursor-pointer",
                              active && "bg-paper-3",
                            )}
                            onClick={() => setSelectedId(o.id)}
                          >
                            <TableCell className="font-mono text-[12px]">
                              {o.id}
                            </TableCell>
                            <TableCell className="truncate max-w-[200px]">
                              {o.vendor}
                            </TableCell>
                            <TableCell className="font-mono text-[12px] text-ink-3">
                              {fmtDate(o.date)}
                            </TableCell>
                            <TableCell className="font-mono text-[12px] text-ink-3">
                              {fmtDate(o.due)}
                            </TableCell>
                            <TableCell>
                              <DocStrip docs={o.docs} />
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-mono font-medium">
                                {m.symbol}
                                {m.integer}
                                <span className="text-ink-3">
                                  .{m.decimal}
                                </span>
                              </span>
                              <span className="ml-1 font-mono text-[10px] text-ink-3">
                                {m.code}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge tone={tone}>{o.status}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
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

              <OrderDetailPanel order={selected} />
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
