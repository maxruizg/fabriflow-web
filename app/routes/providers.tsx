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
import { Search, Plus, Building, Mail } from "lucide-react";
import { requireUser } from "~/lib/session.server";
import type { Provider } from "~/types";
import { DataLoadError } from "~/components/ui/error-state";
import {
  TableLoadingSkeleton,
  StatsCardsLoadingSkeleton,
} from "~/components/ui/loading-state";
import { getStatusBadge } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Proveedores - FabriFlow" },
    {
      name: "description",
      content: "Administra información y relaciones con proveedores",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Require authentication for providers access
  await requireUser(request);

  try {
    // Hardcoded providers data for development
    const providers: Provider[] = [
      {
        rfc: "TNO840515KT8",
        nombre: "Textiles del Norte S.A. de C.V.",
        email: "contacto@textilesnorte.com.mx",
        status: "activo",
        mxnTotal: 125000,
        usdTotal: 0,
        moneda: "MXN",
        clave: "TN001",
        password: "temp123",
      },
      {
        rfc: "MIM901220Q90",
        nombre: "Manufacturera Industrial Mexicana",
        email: "ventas@industriamx.com",
        status: "activo",
        mxnTotal: 450000,
        usdTotal: 25000,
        moneda: "MXN",
        clave: "MIM002",
        password: "temp456",
      },
      {
        rfc: "FCA021105RK4",
        nombre: "Fábrica de Componentes Automotrices",
        email: "info@componentesauto.mx",
        status: "pendiente",
        mxnTotal: 89300,
        usdTotal: 0,
        moneda: "MXN",
        clave: "FCA003",
        password: "temp789",
      },
      {
        rfc: "IMB950612TG7",
        nombre: "Industrias Metálicas del Bajío",
        email: "contacto@metalicasbajio.com",
        status: "activo",
        mxnTotal: 320000,
        usdTotal: 45600,
        moneda: "USD",
        clave: "IMB004",
        password: "temp101",
      },
      {
        rfc: "PAS880315HJ2",
        nombre: "Procesadora de Alimentos San Juan",
        email: "administracion@alimentossanjuan.mx",
        status: "activo",
        mxnTotal: 780000,
        usdTotal: 0,
        moneda: "MXN",
        clave: "PAS005",
        password: "temp202",
      },
    ];

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";

    // Filter providers based on search if provided
    const filteredProviders = search
      ? providers.filter(
          (provider) =>
            provider.nombre.toLowerCase().includes(search.toLowerCase()) ||
            provider.rfc.toLowerCase().includes(search.toLowerCase()) ||
            provider.email.toLowerCase().includes(search.toLowerCase())
        )
      : providers;

    return json({ providers: filteredProviders, error: null, user: null });
  } catch (error) {
    console.error("Providers loader error:", error);
    return json({
      providers: [],
      user: null,
      error:
        "Error al cargar proveedores. Por favor intenta de nuevo más tarde.",
    });
  }
}

function formatCurrency(amount: number, currency: "MXN" | "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export default function Providers() {
  const { providers, error } = useLoaderData<typeof loader>();
  const validProviders = (providers || []).filter(
    (provider): provider is Provider => Boolean(provider)
  );
  const revalidator = useRevalidator();

  if (error) {
    return (
      <AuthLayout>
        <DataLoadError
          resource="Proveedores"
          onRetry={() => revalidator.revalidate()}
        />
      </AuthLayout>
    );
  }

  if (!providers) {
    return (
      <AuthLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Proveedores</h2>
              <p className="text-muted-foreground">
                Administra las relaciones con proveedores y el seguimiento de
                actividad financiera
              </p>
            </div>
          </div>
          <StatsCardsLoadingSkeleton count={4} />
          <Card>
            <CardHeader>
              <CardTitle>Cargando Proveedores...</CardTitle>
            </CardHeader>
            <CardContent>
              <TableLoadingSkeleton rows={5} columns={7} />
            </CardContent>
          </Card>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Proveedores</h2>
            <p className="text-sm text-muted-foreground">
              Administra las relaciones con proveedores y el seguimiento de
              actividad financiera
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline">
              <Mail className="mr-2 h-4 w-4" />
              Email Masivo
            </Button>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Agregar Proveedor
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar proveedores..." className="pl-8" />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Total de Proveedores</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">{validProviders.length}</div>
              <p className="text-xs text-muted-foreground">
                Proveedores registrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Proveedores Activos</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">
                {validProviders.filter((p) => p.status === "activo").length}
              </div>
              <p className="text-xs text-muted-foreground">
                Actualmente activos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Total MXN</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">
                {formatCurrency(
                  validProviders.reduce((sum, p) => sum + (p.mxnTotal || 0), 0),
                  "MXN"
                )}
              </div>
              <p className="text-xs text-muted-foreground">Peso Mexicano</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Total USD</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">
                {formatCurrency(
                  validProviders.reduce((sum, p) => sum + (p.usdTotal || 0), 0),
                  "USD"
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Dólar Estadounidense
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="flex-1 min-h-0 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center">
              <Building className="mr-2 h-4 w-4" />
              Directorio de Proveedores
            </CardTitle>
            <CardDescription className="text-sm">
              Lista completa de proveedores y su historial de transacciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre de la Empresa</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead>Total MXN</TableHead>
                  <TableHead>Total USD</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validProviders.map((provider) => (
                  <TableRow key={provider.rfc}>
                    <TableCell className="font-medium">
                      {provider.nombre}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {provider.rfc}
                    </TableCell>
                    <TableCell>{provider.email}</TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(provider.status)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(provider.mxnTotal || 0, "MXN")}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(provider.usdTotal || 0, "USD")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Button variant="ghost" size="sm">
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          Editar
                        </Button>
                        <Button variant="ghost" size="sm">
                          Ver
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {validProviders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      No se encontraron proveedores
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
