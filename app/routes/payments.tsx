import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

import { requireUser } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import { useRole } from "~/lib/role-context";
import { cn } from "~/lib/utils";
import {
  SAMPLE_PAYMENTS,
  fmtCurrency,
  fmtDate,
  STATUS_TONE,
  type SamplePayment,
} from "~/lib/sample-data";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { StatCard } from "~/components/ui/stat-card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { PaymentLinkCard } from "~/components/payments/payment-link-card";
import { PaymentReceiptCard } from "~/components/payments/payment-receipt-card";

export const meta: MetaFunction = () => [
  { title: "Pagos — FabriFlow" },
  { name: "description", content: "Tesorería y conciliación de pagos a proveedores" },
];

export const handle = {
  crumb: ["Tesorería", "Pagos"],
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Backend is ready (`be-v2/src/api/payments.rs`). To swap from sample data
  // see `procurement-api.server.ts#fetchPayments`.
  await requireUser(request);
  return json({ payments: SAMPLE_PAYMENTS });
}

type StatusFilter =
  | "all"
  | "scheduled"
  | "pending"
  | "confirmed"
  | "rejected";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "scheduled", label: "Programados" },
  { value: "pending", label: "Pendientes conf." },
  { value: "confirmed", label: "Confirmados" },
  { value: "rejected", label: "Rechazados" },
];

function matches(p: SamplePayment, f: StatusFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "scheduled":
      return p.status === "Programado";
    case "pending":
      return p.status === "Pendiente conf.";
    case "confirmed":
      return p.status === "Confirmado";
    case "rejected":
      return p.status === "Rechazado";
  }
}

export default function PaymentsPage() {
  const { payments } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const { role } = useRole();

  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(payments[0]?.id ?? null);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: 0,
      scheduled: 0,
      pending: 0,
      confirmed: 0,
      rejected: 0,
    };
    for (const p of payments) {
      c.all++;
      if (matches(p, "scheduled")) c.scheduled++;
      if (matches(p, "pending")) c.pending++;
      if (matches(p, "confirmed")) c.confirmed++;
      if (matches(p, "rejected")) c.rejected++;
    }
    return c;
  }, [payments]);

  const methods = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) set.add(p.method);
    return Array.from(set);
  }, [payments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (!matches(p, statusFilter)) return false;
      if (methodFilter !== "all" && p.method !== methodFilter) return false;
      if (currencyFilter !== "all" && p.cur !== currencyFilter) return false;
      if (
        q &&
        !p.id.toLowerCase().includes(q) &&
        !p.vendor.toLowerCase().includes(q) &&
        !p.inv.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [payments, statusFilter, methodFilter, currencyFilter, search]);

  const selected = payments.find((p) => p.id === selectedId) ?? null;

  // KPI computations
  const weekToBay = payments
    .filter((p) => p.status === "Programado" || p.status === "Pendiente conf.")
    .reduce((acc, p) => acc + p.amount, 0);
  const paidThisMonth = payments
    .filter((p) => p.status === "Confirmado")
    .reduce((acc, p) => acc + p.amount, 0);
  const pendingCount = payments.filter((p) => p.status === "Pendiente conf.").length;

  const isVendor = role === "vendor";

  return (
    <AuthLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Pagos a <em>proveedores</em>
            </h1>
            <p className="ff-page-sub">
              {isVendor
                ? "Confirma pagos recibidos y revisa comprobantes"
                : `${user?.companyName ?? "Tu empresa"} · ${counts.pending} pagos por confirmar`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Icon name="upload" size={13} />
              Subir comprobante
            </Button>
            {!isVendor ? (
              <Button variant="clay" size="sm">
                <Icon name="plus" size={13} />
                Registrar pago
              </Button>
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="A pagar esta semana"
            currency="$"
            value={
              <>
                {weekToBay.toLocaleString("es-MX", { minimumFractionDigits: 0 })}
                <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
                  .00
                </span>
              </>
            }
            delta={{
              label: `${counts.scheduled + counts.pending} pagos · ${
                new Set(
                  payments
                    .filter((p) => matches(p, "scheduled") || matches(p, "pending"))
                    .map((p) => p.vendor),
                ).size
              } proveedores`,
            }}
          />
          <StatCard
            label="Pagado (mes)"
            currency="$"
            value={
              <>
                {paidThisMonth.toLocaleString("es-MX", { minimumFractionDigits: 0 })}
                <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
                  .00
                </span>
              </>
            }
            delta={{ label: `${counts.confirmed} pagos confirmados`, direction: "up" }}
            sparkPath="M0 22 L10 18 L20 14 L30 16 L40 8 L50 12 L60 6 L70 10 L80 4"
            sparkTone="moss"
          />
          <StatCard
            label="Pendientes conf."
            value={String(pendingCount)}
            delta={{ label: "Esperando confirmación del proveedor" }}
          />
          <StatCard
            label="FX promedio"
            value="17.42"
            delta={{ label: "USD → MXN", direction: "up" }}
            sparkTone="clay"
          />
        </div>

        <Toolbar>
          <Toolbar.Search
            value={search}
            onChange={setSearch}
            placeholder="Folio, proveedor, factura…"
          />
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Método" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los métodos</SelectItem>
              {methods.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
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
          </Toolbar.Summary>
        </Toolbar>

        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
                <TabsCount>{counts[f.value]}</TabsCount>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={statusFilter} className="mt-4 space-y-4">
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Folio</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Parcial</TableHead>
                      <TableHead className="text-right">Importe</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const m = fmtCurrency(p.amount, p.cur);
                      const tone = STATUS_TONE[p.status] ?? "ink";
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
                          <TableCell className="font-mono text-[12px]">
                            {p.id}
                          </TableCell>
                          <TableCell className="truncate max-w-[200px]">
                            {p.vendor}
                          </TableCell>
                          <TableCell className="font-mono text-[12px] text-ink-3">
                            {p.inv}
                          </TableCell>
                          <TableCell className="font-mono text-[12px] text-ink-3">
                            {fmtDate(p.date)}
                          </TableCell>
                          <TableCell className="text-[12px]">{p.method}</TableCell>
                          <TableCell className="font-mono text-[11.5px] text-ink-3">
                            {p.part}
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
                            <Badge tone={tone}>{p.status}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-14">
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

            {selected ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <PaymentLinkCard
                  payment={selected}
                  invoices={[
                    {
                      id: selected.inv,
                      amount: selected.amount,
                      due: "2026-05-18",
                      paid: 100,
                    },
                    {
                      id: `FAC-${(parseInt(selected.inv.split("-")[1] ?? "0", 10) - 5)
                        .toString()
                        .padStart(5, "0")}`,
                      amount: selected.amount * 0.45,
                      due: "2026-06-02",
                      paid: 45,
                    },
                  ]}
                />
                <PaymentReceiptCard
                  payment={selected}
                  bankInfo={{
                    bank: "BBVA México",
                    clabeMasked: "012 ··· ··· ··· 84",
                    beneficiary: selected.vendor,
                    rfc: "VEND" + selected.id.slice(-4),
                  }}
                />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </AuthLayout>
  );
}
