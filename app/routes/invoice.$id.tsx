import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
// import { Badge } from "~/components/ui/badge";
import {
  ArrowLeft,
  Eye,
  Download,
  Upload,
  FileText,
  Receipt,
  FileCheck,
  CreditCard,
  Package,
} from "lucide-react";
import type { Invoice } from "~/types";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { getStatusBadge } from "~/lib/utils";
import { requireUser } from "~/lib/session.server";

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
  // Require authentication for invoice detail access
  await requireUser(request);

  const invoiceId = params.id;

  // Hardcoded data for development - using the same data from invoices list
  const invoices: Invoice[] = [
    {
      uuid: "INV-001",
      folio: "A-2024-001",
      company: "Textiles del Norte S.A. de C.V.",
      issuerName: "Proveedor de Algodón Industrial",
      invoiceDate: "2024-01-15",
      total: "25500.00",
      currency: "MXN",
      status: "paid",
      urlPdfFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      urlXmlFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      paymentConditions: "30 días",
      details: [],
      entryDate: "2024-01-15",
      paymentMethod: "Transferencia",
      subtotal: "25000.00",
      user: "user1",
      useCfdi: "G03",
      balance: 0,
      exchangeRate: "1",
      complements: [],
      relatedDocuments: [
        {
          type: "order",
          name: "Orden de Compra A-2024-001",
          url: "https://via.placeholder.com/800x600/f0f0f0/333333?text=Orden+de+Compra",
          mimeType: "image/png",
          uploadDate: "2024-01-10",
        },
        {
          type: "payment",
          name: "Comprobante de Pago",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          mimeType: "application/pdf",
          uploadDate: "2024-01-16",
        },
      ],
    },
    {
      uuid: "INV-002",
      folio: "A-2024-002",
      company: "Manufacturera Industrial Mexicana",
      issuerName: "Aceros y Metales S.A.",
      invoiceDate: "2024-01-20",
      total: "150750.50",
      currency: "MXN",
      status: "pending",
      urlPdfFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      urlXmlFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      paymentConditions: "15 días",
      details: [],
      entryDate: "2024-01-20",
      paymentMethod: "Transferencia",
      subtotal: "150000.00",
      user: "user1",
      useCfdi: "G03",
      balance: 150750.5,
      exchangeRate: "1",
      complements: [],
      relatedDocuments: [
        {
          type: "order",
          name: "Orden de Compra A-2024-002",
          url: "https://via.placeholder.com/600x800/e0e0e0/444444?text=Orden+de+Compra+002",
          mimeType: "image/png",
          uploadDate: "2024-01-18",
        },
      ],
    },
    {
      uuid: "INV-003",
      folio: "B-2024-015",
      company: "Fábrica de Componentes Automotrices",
      issuerName: "Plásticos Industriales del Bajío",
      invoiceDate: "2024-02-01",
      total: "89300.00",
      currency: "MXN",
      status: "overdue",
      urlPdfFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      urlXmlFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      paymentConditions: "30 días",
      details: [],
      entryDate: "2024-02-01",
      paymentMethod: "Cheque",
      subtotal: "89000.00",
      user: "user1",
      useCfdi: "G03",
      balance: 89300.0,
      exchangeRate: "1",
      complements: [],
      relatedDocuments: [],
    },
    {
      uuid: "INV-004",
      folio: "C-2024-008",
      company: "Industrias Metálicas del Bajío",
      issuerName: "Químicos y Pinturas Especiales",
      invoiceDate: "2024-02-10",
      total: "45600.00",
      currency: "MXN",
      status: "pending",
      urlPdfFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      urlXmlFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      paymentConditions: "60 días",
      details: [],
      entryDate: "2024-02-10",
      paymentMethod: "Transferencia",
      subtotal: "45000.00",
      user: "user1",
      useCfdi: "G03",
      balance: 45600.0,
      exchangeRate: "1",
      complements: [],
      relatedDocuments: [
        {
          type: "order",
          name: "Orden de Compra C-2024-008",
          url: "https://via.placeholder.com/700x500/d0d0d0/555555?text=Orden+Industrial",
          mimeType: "image/png",
          uploadDate: "2024-02-08",
        },
      ],
    },
    {
      uuid: "INV-005",
      folio: "A-2024-003",
      company: "Procesadora de Alimentos San Juan",
      issuerName: "Empacadora Nacional S.A.",
      invoiceDate: "2024-02-15",
      total: "320000.00",
      currency: "MXN",
      status: "paid",
      urlPdfFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      urlXmlFile:
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      paymentConditions: "Contado",
      details: [],
      entryDate: "2024-02-15",
      paymentMethod: "Efectivo",
      subtotal: "315000.00",
      user: "user1",
      useCfdi: "G03",
      balance: 0,
      exchangeRate: "1",
      complements: [],
      relatedDocuments: [
        {
          type: "payment",
          name: "Comprobante de Pago Efectivo",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          mimeType: "application/pdf",
          uploadDate: "2024-02-15",
        },
      ],
    },
  ];

  const invoice = invoices.find((inv) => inv.uuid === invoiceId);

  if (!invoice) {
    console.error("Invoice not found for ID:", invoiceId);
    throw new Response("Factura no encontrada", { status: 404 });
  }

  return json({ invoice });
}

function getDocumentIcon(type: string) {
  switch (type) {
    case "order":
      return <Package className="h-4 w-4" />;
    case "payment":
      return <CreditCard className="h-4 w-4" />;
    case "receipt":
      return <Receipt className="h-4 w-4" />;
    case "contract":
      return <FileCheck className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

function getDocumentTypeName(type: string) {
  switch (type) {
    case "order":
      return "Orden de Compra";
    case "payment":
      return "Comprobante de Pago";
    case "receipt":
      return "Recibo";
    case "contract":
      return "Contrato";
    default:
      return "Documento";
  }
}

export default function InvoiceDetails() {
  const { invoice } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [selectedDocument, setSelectedDocument] = useState<{
    url: string;
    mimeType: string;
    name: string;
  } | null>(null);

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
                  {invoice.company}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {getStatusBadge(invoice.status)}
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
                  ${parseFloat(invoice.total).toLocaleString()}{" "}
                  {invoice.currency}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Fecha</span>
                <div className="font-medium">
                  {new Date(invoice.invoiceDate).toLocaleDateString()}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Balance</span>
                <div className="font-medium">
                  ${invoice.balance.toLocaleString()}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">
                  Método de Pago
                </span>
                <div className="font-medium">{invoice.paymentMethod}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">CFDI</span>
                <div className="font-medium">{invoice.useCfdi}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">
                  Condiciones
                </span>
                <div className="font-medium">{invoice.paymentConditions}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-h-0">
          <div className="px-6 py-6 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              {/* Documents Section */}
              <div className="lg:col-span-2">
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <span>Documentos Relacionados</span>
                      <Button variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-2" />
                        Subir Documento
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 min-h-0">
                    <div className="h-full overflow-y-auto space-y-3">
                      {invoice.relatedDocuments &&
                      invoice.relatedDocuments.length > 0 ? (
                        invoice.relatedDocuments.map((doc, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <div className="flex-shrink-0">
                                {getDocumentIcon(doc.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">
                                  {doc.name}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {getDocumentTypeName(doc.type)} •{" "}
                                  {new Date(
                                    doc.uploadDate
                                  ).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedDocument(doc)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-center h-32 text-muted-foreground">
                          <div className="text-center">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No hay documentos relacionados</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Actions Section */}
              <div>
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-3">
                    <CardTitle>Acciones</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    {/* Upload Actions */}
                    <div>
                      <h4 className="font-medium mb-3 text-muted-foreground">
                        Subir Documentos
                      </h4>
                      <div className="space-y-3">
                        <Select>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccionar tipo de documento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="payment">
                              Comprobante de Pago
                            </SelectItem>
                            <SelectItem value="order">
                              Orden de Compra
                            </SelectItem>
                            <SelectItem value="receipt">Recibo</SelectItem>
                            <SelectItem value="contract">Contrato</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Subir Documento
                        </Button>
                      </div>
                    </div>

                    {/* Download Actions */}
                    <div>
                      <h4 className="font-medium mb-3 text-muted-foreground">
                        Descargas
                      </h4>
                      <div className="space-y-2">
                        {invoice.urlPdfFile && invoice.urlPdfFile !== "#" && (
                          <Button
                            variant="default"
                            className="w-full justify-start"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Descargar PDF
                          </Button>
                        )}
                        {invoice.urlXmlFile && invoice.urlXmlFile !== "#" && (
                          <Button
                            variant="default"
                            className="w-full justify-start"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Descargar XML
                          </Button>
                        )}
                        {invoice.relatedDocuments &&
                          invoice.relatedDocuments.length > 0 && (
                            <Button
                              variant="secondary"
                              className="w-full justify-start"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Descargar documentos (
                              {invoice.relatedDocuments.length})
                            </Button>
                          )}
                      </div>
                    </div>

                    {/* View Actions */}
                    <div>
                      <h4 className="font-medium mb-3 text-muted-foreground">
                        Ver Archivos
                      </h4>
                      <div className="space-y-2">
                        {invoice.urlPdfFile && invoice.urlPdfFile !== "#" && (
                          <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() =>
                              setSelectedDocument({
                                url: invoice.urlPdfFile,
                                mimeType: "application/pdf",
                                name: "Factura PDF",
                              })
                            }
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver PDF de Factura
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* Document Viewer Dialog */}
        <Dialog
          open={!!selectedDocument}
          onOpenChange={() => setSelectedDocument(null)}
        >
          <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>{selectedDocument?.name}</DialogTitle>
            </DialogHeader>

            {selectedDocument && (
              <div className="flex-1 overflow-hidden">
                {selectedDocument.mimeType.startsWith("image/") ? (
                  <div className="flex justify-center bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                    <img
                      src={selectedDocument.url}
                      alt={selectedDocument.name}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  </div>
                ) : selectedDocument.mimeType === "application/pdf" ? (
                  <div className="h-[70vh] w-full">
                    <iframe
                      src={selectedDocument.url}
                      className="w-full h-full border-0 rounded-lg"
                      title={selectedDocument.name}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[70vh] bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground">
                        No se puede previsualizar este tipo de archivo
                      </p>
                      <Button className="mt-4" asChild>
                        <a
                          href={selectedDocument.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Descargar archivo
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AuthLayout>
  );
}
