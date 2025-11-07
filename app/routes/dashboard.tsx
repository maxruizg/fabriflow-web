import { useState } from "react";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { requireUser } from "~/lib/session.server";
import { AuthLayout } from "~/components/layout/auth-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  DollarSign,
  FileText,
  Users,
  Banknote,
  CreditCard,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { DataLoadError } from "~/components/ui/error-state";
import { DashboardLoadingSkeleton } from "~/components/ui/loading-state";
import { MultiPaymentDialog } from "~/components/dashboard/multi-payment-dialog";
import type { Invoice } from "~/types";

export const meta: MetaFunction = () => {
  return [
    { title: "Dashboard - FabriFlow" },
    {
      name: "description",
      content: "Visión general financiera y métricas clave",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication for dashboard access
  await requireUser(request);

  try {

    const metrics = {
      totalRevenue: 125430.5,
      totalInvoices: 47,
      activeProviders: 12,
      balanceUSD: 24500.75,
      balanceMXN: 487250.0,
      recentActivity: [
        {
          description: "Factura #INV-2024-001 pagada",
          amount: 2500.0,
          time: "hace 2 horas",
        },
        {
          description: "Nuevo proveedor registrado: ABC Corp",
          amount: 0,
          time: "hace 5 horas",
        },
        {
          description: "Factura #INV-2024-002 creada",
          amount: 3750.5,
          time: "hace 1 día",
        },
        {
          description: "Pago recibido de XYZ Ltd",
          amount: 1200.0,
          time: "hace 2 días",
        },
        {
          description: "Reporte mensual generado",
          amount: 0,
          time: "hace 3 días",
        },
      ],
    };

    return json({ metrics, error: null, user: null });
  } catch (error) {
    console.error("Dashboard loader error:", error);
    return json({
      metrics: null,
      error:
        "Error al cargar los datos del dashboard. Por favor intente más tarde.",
      user: null,
    });
  }
}

export default function Dashboard() {
  const { metrics, error } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [isMultiPaymentOpen, setIsMultiPaymentOpen] = useState<boolean>(false);

  // Hardcoded invoices for development
  const invoices = [
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
    },
    {
      uuid: "INV-003",
      folio: "B-2024-015",
      company: "Fábrica de Componentes Automotrices",
      issuerName: "Plásticos Industriales del Bajío",
      invoiceDate: "2024-02-01",
      total: "89300.00",
      currency: "MXN",
      status: "pending",
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
    },
    {
      uuid: "INV-005",
      folio: "A-2024-003",
      company: "Procesadora de Alimentos San Juan",
      issuerName: "Empacadora Nacional S.A.",
      invoiceDate: "2024-02-15",
      total: "320000.00",
      currency: "MXN",
      status: "pending",
      urlPdfFile: "#",
      urlXmlFile: "#",
      paymentConditions: "Contado",
      details: [],
      entryDate: "2024-02-15",
      paymentMethod: "Efectivo",
      subtotal: "315000.00",
      user: "user1",
      useCfdi: "G03",
      balance: 320000.0,
      exchangeRate: "1",
      complements: [],
    },
  ];

  if (error) {
    return (
      <AuthLayout>
        <DataLoadError
          resource="Dashboard"
          onRetry={() => revalidator.revalidate()}
        />
      </AuthLayout>
    );
  }

  if (!metrics) {
    return (
      <AuthLayout>
        <DashboardLoadingSkeleton />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Ingresos Totales
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${metrics.totalRevenue.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Calculado de todas las facturas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Facturas
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalInvoices}</div>
              <p className="text-xs text-muted-foreground">
                Facturas activas en el sistema
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Proveedores Activos
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.activeProviders}
              </div>
              <p className="text-xs text-muted-foreground">
                Proveedores actualmente activos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Balance USD</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${metrics.balanceUSD.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Balance disponible en dólares
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Balance MXN</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${metrics.balanceMXN.toLocaleString()} MXN
              </div>
              <p className="text-xs text-muted-foreground">
                Balance disponible en pesos mexicanos
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Actividad Reciente</CardTitle>
              <CardDescription>
                Últimas transacciones financieras y actualizaciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {metrics.recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center">
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {activity.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ${activity.amount} - {activity.time}
                      </p>
                    </div>
                  </div>
                ))}
                {metrics.recentActivity.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Sin actividad reciente
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-3">
            <CardHeader>
              <CardTitle>Acciones Rápidas</CardTitle>
              <CardDescription>
                Tareas comunes y accesos directos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2">
                <Button
                  className="w-full justify-start"
                  onClick={() => {
                    console.log("Subir Nueva Factura clicked");
                    // TODO: Implement upload invoice functionality
                  }}
                >
                  Subir Nueva Factura
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    console.log("Crear Pago clicked");
                    // TODO: Implement create payment functionality
                  }}
                >
                  Crear Pago
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setIsMultiPaymentOpen(true)}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Multipago
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    console.log("Generar Reporte clicked");
                    // TODO: Implement generate report functionality
                  }}
                >
                  Generar Reporte
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    console.log("Agregar Proveedor clicked");
                    // TODO: Implement add provider functionality
                  }}
                >
                  Agregar Proveedor
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <MultiPaymentDialog
        open={isMultiPaymentOpen}
        onOpenChange={setIsMultiPaymentOpen}
        invoices={invoices}
      />
    </AuthLayout>
  );
}
