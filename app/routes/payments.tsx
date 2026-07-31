import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

import { requireUser, getFullSession } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import { useRole } from "~/lib/role-context";
import { cn } from "~/lib/utils";
import {
  fetchPayments,
  fetchActiveVendors,
  fetchOrder,
  type PaymentBackend,
  type ActiveVendorSummary,
  type OrderBackend,
} from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
export const meta: MetaFunction = () => [
  { title: "Pagos — FabriFlow" },
  { name: "description", content: "Tesorería y conciliación de pagos a proveedores" },
];

export const handle = {
  crumb: ["Tesorería", "Pagos"],
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json({
      payments: [] as PaymentBackend[],
      vendors: [] as ActiveVendorSummary[],
      orders: {} as Record<string, OrderBackend>,
    });
  }
  const [paymentsResponse, vendors] = await Promise.all([
    fetchPayments(session.accessToken, user.company, {
      limit: 100,
    }).catch((e: unknown) => {
      console.warn("[payments] fetchPayments failed:", e);
      return { data: [] as PaymentBackend[], count: 0, nextCursor: null };
    }),
    fetchActiveVendors(session.accessToken, user.company).catch((e: unknown) => {
      console.warn("[payments] fetchActiveVendors failed:", e);
      return [] as ActiveVendorSummary[];
    }),
  ]);

  // Cargar solo órdenes asociadas a los pagos (las facturas ya vienen enriquecidas en allocations)
  const orderIds = new Set<string>();

  for (const payment of paymentsResponse.data) {
    if (payment.orderId) {
      orderIds.add(payment.orderId);
    }
  }

  const companyId = user.company;
  const orders = await Promise.all(
    Array.from(orderIds).map(id =>
      fetchOrder(session.accessToken, companyId, id).catch(() => null)
    )
  );

  const orderMap: Record<string, OrderBackend> = {};
  orders.filter(Boolean).forEach(ord => {
    if (ord) orderMap[ord.id] = ord;
  });

  return json({
    payments: paymentsResponse.data,
    vendors,
    orders: orderMap,
  });
}

function formatMethod(method: PaymentBackend["method"]): string {
  switch (method) {
    case "transferencia_spei":
      return "Transferencia SPEI";
    case "wire_usd":
      return "Wire USD";
    case "sepa":
      return "SEPA";
    case "cheque_mxn":
      return "Cheque MXN";
  }
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const day = date.getDate();
  const month = date.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
  const year = date.getFullYear().toString().slice(-2);
  return `${day} ${month} ${year}`;
}

function fmtMoney(amount: number, currency: string): string {
  return `$${amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function vendorName(vendors: ActiveVendorSummary[], id: string): string {
  const vendor = vendors.find((v) => v.id === id);
  return vendor?.vendorLegalName || vendor?.name || id.slice(0, 8);
}

export default function PaymentsPage() {
  const { payments, vendors, orders } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const { role } = useRole();

  const [search, setSearch] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(payments[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (currencyFilter !== "all" && p.currency !== currencyFilter) return false;
      if (q) {
        const vname = vendorName(vendors, p.vendor).toLowerCase();
        const order = p.orderId ? orders[p.orderId] : null;
        const orderFolio = order?.folio?.toLowerCase() || "";

        // Buscar en proveedor, orden, o facturas (usando datos enriquecidos)
        const hasMatch = vname.includes(q) ||
                        orderFolio.includes(q) ||
                        p.allocations.some(alloc =>
                          alloc.invoiceFolio.toLowerCase().includes(q) ||
                          alloc.invoiceUuidAbbrev.toLowerCase().includes(q)
                        );

        if (!hasMatch) return false;
      }
      return true;
    });
  }, [payments, vendors, orders, currencyFilter, search]);


  // KPI computations - Separados por moneda
  const paymentsCount = payments.length;

  // Calcular totales por moneda
  const totalsByCurrency = payments.reduce((acc, p) => {
    acc[p.currency] = (acc[p.currency] || 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  // Calcular saldo pendiente por moneda
  const pendingByCurrency = payments.reduce((acc, p) => {
    p.allocations.forEach(alloc => {
      const currency = alloc.invoiceCurrency;
      acc[currency] = (acc[currency] || 0) + alloc.invoiceBalance;
    });
    return acc;
  }, {} as Record<string, number>);

  // Calcular pagos del mes actual por moneda
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const paymentsThisMonth = payments.filter(p => {
    const paymentDate = new Date(p.date);
    return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
  });
  const thisMonthByCurrency = paymentsThisMonth.reduce((acc, p) => {
    acc[p.currency] = (acc[p.currency] || 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  const isVendor = role === "vendor";

  return (
    <AuthLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Tesorería · <em>Pagos</em>
            </h1>
            <p className="ff-page-sub">
              {isVendor
                ? "Comprobantes de pago recibidos"
                : `Gestión de pagos a proveedores`}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="ff-stat">
            <div className="ff-stat-label">Total Pagado</div>
            <div className="space-y-1 mt-2">
              {Object.entries(totalsByCurrency).map(([currency, amount]) => (
                <div key={currency} className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-mono text-ink-3 w-10">{currency}</span>
                  <span className="font-display text-[20px] font-medium ff-num">
                    ${amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-3">
              · {paymentsCount} pagos registrados
            </div>
          </div>

          <div className="ff-stat">
            <div className="ff-stat-label">Saldo Pendiente</div>
            <div className="space-y-1 mt-2">
              {Object.entries(pendingByCurrency).map(([currency, amount]) => (
                <div key={currency} className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-mono text-ink-3 w-10">{currency}</span>
                  <span className="font-display text-[20px] font-medium ff-num">
                    ${amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-3">
              · Por pagar en facturas
            </div>
          </div>

          <div className="ff-stat">
            <div className="ff-stat-label">Este Mes</div>
            <div className="space-y-1 mt-2">
              {Object.entries(thisMonthByCurrency).length > 0 ? (
                Object.entries(thisMonthByCurrency).map(([currency, amount]) => (
                  <div key={currency} className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-mono text-ink-3 w-10">{currency}</span>
                    <span className="font-display text-[20px] font-medium ff-num">
                      ${amount.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="font-display text-[20px] font-medium text-ink-3">
                  Sin pagos
                </div>
              )}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-3">
              · {paymentsThisMonth.length} pagos
            </div>
          </div>
        </div>

        <Toolbar>
          <Toolbar.Search
            value={search}
            onChange={setSearch}
            placeholder="Proveedor, orden, factura…"
          />
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
          </Toolbar.Summary>
        </Toolbar>

        <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Orden</TableHead>
                      <TableHead>Facturas</TableHead>
                      <TableHead>Fecha Factura</TableHead>
                      <TableHead>Fecha Pago</TableHead>
                      <TableHead className="text-right">Total Factura</TableHead>
                      <TableHead className="text-right">Total Pago</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="w-[100px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const active = p.id === selectedId;
                      return (
                        <TableRow
                          key={p.id}
                          data-state={active ? "selected" : undefined}
                          className={cn(
                            "cursor-pointer",
                            active && "bg-paper-3",
                          )}
                          onClick={() => setSelectedId(p.id)}
                        >
                          <TableCell className="truncate max-w-[200px]">
                            {vendorName(vendors, p.vendor)}
                          </TableCell>
                          <TableCell className="font-mono text-[12px]">
                            {(p.orderId && orders[p.orderId]?.folio) || "—"}
                          </TableCell>
                          <TableCell className="text-[11px] text-ink-2 max-w-[250px]">
                            {p.allocations.length > 0 ? (
                              <div className="space-y-0.5">
                                {p.allocations.map(alloc => (
                                  <div key={alloc.invoiceId} className="truncate">
                                    {alloc.invoiceFolio} • {alloc.invoiceUuidAbbrev}
                                  </div>
                                ))}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-[12px] text-ink-3">
                            {p.allocations.length > 0 ? (
                              <div className="space-y-0.5">
                                {p.allocations.map(alloc => (
                                  <div key={alloc.invoiceId}>
                                    {fmtDate(alloc.invoiceDate)}
                                  </div>
                                ))}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-[12px] text-ink-3">
                            {fmtDate(p.date)}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.allocations.length > 0 ? (
                              <div className="space-y-0.5">
                                {p.allocations.map(alloc => (
                                  <div key={alloc.invoiceId} className="font-mono text-[11.5px] text-ink-2">
                                    {fmtMoney(alloc.invoiceTotal, alloc.invoiceCurrency)}
                                  </div>
                                ))}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-mono font-medium">
                              {fmtMoney(p.amount, p.currency)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {p.allocations.length > 0 ? (
                              <div className="space-y-0.5">
                                {p.allocations.map(alloc => (
                                  <div key={alloc.invoiceId} className="font-mono text-[11.5px] text-ink-3">
                                    {fmtMoney(alloc.invoiceBalance, alloc.invoiceCurrency)}
                                  </div>
                                ))}
                              </div>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {p.receiptUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                              >
                                <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer">
                                  <Icon name="eye" size={14} />
                                  Ver
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-14">
                          <Icon
                            name="pay"
                            size={32}
                            className="mx-auto mb-2 text-ink-4"
                          />
                          <div className="text-[13px] font-medium text-ink-2">
                            Sin pagos en esta vista
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </Card>
      </div>
    </AuthLayout>
  );
}
