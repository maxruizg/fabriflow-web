import type { MetaFunction, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate, useSubmit, useRevalidator } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
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
import { RefreshCw, Trash2 } from "lucide-react";
import type { InvoiceBackend, InvoiceStatus } from "~/types";
import { useState } from "react";
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
  SelectValue,
} from "~/components/ui/select";
import { requireUser, getFullSession } from "~/lib/session.server";
import { fetchInvoice, updateInvoiceStatus, deleteInvoice, fetchInvoiceUrls } from "~/lib/api.server";
import { statusTone, statusLabel, cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Detalles de Factura — FabriFlow" },
    {
      name: "description",
      content: "Detalles completos de la factura y documentos relacionados",
    },
  ];
};

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

  const isAdmin = user.permissions?.includes("*") ||
                  user.permissions?.includes("invoices:manage") ||
                  user.permissions?.includes("invoices:update:status");

  try {
    const invoice = await fetchInvoice(session.accessToken, user.company, invoiceId);

    // Also fetch URLs if available
    let urls = { pdfUrl: invoice.pdfUrl, xmlUrl: invoice.xmlUrl };
    try {
      urls = await fetchInvoiceUrls(session.accessToken, user.company, invoiceId);
    } catch {
      // URLs already in invoice object, ignore error
    }

    return json({
      invoice: { ...invoice, pdfUrl: urls.pdfUrl, xmlUrl: urls.xmlUrl },
      isAdmin,
      error: null,
    });
  } catch (error) {
    console.error("Invoice detail loader error:", error);
    throw new Response("Factura no encontrada", { status: 404 });
  }
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
      return json({ success: false, error: "Estado requerido" }, { status: 400 });
    }

    try {
      await updateInvoiceStatus(session.accessToken, user.company, invoiceId, newStatus);
      return json({ success: true });
    } catch (error) {
      console.error("Error updating status:", error);
      return json({ success: false, error: "Error al actualizar estado" }, { status: 500 });
    }
  }

  if (intent === "delete") {
    try {
      await deleteInvoice(session.accessToken, user.company, invoiceId);
      return json({ success: true, deleted: true });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      return json({ success: false, error: "Error al eliminar factura" }, { status: 500 });
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
    return new Date(iso).toLocaleDateString("es-MX");
  } catch { return "—"; }
}

// ---- Meta row helper ----

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3">{label}</span>
      <div className="font-medium text-[13px] text-ink mt-0.5">{children}</div>
    </div>
  );
}

export default function InvoiceDetails() {
  const { invoice, isAdmin } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const revalidator = useRevalidator();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);

  const tone = statusTone(invoice.estado);
  const label = statusLabel(invoice.estado);
  const total = fmtMoney(invoice.total);
  const subtotal = fmtMoney(invoice.subtotal);

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
    // Navigate back after delete
    setTimeout(() => navigate("/invoices"), 500);
  };

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">

        {/* Page header */}
        <div className="border-b border-line bg-paper">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/invoices")}
                title="Volver a facturas"
              >
                <Icon name="chevl" size={16} />
              </Button>
              <div className="min-w-0">
                <h1 className="ff-page-title !text-[20px]">
                  {invoice.folio}
                </h1>
                <p className="ff-page-sub truncate max-w-[500px]">
                  {invoice.nombreEmisor}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isAdmin ? (
                <Select value={invoice.estado} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-[160px]">
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
              ) : (
                <Badge tone={tone}>{label}</Badge>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => revalidator.revalidate()}
                disabled={revalidator.state === "loading"}
                title="Actualizar"
              >
                <RefreshCw className={cn("h-4 w-4", revalidator.state === "loading" && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div className="bg-paper-2 border-b border-line">
          <div className="px-6 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <MetaItem label="Total">
                <span className="font-mono">
                  <span className="text-[15px] italic font-normal text-ink-3 mr-0.5">$</span>
                  {total.int}
                  <span className="text-ink-3">.{total.dec}</span>
                  <span className="ml-1 text-[11px] text-ink-3">{invoice.moneda}</span>
                </span>
              </MetaItem>
              <MetaItem label="Subtotal">
                <span className="font-mono">
                  ${subtotal.int}<span className="text-ink-3">.{subtotal.dec}</span>
                </span>
              </MetaItem>
              <MetaItem label="Fecha Emisión">
                {fmtDate(invoice.fechaEmision)}
              </MetaItem>
              <MetaItem label="Fecha Entrada">
                {fmtDate(invoice.fechaEntrada)}
              </MetaItem>
              <MetaItem label="RFC Emisor">
                <span className="font-mono text-[12px]">{invoice.rfcEmisor}</span>
              </MetaItem>
              <MetaItem label="RFC Receptor">
                <span className="font-mono text-[12px]">{invoice.rfcReceptor}</span>
              </MetaItem>
            </div>
          </div>
        </div>

        {/* UUID row */}
        <div className="px-6 py-2.5 bg-paper border-b border-line flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3 flex-shrink-0">UUID</span>
            <span className="font-mono text-[12px] text-ink-2 truncate">{invoice.uuid}</span>
          </div>
          {invoice.tipoCambio && invoice.tipoCambio !== 1 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Tipo de Cambio</span>
              <span className="font-mono text-[13px] text-ink">{invoice.tipoCambio}</span>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left: Concepts + Parties */}
              <div className="lg:col-span-2 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-[14px]">
                      <Icon name="file" size={14} className="text-ink-3" />
                      Conceptos de la Factura
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {invoice.detalles && invoice.detalles.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Unidad</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                            <TableHead className="text-right">P. Unitario</TableHead>
                            <TableHead className="text-right">Importe</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoice.detalles.map((detalle, index) => {
                            const pu = fmtMoney(detalle.precioUnitario);
                            const im = fmtMoney(detalle.importe);
                            return (
                              <TableRow key={index}>
                                <TableCell className="text-[13px]">{detalle.descripcion}</TableCell>
                                <TableCell className="text-[13px] text-ink-3">{detalle.unidad}</TableCell>
                                <TableCell className="text-right font-mono text-[13px]">{detalle.cantidad}</TableCell>
                                <TableCell className="text-right font-mono text-[13px]">
                                  ${pu.int}<span className="text-ink-3">.{pu.dec}</span>
                                </TableCell>
                                <TableCell className="text-right font-mono text-[13px] font-medium">
                                  ${im.int}<span className="text-ink-3">.{im.dec}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-ink-3">
                        <div className="text-center">
                          <Icon name="file" size={28} className="mx-auto mb-2 opacity-30" />
                          <p className="text-[13px]">No hay conceptos disponibles</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Emisor / Receptor */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[13px] text-ink-3 font-normal uppercase tracking-wider font-mono">Emisor</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-[14px] text-ink">{invoice.nombreEmisor}</p>
                      <p className="text-[12px] font-mono text-ink-3 mt-0.5">{invoice.rfcEmisor}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-[13px] text-ink-3 font-normal uppercase tracking-wider font-mono">Receptor</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-[14px] text-ink">{invoice.nombreReceptor}</p>
                      <p className="text-[12px] font-mono text-ink-3 mt-0.5">{invoice.rfcReceptor}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Right: Actions */}
              <div>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[14px]">Acciones</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Downloads */}
                    <div>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-2">
                        Descargas
                      </p>
                      <div className="space-y-2">
                        {invoice.pdfUrl && (
                          <>
                            <Button
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => setPdfViewerOpen(true)}
                            >
                              <Icon name="eye" size={14} />
                              Ver PDF
                            </Button>
                            <Button
                              variant="clay"
                              className="w-full justify-start"
                              asChild
                            >
                              <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" download>
                                <Icon name="download" size={14} />
                                Descargar PDF
                              </a>
                            </Button>
                          </>
                        )}
                        {invoice.xmlUrl && (
                          <Button
                            variant="outline"
                            className="w-full justify-start"
                            asChild
                          >
                            <a href={invoice.xmlUrl} target="_blank" rel="noopener noreferrer" download>
                              <Icon name="download" size={14} />
                              Descargar XML
                            </a>
                          </Button>
                        )}
                        {!invoice.pdfUrl && !invoice.xmlUrl && (
                          <p className="text-[12px] text-ink-3 text-center py-4">
                            No hay archivos disponibles
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Admin actions */}
                    {isAdmin && (
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-2">
                          Administración
                        </p>
                        <Button
                          variant="destructive"
                          className="w-full justify-start"
                          onClick={() => setShowDeleteDialog(true)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar Factura
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* PDF Viewer Dialog */}
        <Dialog open={pdfViewerOpen} onOpenChange={setPdfViewerOpen}>
          <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="font-mono text-[14px]">
                {invoice.folio} — Vista PDF
              </DialogTitle>
            </DialogHeader>
            {invoice.pdfUrl && (
              <div className="h-[70vh] w-full">
                <iframe
                  src={invoice.pdfUrl}
                  className="w-full h-full border-0 rounded-lg"
                  title={`PDF de ${invoice.folio}`}
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
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
              <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>
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
