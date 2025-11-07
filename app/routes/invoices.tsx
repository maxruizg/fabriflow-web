import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Search, FileText, Download, Upload, Eye } from "lucide-react";
import { requireUser } from "~/lib/session.server";
import type { Invoice } from "~/types";
import { DataLoadError } from "~/components/ui/error-state";
import {
  TableLoadingSkeleton,
  StatsCardsLoadingSkeleton,
} from "~/components/ui/loading-state";
// import { FileUpload } from "~/components/ui/file-upload";
// import { FilePreview } from "~/components/ui/file-preview";
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "~/components/ui/dialog";
// import { useFileUpload } from "~/lib/hooks/use-file-upload";

import { useNavigate } from "@remix-run/react";
// import { InvoiceDetailsDialog } from "~/components/invoices/invoice-details-dialog";
import { getStatusBadge } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Facturas - FabriFlow" },
    {
      name: "description",
      content: "Administra facturas, pagos y complementos",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication for invoices access
  await requireUser(request);

  try {
    // Hardcoded invoices data for development
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
          "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", // Placeholder XML URL
        // Add missing required fields
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
        // Add related documents
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
          "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", // Placeholder XML URL
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
        urlPdfFile: "#",
        urlXmlFile: "#",
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
        urlPdfFile: "#",
        urlXmlFile: "",
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
        urlPdfFile: "#",
        urlXmlFile: "#",
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

    // Return hardcoded data directly
    return json({ invoices, error: null, user: null });
  } catch (error) {
    console.error("Invoices loader error:", error);
    return json({
      invoices: [],
      error: "Error al cargar facturas. Por favor intenta de nuevo más tarde.",
      user: null,
    });
  }
}

export default function Invoices() {
  const { invoices, error } = useLoaderData<typeof loader>();
  const validInvoices = (invoices || []).filter((invoice): invoice is Invoice =>
    Boolean(invoice)
  );
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  // const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  // Commented out file upload functionality for dialog testing
  // const {
  //   uploadFiles,
  //   isUploading,
  //   progress,
  //   error: uploadError,
  //   reset: resetUpload,
  // } = useFileUpload({
  //   onSuccess: (result) => {
  //     console.log("Upload successful:", result);
  //     revalidator.revalidate();
  //     setIsUploadDialogOpen(false);
  //     resetUpload();
  //   },
  //   onError: (error) => {
  //     console.error("Upload failed:", error);
  //   },
  // });

  if (error) {
    return (
      <AuthLayout>
        <DataLoadError
          resource="Facturas"
          onRetry={() => revalidator.revalidate()}
        />
      </AuthLayout>
    );
  }

  if (!invoices) {
    return (
      <AuthLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Facturas</h2>
              <p className="text-muted-foreground">
                Administra tus facturas, pagos y documentos financieros
              </p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Cargando Facturas...</CardTitle>
            </CardHeader>
            <CardContent>
              <TableLoadingSkeleton rows={5} columns={7} />
            </CardContent>
          </Card>
          <StatsCardsLoadingSkeleton />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Facturas</h2>
            <p className="text-sm text-muted-foreground">
              Administra tus facturas, pagos y documentos financieros
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            <Button disabled>
              <Upload className="mr-2 h-4 w-4" />
              Subir Factura (Deshabilitado)
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar facturas..." className="pl-8" />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-3 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Total de Facturas</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">{validInvoices.length}</div>
              <p className="text-xs text-muted-foreground">Facturas activas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Monto Total</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">
                $
                {validInvoices
                  .reduce((sum, invoice) => sum + parseFloat(invoice.total), 0)
                  .toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Valor combinado</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Pagos Pendientes</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">
                $
                {validInvoices
                  .filter(
                    (invoice) =>
                      invoice.status === "pending" ||
                      invoice.status === "pendiente"
                  )
                  .reduce((sum, invoice) => sum + parseFloat(invoice.total), 0)
                  .toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Esperando pago</p>
            </CardContent>
          </Card>
        </div>

        <Card className="flex-1 min-h-0 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center">
              <FileText className="mr-2 h-4 w-4" />
              Facturas Recientes
            </CardTitle>
            <CardDescription className="text-sm">
              Lista de tus facturas recientes y su estado actual.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Emisor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validInvoices.map((invoice) => (
                  <TableRow key={invoice.uuid}>
                    <TableCell className="font-medium">
                      {invoice.folio}
                    </TableCell>
                    <TableCell>{invoice.company}</TableCell>
                    <TableCell>{invoice.issuerName}</TableCell>
                    <TableCell>
                      {new Date(invoice.invoiceDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      ${parseFloat(invoice.total).toLocaleString()}{" "}
                      {invoice.currency}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(invoice.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/invoice/${invoice.uuid}`);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {validInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      No se encontraron facturas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
