import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";

import { requireUser, getFullSession } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import { cn } from "~/lib/utils";
import {
  fetchPayments,
  fetchActiveVendors,
  type PaymentBackend,
  type ActiveVendorSummary,
} from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Toolbar } from "~/components/ui/toolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export const meta: MetaFunction = () => [
  { title: "Multipagos — FabriFlow" },
  {
    name: "description",
    content: "Pagos que cubren varias facturas con un mismo comprobante",
  },
];

export const handle = {
  crumb: ["Tesorería", "Multipagos"],
  cta: { label: "Nuevo multipago", to: "/multipayments/new", icon: "plus" },
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json({
      payments: [] as PaymentBackend[],
      vendors: [] as ActiveVendorSummary[],
    });
  }
  const [paymentsResponse, vendors] = await Promise.all([
    fetchPayments(session.accessToken, user.company, {
      minAllocations: 2,
      limit: 100,
    }),
    fetchActiveVendors(session.accessToken, user.company).catch(
      (e: unknown) => {
        console.warn("[multipayments] fetchActiveVendors failed:", e);
        return [] as ActiveVendorSummary[];
      },
    ),
  ]);
  return json({
    payments: paymentsResponse.data,
    vendors,
  });
}

function vendorName(vendors: ActiveVendorSummary[], id: string): string {
  return vendors.find((v) => v.id === id)?.name ?? id.slice(0, 8);
}

const STATUS_LABEL: Record<string, string> = {
  programado: "Programado",
  pendiente_conf: "Pendiente conf.",
  confirmado: "Confirmado",
  rechazado: "Rechazado",
};

const STATUS_TONE: Record<string, "moss" | "clay" | "ink" | "rust" | "wine"> = {
  programado: "clay",
  pendiente_conf: "clay",
  confirmado: "moss",
  rechazado: "rust",
};

function fmtMoney(amount: number, currency: string): string {
  return `$${amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export default function MultipaymentsPage() {
  const { payments, vendors } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    payments[0]?.id ?? null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p: PaymentBackend) => {
      const vname = vendorName(vendors, p.vendor).toLowerCase();
      return (
        p.folio.toLowerCase().includes(q) ||
        vname.includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [payments, vendors, search]);

  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <AuthLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              <em>Multi</em>pagos
            </h1>
            <p className="ff-page-sub">
              {user?.companyName ?? "Tu empresa"} · {payments.length} multipago
              {payments.length === 1 ? "" : "s"} ·{" "}
              {fmtMoney(totalAmount, payments[0]?.currency ?? "MXN")}
            </p>
          </div>
          <Button asChild>
            <Link to="/multipayments/new">
              <Icon name="plus" size={13} />
              Nuevo multipago
            </Link>
          </Button>
        </header>

        <Toolbar>
          <Toolbar.Search
            value={search}
            onChange={setSearch}
            placeholder="Folio, proveedor, ID…"
          />
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
                  <TableHead>Folio</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="text-right">Facturas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Comprobante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p: PaymentBackend) => {
                  const active = p.id === selectedId;
                  const statusKey = p.status as string;
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
                        {p.folio}
                      </TableCell>
                      <TableCell className="truncate max-w-[220px]">
                        {vendorName(vendors, p.vendor)}
                      </TableCell>
                      <TableCell className="font-mono text-[12px] text-ink-3">
                        {p.date}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {fmtMoney(p.amount, p.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {p.allocations.length}
                      </TableCell>
                      <TableCell>
                        <Badge tone={STATUS_TONE[statusKey] ?? "ink"}>
                          {STATUS_LABEL[statusKey] ?? p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.receiptUrl ? (
                          <a
                            href={p.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-mocha-3 hover:underline text-[12px]"
                          >
                            <Icon name="download" size={12} className="inline mr-1" />
                            Ver
                          </a>
                        ) : (
                          <span className="text-ink-4 text-[12px]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-14">
                      <Icon
                        name="pay"
                        size={32}
                        className="mx-auto mb-2 text-ink-4"
                      />
                      <div className="text-[13px] font-medium text-ink-2">
                        Aún no hay multipagos registrados
                      </div>
                      <div className="text-[12px] text-ink-3 mt-1">
                        Sube un comprobante que cubra varias facturas para
                        registrar el primero.
                      </div>
                      <Button asChild size="sm" className="mt-4">
                        <Link to="/multipayments/new">
                          <Icon name="plus" size={13} />
                          Nuevo multipago
                        </Link>
                      </Button>
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
