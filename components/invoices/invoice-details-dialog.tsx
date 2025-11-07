import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import { Eye, X, FileText, Download, Upload } from "lucide-react";
import type { Invoice } from "~/types";
import { getStatusBadge } from "~/lib/utils";

interface InvoiceDetailsDialogProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceDetailsDialog({
  invoice,
  isOpen,
  onOpenChange,
}: InvoiceDetailsDialogProps) {
  const [selectedDocument, setSelectedDocument] = useState<{
    url: string;
    mimeType: string;
    name: string;
  } | null>(null);

  if (!invoice) return null;

  return (
    <>
      {/* Invoice Details Dialog */}
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de Factura - {invoice.folio}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Invoice Basic Info - Compact Version */}
            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Folio:</span>
                  <div className="font-medium">{invoice.folio}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Total:</span>
                  <div className="font-medium">
                    ${parseFloat(invoice.total).toLocaleString()} {invoice.currency}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>
                  <div className="mt-1">{getStatusBadge(invoice.status)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>
                  <div className="font-medium">
                    {new Date(invoice.invoiceDate).toLocaleDateString()}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Empresa:</span>
                  <div className="font-medium">{invoice.company}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Emisor:</span>
                  <div className="font-medium">{invoice.issuerName}</div>
                </div>
              </div>
            </div>

            {/* Related Documents */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Documentos Relacionados
              </h3>
              {invoice.relatedDocuments &&
              invoice.relatedDocuments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {invoice.relatedDocuments.map((doc, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{doc.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {doc.type === "order"
                              ? "Orden de Compra"
                              : "Comprobante de Pago"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Subido:{" "}
                            {new Date(doc.uploadDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDocument(doc)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No hay documentos relacionados
                </p>
              )}
            </div>

            {/* Invoice Files */}
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Archivos de Factura
              </h3>
              <div className="flex flex-wrap gap-2">
                {invoice.urlPdfFile && invoice.urlPdfFile !== "#" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setSelectedDocument({
                        url: invoice.urlPdfFile,
                        mimeType: "application/pdf",
                        name: "Factura PDF",
                      })
                    }
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver PDF
                  </Button>
                )}
              </div>
            </div>

            {/* Actions Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Acciones</h3>
              <div className="space-y-4">
                {/* Upload Payment Section */}
                <div>
                  <h4 className="text-md font-medium mb-2 text-muted-foreground">Subir Documentos</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        // TODO: Implement payment upload functionality
                        console.log('Upload payment clicked for invoice:', invoice.folio);
                      }}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Subir Comprobante de Pago
                    </Button>
                  </div>
                </div>

                {/* Downloads Section */}
                <div>
                  <h4 className="text-md font-medium mb-2 text-muted-foreground">Descargas</h4>
                  <div className="flex flex-wrap gap-2">
                {/* Download Invoice PDF */}
                {invoice.urlPdfFile && invoice.urlPdfFile !== "#" && (
                  <Button
                    variant="default"
                    onClick={() => {
                      // TODO: Implement PDF download functionality
                      console.log(
                        "Download PDF clicked for invoice:",
                        invoice.folio
                      );
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descargar PDF
                  </Button>
                )}

                {/* Download Invoice XML */}
                {invoice.urlXmlFile && invoice.urlXmlFile !== "#" && (
                  <Button
                    variant="default"
                    onClick={() => {
                      // TODO: Implement XML download functionality
                      console.log(
                        "Download XML clicked for invoice:",
                        invoice.folio
                      );
                    }}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Descargar XML
                  </Button>
                )}

                {/* Download All Related Documents */}
                {invoice.relatedDocuments &&
                  invoice.relatedDocuments.length > 0 && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        // TODO: Implement bulk download functionality for related documents
                        console.log(
                          "Download all documents clicked for invoice:",
                          invoice.folio
                        );
                        console.log(
                          "Documents to download:",
                          invoice.relatedDocuments?.map((doc) => doc.name)
                        );
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Descargar documentos ({invoice.relatedDocuments.length})
                    </Button>
                  )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog
        open={!!selectedDocument}
        onOpenChange={() => setSelectedDocument(null)}
      >
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              {selectedDocument?.name}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDocument(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
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
    </>
  );
}
