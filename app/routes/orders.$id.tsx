import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useFetcher, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { getFullSession, requireUser } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import {
  authorizeOrder,
  deleteOrder,
  fetchActiveVendors,
  fetchInvoiceBalance,
  fetchOrder,
  type ActiveVendorSummary,
  type InvoiceBalance,
  type OrderBackend,
} from "~/lib/procurement-api.server";
import { listPaymentComplementsForInvoice } from "~/lib/payment-complements-api.server";
import type { PaymentComplementCfdi } from "~/types";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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
  invoiceBalance: InvoiceBalance | null;
  paymentComplements: PaymentComplementCfdi[];
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

  if (intent === "delete") {
    const bareId = id.startsWith("order:") ? id.slice("order:".length) : id;
    try {
      await deleteOrder(session.accessToken, session.user.company, bareId);
      throw redirect("/orders?deleted=1");
    } catch (error) {
      if (error instanceof Response) throw error; // re-throw redirect
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Error al eliminar orden",
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

  // Si la OC ya tiene factura vinculada, traemos el saldo para mostrar
  // "Pagado X / Y · falta Z" en el panel PAGO. Es no-fatal: si falla,
  // la UI cae a su estado neutro de "pendiente".
  let invoiceBalance: InvoiceBalance | null = null;
  let paymentComplements: PaymentComplementCfdi[] = [];
  const invoiceId = order.docState?.facInvoiceId;
  if (invoiceId) {
    try {
      invoiceBalance = await fetchInvoiceBalance(
        session.accessToken,
        session.user.company,
        invoiceId,
      );
    } catch (e) {
      console.warn("[orders/:id] could not fetch invoice balance:", e);
    }
    // Sólo cargamos REPs para facturas PPD — PUE no los requiere.
    if (order.paymentMethod === "PPD") {
      try {
        const invoiceUuid = invoiceId.startsWith("invoice:")
          ? invoiceId.slice("invoice:".length)
          : invoiceId;
        const page = await listPaymentComplementsForInvoice(
          session.accessToken,
          session.user.company,
          invoiceUuid,
        );
        paymentComplements = page.data ?? [];
      } catch (e) {
        console.warn("[orders/:id] could not fetch payment complements:", e);
      }
    }
  }

  return json<LoaderData>({ order, vendor, invoiceBalance, paymentComplements });
}

export default function OrderDetailPage() {
  const { order, vendor, paymentComplements } = useLoaderData<typeof loader>();
  const { user } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sendOpen, setSendOpen] = useState(false);
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [authorizeMode, setAuthorizeMode] = useState<"approve" | "reject">("approve");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigation = useNavigation();
  const isDeleting =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "delete";

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
  const userPermissions = user?.permissions ?? [];
  const canAuthorize =
    userPermissions.includes("orders:authorize") || userPermissions.includes("*");
  const needsAuthorization = order.status === "creada";

  // Eliminar es soft-delete y queda en audit log: lo permitimos en cualquier
  // estado siempre que el usuario tenga el permiso. Útil para limpiar OCs
  // creadas con datos erróneos en cualquier punto del ciclo.
  const canDelete =
    userPermissions.includes("orders:delete") || userPermissions.includes("*");

  // Usuarios que pueden cargar la factura vinculada a la OC
  const userRole = user?.role?.toLowerCase() ?? "";
  const canUploadInvoice =
    userPermissions.includes("invoices:create") ||
    userPermissions.includes("*") ||
    userRole === "vendor" ||
    userRole.includes("proveedor");
  const canShowInvoiceUpload =
    canUploadInvoice &&
    !order.docState.facInvoiceId &&
    (order.status === "autorizada" || order.status === "facturada");

  const orderBareId = useMemo(
    () => (order.id.startsWith("order:") ? order.id.slice("order:".length) : order.id),
    [order.id],
  );

  const folioDisplay = useMemo(() => shortenFolio(order.folio), [order.folio]);

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
              Orden{" "}
              <em
                title={order.folio}
                className="font-mono not-italic align-middle"
              >
                {folioDisplay}
              </em>
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

            {/* Cargar factura — visible para vendors / usuarios con permiso, cuando la OC aún no tiene factura vinculada */}
            {canShowInvoiceUpload && (
              <Button variant="clay" asChild>
                <Link
                  to={`/invoices/new?orderId=${orderBareId}`}
                  title="Cargar factura para esta orden"
                >
                  <Icon name="upload" size={13} />
                  Cargar factura
                </Link>
              </Button>
            )}

            {/* Subir documento — dropdown con los 4 tipos de doc adjuntos a la OC.
                Sólo se muestran los kinds que aún faltan; si están los 4, se oculta el botón. */}
            {(() => {
              const docOptions: { label: string; kind: "oc" | "rem" | "nc" | "pago" | "comppago" }[] = [];
              if (!order.docState.ocUrl) docOptions.push({ label: "OC (PDF)", kind: "oc" });
              if (!order.docState.remUrl) docOptions.push({ label: "Remisión", kind: "rem" });
              if (!order.docState.ncUrl) docOptions.push({ label: "Nota de crédito", kind: "nc" });
              if (!order.docState.paymentReceiptUrl) docOptions.push({ label: "Comprobante de pago", kind: "pago" });
              // Sólo facturas PPD requieren CFDI Complemento de Pago. PUE nunca lo ve.
              if (
                order.paymentMethod === "PPD" &&
                order.docState.facInvoiceId
              ) {
                docOptions.push({ label: "Complemento de Pago (CFDI)", kind: "comppago" });
              }
              if (docOptions.length === 0) return null;
              return (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="outline" size="sm" title="Subir documento adjunto a la OC">
                      <Icon name="upload" size={13} />
                      Subir documento
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={6}
                      className="z-50 min-w-[200px] overflow-hidden rounded-md border border-line bg-paper p-1 shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0"
                    >
                      {docOptions.map((opt) => (
                        <DropdownMenu.Item key={opt.kind} asChild>
                          <Link
                            to={`/orders/${orderBareId}/upload-doc?kind=${opt.kind}`}
                            className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] text-ink outline-none data-[highlighted]:bg-paper-2 data-[highlighted]:text-ink"
                          >
                            <Icon name="upload" size={13} className="text-ink-3" />
                            {opt.label}
                          </Link>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              );
            })()}

            {/* Abrir PDF en nueva pestaña — siempre disponible. */}
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/orders/${orderBareId}/pdf`}
                target="_blank"
                rel="noreferrer"
                title="Abrir PDF en pestaña nueva"
              >
                <Icon name="download" size={13} />
                Abrir PDF
              </a>
            </Button>

            {/* Menú de acciones secundarias / destructivas. Soft-delete queda en
                audit log; la confirmación es modal para evitar borrar por error. */}
            {canDelete && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Más acciones"
                    title="Más acciones"
                    className="px-2"
                  >
                    <Icon name="dots" size={13} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 min-w-[180px] overflow-hidden rounded-md border border-line bg-paper p-1 shadow-md data-[state=open]:animate-in data-[state=open]:fade-in-0"
                  >
                    <DropdownMenu.Item
                      onSelect={(e) => {
                        e.preventDefault();
                        setDeleteOpen(true);
                      }}
                      className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-[13px] text-wine-700 outline-none data-[highlighted]:bg-wine-50 data-[highlighted]:text-wine-900"
                    >
                      <Icon name="x" size={13} />
                      Eliminar orden
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>
                Vista previa <em className="not-italic text-clay">del PDF</em>
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <a
                  href={`/orders/${orderBareId}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir en pestaña nueva"
                >
                  <Icon name="download" size={13} />
                  Pestaña nueva
                </a>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={`/orders/${orderBareId}/pdf#view=FitH&toolbar=1`}
                title={`PDF de la orden ${order.folio}`}
                className="block w-full bg-paper-2"
                style={{ height: "70vh", minHeight: "560px", border: 0 }}
                loading="lazy"
              />
            </CardContent>
          </Card>

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

              {hasAnyDetailField(order) ? (
                <>
                  <Separator className="my-4" />
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
                    {order.paymentTerms ? (
                      <KV k="Términos de pago" v={order.paymentTerms} />
                    ) : null}
                    {order.deliveryWarehouse ? (
                      <KV k="Almacén" v={order.deliveryWarehouse} />
                    ) : null}
                    {order.deliveryAddress ? (
                      <KV k="Dirección de entrega" v={order.deliveryAddress} />
                    ) : null}
                    {order.deliveryDate ? (
                      <KV k="Fecha de entrega" v={order.deliveryDate} />
                    ) : null}
                    {order.requestingDepartment ? (
                      <KV k="Departamento solicitante" v={order.requestingDepartment} />
                    ) : null}
                    {order.cfdiUse ? <KV k="Uso CFDI" v={order.cfdiUse} /> : null}
                    {order.paymentMethod ? (
                      <KV k="Método de pago" v={order.paymentMethod} />
                    ) : null}
                    {order.paymentForm ? (
                      <KV k="Forma de pago" v={order.paymentForm} />
                    ) : null}
                    {typeof order.ivaRate === "number" ? (
                      <KV k="IVA" v={`${order.ivaRate}%`} />
                    ) : null}
                    {order.observations ? (
                      <KV k="Observaciones" v={order.observations} />
                    ) : null}
                    {order.notes ? <KV k="Notas internas" v={order.notes} /> : null}
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
                <DocRow
                  label="Nota crédito"
                  url={order.docState.ncUrl}
                  uploadHref={`/orders/${orderBareId}/upload-doc?kind=nc`}
                  statusBadge={
                    order.docState.ncUrl ? { label: "Cargada", tone: "moss" } : undefined
                  }
                />
                <DocRow
                  label="Comprobante de pago"
                  url={order.docState.paymentReceiptUrl ?? null}
                />
                <DocRow
                  label="Factura vinculada"
                  url={order.docState.facInvoiceId ? `/invoices/${stripPrefix(order.docState.facInvoiceId, "invoice")}` : null}
                  internal
                />
                {order.paymentMethod === "PPD" && order.docState.facInvoiceId ? (
                  <div className="pt-2 mt-1 border-t border-line">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[12px] font-medium text-ink-2 uppercase tracking-wide">
                        Complementos de Pago (CFDI)
                      </div>
                      {paymentComplements.length > 0 ? (
                        <span className="text-[11px] font-mono text-ink-3">
                          {paymentComplements.length}
                        </span>
                      ) : null}
                    </div>
                    {paymentComplements.length === 0 ? (
                      <p className="text-[12px] text-ink-3 leading-snug">
                        Falta Complemento de Pago para esta factura PPD. Sube el XML del CFDI tipo &ldquo;Pago&rdquo; (REP) para registrar el pago ante el SAT.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {paymentComplements.map((pc) => (
                          <PaymentComplementRow
                            key={pc.id}
                            pc={pc}
                            orderBareId={orderBareId}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
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

        <Dialog open={deleteOpen} onOpenChange={(o) => !isDeleting && setDeleteOpen(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar orden de compra</DialogTitle>
              <DialogDescription>
                Esta acción borrará la orden <span className="font-mono">{order.folio}</span>{" "}
                del listado activo. La operación es reversible solo desde la base de datos —
                no podrás restaurarla desde la interfaz.
              </DialogDescription>
            </DialogHeader>
            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={isDeleting}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive" disabled={isDeleting}>
                  <Icon name={isDeleting ? "clock" : "x"} size={13} />
                  {isDeleting ? "Eliminando…" : "Eliminar orden"}
                </Button>
              </DialogFooter>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </AuthLayout>
  );
}

function hasAnyDetailField(o: OrderBackend): boolean {
  return Boolean(
    o.notes ||
      o.paymentTerms ||
      o.deliveryAddress ||
      o.deliveryWarehouse ||
      o.deliveryDate ||
      o.requestingDepartment ||
      o.cfdiUse ||
      o.paymentMethod ||
      o.paymentForm ||
      o.observations ||
      typeof o.ivaRate === "number",
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

function PaymentComplementRow({
  pc,
  orderBareId,
}: {
  pc: PaymentComplementCfdi;
  orderBareId: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const deleting = fetcher.state !== "idle";
  const onDelete = () => {
    if (deleting) return;
    if (!confirm(`¿Eliminar el Complemento de Pago folio ${pc.folio}?`)) return;
    const fd = new FormData();
    fd.set("complementId", pc.id);
    fetcher.submit(fd, {
      method: "post",
      action: `/orders/${orderBareId}/delete-doc?kind=comppago`,
    });
  };
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-ink truncate">
          <span className="font-mono">{pc.folio}</span>
          <span className="text-ink-3"> · {pc.fechaTimbrado.slice(0, 10)}</span>
        </div>
        <div className="text-[11px] text-ink-3 font-mono truncate">
          UUID {pc.uuid}
        </div>
        {fetcher.data?.error ? (
          <div className="text-[10.5px] text-wine mt-0.5">{fetcher.data.error}</div>
        ) : null}
      </div>
      {pc.xmlKey ? (
        <a
          href={`/api/payment-complements/${pc.id}/document?type=xml`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-clay underline"
          title="Descargar XML"
        >
          XML
        </a>
      ) : null}
      {pc.pdfKey ? (
        <a
          href={`/api/payment-complements/${pc.id}/document?type=pdf`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-clay underline"
          title="Descargar PDF"
        >
          PDF
        </a>
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="text-[11px] text-wine-700 hover:text-wine-900 disabled:text-ink-4 disabled:cursor-not-allowed"
        title="Eliminar Complemento de Pago"
        aria-label="Eliminar Complemento de Pago"
      >
        {deleting ? "…" : "Eliminar"}
      </button>
    </li>
  );
}

function DocRow({
  label,
  url,
  internal,
  uploadHref,
  statusBadge,
}: {
  label: string;
  url: string | null;
  internal?: boolean;
  uploadHref?: string | null;
  statusBadge?: { label: string; tone: BadgeTone };
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper-2 px-3 py-2">
      <div className="flex items-center gap-2 text-ink-2">
        <Icon name="file" size={13} className="text-ink-3" />
        <span className="text-[12.5px]">{label}</span>
      </div>
      {url ? (
        <div className="flex items-center gap-2">
          {statusBadge ? <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge> : null}
          {internal ? (
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
          )}
        </div>
      ) : uploadHref ? (
        <Link
          to={uploadHref}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-clay hover:underline"
        >
          <Icon name="upload" size={11} />
          Cargar
        </Link>
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
      pagada: "moss",
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
      pagada: "Pagada",
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

// Si el folio es un UUID o es muy largo, se acorta para que no rompa el layout del header.
// Mantiene los folios cortos legibles (p.ej. "OC-2026-0042") sin tocar.
function shortenFolio(folio: string): string {
  if (!folio) return "—";
  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folio);
  if (isUuidLike) return `${folio.slice(0, 8)}…`;
  if (folio.length > 16) return `${folio.slice(0, 12)}…${folio.slice(-3)}`;
  return folio;
}
