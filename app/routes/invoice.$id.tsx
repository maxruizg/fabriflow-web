import type {
  MetaFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import {
  Await,
  Form,
  Link,
  useLoaderData,
  useNavigate,
  useSubmit,
  useRevalidator,
  useSearchParams,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import { defer, json } from "@remix-run/cloudflare";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Icon } from "~/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";
import {
  DocumentViewer,
  type DocumentItem,
} from "~/components/invoices/document-viewer";
import {
  ErrorScreen,
  type ErrorScreenAction,
} from "~/components/ui/error-screen";
import { DocStrip, type DocType } from "~/components/ui/doc-chip";
import { requireUser, getFullSession } from "~/lib/session.server";
import {
  fetchInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  fetchInvoiceUrls,
  fetchInvoiceNeighbors,
} from "~/lib/api.server";
import {
  fetchInvoiceBalance,
  listPaymentsForInvoice,
  fetchOrder,
  type InvoiceBalance,
  type PaymentBackend,
  type OrderBackend,
} from "~/lib/procurement-api.server";
import { listCreditNotesForInvoice } from "~/lib/credit-notes-api.server";
import { listPaymentComplementsForInvoice } from "~/lib/payment-complements-api.server";
import type { CreditNote, PaymentComplementCfdi } from "~/types";
import { fmtCurrency } from "~/lib/sample-data";
import type { InvoiceBackend, InvoiceStatus } from "~/types";
import { statusTone, statusLabel, cn } from "~/lib/utils";
import type { BadgeTone } from "~/components/ui/badge";

export const meta: MetaFunction = () => {
  return [
    { title: "Detalles de Factura — FabriFlow" },
    {
      name: "description",
      content:
        "Detalles completos de la factura y documentos relacionados",
    },
  ];
};

const NEIGHBOR_FILTER_KEYS = [
  "folio",
  "uuid",
  "estado",
  "fechaDesde",
  "fechaHasta",
  "proveedor",
] as const;

function neighborFiltersFromUrl(url: URL) {
  const params = url.searchParams;
  const folio = params.get("folio") ?? undefined;
  const uuid = params.get("uuid") ?? undefined;
  const estado = params.get("estado") ?? undefined;
  const fechaDesde = params.get("fechaDesde") ?? undefined;
  const fechaHasta = params.get("fechaHasta") ?? undefined;

  return {
    folio,
    uuid,
    estado: estado && estado !== "all" ? estado : undefined,
    fechaEntradaDesde: fechaDesde,
    fechaEntradaHasta: fechaHasta,
  };
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  const invoiceId = params.id;
  if (!invoiceId) {
    throw new Response("ID de factura requerido", { status: 400 });
  }
  if (!session?.accessToken || !user.company) {
    throw new Response("Sesión inválida", { status: 401 });
  }

  const isAdmin =
    user.permissions?.includes("*") ||
    user.permissions?.includes("invoices:manage") ||
    user.permissions?.includes("invoices:update:status") ||
    false;

  const url = new URL(request.url);
  const filters = neighborFiltersFromUrl(url);

  console.log(
    `[invoice.$id] loader: params.id="${invoiceId}" company="${user.company}"`,
  );
  let invoice;
  try {
    invoice = await fetchInvoice(session.accessToken, user.company, invoiceId);
  } catch (error) {
    console.error(
      `[invoice.$id] fetchInvoice("${invoiceId}") failed:`,
      error,
    );
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status) || 500
        : 500;
    const baseMessage =
      error instanceof Error
        ? error.message
        : "No se pudo cargar la factura";
    const message = `${baseMessage} · id="${invoiceId}"`;
    throw new Response(message, { status });
  }

  const urlsResult = await fetchInvoiceUrls(
    session.accessToken,
    user.company,
    invoiceId,
  ).catch((error) => {
    console.warn("[invoice.$id] fetchInvoiceUrls failed:", error);
    return null;
  });

  const invoiceBalance = await fetchInvoiceBalance(
    session.accessToken,
    user.company,
    invoiceId,
  ).catch((error) => {
    console.warn("[invoice.$id] fetchInvoiceBalance failed:", error);
    return null as InvoiceBalance | null;
  });

  const creditNotes = await listCreditNotesForInvoice(
    session.accessToken,
    user.company,
    invoiceId,
  ).catch((error) => {
    console.warn("[invoice.$id] listCreditNotesForInvoice failed:", error);
    return [] as CreditNote[];
  });

  const payments = await listPaymentsForInvoice(
    session.accessToken,
    user.company,
    invoiceId,
  ).catch((error) => {
    console.warn("[invoice.$id] listPaymentsForInvoice failed:", error);
    return [] as PaymentBackend[];
  });

  const paymentComplements = await listPaymentComplementsForInvoice(
    session.accessToken,
    user.company,
    invoiceId,
  )
    .then((res) => res.data)
    .catch((error) => {
      console.warn("[invoice.$id] listPaymentComplementsForInvoice failed:", error);
      return [] as PaymentComplementCfdi[];
    });

  // Cargar la orden vinculada si existe, para obtener la remisión
  let linkedOrder: OrderBackend | null = null;
  if (invoice.purchaseOrder) {
    linkedOrder = await fetchOrder(
      session.accessToken,
      user.company,
      invoice.purchaseOrder,
    ).catch((error) => {
      console.warn("[invoice.$id] fetchOrder failed:", error);
      return null;
    });
  }

  const neighborsPromise = fetchInvoiceNeighbors(
    session.accessToken,
    user.company,
    invoiceId,
    filters,
    isAdmin,
  ).catch((error) => {
    console.warn("[invoice.$id] fetchInvoiceNeighbors failed:", error);
    return { prevId: null as string | null, nextId: null as string | null };
  });

  return defer({
    invoice: {
      ...invoice,
      pdfUrl: urlsResult?.pdfUrl ?? invoice.pdfUrl,
      xmlUrl: urlsResult?.xmlUrl ?? invoice.xmlUrl,
      ordenCompraUrl: urlsResult?.ordenCompraUrl ?? invoice.ordenCompraUrl,
    },
    invoiceBalance,
    creditNotes,
    payments,
    paymentComplements,
    linkedOrder,
    isAdmin,
    userPermissions: user.permissions ?? [],
    neighbors: neighborsPromise,
    error: null,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({ success: false, error: "Sesión inválida" }, { status: 401 });
  }

  const invoiceId = params.id;
  if (!invoiceId) {
    return json({ success: false, error: "ID requerido" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateStatus") {
    const newStatus = formData.get("status") as InvoiceStatus;
    if (!newStatus) {
      return json(
        { success: false, error: "Estado requerido" },
        { status: 400 },
      );
    }
    try {
      await updateInvoiceStatus(
        session.accessToken,
        user.company,
        invoiceId,
        newStatus,
      );
      return json({ success: true });
    } catch (error) {
      console.error("Error updating status:", error);
      return json(
        { success: false, error: "Error al actualizar estado" },
        { status: 500 },
      );
    }
  }

  if (intent === "delete") {
    try {
      await deleteInvoice(session.accessToken, user.company, invoiceId);
      return json({ success: true, deleted: true });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      return json(
        { success: false, error: "Error al eliminar factura" },
        { status: 500 },
      );
    }
  }

  return json({ success: false, error: "Acción no válida" }, { status: 400 });
}

// ---- helpers ----

function fmtMoney(n: number) {
  const [int, dec] = n.toFixed(2).split(".");
  return { int: int.replace(/\B(?=(\d{3})+(?!\d))/g, ","), dec };
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleDateString("es-MX", { month: "short" }).replace('.', '');
    const year = d.getFullYear().toString().slice(-2);
    return `${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

function inferDocs(inv: InvoiceBackend): DocType[] {
  const docs: DocType[] = [];

  if (inv.purchaseOrder || inv.ordenCompraKey || inv.ordenCompraUrl) {
    docs.push("OC");
  }

  if (inv.purchaseOrder) {
    docs.push("REM");
  }

  if (inv.pdfKey || inv.xmlKey || inv.pdfUrl || inv.xmlUrl) {
    docs.push("FAC");
  }

  // Si el estado es "pagada" o "completada", mostrar ícono de pago
  if (inv.estado === "pagada" || inv.estado === "completada") {
    docs.push("PAGO");
  }

  return docs;
}

function InvoiceBalanceCard({ balance }: { balance: InvoiceBalance }) {
  const total = fmtMoney(balance.total);
  const paid = fmtMoney(balance.paid);
  const outstanding = fmtMoney(balance.outstanding);
  const fullyPaid = balance.outstanding <= 0.01;
  const progress =
    balance.total > 0
      ? Math.min(100, Math.max(0, (balance.paid / balance.total) * 100))
      : 0;

  return (
    <Card className="bg-gradient-to-br from-paper to-paper-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-mono uppercase tracking-wider text-ink-3 font-normal flex items-center justify-between">
          <span>Balance</span>
          {fullyPaid ? (
            <Badge tone="moss" className="text-[9px]">
              Completamente Pagado
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3">
              Total
            </p>
            <p className="font-mono text-[13px] text-ink mt-0.5">
              ${total.int}<span className="text-ink-3">.{total.dec}</span>
            </p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3">
              Pagado
            </p>
            <p className="font-mono text-[13px] text-moss mt-0.5">
              ${paid.int}<span className="text-moss/70">.{paid.dec}</span>
            </p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3">
              Saldo
            </p>
            <p
              className={cn(
                "font-mono text-[13px] mt-0.5",
                fullyPaid ? "text-ink-3" : "text-clay",
              )}
            >
              ${outstanding.int}<span className={fullyPaid ? "text-ink-4" : "text-clay/70"}>.{outstanding.dec}</span>
            </p>
          </div>
        </div>
        <div
          className="h-2 w-full rounded-full bg-ink-5 overflow-hidden"
          aria-label={`Progreso de pago ${progress.toFixed(0)}%`}
        >
          <div
            className={cn(
              "h-full transition-all",
              fullyPaid ? "bg-moss" : "bg-clay",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        {(balance.credited ?? 0) > 0.01 && (
          <p className="text-[11px] text-ink-3">
            Acreditado: <span className="font-mono text-ink">${fmtMoney(balance.credited ?? 0).int}.{fmtMoney(balance.credited ?? 0).dec}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function buildDocuments(
  invoice: InvoiceBackend,
  linkedOrder: OrderBackend | null
): DocumentItem[] {
  const docs: DocumentItem[] = [];

  if (invoice.pdfUrl) {
    docs.push({
      id: "pdf",
      label: "Factura PDF",
      kind: "pdf",
      url: invoice.pdfUrl,
      downloadName: `factura-${invoice.folio}.pdf`,
    });
  }

  if (invoice.xmlUrl) {
    docs.push({
      id: "xml",
      label: "CFDI XML",
      kind: "xml",
      url: invoice.xmlUrl,
      downloadName: `factura-${invoice.folio}.xml`,
    });
  }

  // Orden de compra - primero intentar de la orden vinculada, luego el PDF legacy
  if (linkedOrder?.docState?.ocUrl) {
    docs.push({
      id: "orden",
      label: invoice.orderFolio ? `Orden de Compra (${invoice.orderFolio})` : "Orden de Compra",
      kind: "pdf",
      url: linkedOrder.docState.ocUrl,
      downloadName: `oc-${invoice.orderFolio || invoice.folio}.pdf`,
    });
  } else if (invoice.ordenCompraUrl) {
    docs.push({
      id: "orden",
      label: "Orden de Compra",
      kind: "pdf",
      url: invoice.ordenCompraUrl,
      downloadName: `oc-${invoice.folio}.pdf`,
    });
  }

  // Recepción de la orden vinculada
  if (linkedOrder?.docState?.remUrl) {
    docs.push({
      id: "recepcion",
      label: "Recepción",
      kind: "pdf",
      url: linkedOrder.docState.remUrl,
      downloadName: `recepcion-${invoice.orderFolio || invoice.folio}.pdf`,
    });
  }

  return docs;
}

type ResolvedNeighbors = { prevId: string | null; nextId: string | null };

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
      <div className="flex items-center gap-2">
        {statusBadge && <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>}
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
        ) : null}
        {uploadHref ? (
          <Link
            to={uploadHref}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-clay hover:underline"
          >
            <Icon name="upload" size={11} />
            Cargar
          </Link>
        ) : null}
        {!url && !uploadHref && !statusBadge && (
          <span className="text-[11.5px] text-ink-3">—</span>
        )}
      </div>
    </div>
  );
}

function NeighborSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-1">
      <div className="h-9 w-9 rounded-md border border-line bg-paper-3 animate-pulse" />
      <div className="h-9 w-9 rounded-md border border-line bg-paper-3 animate-pulse" />
    </div>
  );
}

function NeighborSync({
  resolved,
  onResolve,
}: {
  resolved: ResolvedNeighbors;
  onResolve: (n: ResolvedNeighbors) => void;
}) {
  useEffect(() => {
    onResolve(resolved);
  }, [resolved.prevId, resolved.nextId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function InvoiceDetails() {
  const { invoice, invoiceBalance, creditNotes, payments, paymentComplements, linkedOrder, isAdmin, userPermissions, neighbors } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [resolvedNeighbors, setResolvedNeighbors] = useState<ResolvedNeighbors>({
    prevId: null,
    nextId: null,
  });

  const documents = useMemo(() => buildDocuments(invoice, linkedOrder), [invoice, linkedOrder]);

  const docParam = searchParams.get("doc");
  const activeDocId = useMemo(() => {
    if (docParam && documents.some((d) => d.id === docParam)) return docParam;
    return documents[0]?.id ?? "";
  }, [docParam, documents]);

  const tone = statusTone(invoice.estado);
  const label = statusLabel(invoice.estado);
  const total = fmtMoney(invoice.total);
  const subtotal = fmtMoney(invoice.subtotal);

  const canUploadNc =
    userPermissions.includes("credit_notes:upload") ||
    userPermissions.includes("*");
  const canManageNc =
    userPermissions.includes("credit_notes:approve") ||
    userPermissions.includes("*");
  const canUploadPayment =
    userPermissions.includes("payments:upload") ||
    userPermissions.includes("*");
  const canUploadComplement =
    userPermissions.includes("payment_complements:upload") ||
    userPermissions.includes("*");

  const filterParamsString = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of NEIGHBOR_FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [searchParams]);

  const buildHref = (id: string | null) => {
    if (!id) return null;
    return filterParamsString
      ? `/invoice/${id}?${filterParamsString}`
      : `/invoice/${id}`;
  };

  const goPrev = () => {
    const href = buildHref(resolvedNeighbors.prevId);
    if (href) navigate(href);
  };
  const goNext = () => {
    const href = buildHref(resolvedNeighbors.nextId);
    if (href) navigate(href);
  };
  const goBack = () => {
    const target = filterParamsString
      ? `/invoices?${filterParamsString}`
      : "/invoices";
    navigate(target);
  };

  const handleStatusChange = (newStatus: string) => {
    const formData = new FormData();
    formData.set("intent", "updateStatus");
    formData.set("status", newStatus);
    submit(formData, { method: "post" });
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.set("intent", "delete");
    submit(formData, { method: "post" });
    setShowDeleteDialog(false);
    setTimeout(() => navigate("/invoices"), 500);
  };

  const handleDocChange = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === documents[0]?.id) {
      next.delete("doc");
    } else {
      next.set("doc", id);
    }
    setSearchParams(next, { replace: true });
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && resolvedNeighbors.prevId) {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight" && resolvedNeighbors.nextId) {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape" && !showDeleteDialog) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resolvedNeighbors.prevId,
    resolvedNeighbors.nextId,
    filterParamsString,
    showDeleteDialog,
  ]);

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col bg-paper">
        {/* Header - Minimal & Clean */}
        <div className="flex-shrink-0 border-b border-line bg-paper">
          <div className="px-6 py-2 flex items-center justify-between gap-4">
            {/* Left: Back + Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={goBack}
                title="Volver a facturas (Esc)"
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="hidden md:flex items-center gap-1 ml-1 pl-2 border-l border-line">
                <Suspense fallback={<NeighborSkeleton />}>
                  <Await resolve={neighbors} errorElement={null}>
                    {(resolved: ResolvedNeighbors) => (
                      <NeighborSync resolved={resolved} onResolve={setResolvedNeighbors} />
                    )}
                  </Await>
                </Suspense>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goPrev}
                  disabled={!resolvedNeighbors.prevId}
                  title="Anterior (←)"
                  aria-label="Factura anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goNext}
                  disabled={!resolvedNeighbors.nextId}
                  title="Siguiente (→)"
                  aria-label="Factura siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {canUploadNc && (
                <Button size="sm" variant="outline" asChild>
                  <Link
                    to={`/invoice/${invoice.id}/upload-doc?kind=nc`}
                    title="Subir nota de crédito vinculada a esta factura"
                  >
                    <Icon name="upload" size={13} />
                    <span className="hidden lg:inline">Nota de crédito</span>
                  </Link>
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Eliminar</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => revalidator.revalidate()}
                disabled={revalidator.state === "loading"}
                title="Actualizar"
                aria-label="Actualizar factura"
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    revalidator.state === "loading" && "animate-spin",
                  )}
                />
              </Button>
            </div>
          </div>
        </div>

        {/* Hero Section - Key Info */}
        <div className="flex-shrink-0 bg-gradient-to-br from-paper to-paper-2 border-b border-line">
          <div className="px-6 py-3">
            <div className="flex items-start justify-between gap-6 mb-2">
              {/* Left: Provider & Status */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h1 className="text-[20px] font-semibold font-mono text-ink tracking-tight">
                    {invoice.folio}
                  </h1>
                  {isAdmin ? (
                    <Select value={invoice.estado} onValueChange={handleStatusChange}>
                      <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent" aria-label="Estado de factura">
                        <Badge tone={tone} className="text-[11px] px-3 py-1.5 cursor-pointer hover:opacity-80 transition">
                          {label}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="creada">Creada</SelectItem>
                        <SelectItem value="autorizada">Autorizada</SelectItem>
                        <SelectItem value="recibido">Recibido</SelectItem>
                        <SelectItem value="facturada">Facturada</SelectItem>
                        <SelectItem value="pagada">Pagada</SelectItem>
                        <SelectItem value="completada">Completada</SelectItem>
                        <SelectItem value="rechazada">Rechazada</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge tone={tone} className="text-[11px]">{label}</Badge>
                  )}
                  <DocStrip docs={inferDocs(invoice)} />
                </div>
                <div>
                  <p className="text-[14px] text-ink font-semibold leading-tight">
                    {invoice.nombreEmisor}
                  </p>
                  <p className="text-[11px] font-mono text-ink-3 mt-0.5">
                    RFC: {invoice.rfcEmisor}
                  </p>
                </div>
              </div>

              {/* Right: Total Amount - Hero */}
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-1">
                  Monto Total
                </p>
                <p className="text-[24px] font-mono font-bold text-ink leading-none">
                  ${total.int}<span className="text-[18px] text-ink-3">.{total.dec}</span>
                </p>
                <p className="text-[12px] font-mono text-ink-2 mt-1">
                  {invoice.moneda}
                  {invoice.tipoCambio && invoice.tipoCambio !== 1 && (
                    <span className="ml-2 text-ink-3">
                      T.C. {invoice.tipoCambio.toFixed(2)}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Quick meta grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-line/50">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3 mb-0.5">Subtotal</p>
                <p className="text-[12px] font-mono text-ink">${subtotal.int}.{subtotal.dec}</p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3 mb-0.5">F. Emisión</p>
                <p className="text-[12px] text-ink">{fmtDate(invoice.fechaEmision)}</p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3 mb-0.5">F. Entrada</p>
                <p className="text-[12px] text-ink">{fmtDate(invoice.fechaEntrada)}</p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3 mb-0.5">F. Carga</p>
                <p className="text-[12px] text-ink">{fmtDate(invoice.createdAt)}</p>
              </div>
              {invoice.orderFolio && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3 mb-0.5">OC</p>
                  <p className="text-[12px] font-mono text-ink">{invoice.orderFolio}</p>
                </div>
              )}
              {invoice.condicionesPago && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-ink-3 mb-0.5">Cond. Pago</p>
                  <p className="text-[12px] text-ink truncate" title={invoice.condicionesPago}>
                    {invoice.condicionesPago}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-0 divide-y lg:divide-y-0 lg:divide-x divide-line">

            {/* Left: Document Viewer */}
            <div className="min-h-[60vh] lg:min-h-0 lg:h-full p-4 bg-paper">
              <DocumentViewer
                documents={documents}
                activeId={activeDocId}
                onActiveChange={handleDocChange}
                emptyState={
                  <div className="text-center text-ink-3 px-6">
                    <Icon
                      name="file"
                      size={48}
                      className="mx-auto mb-4 opacity-20"
                    />
                    <p className="font-medium text-[14px] text-ink-2">
                      Sin documentos adjuntos
                    </p>
                    <p className="text-[12px] mt-1.5 text-ink-3">
                      Esta factura no tiene PDF, XML ni orden de compra.
                    </p>
                  </div>
                }
              />
            </div>

            {/* Right: Info Sidebar */}
            <div className="min-h-0 overflow-auto bg-paper-2">
              <div className="p-5 space-y-4">

                {/* Balance Card - Priority #1 */}
                {invoiceBalance && <InvoiceBalanceCard balance={invoiceBalance} />}

                {/* UUID */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-normal">
                      UUID Fiscal
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-[10.5px] text-ink-2 bg-ink-5 px-3 py-2.5 rounded-md break-all leading-relaxed select-all">
                      {invoice.uuid}
                    </p>
                  </CardContent>
                </Card>

                {/* Parties - Compact */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-normal">
                      Receptor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium text-[14px] text-ink leading-tight">
                      {invoice.nombreReceptor}
                    </p>
                    <p className="text-[11px] font-mono text-ink-3 mt-1">
                      RFC: {invoice.rfcReceptor}
                    </p>
                  </CardContent>
                </Card>

                {/* Conceptos - Collapsible */}
                {invoice.detalles && invoice.detalles.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-normal">
                        Conceptos ({invoice.detalles.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2.5 max-h-[300px] overflow-auto">
                        {invoice.detalles.map((d, idx) => {
                          const im = fmtMoney(d.importe);
                          return (
                            <div key={idx} className="pb-2.5 border-b border-line last:border-0 last:pb-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[12px] font-medium text-ink leading-tight">
                                    {d.descripcion}
                                  </p>
                                  <p className="text-[10.5px] text-ink-3 mt-1">
                                    {d.unidad} · Cantidad: {d.cantidad}
                                  </p>
                                </div>
                                <p className="text-[13px] font-mono font-semibold text-ink whitespace-nowrap flex-shrink-0">
                                  ${im.int}<span className="text-ink-3 text-[11px]">.{im.dec}</span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Notas de crédito */}
                {(creditNotes.length > 0 || canUploadNc) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-normal">
                        Notas de Crédito
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {creditNotes.length === 0 ? (
                        <p className="text-[12px] text-ink-3">
                          Sin notas de crédito aplicadas.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {creditNotes.map((cn) => (
                            <div
                              key={cn.id}
                              className="flex items-center justify-between pb-2.5 border-b border-line last:border-0 last:pb-0"
                            >
                              <div>
                                <p className="text-[12px] font-medium text-ink">
                                  {cn.folio}
                                </p>
                                <p className="text-[10.5px] text-ink-3 mt-0.5">
                                  {fmtDate(cn.fechaEmision)} · ${cn.total.toFixed(2)} {cn.moneda}
                                </p>
                              </div>
                              {canManageNc && (
                                <Form
                                  method="post"
                                  action={`/api/credit-notes/${cn.id}`}
                                >
                                  <input type="hidden" name="_intent" value="delete" />
                                  <Button variant="ghost" size="sm" type="submit" className="text-[11px]">
                                    Revertir
                                  </Button>
                                </Form>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Documentos */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-[14px]">Documentos</CardTitle>
                  </CardHeader>
                  <CardContent className="text-[13px] space-y-2">
                    <DocRow
                      label="OC (PDF)"
                      url={linkedOrder?.docState?.ocUrl || invoice.ordenCompraUrl || null}
                      uploadHref={
                        !linkedOrder?.docState?.ocUrl && !invoice.ordenCompraUrl
                          ? `/invoice/${invoice.id}/upload-doc?kind=oc`
                          : null
                      }
                    />
                    <DocRow
                      label="Remisión"
                      url={linkedOrder?.docState?.remUrl ?? null}
                    />
                    <DocRow
                      label="Factura (PDF)"
                      url={invoice.pdfUrl || null}
                    />
                    <DocRow
                      label="Factura (XML)"
                      url={invoice.xmlUrl || null}
                    />
                    {payments.map((payment) => (
                      <DocRow
                        key={payment.id}
                        label={`Comprobante de pago (${payment.folio})`}
                        url={payment.receiptUrl || null}
                      />
                    ))}
                    {canUploadPayment &&
                     invoice.estado === "facturada" &&
                     invoiceBalance &&
                     invoiceBalance.outstanding > 0.01 && (
                      <DocRow
                        label="Comprobante de pago"
                        url={null}
                        uploadHref={`/payments/${invoice.id}/upload`}
                      />
                    )}
                    {invoice.condicionesPago === "PPD" && (
                      <div className="pt-2 mt-1 border-t border-line">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[12px] font-medium text-ink-2 uppercase tracking-wide">
                            Complementos de Pago (CFDI)
                          </div>
                          {paymentComplements.length > 0 && (
                            <span className="text-[11px] font-mono text-ink-3">
                              {paymentComplements.length}
                            </span>
                          )}
                        </div>
                        {paymentComplements.length === 0 ? (
                          <>
                            <p className="text-[12px] text-ink-3 leading-snug mb-2">
                              Falta Complemento de Pago para esta factura PPD. Sube el XML del CFDI tipo &ldquo;Pago&rdquo; (REP) para registrar el pago ante el SAT.
                            </p>
                            {canUploadComplement && (
                              <DocRow
                                label="Subir complemento"
                                url={null}
                                uploadHref={`/invoice/${invoice.id}/upload-doc?kind=comppago`}
                              />
                            )}
                          </>
                        ) : (
                          <>
                            {paymentComplements.map((pc) => (
                              <div
                                key={pc.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper-2 px-3 py-2 mb-1.5"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <Icon name="file" size={13} className="text-ink-3 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-[12.5px] text-ink-2 truncate">
                                      {pc.folio}
                                    </p>
                                    <p className="text-[10px] text-ink-3 font-mono">
                                      {fmtDate(pc.fechaTimbrado)} · ${pc.montoTotal.toFixed(2)} {pc.moneda}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

              </div>
            </div>
          </div>
        </div>

        {/* Delete confirmation */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar eliminación</DialogTitle>
              <DialogDescription className="text-[13px] text-ink-3 mt-1.5">
                ¿Estás seguro de que deseas eliminar la factura{" "}
                <span className="font-mono text-ink">{invoice.folio}</span>?
                Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteDialog(false)}
              >
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Eliminar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthLayout>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isResponse = isRouteErrorResponse(error);
  const status = isResponse
    ? error.status
    : (error as { status?: number } | null)?.status ?? 500;
  const message = isResponse
    ? typeof error.data === "string"
      ? error.data
      : error.statusText
    : error instanceof Error
      ? error.message
      : "Error inesperado";

  const titleByStatus: Record<number, string> = {
    401: "Tu sesión ya no es válida.",
    403: "No tienes permisos para ver esta factura.",
    404: "No encontramos esa factura.",
    500: "Algo se rompió al cargar la factura.",
  };
  const descriptionByStatus: Record<number, string> = {
    401: "Inicia sesión nuevamente para volver a la factura.",
    403: "Pide a un administrador que ajuste tus permisos.",
    404: "El folio que buscas no existe o fue eliminado. Verifica el enlace o vuelve a la lista.",
    500: "Vuelve a intentarlo en unos segundos. Si persiste, revisa la consola para más detalles.",
  };

  const actions: ErrorScreenAction[] = [
    {
      label: "Volver a facturas",
      href: "/invoices",
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
