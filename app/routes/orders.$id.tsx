import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";

import { getFullSession, requireUser } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import {
  authorizeOrder,
  fetchActiveVendors,
  fetchOrder,
  type ActiveVendorSummary,
  type OrderBackend,
} from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Separator } from "~/components/ui/separator";
import { SendOrderDialog } from "~/components/orders/send-order-dialog";
import { AuthorizeOrderDialog } from "~/components/orders/authorize-order-dialog";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const folio = data && "order" in data ? data.order.folio : "Orden";
  return [{ title: `${folio} — FabriFlow` }];
};

export const handle = {
  crumb: ["Operación", "Órdenes", "Detalle"],
};

interface LoaderData {
  order: OrderBackend;
  vendor: ActiveVendorSummary | null;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }

  const id = params.id;
  if (!id) throw redirect("/orders");

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "authorize") {
    const approve = formData.get("approve") === "true";
    const rejectionReason = formData.get("rejectionReason") as string | undefined;

    try {
      await authorizeOrder(
        session.accessToken,
        session.user.company,
        id,
        { approve, rejectionReason }
      );

      return json({ ok: true });
    } catch (error) {
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Error al autorizar orden",
        },
        { status: 400 }
      );
    }
  }

  return json({ ok: false, error: "Intent no reconocido" }, { status: 400 });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }
  const id = params.id;
  if (!id) throw redirect("/orders");

  const order = await fetchOrder(session.accessToken, session.user.company, id);

  // Try to enrich with vendor contact info; non-fatal if it fails.
  let vendor: ActiveVendorSummary | null = null;
  try {
    const vendors = await fetchActiveVendors(session.accessToken, session.user.company);
    const vendorBareId = order.vendor.startsWith("company:")
      ? order.vendor.slice("company:".length)
      : order.vendor;
    vendor = vendors.find((v) => v.id === vendorBareId) ?? null;
  } catch (e) {
    console.warn("[orders/:id] could not fetch vendor list:", e);
  }

  return json<LoaderData>({ order, vendor });
}

export default function OrderDetailPage() {
  const { order, vendor } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sendOpen, setSendOpen] = useState(false);
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [authorizeMode, setAuthorizeMode] = useState<"approve" | "reject">("approve");

  // Auto-open the send dialog if redirected from create form (?send=1)
  useEffect(() => {
    if (searchParams.get("send") === "1") {
      setSendOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeSendAndClearParam = () => {
    setSendOpen(false);
    if (searchParams.has("send") || searchParams.has("token")) {
      const next = new URLSearchParams(searchParams);
      next.delete("send");
      next.delete("token");
      setSearchParams(next, { replace: true });
    }
  };

  // Verificar si puede autorizar
  const canAuthorize =
    user.permissions.includes("orders:authorize") || user.permissions.includes("*");
  const needsAuthorization = order.status === "creada";

  const orderBareId = useMemo(
    () => (order.id.startsWith("order:") ? order.id.slice("order:".length) : order.id),
    [order.id],
  );

  const subtotal = useMemo(
    () => (order.items ?? []).reduce((acc, it) => acc + (it.lineTotal ?? 0), 0),
    [order.items],
  );

  return (
    <AuthLayout>
      <div className="space-y-6 max-w-5xl">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2">
              <Link to="/orders">
                <Icon name="chevl" size={12} />
                Volver a órdenes
              </Link>
            </Button>
            <h1 className="ff-page-title">
              Orden <em>{order.folio}</em>
            </h1>
            <p className="ff-page-sub">
              {order.date} · {(order.itemsCount ?? order.items?.length ?? 0)} línea
              {(order.items?.length ?? 0) === 1 ? "" : "s"} ·{" "}
              {moneyFmt(order.amount, order.currency)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />

            {/* Botones de autorización */}
            {needsAuthorization && canAuthorize && (
              <>
                <Button
                  variant="clay"
                  onClick={() => {
                    setAuthorizeMode("approve");
                    setAuthorizeOpen(true);
                  }}
                >
                  <Icon name="check" size={13} />
                  Autorizar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setAuthorizeMode("reject");
                    setAuthorizeOpen(true);
                  }}
                >
                  <Icon name="x" size={13} />
                  Rechazar
                </Button>
              </>
            )}

            {/* Botón de enviar (solo si está autorizada) */}
            {order.status === "autorizada" && (
              <Button variant="clay" onClick={() => setSendOpen(true)}>
                <Icon name="upload" size={13} />
                Enviar a proveedor
              </Button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                Líneas <em className="not-italic text-clay">de la orden</em>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(order.items ?? []).length === 0 ? (
                <p className="text-[13px] text-ink-3">
                  Esta orden no tiene líneas registradas (creada antes del módulo de líneas).
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-line">
                  <table className="w-full text-[13px]">
                    <thead className="bg-paper-2 font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">Precio U.</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.items ?? []).map((it) => (
                        <tr key={it.lineNo} className="border-t border-line">
                          <td className="px-3 py-2 font-mono text-[11px] text-ink-3">{it.lineNo}</td>
                          <td className="px-3 py-2 text-ink">
                            <div>{it.description}</div>
                            {it.sku ? (
                              <div className="font-mono text-[10.5px] text-ink-3">{it.sku}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[12px]">
                            {it.qty} {it.unit}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[12px]">
                            {moneyFmt(it.unitPrice, order.currency)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[12.5px]">
                            {moneyFmt(it.lineTotal, order.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line">
                        <td colSpan={4} className="px-3 py-2 text-right text-[11.5px] text-ink-3">
                          Subtotal
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[12.5px]">
                          {moneyFmt(subtotal, order.currency)}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-[12px] font-semibold">
                          Total
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[14px] font-semibold">
                          {moneyFmt(order.amount, order.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {order.notes || order.paymentTerms || order.deliveryAddress ? (
                <>
                  <Separator className="my-4" />
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
                    {order.paymentTerms ? (
                      <KV k="Términos de pago" v={order.paymentTerms} />
                    ) : null}
                    {order.deliveryAddress ? (
                      <KV k="Entrega" v={order.deliveryAddress} />
                    ) : null}
                    {order.notes ? <KV k="Notas" v={order.notes} /> : null}
                  </dl>
                </>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  Proveedor
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] space-y-1.5">
                <div className="text-ink font-semibold text-[14px]">
                  {vendor?.name ?? "Proveedor"}
                </div>
                {vendor?.rfc ? (
                  <div className="font-mono text-[11.5px] text-ink-3">{vendor.rfc}</div>
                ) : null}
                {vendor?.email ? (
                  <div className="flex items-center gap-2 text-ink-2">
                    <Icon name="paper" size={12} className="text-ink-3" />
                    <span className="break-all">{vendor.email}</span>
                  </div>
                ) : null}
                {vendor?.whatsappPhone ? (
                  <div className="flex items-center gap-2 text-ink-2 font-mono text-[12px]">
                    <Icon name="globe" size={12} className="text-ink-3" />
                    {vendor.whatsappPhone}
                  </div>
                ) : null}
                {!vendor?.email && !vendor?.whatsappPhone ? (
                  <p className="text-[12px] text-ink-3">
                    Sin canales de contacto configurados — agrega correo y WhatsApp en el directorio
                    de proveedores.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Documentos</CardTitle>
              </CardHeader>
              <CardContent className="text-[13px] space-y-2">
                <DocRow label="OC (PDF)" url={order.docState.ocUrl} />
                <DocRow label="Remisión" url={order.docState.remUrl} />
                <DocRow label="Nota crédito" url={order.docState.ncUrl} />
                <DocRow
                  label="Factura vinculada"
                  url={order.docState.facInvoiceId ? `/invoices/${stripPrefix(order.docState.facInvoiceId, "invoice")}` : null}
                  internal
                />
              </CardContent>
            </Card>

            {/* Información de Autorización */}
            {order.status === "autorizada" && order.authorizedBy && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="check" size={14} className="text-moss" />
                    Autorización
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-ink-3">Autorizada por:</span>
                    <span className="text-ink font-medium">{order.authorizedBy}</span>
                  </div>
                  {order.authorizedAt && (
                    <div className="flex justify-between">
                      <span className="text-ink-3">Fecha:</span>
                      <span className="text-ink font-mono text-[12px]">
                        {formatTs(order.authorizedAt)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Información de Rechazo */}
            {order.status === "rechazado" && (
              <Card className="border-wine-300 bg-wine-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-wine-900">
                    <Icon name="x" size={14} className="text-wine-700" />
                    Orden Rechazada
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {order.rejectionReason && (
                    <p className="text-[13px] text-wine-900 italic">
                      "{order.rejectionReason}"
                    </p>
                  )}
                  {order.authorizedAt && (
                    <p className="text-[11px] text-wine-700 font-mono">
                      Rechazada el {formatTs(order.authorizedAt)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Historial</CardTitle>
              </CardHeader>
              <CardContent>
                {(order.history ?? []).length === 0 ? (
                  <p className="text-[12.5px] text-ink-3">Sin eventos.</p>
                ) : (
                  <ol className="space-y-3">
                    {[...(order.history ?? [])].reverse().map((evt, idx) => (
                      <li key={idx} className="flex gap-3">
                        <div className="mt-1 grid h-2 w-2 place-items-center rounded-full bg-clay" />
                        <div className="flex-1">
                          <div className="text-[12.5px] text-ink">{evt.description}</div>
                          <div className="font-mono text-[10.5px] text-ink-3">
                            {formatTs(evt.ts)} · {evt.kind}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <SendOrderDialog
          open={sendOpen}
          onOpenChange={(next) => (next ? setSendOpen(true) : closeSendAndClearParam())}
          orderId={orderBareId}
          folio={order.folio}
          vendor={{
            name: vendor?.name ?? "Proveedor",
            email: vendor?.email,
            whatsappPhone: vendor?.whatsappPhone,
          }}
        />

        <AuthorizeOrderDialog
          order={order}
          open={authorizeOpen}
          onOpenChange={setAuthorizeOpen}
          mode={authorizeMode}
        />
      </div>
    </AuthLayout>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">{k}</dt>
      <dd className="text-[13px] text-ink">{v}</dd>
    </div>
  );
}

function DocRow({ label, url, internal }: { label: string; url: string | null; internal?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper-2 px-3 py-2">
      <div className="flex items-center gap-2 text-ink-2">
        <Icon name="file" size={13} className="text-ink-3" />
        <span className="text-[12.5px]">{label}</span>
      </div>
      {url ? (
        internal ? (
          <Link to={url} className="text-[12px] text-clay hover:underline">
            Abrir
          </Link>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-clay hover:underline"
          >
            Descargar
          </a>
        )
      ) : (
        <span className="text-[11.5px] text-ink-3">—</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: OrderBackend["status"] }) {
  const tone = (
    {
      creada: "ink",
      autorizada: "moss",
      facturada: "clay",
      recibido: "clay",
      en_transito: "clay",
      confirmado: "moss",
      revision_calidad: "rust",
      cerrado: "moss",
      incidencia: "wine",
      pendiente_conf: "rust",
      rechazado: "wine",
    } as const
  )[status];
  const label = (
    {
      creada: "Creada",
      autorizada: "Autorizada",
      facturada: "Facturada",
      recibido: "Recibida",
      en_transito: "En tránsito",
      confirmado: "Confirmada",
      revision_calidad: "Revisión",
      cerrado: "Cerrada",
      incidencia: "Incidencia",
      pendiente_conf: "Pendiente conf.",
      rechazado: "Rechazada",
    } as const
  )[status];
  return <Badge tone={tone}>{label}</Badge>;
}

function moneyFmt(n: number | null | undefined, currency: string): string {
  const c = currency === "USD" ? "USD" : currency === "EUR" ? "EUR" : "MXN";
  return (n ?? 0).toLocaleString("es-MX", { style: "currency", currency: c });
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString("es-MX", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function stripPrefix(id: string, prefix: string): string {
  return id.startsWith(`${prefix}:`) ? id.slice(prefix.length + 1) : id;
}
