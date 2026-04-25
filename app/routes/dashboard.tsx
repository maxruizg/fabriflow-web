import { useState } from "react";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { requireUser, getAccessTokenFromSession, getFullSession } from "~/lib/session.server";
import { fetchInvoices, fetchAllInvoices } from "~/lib/api.server";
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
  Upload,
  Receipt,
  FileCheck,
  FileMinus,
  FilePlus,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  CircleDot,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { DataLoadError } from "~/components/ui/error-state";
import { DashboardLoadingSkeleton } from "~/components/ui/loading-state";
import { MultiPaymentDialog } from "~/components/dashboard/multi-payment-dialog";
import type { Invoice, InvoiceBackend } from "~/types";

export const meta: MetaFunction = () => {
  return [
    { title: "Dashboard - FabriFlow" },
    {
      name: "description",
      content: "Visión general financiera y métricas clave",
    },
  ];
};

// Helper function to check if user has a specific permission
function hasPermission(permissions: string[] | undefined, permission: string): boolean {
  if (!permissions) return false;
  if (permissions.includes("*")) return true; // Full access
  return permissions.includes(permission);
}

// Helper function to detect role type
function getRoleType(role: string | undefined): "super_admin" | "admin" | "proveedor" | "unknown" {
  const roleLower = (role || "").toLowerCase().trim();
  if (roleLower === "super admin" || roleLower === "superadmin") return "super_admin";
  if (roleLower.includes("admin") || roleLower.includes("administrador")) return "admin";
  if (roleLower.includes("proveedor") || roleLower.includes("vendor")) return "proveedor";
  return "unknown";
}

// Vendor metrics interface
interface VendorMetrics {
  totalInvoices: number;
  totalMXN: number;
  totalUSD: number;
  pendiente: number;
  recibido: number;
  pagado: number;
  completado: number;
  rechazado: number;
  ultimaFactura: string | null;
}

// Calculate vendor metrics from invoices
function calculateVendorMetrics(invoices: InvoiceBackend[]): VendorMetrics {
  const metrics: VendorMetrics = {
    totalInvoices: invoices.length,
    totalMXN: 0,
    totalUSD: 0,
    pendiente: 0,
    recibido: 0,
    pagado: 0,
    completado: 0,
    rechazado: 0,
    ultimaFactura: null,
  };

  let latestDate: Date | null = null;

  for (const invoice of invoices) {
    // Sum by currency
    if (invoice.moneda === "MXN") {
      metrics.totalMXN += invoice.total;
    } else if (invoice.moneda === "USD") {
      metrics.totalUSD += invoice.total;
    }

    // Count by status
    const estado = invoice.estado?.toLowerCase() || "pendiente";
    if (estado === "pendiente") metrics.pendiente++;
    else if (estado === "recibido") metrics.recibido++;
    else if (estado === "pagado") metrics.pagado++;
    else if (estado === "completado") metrics.completado++;
    else if (estado === "rechazado") metrics.rechazado++;

    // Track latest invoice
    const invoiceDate = new Date(invoice.fechaEntrada || invoice.createdAt);
    if (!latestDate || invoiceDate > latestDate) {
      latestDate = invoiceDate;
      metrics.ultimaFactura = invoice.fechaEntrada || invoice.createdAt;
    }
  }

  return metrics;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication for dashboard access
  const user = await requireUser(request);
  const session = await getFullSession(request);
  const token = session?.accessToken;
  const companyId = user.company;

  try {
    const roleType = getRoleType(user.role);
    const permissions = user.permissions || [];
    const isProveedor = roleType === "proveedor";

    // Default metrics
    let vendorMetrics: VendorMetrics | null = null;
    let adminMetrics = {
      totalRevenue: 0,
      totalInvoices: 0,
      activeProviders: 0,
      balanceUSD: 0,
      balanceMXN: 0,
      recentActivity: [] as { description: string; amount: number; time: string }[],
    };

    // Fetch invoices for vendor dashboard
    if (isProveedor && token && companyId) {
      try {
        const response = await fetchInvoices(token, companyId, { limit: 100 });
        vendorMetrics = calculateVendorMetrics(response.data || []);
      } catch (error) {
        console.error("Error fetching vendor invoices:", error);
        vendorMetrics = {
          totalInvoices: 0,
          totalMXN: 0,
          totalUSD: 0,
          pendiente: 0,
          recibido: 0,
          pagado: 0,
          completado: 0,
          rechazado: 0,
          ultimaFactura: null,
        };
      }
    }

    // Fetch all invoices for admin dashboard
    if (!isProveedor && token && companyId) {
      try {
        const response = await fetchAllInvoices(token, companyId, { limit: 100 });
        const invoices = response.data || [];

        // Calculate admin metrics
        for (const invoice of invoices) {
          if (invoice.moneda === "MXN") {
            adminMetrics.balanceMXN += invoice.total;
            adminMetrics.totalRevenue += invoice.total;
          } else if (invoice.moneda === "USD") {
            adminMetrics.balanceUSD += invoice.total;
            adminMetrics.totalRevenue += invoice.total;
          }
        }
        adminMetrics.totalInvoices = invoices.length;

        // Count unique vendors
        const uniqueVendors = new Set(invoices.map(i => i.vendor).filter(Boolean));
        adminMetrics.activeProviders = uniqueVendors.size;
      } catch (error) {
        console.error("Error fetching admin invoices:", error);
      }
    }

    return json({
      metrics: adminMetrics,
      vendorMetrics,
      error: null,
      user,
      roleType,
      permissions,
    });
  } catch (error) {
    console.error("Dashboard loader error:", error);
    return json({
      metrics: null,
      vendorMetrics: null,
      error:
        "Error al cargar los datos del dashboard. Por favor intente más tarde.",
      user,
      roleType: "unknown" as const,
      permissions: [] as string[],
    });
  }
}

export default function Dashboard() {
  const { metrics, vendorMetrics, error, roleType, permissions } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [isMultiPaymentOpen, setIsMultiPaymentOpen] = useState<boolean>(false);

  // Empty invoices for now - will be loaded from API
  const invoices: Invoice[] = [];

  // Permission checks
  const can = (permission: string) => hasPermission(permissions, permission);
  const isSuperAdmin = roleType === "super_admin";
  const isAdmin = roleType === "admin";
  const isProveedor = roleType === "proveedor";

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

  if (!metrics && !vendorMetrics) {
    return (
      <AuthLayout>
        <DashboardLoadingSkeleton />
      </AuthLayout>
    );
  }

  // Render vendor dashboard
  if (isProveedor && vendorMetrics) {
    return (
      <AuthLayout>
        <div className="space-y-6">
          {/* Vendor Stats Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total de Facturas
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{vendorMetrics.totalInvoices}</div>
                <p className="text-xs text-muted-foreground">
                  Facturas enviadas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total MXN</CardTitle>
                <Banknote className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${vendorMetrics.totalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total facturado en pesos
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total USD</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${vendorMetrics.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total facturado en dólares
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Última Factura</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {vendorMetrics.ultimaFactura
                    ? new Date(vendorMetrics.ultimaFactura).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
                    : "N/A"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fecha de última factura
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            {/* Invoice Status Breakdown */}
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Estado de Facturas</CardTitle>
                <CardDescription>
                  Distribución por estado de tus facturas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="flex flex-col items-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <Clock className="h-6 w-6 text-yellow-600 mb-2" />
                    <span className="text-2xl font-bold text-yellow-600">{vendorMetrics.pendiente}</span>
                    <span className="text-xs text-muted-foreground">Pendientes</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <Truck className="h-6 w-6 text-blue-600 mb-2" />
                    <span className="text-2xl font-bold text-blue-600">{vendorMetrics.recibido}</span>
                    <span className="text-xs text-muted-foreground">Recibidas</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <CreditCard className="h-6 w-6 text-purple-600 mb-2" />
                    <span className="text-2xl font-bold text-purple-600">{vendorMetrics.pagado}</span>
                    <span className="text-xs text-muted-foreground">Pagadas</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600 mb-2" />
                    <span className="text-2xl font-bold text-green-600">{vendorMetrics.completado}</span>
                    <span className="text-xs text-muted-foreground">Completadas</span>
                  </div>
                  <div className="flex flex-col items-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <XCircle className="h-6 w-6 text-red-600 mb-2" />
                    <span className="text-2xl font-bold text-red-600">{vendorMetrics.rechazado}</span>
                    <span className="text-xs text-muted-foreground">Rechazadas</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions for Vendor */}
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Acciones Rápidas</CardTitle>
                <CardDescription>
                  Gestiona tus documentos fiscales
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-2">
                  <Button
                    className="w-full justify-start"
                    onClick={() => { window.location.href = "/invoices/new"; }}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Subir Factura
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => { window.location.href = "/reception/new"; }}
                  >
                    <FileCheck className="h-4 w-4 mr-2" />
                    Subir Recepción
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => { window.location.href = "/credit-notes/new"; }}
                  >
                    <FileMinus className="h-4 w-4 mr-2" />
                    Subir Nota de Crédito
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => { window.location.href = "/complements/new"; }}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Subir Complemento
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => { window.location.href = "/invoices"; }}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Ver Mis Facturas
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Render admin/super admin dashboard
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
                ${metrics?.totalRevenue.toLocaleString()}
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
              <div className="text-2xl font-bold">{metrics?.totalInvoices}</div>
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
                {metrics?.activeProviders}
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
                ${metrics?.balanceUSD.toLocaleString()}
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
                ${metrics?.balanceMXN.toLocaleString()} MXN
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
                {metrics?.recentActivity.map((activity, index) => (
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
                {(!metrics?.recentActivity || metrics.recentActivity.length === 0) && (
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
                {isSuperAdmin ? "Visión general del sistema" : "Acciones operativas"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2">
                {/* === ACCIONES DE SUPER ADMIN (Dueño) === */}
                {isSuperAdmin && (
                  <>
                    <Button
                      className="w-full justify-start"
                      onClick={() => { window.location.href = "/invoices"; }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Ver Todas las Facturas
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => { window.location.href = "/providers"; }}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Gestionar Proveedores
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => { window.location.href = "/users"; }}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Gestionar Usuarios
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => { window.location.href = "/reports"; }}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Ver Reportes
                    </Button>
                  </>
                )}

                {/* === ACCIONES DE ADMIN (Operativo) === */}
                {isAdmin && (
                  <>
                    {can("invoices:read") && (
                      <Button
                        className="w-full justify-start"
                        onClick={() => { window.location.href = "/invoices"; }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Ver Facturas
                      </Button>
                    )}
                    {can("payments:create") && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => { window.location.href = "/payments/new"; }}
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Crear Pago
                      </Button>
                    )}
                    {can("payments:create") && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => setIsMultiPaymentOpen(true)}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Multipago
                      </Button>
                    )}
                    {can("vendors:manage") && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => { window.location.href = "/providers"; }}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Gestionar Proveedores
                      </Button>
                    )}
                    {can("reports:read") && (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => { window.location.href = "/reports"; }}
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Ver Reportes
                      </Button>
                    )}
                  </>
                )}
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
