import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { requireUser } from "~/lib/session.server";
import { json } from "@remix-run/cloudflare";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { BarChart3, Download, Calendar, FileSpreadsheet, Printer } from "lucide-react";

export const meta: MetaFunction = () => {
  return [
    { title: "Reportes - FabriFlow" },
    { name: "description", content: "Genera reportes financieros y análisis" },
  ];
};

const reportTypes = [
  {
    id: "monthly-summary",
    title: "Resumen Financiero Mensual",
    description: "Resumen integral de la actividad financiera mensual incluyendo facturas, pagos y saldos.",
    icon: Calendar,
    features: ["Desglose de ingresos", "Estado de pagos", "Análisis de divisas", "Gráficos de tendencias"]
  },
  {
    id: "provider-analysis",
    title: "Análisis de Desempeño de Proveedores",
    description: "Análisis detallado de las relaciones con proveedores, volúmenes de transacciones y patrones de pago.",
    icon: BarChart3,
    features: ["Principales proveedores", "Velocidad de pago", "Tendencias de volumen", "Análisis regional"]
  },
  {
    id: "tax-compliance",
    title: "Reporte de Cumplimiento Fiscal",
    description: "Generar reportes para cumplimiento fiscal incluyendo requisitos del SAT y documentación CFDI.",
    icon: FileSpreadsheet,
    features: ["Resumen CFDI", "Cálculos fiscales", "Estado de cumplimiento", "Formatos de exportación"]
  },
  {
    id: "custom-analytics",
    title: "Panel de Análisis Personalizado",
    description: "Crear reportes personalizados con filtros flexibles y capacidades de análisis avanzadas.",
    icon: Printer,
    features: ["Filtros personalizados", "Rangos de fechas", "Opciones de exportación", "Gráficos visuales"]
  }
];

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication for reports access
  const user = await requireUser(request);
  return json({ user });
}

export default function Reports() {
  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Reportes y Análisis</h2>
            <p className="text-muted-foreground">
              Genera reportes financieros integrales e información empresarial
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline">
              <Calendar className="mr-2 h-4 w-4" />
              Programar Reporte
            </Button>
            <Button>
              <Download className="mr-2 h-4 w-4" />
              Exportar Datos
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {reportTypes.map((report) => {
            const Icon = report.icon;
            return (
              <Card key={report.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{report.title}</CardTitle>
                      <CardDescription>{report.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {report.features.map((feature, index) => (
                        <div key={index} className="text-sm text-muted-foreground flex items-center">
                          <div className="w-1.5 h-1.5 bg-primary rounded-full mr-2"></div>
                          {feature}
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2 pt-3">
                      <Button className="flex-1">Generar Reporte</Button>
                      <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estadísticas Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Ingresos Este Mes</span>
                <span className="font-semibold">$45,231</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Facturas Procesadas</span>
                <span className="font-semibold">1,247</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Proveedores Activos</span>
                <span className="font-semibold">89</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tiempo Promedio de Pago</span>
                <span className="font-semibold">12 días</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reportes Recientes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm">
                  <div className="font-medium">Resumen Financiero Mayo 2024</div>
                  <div className="text-muted-foreground text-xs">Generado hace 2 días</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium">Análisis de Proveedores T1</div>
                  <div className="text-muted-foreground text-xs">Generado hace 1 semana</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium">Cumplimiento Fiscal Abril</div>
                  <div className="text-muted-foreground text-xs">Generado hace 2 semanas</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Opciones de Exportación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Formato Excel
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Download className="mr-2 h-4 w-4" />
                Reporte PDF
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Calendar className="mr-2 h-4 w-4" />
                Datos CSV
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reportes Programados</CardTitle>
            <CardDescription>
              Administra la generación automática y programación de entrega de reportes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Resumen Financiero Mensual</div>
                  <div className="text-sm text-muted-foreground">
                    Cada 1ro del mes a las 9:00 AM • Próximo: 1 de Julio, 2024
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm">Editar</Button>
                  <Button variant="ghost" size="sm">Pausar</Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">Actualización Semanal de Proveedores</div>
                  <div className="text-sm text-muted-foreground">
                    Cada lunes a las 8:00 AM • Próximo: 24 de Junio, 2024
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm">Editar</Button>
                  <Button variant="ghost" size="sm">Pausar</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}