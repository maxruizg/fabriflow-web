import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation, useRevalidator } from "@remix-run/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Timeline, type TimelineDotTone } from "~/components/ui/timeline";
import { DocChip, type DocType } from "~/components/ui/doc-chip";
import {
  fmtCurrency,
  fmtDate,
  fmtDateTime,
  STATUS_TONE,
  type SampleOrder,
} from "~/lib/sample-data";
import type {
  ActiveVendorSummary,
  OrderBackend,
  OrderEvent,
} from "~/lib/procurement-api.server";
import { AuthorizeOrderDialog } from "~/components/orders/authorize-order-dialog";
import { SendOrderDialog } from "~/components/orders/send-order-dialog";
import { cn } from "~/lib/utils";

interface OrderDetailPanelProps {
  order: SampleOrder | null;
  /** Raw backend record used for action dialogs (authorize/send). */
  backend?: OrderBackend | null;
  /** Vendor contact info used by the send dialog. */
  vendorContact?: ActiveVendorSummary | null;
  /** Effective user permissions; used to gate action buttons. */
  userPermissions?: string[];
  className?: string;
}

const SENDABLE_STATUS = new Set([
  "Autorizada",
  "Facturada",
  "En tránsito",
  "Revisión calidad",
  "Confirmado",
  "Pendiente conf.",
]);

function hasAny(perms: string[], required: string[]): boolean {
  if (perms.includes("*")) return true;
  return required.some((p) => perms.includes(p));
}

interface DocRowSpec {
  type: DocType;
  label: string;
  fileName?: string;
  meta?: string;
  state: "ok" | "pending";
  href?: string;
  /** Backend kind for upload (oc/rem/nc/pago). FAC is linked, not uploaded. */
  uploadKind?: "oc" | "rem" | "nc" | "pago";
  /** Internal navigation link used for docs that are uploaded through a separate flow (e.g. FAC → /invoices/new). */
  uploadHref?: string;
  /** Tooltip / aria-label for the navigation upload button. */
  uploadHrefLabel?: string;
}

function fileNameFromUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : undefined;
  } catch {
    const last = url.split("/").filter(Boolean).pop();
    return last ? last.split("?")[0] : undefined;
  }
}

// Recorta nombres de archivo con UUIDs largos para que no rompan el layout
// del card (p.ej. order-c7c75f2e-81bb-43bd-9aab-df967d67d33d.pdf → order-c7c75f2e….pdf).
function shortenFileName(name: string, max = 22): string {
  if (!name || name.length <= max) return name;
  const dotIdx = name.lastIndexOf(".");
  const hasExt = dotIdx > 0 && name.length - dotIdx <= 5;
  const ext = hasExt ? name.slice(dotIdx) : "";
  const base = hasExt ? name.slice(0, dotIdx) : name;
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const m = base.match(uuidRe);
  if (m && m.index !== undefined) {
    const before = base.slice(0, m.index);
    return `${before}${m[0].slice(0, 8)}…${ext}`;
  }
  return `${base.slice(0, Math.max(8, max - 3))}…${ext}`;
}

function docRowsFor(
  order: SampleOrder,
  opts: { canUploadInvoice?: boolean; canUploadPayment?: boolean } = {},
): DocRowSpec[] {
  const ds = order.docState;
  const has = (t: DocType) => order.docs.includes(t);
  const facLinked = Boolean(ds?.facInvoiceId);
  const bal = order.invoiceBalance ?? null;
  const balCurCode: SampleOrder["cur"] =
    bal && (bal.currency === "MXN" || bal.currency === "USD" || bal.currency === "EUR")
      ? (bal.currency as SampleOrder["cur"])
      : order.cur;
  const fullyPaid = bal ? bal.outstanding <= 0.01 : false;
  const money = (n: number) => {
    const m = fmtCurrency(n, balCurCode);
    return `${m.symbol}${m.integer}.${m.decimal}`;
  };
  const pagoMeta = (() => {
    if (!facLinked) return "Vincula la factura primero";
    if (bal) {
      if (fullyPaid) {
        return `Pagado · ${money(bal.total)}`;
      }
      return `Pagado ${money(bal.paid)} / ${money(bal.total)} · falta ${money(bal.outstanding)}`;
    }
    return ds?.paymentReceiptUrl ? "PDF / imagen" : "Pendiente";
  })();
  // OC is implicit: the order existing means the OC exists. The PDF URL is
  // generated lazily by the backend, so we always mark it as "ok" and link
  // to the resource route which materializes/redirects on demand.
  return [
    {
      type: "OC",
      label: "Orden de compra",
      fileName: fileNameFromUrl(ds?.ocUrl) ?? `OC-${order.folio || order.id.slice(0, 8)}.pdf`,
      meta: ds?.ocUrl ? "PDF" : "Generado al abrir",
      state: "ok",
      href: ds?.ocUrl ?? `/orders/${order.id}/pdf`,
      uploadKind: "oc",
    },
    {
      type: "FAC",
      label: "Factura (CFDI)",
      fileName: ds?.facInvoiceId ?? undefined,
      meta: ds?.facInvoiceId ? "CFDI vinculado" : "Vincular desde Facturas",
      state: has("FAC") ? "ok" : "pending",
      // FAC is linked from the invoices module — sends the user to the upload flow with this OC preselected.
      uploadHref:
        opts.canUploadInvoice && !ds?.facInvoiceId
          ? `/invoices/new?orderId=${order.id}`
          : undefined,
      uploadHrefLabel: "Cargar factura",
    },
    {
      type: "REM",
      label: "Remito de entrega",
      fileName: fileNameFromUrl(ds?.remUrl),
      state: has("REM") ? "ok" : "pending",
      href: ds?.remUrl ?? undefined,
      uploadKind: "rem",
    },
    {
      type: "NC",
      label: "Nota de crédito",
      fileName: fileNameFromUrl(ds?.ncUrl),
      state: has("NC") ? "ok" : "pending",
      href: ds?.ncUrl ?? undefined,
      uploadKind: "nc",
    },
    {
      type: "PAGO",
      label: "Comprobante de pago",
      fileName: fileNameFromUrl(ds?.paymentReceiptUrl),
      meta: pagoMeta,
      // Estado "ok" si tenemos receipt URL o si el saldo cubre la factura
      // (segunda condición útil cuando el balance se hidrata desde fuera).
      state: ds?.paymentReceiptUrl || fullyPaid ? "ok" : "pending",
      href: ds?.paymentReceiptUrl ?? undefined,
      // Only allow the upload once a factura is linked (the backend enforces this too).
      uploadKind: opts.canUploadPayment !== false && facLinked ? "pago" : undefined,
    },
  ];
}

function eventTone(kind: string): TimelineDotTone {
  switch (kind) {
    case "created":
      return "clay";
    case "authorization":
      return "moss";
    case "sent_email":
    case "sent_whatsapp":
    case "sent":
      return "moss";
    case "incident":
    case "rejected":
      return "wine";
    case "status_change":
      return "ink";
    default:
      return "ink";
  }
}

function eventDescription(ev: OrderEvent): string {
  if (ev.description && ev.description.trim()) return ev.description;
  switch (ev.kind) {
    case "created":
      return "Orden creada";
    case "authorization":
      return "Orden autorizada";
    case "sent_email":
      return "OC enviada por correo";
    case "sent_whatsapp":
      return "OC enviada por WhatsApp";
    default:
      return ev.kind;
  }
}

interface DocRowProps {
  doc: DocRowSpec;
  orderId: string;
  /** Called after a successful upload so the panel can refresh order data. */
  onUploaded?: () => void;
}

function DocRow({ doc, orderId, onUploaded }: DocRowProps) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const uploading = fetcher.state !== "idle";
  const actionable = doc.state === "ok" && doc.href;
  const canUpload = Boolean(doc.uploadKind);
  const acceptByKind: Record<"oc" | "rem" | "nc" | "pago", string> = {
    oc: "application/pdf",
    rem: "application/pdf,image/png,image/jpeg",
    nc: "application/pdf,application/xml,text/xml",
    pago: "application/pdf,image/png,image/jpeg",
  };

  // Bubble success up so the parent revalidates loader data.
  // onUploaded is held in a ref so an unstable parent reference (inline arrow)
  // can't put this effect in a render → revalidate → render loop. firedRef
  // gates the callback to once per submitting → idle transition.
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  });
  const firedRef = useRef(false);
  useEffect(() => {
    if (fetcher.state !== "idle") {
      firedRef.current = false;
      return;
    }
    if (fetcher.data?.ok && !firedRef.current) {
      firedRef.current = true;
      onUploadedRef.current?.();
    }
  }, [fetcher.state, fetcher.data?.ok]);

  const onPick = () => {
    if (!canUpload || uploading) return;
    setLocalError(null);
    inputRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file fires change again
    if (!file || !doc.uploadKind) return;
    const fd = new FormData();
    fd.set("kind", doc.uploadKind);
    fd.set("file", file);
    fetcher.submit(fd, {
      method: "post",
      action: `/orders/${orderId}/upload-doc`,
      encType: "multipart/form-data",
    });
  };

  const displayFileName = doc.fileName ? shortenFileName(doc.fileName) : undefined;

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-line bg-paper-2 p-2.5">
      <DocChip type={doc.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-[13px] font-medium text-ink truncate min-w-0">
            {doc.label}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone={doc.state === "ok" ? "moss" : "rust"} noDot>
              {doc.state === "ok" ? "Subido" : "Pendiente"}
            </Badge>
            {actionable ? (
              <Button
                size="xs"
                variant="outline"
                aria-label="Ver documento"
                asChild
              >
                <a href={doc.href} target="_blank" rel="noreferrer">
                  <Icon name="eye" size={12} />
                </a>
              </Button>
            ) : null}
            {canUpload ? (
              <>
                <Button
                  size="xs"
                  variant={doc.state === "ok" ? "outline" : "clay"}
                  aria-label={doc.state === "ok" ? "Reemplazar documento" : "Subir documento"}
                  title={doc.state === "ok" ? "Reemplazar" : "Subir"}
                  onClick={onPick}
                  disabled={uploading}
                >
                  <Icon name={uploading ? "clock" : "upload"} size={12} />
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept={acceptByKind[doc.uploadKind!]}
                  className="hidden"
                  onChange={onFile}
                />
              </>
            ) : doc.uploadHref ? (
              <Button
                size="xs"
                variant="clay"
                aria-label={doc.uploadHrefLabel ?? "Cargar"}
                title={doc.uploadHrefLabel ?? "Cargar"}
                asChild
              >
                <Link to={doc.uploadHref}>
                  <Icon name="upload" size={12} />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
        <div className="text-[11px] text-ink-3 mt-0.5 truncate">
          {displayFileName ? (
            <span className="font-mono" title={doc.fileName}>
              {displayFileName}
            </span>
          ) : (
            <span>Aún no recibido</span>
          )}
          {doc.meta ? <span className="ml-2 text-ink-4">· {doc.meta}</span> : null}
        </div>
        {fetcher.data?.error || localError ? (
          <div className="mt-1 text-[10.5px] text-wine">
            {fetcher.data?.error ?? localError}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function OrderDetailPanel({
  order,
  backend,
  vendorContact,
  userPermissions = [],
  className,
}: OrderDetailPanelProps) {
  const [authMode, setAuthMode] = useState<"approve" | "reject" | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const isDeleting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "delete";

  if (!order) {
    return (
      <aside
        className={cn(
          "rounded-lg border border-line bg-paper p-6 text-center lg:h-full",
          className,
        )}
      >
        <Icon name="orders" size={28} className="mx-auto text-ink-4 mb-3" />
        <div className="text-[13px] font-medium text-ink-2">
          Selecciona una orden
        </div>
        <div className="text-[11px] text-ink-3 mt-1">
          Haz clic en una fila para ver detalles
        </div>
      </aside>
    );
  }

  const tone = STATUS_TONE[order.status] ?? "ink";
  const m = fmtCurrency(order.amount, order.cur);
  const canUploadInvoice = hasAny(userPermissions, ["invoices:create"]);
  const canUploadPayment = hasAny(userPermissions, ["orders:update", "payments:create"]);
  const docs = docRowsFor(order, { canUploadInvoice, canUploadPayment });
  const headerRef = order.folio || order.id;
  const pendingAuth = order.status === "Creada";
  const canAuthorize = hasAny(userPermissions, ["orders:authorize"]);
  const canSend = hasAny(userPermissions, ["orders:send", "orders:create"]);
  const canDelete = hasAny(userPermissions, ["orders:delete"]);
  const sendable = SENDABLE_STATUS.has(order.status);
  const orderBareId = order.id.startsWith("order:")
    ? order.id.slice("order:".length)
    : order.id;

  return (
    <aside
      className={cn(
        "rounded-lg border border-line bg-paper min-w-0 max-w-full",
        "lg:h-full lg:overflow-y-auto",
        className,
      )}
    >
      <div className="p-5 border-b border-line min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span
            className="font-mono text-[11px] text-ink-3 uppercase tracking-wider truncate min-w-0"
            title={headerRef}
          >
            {headerRef}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone={tone}>{order.status}</Badge>
            {canDelete && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button
                    variant="outline"
                    size="xs"
                    aria-label="Más acciones"
                    title="Más acciones"
                    className="px-1.5"
                  >
                    <Icon name="dots" size={12} />
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
        </div>
        <h3
          className="mt-2 font-display text-[20px] font-medium leading-tight truncate"
          title={order.vendor}
        >
          {order.vendor}
        </h3>
        <div className="mt-1 text-[11.5px] text-ink-3 font-mono truncate">
          {order.items} líneas · emitida {fmtDate(order.date)} · vence{" "}
          {fmtDate(order.due)}
        </div>
        {pendingAuth ? (
          <div className="mt-3 flex items-center gap-1.5 rounded-md border border-line bg-paper-2 px-2.5 py-1.5">
            <Icon name="warn" size={12} className="text-rust-700" />
            <span className="text-[11px] font-medium text-rust-700">
              Pendiente de autorización por un Super Admin
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-1">
          Importe
        </div>
        <div className="ff-stat-val ff-num">
          <span className="text-[18px] italic font-normal text-ink-3 mr-1">
            {m.symbol}
          </span>
          {m.integer}
          <span className="text-ink-3 text-[20px]">.{m.decimal}</span>
          <span className="ml-1.5 text-[12px] font-mono text-ink-3 align-baseline">
            {m.code}
          </span>
        </div>
      </div>

      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-3">
          Documentos
        </div>
        <div className="space-y-2">
          {docs.map((d) => (
            <DocRow
              key={d.type}
              doc={d}
              orderId={order.id}
              onUploaded={() => revalidator.revalidate()}
            />
          ))}
        </div>
      </div>

      <div className="p-5 border-b border-line">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-3">
          Historial
        </div>
        {order.history && order.history.length > 0 ? (
          <Timeline>
            {[...order.history]
              .sort((a, b) => (a.ts < b.ts ? 1 : -1))
              .map((ev, idx) => {
                const meta = [fmtDateTime(ev.ts), ev.actor]
                  .filter((v): v is string => Boolean(v))
                  .join(" · ");
                return (
                  <Timeline.Item
                    key={`${ev.ts}-${ev.kind}-${idx}`}
                    tone={eventTone(ev.kind)}
                    meta={meta || undefined}
                  >
                    {eventDescription(ev)}
                  </Timeline.Item>
                );
              })}
          </Timeline>
        ) : (
          <div className="text-[12px] text-ink-3">
            Sin eventos registrados todavía.
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col gap-2">
        {pendingAuth && canAuthorize && backend ? (
          <div className="flex gap-2">
            <Button
              variant="clay"
              size="sm"
              className="flex-1 justify-center"
              onClick={() => setAuthMode("approve")}
            >
              <Icon name="check" size={13} />
              Autorizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-center"
              onClick={() => setAuthMode("reject")}
            >
              <Icon name="x" size={13} />
              Rechazar
            </Button>
          </div>
        ) : null}

        {pendingAuth && !canAuthorize ? (
          <div className="text-[11px] text-ink-3 text-center">
            Esperando autorización de un Super Admin
          </div>
        ) : null}

        {canSend && backend ? (
          <Button
            variant={sendable ? "clay" : "outline"}
            size="sm"
            className="w-full justify-center"
            disabled={!sendable}
            title={
              sendable
                ? undefined
                : "La orden debe estar autorizada antes de enviarla al proveedor"
            }
            onClick={() => sendable && setSendOpen(true)}
          >
            <Icon name="upload" size={13} />
            Enviar al proveedor
          </Button>
        ) : null}

        <Button variant="outline" size="sm" className="w-full justify-center" asChild>
          <a
            href={`/orders/${order.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="download" size={13} />
            OC (PDF)
          </a>
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-center" asChild>
          <Link to={`/payments/new?order=${order.id}`}>
            <Icon name="coin" size={13} />
            Registrar pago
          </Link>
        </Button>
      </div>

      {backend ? (
        <>
          <AuthorizeOrderDialog
            order={backend}
            open={authMode !== null}
            onOpenChange={(open) => {
              if (!open) setAuthMode(null);
            }}
            mode={authMode ?? "approve"}
          />
          <SendOrderDialog
            open={sendOpen}
            onOpenChange={setSendOpen}
            orderId={backend.id}
            folio={backend.folio}
            vendor={{
              name: vendorContact?.name ?? order.vendor,
              email: vendorContact?.email,
              whatsappPhone: vendorContact?.whatsappPhone,
            }}
          />
        </>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={(o) => !isDeleting && setDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar orden de compra</DialogTitle>
            <DialogDescription>
              Esta acción borrará la orden{" "}
              <span className="font-mono">{order.folio || headerRef}</span> del listado activo.
              La operación es reversible solo desde la base de datos.
            </DialogDescription>
          </DialogHeader>
          <Form method="post" action={`/orders/${orderBareId}`}>
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
    </aside>
  );
}
