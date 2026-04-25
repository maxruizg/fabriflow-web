import type { MetaFunction, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate, useSubmit, useRevalidator } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  ArrowLeft,
  Eye,
  Download,
  FileText,
  Trash2,
  RefreshCw,
} from "lucide-react";
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

export const meta: MetaFunction = () => {
  return [
    { title: "Detalles de Factura - FabriFlow" },
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

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case "pagado":
    case "completado":
      return "default";
    case "pendiente":
    case "recibido":
      return "secondary";
    case "rechazado":
      return "destructive";
    default:
      return "outline";
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pendiente: "Pendiente",
    recibido: "Recibido",
    pagado: "Pagado",
    completado: "Completado",
    rechazado: "Rechazado",
  };
  return labels[status.toLowerCase()] || status;
}

export default function InvoiceDetails() {
  const { invoice, isAdmin } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const revalidator = useRevalidator();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);

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
        {/* Header */}
        <div className="border-b bg-background">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate("/invoices")}
                className="h-9 w-9 p-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">{invoice.folio}</h1>
                <p className="text-sm text-muted-foreground truncate max-w-[500px]">
                  {invoice.nombreEmisor}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isAdmin ? (
                <Select
                  value={invoice.estado}
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger className="w-[150px]">
                    <Badge variant={getStatusBadgeVariant(invoice.estado)}>
                      {getStatusLabel(invoice.estado)}
                    </Badge>
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
                <Badge variant={getStatusBadgeVariant(invoice.estado)}>
                  {getStatusLabel(invoice.estado)}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => revalidator.revalidate()}
                disabled={revalidator.state === "loading"}
              >
                <RefreshCw className={`h-4 w-4 ${revalidator.state === "loading" ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Invoice Summary */}
        <div className="bg-muted/30 border-b">
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              <div>
                <span className="text-muted-foreground text-sm">Total</span>
                <div className="font-semibold">
                  ${invoice.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} {invoice.moneda}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Subtotal</span>
                <div className="font-medium">
                  ${invoice.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Fecha Emisión</span>
                <div className="font-medium">
                  {new Date(invoice.fechaEmision).toLocaleDateString("es-MX")}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Fecha Entrada</span>
                <div className="font-medium">
                  {new Date(invoice.fechaEntrada).toLocaleDateString("es-MX")}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">RFC Emisor</span>
                <div className="font-medium">{invoice.rfcEmisor}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">RFC Receptor</span>
                <div className="font-medium">{invoice.rfcReceptor}</div>
              </div>
            </div>
          </div>
        </div>

        {/* UUID Section */}
        <div className="px-6 py-3 bg-muted/10 border-b">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-muted-foreground text-sm">UUID:</span>
              <span className="ml-2 font-mono text-sm">{invoice.uuid}</span>
            </div>
            {invoice.tipoCambio && invoice.tipoCambio !== 1 && (
              <div>
                <span className="text-muted-foreground text-sm">Tipo de Cambio:</span>
                <span className="ml-2 font-medium">{invoice.tipoCambio}</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Detalles/Conceptos Section */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center">
                      <FileText className="mr-2 h-4 w-4" />
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
                          {invoice.detalles.map((detalle, index) => (
                            <TableRow key={index}>
                              <TableCell>{detalle.descripcion}</TableCell>
                              <TableCell>{detalle.unidad}</TableCell>
                              <TableCell className="text-right">{detalle.cantidad}</TableCell>
                              <TableCell className="text-right">
                                ${detalle.precioUnitario.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right">
                                ${detalle.importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="flex items-center justify-center h-32 text-muted-foreground">
                        <div className="text-center">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No hay conceptos disponibles</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Emisor/Receptor Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Emisor</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">{invoice.nombreEmisor}</p>
                      <p className="text-sm text-muted-foreground">{invoice.rfcEmisor}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Receptor</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">{invoice.nombreReceptor}</p>
                      <p className="text-sm text-muted-foreground">{invoice.rfcReceptor}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Actions Section */}
              <div>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>Acciones</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Download Actions */}
                    <div>
                      <h4 className="font-medium mb-3 text-muted-foreground">
                        Descargas
                      </h4>
                      <div className="space-y-2">
                        {invoice.pdfUrl && (
                          <>
                            <Button
                              variant="outline"
                              className="w-full justify-start"
                              onClick={() => setPdfViewerOpen(true)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver PDF
                            </Button>
                            <Button
                              variant="default"
                              className="w-full justify-start"
                              asChild
                            >
                              <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" download>
                                <Download className="h-4 w-4 mr-2" />
                                Descargar PDF
                              </a>
                            </Button>
                          </>
                        )}
                        {invoice.xmlUrl && (
                          <Button
                            variant="secondary"
                            className="w-full justify-start"
                            asChild
                          >
                            <a href={invoice.xmlUrl} target="_blank" rel="noopener noreferrer" download>
                              <Download className="h-4 w-4 mr-2" />
                              Descargar XML
                            </a>
                          </Button>
                        )}
                        {!invoice.pdfUrl && !invoice.xmlUrl && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No hay archivos disponibles
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Admin Actions */}
                    {isAdmin && (
                      <div>
                        <h4 className="font-medium mb-3 text-muted-foreground">
                          Administración
                        </h4>
                        <Button
                          variant="destructive"
                          className="w-full justify-start"
                          onClick={() => setShowDeleteDialog(true)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
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
              <DialogTitle>Vista de PDF - {invoice.folio}</DialogTitle>
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
              <DialogTitle>Confirmar Eliminación</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas eliminar la factura {invoice.folio}?
                Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
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
