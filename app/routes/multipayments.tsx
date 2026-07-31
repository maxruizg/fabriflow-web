import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect, useMemo, useState } from "react";

import { requireUser, getFullSession } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import { cn } from "~/lib/utils";
import {
  fetchPayments,
  fetchActiveVendors,
  deletePayment,
  type PaymentBackend,
  type ActiveVendorSummary,
} from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json<ActionResult>(
      { ok: false, error: "Sesión inválida" },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const paymentId = String(formData.get("paymentId") ?? "");
    if (!paymentId) {
      return json<ActionResult>(
        { ok: false, error: "Falta el ID del multipago" },
        { status: 400 },
      );
    }
    try {
      await deletePayment(session.accessToken, user.company, paymentId);
      return json<ActionResult>({ ok: true });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "No se pudo eliminar el multipago";
      return json<ActionResult>({ ok: false, error: msg }, { status: 400 });
    }
  }

  return json<ActionResult>(
    { ok: false, error: "Acción desconocida" },
    { status: 400 },
  );
}

function hasAny(perms: string[], required: string[]): boolean {
  if (perms.includes("*")) return true;
  return required.some((p) => perms.includes(p));
}

function vendorName(vendors: ActiveVendorSummary[], id: string): string {
  const v = vendors.find((v) => v.id === id);
  return v?.vendorLegalName || v?.name || id.slice(0, 8);
}

function fmtMoney(amount: number, currency: string): string {
  return `$${amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export default function MultipaymentsPage() {
  const { payments, vendors } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof action>();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    payments[0]?.id ?? null,
  );
  const [deletingPayment, setDeletingPayment] = useState<PaymentBackend | null>(null);

  const canDelete = hasAny(user?.permissions ?? [], ["payments:delete"]);
  const isDeleting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setDeletingPayment(null);
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

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
                  <TableHead>Comprobante</TableHead>
                  {canDelete ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p: PaymentBackend) => {
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
                      {canDelete ? (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-wine hover:bg-wine-soft"
                            onClick={() => setDeletingPayment(p)}
                          >
                            <Icon name="trash" size={14} />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canDelete ? 7 : 6} className="text-center py-14">
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

      <Dialog
        open={!!deletingPayment}
        onOpenChange={(open) => !open && setDeletingPayment(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Eliminar multipago</DialogTitle>
            <DialogDescription>
              Esta acción revertirá el efecto del pago en cada orden vinculada
              (regresan a su estado anterior y el saldo se recalcula). No se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-wine-soft border border-wine/20 p-4">
            <p className="text-[13px] font-medium text-wine">
              {deletingPayment?.folio}
            </p>
            <p className="text-[12px] text-wine/80">
              {deletingPayment
                ? fmtMoney(deletingPayment.amount, deletingPayment.currency)
                : ""}{" "}
              · {deletingPayment?.allocations.length ?? 0} factura
              {deletingPayment?.allocations.length === 1 ? "" : "s"}
            </p>
          </div>
          {fetcher.data && !fetcher.data.ok ? (
            <div className="text-[13px] text-wine bg-wine-soft border border-wine/20 p-3 rounded-lg">
              {fetcher.data.error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingPayment(null)}
            >
              Cancelar
            </Button>
            <fetcher.Form method="post" className="inline">
              <input type="hidden" name="intent" value="delete" />
              <input
                type="hidden"
                name="paymentId"
                value={deletingPayment?.id || ""}
              />
              <Button type="submit" variant="destructive" disabled={isDeleting}>
                {isDeleting ? "Eliminando…" : "Eliminar"}
              </Button>
            </fetcher.Form>
          </div>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
