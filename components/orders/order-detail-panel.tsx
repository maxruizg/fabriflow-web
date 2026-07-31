import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation, useRevalidator } from "@remix-run/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { useRole } from "~/lib/role-context";
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
  InvoiceBalance,
  OrderBackend,
  OrderEvent,
} from "~/lib/procurement-api.server";
import type { UploadActionResult } from "~/types";
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
  "autorizada",
  "facturada",
  "en_transito",
  "revision_calidad",
  "confirmado",
  "pendiente_conf",
]);

const STATUS_LABEL: Record<string, string> = {
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
  /** Backend kind for upload (oc/rem/nc/pago/comppago). FAC is linked, not uploaded. */
  uploadKind?: "oc" | "rem" | "nc" | "pago" | "comppago";
  /** Internal navigation link used for docs that are uploaded through a separate flow (e.g. FAC → /invoices/new). */
  uploadHref?: string;
  /** Tooltip / aria-label for the navigation upload button. */
  uploadHrefLabel?: string;
  /** When true, no badge renders while `state === "pending"` — only the upload action shows.
   *  Used for optional docs (NC) where "Pendiente" wording would imply it's required. */
  hidePendingBadge?: boolean;
  /** For docs that need an external id when deleting (currently REP only — the
   *  delete-doc action takes `complementId` in the body and routes to the
   *  /api/payment-complements/{id} endpoint). */
  deleteExtraId?: string | null;
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
  opts: { canUploadInvoice?: boolean; canUploadPayment?: boolean; canUploadCreditNote?: boolean } = {},
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
  const hasRem = has("REM") || Boolean(ds?.remUrl);
  const ncUploaded = has("NC") || Boolean(ds?.ncUrl);

  // Flujo de documentos requerido: OC → REM → FAC → PAGO → REP
  // NC es opcional en cualquier momento después de la factura
  const canUploadRem = true; // Siempre se puede subir REM después de OC
  const canUploadFac = hasRem; // Solo se puede subir FAC si existe REM
  const canUploadNc = facLinked; // NC es opcional, solo si hay factura
  const canUploadPago = facLinked; // Solo se puede subir PAGO si existe FAC
  const hasPayment = Boolean(ds?.paymentReceiptUrl); // Solo si hay archivo subido
  const canUploadRep = hasPayment; // Solo se puede subir REP si existe PAGO

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
      type: "REM",
      label: "Recepción",
      fileName: fileNameFromUrl(ds?.remUrl),
      meta: hasRem ? undefined : "Subir después de OC",
      state: hasRem ? "ok" : "pending",
      href: ds?.remUrl ?? undefined,
      uploadKind: canUploadRem ? "rem" : undefined,
    },
    {
      type: "FAC",
      label: "Factura (CFDI)",
      fileName: ds?.facInvoiceId ?? undefined,
      meta: ds?.facInvoiceId
        ? "CFDI vinculado"
        : !canUploadFac
          ? "Sube el remito primero"
          : "Vincular desde Facturas",
      state: has("FAC") ? "ok" : "pending",
      // FAC is linked from the invoices module — sends the user to the upload flow with this OC preselected.
      uploadHref:
        opts.canUploadInvoice && !ds?.facInvoiceId && canUploadFac
          ? `/invoices/new?orderId=${order.id}`
          : undefined,
      uploadHrefLabel: "Cargar factura",
    },
    // NC is optional. Row is always rendered; when not uploaded we suppress
    // the "Pendiente" badge so users don't think it's a required doc — they
    // just see the upload action when applicable.
    {
      type: "NC",
      label: "Nota de crédito",
      fileName: fileNameFromUrl(ds?.ncUrl),
      meta: ncUploaded ? undefined : "Opcional",
      state: ncUploaded ? "ok" : "pending",
      href: ds?.ncUrl ?? undefined,
      // NC requiere 2 archivos (XML + PDF opcional), usamos uploadHref para ir a la pantalla completa
      uploadHref: canUploadNc && opts.canUploadCreditNote !== false ? `/orders/${order.id}/upload-doc?kind=nc` : undefined,
      uploadHrefLabel: "Cargar nota de crédito",
      hidePendingBadge: true,
    },
    {
      type: "PAGO",
      label: "Comprobante de pago",
      fileName: fileNameFromUrl(ds?.paymentReceiptUrl),
      meta: !canUploadPago
        ? "Vincula la factura primero"
        : bal
          ? fullyPaid
            ? `Pagado · ${money(bal.total)}`
            : `Pagado ${money(bal.paid)} / ${money(bal.total)} · falta ${money(bal.outstanding)}`
          : ds?.paymentReceiptUrl
            ? "PDF / imagen"
            : "Pendiente",
      // Estado "ok" SOLO si hay archivo subido - el backend maneja el estado de la orden
      state: ds?.paymentReceiptUrl ? "ok" : "pending",
      href: ds?.paymentReceiptUrl ?? undefined,
      // Only allow the upload once a factura is linked (the backend enforces this too).
      uploadKind: opts.canUploadPayment !== false && canUploadPago ? "pago" : undefined,
    },
    // Complemento de Pago (CFDI tipo "P" / REP). Sólo para facturas PPD —
    // SAT no lo requiere para PUE. Solo se puede subir si ya existe el comprobante de pago.
    ...(order.paymentMethod === "PPD" && facLinked
      ? ([
          {
            type: "REP",
            label: "Complemento de Pago (CFDI)",
            fileName: order.paymentComplementFirstFolio ?? undefined,
            meta:
              (order.paymentComplementsCount ?? 0) > 0
                ? `${order.paymentComplementsCount} REP${
                    (order.paymentComplementsCount ?? 0) === 1 ? "" : "s"
                  } cargado${(order.paymentComplementsCount ?? 0) === 1 ? "" : "s"}`
                : !canUploadRep
                  ? "Sube el comprobante de pago primero"
                  : "Requerido para PPD",
            state:
              (order.paymentComplementsCount ?? 0) > 0 ? "ok" : "pending",
            // REP upload usa el flujo full-screen (igual que FAC con uploadHref):
            // el endpoint del backend exige el XML del CFDI tipo Pago. El
            // wizard de upload-doc se encarga de mandar el `xml` correctamente.
            uploadHref: canUploadRep ? `/orders/${order.id}/upload-doc?kind=comppago` : undefined,
            uploadHrefLabel: "Subir Complemento de Pago (CFDI)",
            // `deleteExtraId` apunta al REP más reciente — el delete inline
            // borrará ese. Si hay múltiples y se quiere borrar uno específico,
            // se usa la lista en la página de detalle de la OC.
            deleteExtraId: order.paymentComplementFirstId ?? null,
          } satisfies DocRowSpec,
        ] as DocRowSpec[])
      : []),
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
  let description = "";

  if (ev.description && ev.description.trim()) {
    description = ev.description;
  } else {
    switch (ev.kind) {
      case "created":
        description = "Orden creada";
        break;
      case "authorization":
        description = "Orden autorizada";
        break;
      case "sent_email":
        description = "OC enviada por correo";
        break;
      case "sent_whatsapp":
        description = "OC enviada por WhatsApp";
        break;
      default:
        description = ev.kind;
    }
  }

  // Reemplazar nombres de documentos por versiones más descriptivas
  description = description
    .replace(/Documento REM/gi, "Recepción")
    .replace(/documento rem/gi, "recepción")
    .replace(/Documento OC/gi, "Orden de Compra")
    .replace(/documento oc/gi, "orden de compra")
    .replace(/\bREM\b/g, "Recepción")
    .replace(/\bOC\b/g, "Orden de Compra");

  return description;
}

interface DocRowProps {
  doc: DocRowSpec;
  orderId: string;
  /** Called after a successful upload or delete so the panel can refresh order data. */
  onUploaded?: () => void;
  /** Permission gate for showing the trash button. */
  canDelete?: boolean;
}

function DocRow({ doc, orderId, onUploaded, canDelete }: DocRowProps) {
  const fetcher = useFetcher<UploadActionResult<{ balance?: InvoiceBalance }>>();
  const deleteFetcher = useFetcher<{
    ok: boolean;
    kind?: string;
    error?: string;
    result?: { balance?: InvoiceBalance | null; order?: any; affectedInvoiceIds?: string[] };
  }>();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const uploading = fetcher.state !== "idle";
  const deleting = deleteFetcher.state !== "idle";
  const actionable = doc.state === "ok" && doc.href;
  const canUpload = Boolean(doc.uploadKind);
  const acceptByKind: Record<"oc" | "rem" | "nc" | "pago" | "comppago", string> = {
    oc: "application/pdf",
    rem: "application/pdf,image/png,image/jpeg",
    nc: "application/pdf,application/xml,text/xml",
    pago: "application/pdf,image/png,image/jpeg",
    comppago: "application/xml,text/xml",
  };
  // Delete kind: docs that share the OC's `doc_state` lifecycle use their
  // lowercased DocType. `REP` (Complemento de Pago CFDI) is NOT part of
  // `doc_state` — it forwards to /api/payment-complements/{id} via the
  // `comppago` branch in delete-doc.tsx and needs `complementId` in the form.
  const deletableKinds = ["oc", "fac", "rem", "nc", "pago", "comppago"] as const;
  type DeletableKind = (typeof deletableKinds)[number];
  const deleteKind: DeletableKind | null = (() => {
    if (doc.type === "REP") return "comppago";
    const lowered = doc.type.toLowerCase();
    return (deletableKinds as readonly string[]).includes(lowered)
      ? (lowered as DeletableKind)
      : null;
  })();
  const showDelete =
    Boolean(canDelete) && doc.state === "ok" && deleteKind !== null;

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

  // Same revalidate-on-success contract for the delete fetcher. Also close
  // the confirmation dialog automatically when the request succeeds.
  const deleteFiredRef = useRef(false);
  useEffect(() => {
    if (deleteFetcher.state !== "idle") {
      deleteFiredRef.current = false;
      setDeleteSuccess(false);
      return;
    }

    // Si la eliminación fue exitosa
    if (deleteFetcher.data?.ok === true && !deleteFiredRef.current) {
      deleteFiredRef.current = true;
      setDeleteSuccess(true);

      // Forzar revalidación para actualizar los datos
      onUploadedRef.current?.();

      // Cerrar el modal inmediatamente
      setDeleteOpen(false);

      // Resetear el estado de éxito después de 3 segundos
      setTimeout(() => setDeleteSuccess(false), 3000);
    }

    // Si hubo un error, NO cerrar el modal para que el usuario vea el error
  }, [deleteFetcher.state, deleteFetcher.data, doc.type, orderId]);

  const confirmDelete = () => {
    if (deleting || !deleteKind) return;

    // Resetear estados antes de eliminar
    setDeleteSuccess(false);

    // REP delete needs `complementId` in the form body — the action forwards
    // to /api/payment-complements/{id}. For doc_state-based kinds the body is
    // empty (server reads kind from query string).
    const body =
      deleteKind === "comppago" && doc.deleteExtraId
        ? (() => {
            const fd = new FormData();
            fd.set("complementId", doc.deleteExtraId!);
            return fd;
          })()
        : null;
    deleteFetcher.submit(body, {
      method: "post",
      action: `/orders/${orderId}/delete-doc?kind=${deleteKind}`,
    });
  };

  // Resetear estados cuando se abre el modal
  const handleOpenChange = (open: boolean) => {
    if (!deleting) {
      setDeleteOpen(open);
      if (open) {
        // Al abrir, limpiar errores previos
        setDeleteSuccess(false);
      }
    }
  };

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
      action: `/orders/${orderId}/upload-doc?kind=${doc.uploadKind}`,
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
            {doc.hidePendingBadge && doc.state === "pending" ? null : (
              <Badge tone={doc.state === "ok" ? "moss" : "rust"} noDot>
                {doc.state === "ok" ? "Subido" : "Pendiente"}
              </Badge>
            )}
            {actionable ? (
              <Button
                size="xs"
                variant="outline"
                aria-label="Ver documento"
                title="Ver documento"
                onClick={() => setPreviewOpen(true)}
              >
                <Icon name="eye" size={12} />
              </Button>
            ) : null}
            {showDelete ? (
              <Button
                size="xs"
                variant="outline"
                aria-label="Eliminar documento"
                title="Eliminar"
                onClick={() => setDeleteOpen(true)}
                disabled={deleting}
              >
                <Icon name={deleting ? "clock" : "x"} size={12} />
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
          ) : doc.meta ? (
            <span className="text-ink-4">{doc.meta}</span>
          ) : (
            <span>Sin documento</span>
          )}
          {displayFileName && doc.meta ? <span className="ml-2 text-ink-4">· {doc.meta}</span> : null}
        </div>
        {fetcher.data?.error || localError ? (
          <div className="mt-1 text-[10.5px] text-wine">
            {fetcher.data?.error ?? localError}
          </div>
        ) : null}
        {fetcher.data?.ok &&
        doc.uploadKind === "pago" &&
        fetcher.data.result?.balance ? (
          <PagoUploadFlash balance={fetcher.data.result.balance} />
        ) : null}
        {deleteFetcher.data?.error ? (
          <div className="mt-1 text-[10.5px] text-wine">{deleteFetcher.data.error}</div>
        ) : null}
      </div>

      {actionable && doc.href ? (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="truncate">
                {doc.fileName ?? doc.label}
              </DialogTitle>
            </DialogHeader>
            <DocPreviewBody url={doc.href} fileName={doc.fileName ?? doc.label} />
          </DialogContent>
        </Dialog>
      ) : null}

      {showDelete ? (
        <Dialog
          open={deleteOpen}
          onOpenChange={handleOpenChange}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar {doc.label.toLowerCase()}</DialogTitle>
              <DialogDescription>
                {deleteDialogCopy(deleteKind, doc)}
              </DialogDescription>
            </DialogHeader>

            {deleteFetcher.data?.error && (
              <div className="rounded-md bg-wine-50 border border-wine-200 p-3 text-[12px] text-wine-900">
                <div className="flex items-start gap-2">
                  <Icon name="warn" size={14} className="text-wine-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-0.5">Error al eliminar</div>
                    <div>{deleteFetcher.data.error}</div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * Body del dialog de preview: itera por tipo de archivo (PDF / imagen) y
 * cae a un mensaje "No previsualizable" con CTA "Abrir en pestaña nueva"
 * para tipos desconocidos.
 */
function DocPreviewBody({ url, fileName }: { url: string; fileName: string }) {
  const lower = url.toLowerCase();
  const isImage = /\.(png|jpe?g|gif|webp)(\?|$)/.test(lower);
  const isPdf = /\.pdf(\?|$)/.test(lower) || lower.includes("/orders/") || lower.includes("/object/");
  // Heurística: las URLs firmadas de Supabase no traen extensión legible
  // (terminan en ?token=…). Asumimos PDF como default cuando no es imagen,
  // ya que casi todos los docs subidos son PDF/imagen y el iframe maneja
  // ambos. Si el navegador no puede renderizar, mostramos el fallback.
  if (isImage) {
    return (
      <div className="mt-2 flex justify-center bg-paper-2 rounded-md p-2">
        <img
          src={url}
          alt={fileName}
          className="max-w-full max-h-[70vh] object-contain"
        />
      </div>
    );
  }
  if (isPdf) {
    return (
      <iframe
        src={url}
        className="mt-2 w-full h-[70vh] rounded-md border border-line"
        title={fileName}
      />
    );
  }
  return (
    <div className="mt-2 py-8 text-center text-[12px] text-ink-3">
      Tipo de archivo no previsualizable.{" "}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-clay hover:underline"
      >
        Abrir en pestaña nueva
      </a>
    </div>
  );
}

/** Copy contextual del confirm dialog según el tipo de doc. */
function deleteDialogCopy(
  kind: "oc" | "fac" | "rem" | "nc" | "pago" | "comppago",
  doc: DocRowSpec,
): string {
  switch (kind) {
    case "pago":
      return "Esto eliminará el comprobante de pago, restaurará el saldo de la factura y revertirá la OC a Facturada. El archivo se borrará del bucket.";
    case "fac":
      return doc.fileName
        ? "Esto desvinculará la factura de la OC. Si la OC tiene un pago adjunto, también se eliminará. La factura permanece en el módulo de facturas."
        : "Esto desvinculará la factura de la OC.";
    case "nc":
      return "Esto eliminará la nota de crédito y recalculará el saldo de la factura vinculada.";
    case "rem":
      return "Esto eliminará la remisión de la OC y borrará el archivo del bucket.";
    case "oc":
      return "Esto eliminará el PDF de la OC del bucket. Se regenerará la próxima vez que abras la orden.";
    case "comppago":
      return "Esto eliminará el Complemento de Pago (CFDI tipo P / REP). Si era la única evidencia fiscal que cerraba la OC, ésta se revertirá a Pagada o Facturada según la cobertura restante.";
  }
}

/**
 * Flash de confirmación que aparece bajo la fila "Comprobante de pago"
 * inmediatamente después de un upload exitoso. Muestra el saldo recién
 * devuelto por el action — antes que el revalidator termine de refrescar
 * `pagoMeta` en la fila padre.
 */
function PagoUploadFlash({ balance }: { balance: InvoiceBalance }) {
  const cur: SampleOrder["cur"] =
    balance.currency === "USD" || balance.currency === "EUR" ? balance.currency : "MXN";
  const money = (n: number) => {
    const m = fmtCurrency(n, cur);
    return `${m.symbol}${m.integer}.${m.decimal}`;
  };
  const fullyPaid = balance.outstanding <= 0.01;
  return (
    <div className="mt-1 text-[10.5px] text-moss">
      ✓ Pagado {money(balance.paid)} / {money(balance.total)}
      {fullyPaid ? " · saldo cubierto" : ` · Saldo ${money(balance.outstanding)}`}
    </div>
  );
}

/**
 * Tarjeta de "Resumen de pago" en el panel lateral. Sólo se renderiza
 * cuando hay una factura vinculada (i.e. `order.invoiceBalance != null`).
 * Es la fuente persistente del estado de pagos — el flash inline en DocRow
 * la complementa para feedback inmediato post-upload.
 */
function PaymentSummary({
  balance,
  currency,
}: {
  balance: InvoiceBalance;
  currency: SampleOrder["cur"];
}) {
  const cur: SampleOrder["cur"] =
    balance.currency === "USD" || balance.currency === "EUR" || balance.currency === "MXN"
      ? (balance.currency as SampleOrder["cur"])
      : currency;
  const money = (n: number) => {
    const m = fmtCurrency(n, cur);
    return `${m.symbol}${m.integer}.${m.decimal}`;
  };
  const fullyPaid = balance.outstanding <= 0.01;
  const paymentProgress = balance.total > 0
    ? Math.round((balance.paid / balance.total) * 100)
    : 0;

  return (
    <div className="space-y-1.5">
      <SummaryRow label="Total facturado" value={money(balance.total)} />
      <SummaryRow
        label="Pagado"
        value={money(balance.paid)}
        valueClass={fullyPaid ? "text-moss font-semibold" : "text-ink"}
      />
      <SummaryRow
        label="Saldo"
        value={money(balance.outstanding)}
        valueClass={fullyPaid ? "text-moss font-semibold" : "text-rust font-semibold"}
      />
      {balance.credited > 0.01 ? (
        <SummaryRow label="Notas de crédito" value={money(balance.credited)} />
      ) : null}
      <div className="border-t border-line my-1.5" />
      {fullyPaid ? (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-moss bg-moss-soft px-2 py-1.5 rounded">
          <Icon name="check" size={11} />
          Pagado en su totalidad
        </div>
      ) : (
        <>
          {paymentProgress > 0 && (
            <div className="mt-1.5">
              <div className="flex items-center justify-between text-[9px] text-ink-3 mb-0.5">
                <span>Progreso</span>
                <span className="font-mono font-semibold">{paymentProgress}%</span>
              </div>
              <div className="h-1.5 bg-ink-5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-moss transition-all duration-300"
                  style={{ width: `${paymentProgress}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="text-ink-3">{label}</span>
      <span className={cn("font-mono tabular-nums font-semibold", valueClass ?? "text-ink")}>{value}</span>
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
  const { role } = useRole();
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

  // El backend es la fuente de verdad para el estado — mostrar exactamente lo que viene del backend
  const balance = order.invoiceBalance;
  const isPaid = balance && balance.outstanding <= 0.01;
  const statusLabel = STATUS_LABEL[order.status] ?? order.status;
  const tone = STATUS_TONE[statusLabel] ?? "ink";

  // Determinar qué mostrar basado en el rol del usuario
  const isVendor = role === "vendor";
  const displayName = isVendor ? (order.company || "Cliente desconocido") : order.vendor;
  const displayLabel = isVendor ? "Cliente" : "Proveedor";

  const m = fmtCurrency(order.amount, order.cur);
  const canUploadInvoice = hasAny(userPermissions, ["invoices:upload", "invoices:create"]);
  const canUploadPayment = hasAny(userPermissions, ["payments:create"]);
  const canUploadCreditNote = hasAny(userPermissions, ["credit_notes:upload"]);
  const docs = docRowsFor(order, { canUploadInvoice, canUploadPayment, canUploadCreditNote });
  const headerRef = order.folio || order.id;
  const pendingAuth = order.status === "creada";
  const canAuthorize = hasAny(userPermissions, ["orders:authorize"]);
  const canSend = hasAny(userPermissions, ["orders:send", "orders:create"]);
  const canDelete = hasAny(userPermissions, ["orders:delete"]);
  const canDeleteDoc = hasAny(userPermissions, ["orders:update", "orders:delete"]);
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
      <div className="p-3 border-b border-line min-w-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span
            className="font-mono text-[9px] text-ink-3 uppercase tracking-wider truncate min-w-0"
            title={headerRef}
          >
            {headerRef}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone={tone}>{statusLabel}</Badge>
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
          className="mt-1.5 font-display text-[16px] font-semibold leading-tight truncate"
          title={displayName}
        >
          {displayName}
        </h3>
        <div className="mt-1.5 text-[10px] text-ink-3 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Icon name="file" size={10} />
            <span>{order.items} líneas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Icon name="calendar" size={10} />
            <span>Emitida {fmtDate(order.date)}</span>
          </div>
          {order.paymentMethod && (
            <div className="flex items-center gap-1.5">
              <Icon name="coin" size={10} />
              <span>Cond: <span className="font-mono font-semibold">{order.paymentMethod}</span></span>
            </div>
          )}
        </div>

        {/* Botones de autorización */}
        {pendingAuth && canAuthorize && backend ? (
          <div className="mt-3 flex gap-2">
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
          <div className="mt-3 flex items-center gap-1.5 rounded-md border border-line bg-paper-2 px-2.5 py-1.5">
            <Icon name="warn" size={12} className="text-rust-700" />
            <span className="text-[11px] font-medium text-rust-700">
              Pendiente de autorización por un Super Admin
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-3 border-b border-line">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-1">
              Importe Total
            </div>
            <div className="ff-stat-val ff-num">
              <span className="text-[14px] italic font-normal text-ink-3 mr-0.5">
                {m.symbol}
              </span>
              <span className="text-[18px]">{m.integer}</span>
              <span className="text-ink-3 text-[16px]">.{m.decimal}</span>
              <span className="ml-1 text-[10px] font-mono text-ink-3 align-baseline">
                {m.code}
              </span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-1">
              Saldo
            </div>
            <div className="ff-stat-val ff-num">
              {(() => {
                const saldoAmount = backend?.balance ?? order.amount;
                const s = fmtCurrency(saldoAmount, order.cur);
                const isPaid = saldoAmount <= 0.01;
                return (
                  <>
                    <span className={cn("text-[14px] italic font-normal mr-0.5", isPaid ? "text-green-600" : "text-orange-600")}>
                      {s.symbol}
                    </span>
                    <span className={cn("text-[18px]", isPaid ? "text-green-600" : "text-orange-600")}>
                      {s.integer}
                    </span>
                    <span className={cn("text-[16px]", isPaid ? "text-green-600" : "text-orange-600")}>
                      .{s.decimal}
                    </span>
                    <span className={cn("ml-1 text-[10px] font-mono align-baseline", isPaid ? "text-green-600" : "text-orange-600")}>
                      {s.code}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {order.invoiceBalance ? (
        <div className="p-3 border-b border-line">
          <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-2">
            Resumen de pago
          </div>
          <PaymentSummary balance={order.invoiceBalance} currency={order.cur} />
        </div>
      ) : null}

      {/* Detalles de la orden - SIEMPRE VISIBLE */}
      <div className="p-3 border-b border-line bg-paper-2">
        <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-2">
          Detalles
        </div>
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-ink-3">{displayLabel}</span>
            <span className="font-semibold text-ink text-right max-w-[60%] truncate" title={displayName}>{displayName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-3">Líneas de producto</span>
            <span className="font-mono font-semibold text-ink">{order.items}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-3">Moneda</span>
            <span className="font-mono font-semibold text-ink">{order.cur}</span>
          </div>
          {order.paymentMethod && (
            <div className="flex items-center justify-between">
              <span className="text-ink-3">Condición de pago</span>
              <span className="font-mono font-semibold text-ink bg-ink-5 px-2 py-1 rounded">{order.paymentMethod}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-ink-3">Fecha de emisión</span>
            <span className="font-semibold text-ink">{fmtDate(order.date)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-3">Fecha de vencimiento</span>
            <div className="text-right">
              <div className="font-semibold text-ink">{fmtDate(order.due)}</div>
              {new Date(order.due) < new Date() && order.status !== "pagada" && order.status !== "cerrado" && (
                <div className="text-[10px] text-rust font-semibold mt-0.5 flex items-center gap-1 justify-end">
                  <Icon name="warn" size={10} />
                  Vencida
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Información adicional del proveedor */}
      {vendorContact && (vendorContact.vendorLegalName || vendorContact.rfc || vendorContact.email || vendorContact.phone) && (
        <div className="p-3 border-b border-line">
          <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-2">
            Info proveedor
          </div>
          <div className="space-y-1.5 text-[10px]">
            {vendorContact.vendorLegalName && (
              <div>
                <div className="text-[8px] text-ink-4 uppercase tracking-wide">Razón social</div>
                <div className="text-ink font-semibold text-[10px] mt-0.5">{vendorContact.vendorLegalName}</div>
              </div>
            )}
            {vendorContact.rfc && (
              <div>
                <div className="text-[8px] text-ink-4 uppercase tracking-wide">RFC</div>
                <div className="text-ink font-mono font-semibold text-[10px] mt-0.5">{vendorContact.rfc}</div>
              </div>
            )}
            {vendorContact.email && (
              <div>
                <div className="text-[8px] text-ink-4 uppercase tracking-wide">Email</div>
                <div className="text-ink break-all text-[9px] mt-0.5">{vendorContact.email}</div>
              </div>
            )}
            {vendorContact.phone && (
              <div>
                <div className="text-[8px] text-ink-4 uppercase tracking-wide">Teléfono</div>
                <div className="text-ink font-mono text-[10px] mt-0.5">{vendorContact.phone}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complementos de pago (REP) */}
      {(order.paymentComplementsCount ?? 0) > 0 && (
        <div className="p-3 border-b border-line">
          <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-2">
            Complementos (REP)
          </div>
          <div className="flex items-center gap-2 bg-moss-soft border border-moss/20 rounded px-2 py-1.5">
            <Icon name="check" size={12} className="text-moss shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-moss-deep">
                {order.paymentComplementsCount} REP
              </div>
              {order.paymentComplementFirstFolio && (
                <div className="text-[8px] text-moss-deep/70 mt-0.5 font-mono truncate">
                  {order.paymentComplementFirstFolio}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-3 border-b border-line">
        <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-2">
          Documentos
        </div>
        <div className="space-y-1.5">
          {docs.map((d) => (
            <DocRow
              key={d.type}
              doc={d}
              orderId={order.id}
              onUploaded={() => revalidator.revalidate()}
              canDelete={canDeleteDoc}
            />
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-line">
          <div className="text-[9px] text-ink-3">
            <div className="flex items-center justify-between">
              <span>Total:</span>
              <span className="font-mono font-semibold text-ink">{docs.filter(d => d.state === 'ok').length}/{docs.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fechas importantes */}
      <div className="p-3 border-b border-line">
        <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-2">
          Fechas
        </div>
        <div className="space-y-1.5 text-[10px]">
          <div className="flex items-start gap-2">
            <Icon name="calendar" size={11} className="text-ink-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-ink-4 text-[8px]">Emisión</div>
              <div className="text-ink font-semibold">{fmtDate(order.date)}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Icon name="clock" size={11} className="text-ink-3 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-ink-4 text-[8px]">Vencimiento</div>
              <div className="text-ink font-semibold">{fmtDate(order.due)}</div>
              {new Date(order.due) < new Date() && order.status !== "pagada" && order.status !== "cerrado" && (
                <div className="text-[9px] text-rust font-semibold mt-1 flex items-center gap-1 bg-rust-soft px-1.5 py-0.5 rounded">
                  <Icon name="warn" size={9} />
                  Vencida
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 border-b border-line">
        <div className="font-mono text-[9px] uppercase tracking-wider text-ink-3 mb-2">
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
            onSuccess={() => {
              // Revalidar los datos de la orden para actualizar el estado
              revalidator.revalidate();
            }}
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
