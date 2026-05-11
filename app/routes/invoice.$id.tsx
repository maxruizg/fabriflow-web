import type {
  MetaFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import {
  Await,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
  type InvoiceBalance,
} from "~/lib/procurement-api.server";
import { fmtCurrency } from "~/lib/sample-data";
import type { InvoiceBackend, InvoiceStatus } from "~/types";
import { statusTone, statusLabel, cn } from "~/lib/utils";

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

  // Required: invoice itself. Surface backend status codes / messages so the
  // UI can distinguish 401/403/404/500 instead of always rendering "404".
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
    // Include the failing id so the ErrorBoundary's detail chip surfaces
    // exactly what got sent — saves a console dive.
    const message = `${baseMessage} · id="${invoiceId}"`;
    throw new Response(message, { status });
  }

  // Required for first paint: signed URLs (cheap, single round-trip).
  const urlsResult = await fetchInvoiceUrls(
    session.accessToken,
    user.company,
    invoiceId,
  ).catch((error) => {
    console.warn("[invoice.$id] fetchInvoiceUrls failed:", error);
    return null;
  });

  // Saldo: total / pagado / falta. No bloquea el render si falla.
  const invoiceBalance = await fetchInvoiceBalance(
    session.accessToken,
    user.company,
    invoiceId,
  ).catch((error) => {
    console.warn("[invoice.$id] fetchInvoiceBalance failed:", error);
    return null as InvoiceBalance | null;
  });

  // Off the critical path: neighbor lookup walks the paginated list and can
  // take several round-trips. Defer it so the page renders immediately and
  // the prev/next buttons stream in once resolved.
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
    isAdmin,
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
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <div className="font-medium text-[13px] text-ink mt-0.5">{children}</div>
    </div>
  );
}

function InvoiceBalanceCard({ balance }: { balance: InvoiceBalance }) {
  const cur: "MXN" | "USD" | "EUR" =
    balance.currency === "MXN" ||
    balance.currency === "USD" ||
    balance.currency === "EUR"
      ? (balance.currency as "MXN" | "USD" | "EUR")
      : "MXN";
  const fmt = (n: number) => {
    const m = fmtCurrency(n, cur);
    return { display: `${m.symbol}${m.integer}.${m.decimal}`, code: m.code };
  };
  const total = fmt(balance.total);
  const paid = fmt(balance.paid);
  const outstanding = fmt(balance.outstanding);
  const fullyPaid = balance.outstanding <= 0.01;
  const progress =
    balance.total > 0
      ? Math.min(100, Math.max(0, (balance.paid / balance.total) * 100))
      : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-normal flex items-center justify-between">
          <span>Saldo</span>
          {fullyPaid ? (
            <Badge tone="moss" className="text-[10px]">
              Pagado
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10.5px] font-mono uppercase tracking-wider text-ink-3">
              Total
            </p>
            <p className="font-mono text-[14px] text-ink mt-0.5">
              {total.display}
              <span className="ml-1 text-[10.5px] text-ink-3">{total.code}</span>
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-mono uppercase tracking-wider text-ink-3">
              Pagado
            </p>
            <p className="font-mono text-[14px] text-ink mt-0.5">
              {paid.display}
            </p>
          </div>
          <div>
            <p className="text-[10.5px] font-mono uppercase tracking-wider text-ink-3">
              Falta
            </p>
            <p
              className={cn(
                "font-mono text-[14px] mt-0.5",
                fullyPaid ? "text-ink-3" : "text-ink",
              )}
            >
              {outstanding.display}
            </p>
          </div>
        </div>
        <div
          className="h-1.5 w-full rounded bg-ink-5 overflow-hidden"
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
      </CardContent>
    </Card>
  );
}

function buildDocuments(invoice: InvoiceBackend): DocumentItem[] {
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
  if (invoice.ordenCompraUrl) {
    docs.push({
      id: "orden",
      label: "Orden de Compra",
      kind: "pdf",
      url: invoice.ordenCompraUrl,
      downloadName: `oc-${invoice.folio}.pdf`,
    });
  }
  return docs;
}

type ResolvedNeighbors = { prevId: string | null; nextId: string | null };

function NeighborSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-1">
      <div className="h-9 w-9 rounded-md border border-line bg-paper-3 animate-pulse" />
      <div className="h-9 w-9 rounded-md border border-line bg-paper-3 animate-pulse" />
    </div>
  );
}

/**
 * Render-time bridge: copies the resolved neighbor ids from the deferred
 * promise into local state so the keyboard handler and disabled-state logic
 * can read them synchronously. Renders nothing.
 */
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
  const { invoice, invoiceBalance, isAdmin, neighbors } =
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

  const documents = useMemo(() => buildDocuments(invoice), [invoice]);

  const docParam = searchParams.get("doc");
  const activeDocId = useMemo(() => {
    if (docParam && documents.some((d) => d.id === docParam)) return docParam;
    return documents[0]?.id ?? "";
  }, [docParam, documents]);

  const tone = statusTone(invoice.estado);
  const label = statusLabel(invoice.estado);
  const total = fmtMoney(invoice.total);
  const subtotal = fmtMoney(invoice.subtotal);

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

  // Keyboard navigation: ← / → between invoices, Esc back
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
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        {/* Page header */}
        <div className="flex-shrink-0 border-b border-line bg-paper">
          <div className="px-6 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={goBack}
                title="Volver a facturas (Esc)"
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="ff-page-title !text-[19px] flex items-center gap-2">
                  <span className="font-mono">{invoice.folio}</span>
                  <Badge tone={tone}>{label}</Badge>
                </h1>
                <p className="ff-page-sub truncate max-w-[520px] mt-0.5">
                  {invoice.nombreEmisor}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="hidden md:flex items-center gap-1 mr-1">
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
              {isAdmin ? (
                <Select value={invoice.estado} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-[160px]" aria-label="Estado de factura">
                    <Badge tone={tone}>{label}</Badge>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="recibido">Recibido</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                    <SelectItem value="completado">Completado</SelectItem>
                    <SelectItem value="rechazado">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
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

        {/* Summary strip */}
        <div className="flex-shrink-0 bg-paper-2 border-b border-line">
          <div className="px-6 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <MetaItem label="Total">
                <span className="font-mono">
                  <span className="text-[15px] italic font-normal text-ink-3 mr-0.5">
                    $
                  </span>
                  {total.int}
                  <span className="text-ink-3">.{total.dec}</span>
                  <span className="ml-1 text-[11px] text-ink-3">
                    {invoice.moneda}
                  </span>
                </span>
              </MetaItem>
              <MetaItem label="Subtotal">
                <span className="font-mono">
                  ${subtotal.int}
                  <span className="text-ink-3">.{subtotal.dec}</span>
                </span>
              </MetaItem>
              <MetaItem label="Fecha Emisión">
                {fmtDate(invoice.fechaEmision)}
              </MetaItem>
              <MetaItem label="Fecha Entrada">
                {fmtDate(invoice.fechaEntrada)}
              </MetaItem>
              <MetaItem label="RFC Emisor">
                <span className="font-mono text-[12px]">
                  {invoice.rfcEmisor}
                </span>
              </MetaItem>
              <MetaItem label="RFC Receptor">
                <span className="font-mono text-[12px]">
                  {invoice.rfcReceptor}
                </span>
              </MetaItem>
            </div>
          </div>
        </div>

        {/* Main split */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-0 divide-y lg:divide-y-0 lg:divide-x divide-line">
            {/* Left: document viewer */}
            <div className="min-h-[60vh] lg:min-h-0 lg:h-full p-3">
              <DocumentViewer
                documents={documents}
                activeId={activeDocId}
                onActiveChange={handleDocChange}
                emptyState={
                  <div className="text-center text-ink-3 px-6">
                    <Icon
                      name="file"
                      size={36}
                      className="mx-auto mb-3 opacity-30"
                    />
                    <p className="font-medium text-[13px] text-ink-2">
                      Sin documentos adjuntos
                    </p>
                    <p className="text-[11px] mt-1">
                      Esta factura no tiene PDF, XML ni orden de compra.
                    </p>
                  </div>
                }
              />
            </div>

            {/* Right: details panel */}
            <div className="min-h-0 overflow-auto bg-paper">
              <div className="p-6 space-y-5">
                {/* UUID */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
                    UUID Fiscal
                  </p>
                  <p className="font-mono text-[11px] text-ink-2 bg-ink-5 p-2.5 rounded break-all">
                    {invoice.uuid}
                  </p>
                  {invoice.tipoCambio && invoice.tipoCambio !== 1 ? (
                    <p className="text-[11px] text-ink-3 mt-1">
                      Tipo de cambio:{" "}
                      <span className="font-mono text-ink">
                        {invoice.tipoCambio}
                      </span>
                    </p>
                  ) : null}
                </div>

                {/* Saldo: total / pagado / falta */}
                {invoiceBalance ? (
                  <InvoiceBalanceCard balance={invoiceBalance} />
                ) : null}

                {/* Parties */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-normal">
                        Emisor
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-[14px] text-ink leading-tight">
                        {invoice.nombreEmisor}
                      </p>
                      <p className="text-[12px] font-mono text-ink-3 mt-1">
                        {invoice.rfcEmisor}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-normal">
                        Receptor
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-[14px] text-ink leading-tight">
                        {invoice.nombreReceptor}
                      </p>
                      <p className="text-[12px] font-mono text-ink-3 mt-1">
                        {invoice.rfcReceptor}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Conceptos */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
                    Conceptos{" "}
                    {invoice.detalles?.length
                      ? `(${invoice.detalles.length})`
                      : ""}
                  </h4>
                  {invoice.detalles && invoice.detalles.length > 0 ? (
                    <div className="border border-line rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-ink-5">
                            <TableHead className="text-[10px] font-mono">
                              Descripción
                            </TableHead>
                            <TableHead className="text-[10px] font-mono text-right w-[60px]">
                              Cant.
                            </TableHead>
                            <TableHead className="text-[10px] font-mono text-right w-[100px]">
                              Importe
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoice.detalles.map((d, idx) => {
                            const im = fmtMoney(d.importe);
                            return (
                              <TableRow key={idx}>
                                <TableCell className="text-[12px]">
                                  <p className="font-medium text-ink">
                                    {d.descripcion}
                                  </p>
                                  <p className="text-[10px] text-ink-3">
                                    {d.unidad}
                                  </p>
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-[12px]">
                                  {d.cantidad}
                                </TableCell>
                                <TableCell className="text-right tabular-nums font-medium text-[12px]">
                                  ${im.int}
                                  <span className="text-ink-3">.{im.dec}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="border border-line border-dashed rounded-lg p-4 text-center text-ink-3 text-[12px]">
                      Sin conceptos disponibles
                    </div>
                  )}
                </div>

                {/* Admin actions */}
                {isAdmin ? (
                  <div className="pt-3 border-t border-line">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-2">
                      Administración
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar factura
                    </Button>
                  </div>
                ) : null}
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

  // Status-aware copy tailored to the invoice context.
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
