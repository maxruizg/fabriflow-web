import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator, useSearchParams } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Separator } from "~/components/ui/separator";
import { Search, Building2, RefreshCw, Filter, X, Mail, FileText, DollarSign } from "lucide-react";
import { requireUser, getFullSession } from "~/lib/session.server";
import { fetchAllInvoices } from "~/lib/api.server";
import type { InvoiceBackend } from "~/types";
import { DataLoadError } from "~/components/ui/error-state";
import { useState, useCallback } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Proveedores - FabriFlow" },
    {
      name: "description",
      content: "Administra información y relaciones con proveedores",
    },
  ];
};

// Tipo para proveedor agregado
interface ProviderSummary {
  rfc: string;
  nombre: string;
  facturas: number;
  totalMXN: number;
  totalUSD: number;
  ultimaFactura: string;
  estados: {
    pendiente: number;
    recibido: number;
    pagado: number;
    completado: number;
    rechazado: number;
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({
      providers: [] as ProviderSummary[],
      error: "Sesión inválida",
      user,
    });
  }

  try {
    // Obtener todas las facturas para extraer proveedores únicos
    const response = await fetchAllInvoices(session.accessToken, user.company, { limit: 1000 });
    const invoices = response.data;

    // Agrupar por proveedor (RFC)
    const providerMap = new Map<string, ProviderSummary>();

    for (const invoice of invoices) {
      const rfc = invoice.rfcEmisor;

      if (!providerMap.has(rfc)) {
        providerMap.set(rfc, {
          rfc,
          nombre: invoice.nombreEmisor,
          facturas: 0,
          totalMXN: 0,
          totalUSD: 0,
          ultimaFactura: invoice.fechaEmision,
          estados: { pendiente: 0, recibido: 0, pagado: 0, completado: 0, rechazado: 0 },
        });
      }

      const provider = providerMap.get(rfc)!;
      provider.facturas++;

      if (invoice.moneda === "USD") {
        provider.totalUSD += invoice.total;
      } else {
        provider.totalMXN += invoice.total;
      }

      // Contar estados
      const estado = invoice.estado.toLowerCase() as keyof typeof provider.estados;
      if (provider.estados[estado] !== undefined) {
        provider.estados[estado]++;
      }

      // Actualizar última factura si es más reciente
      if (invoice.fechaEmision > provider.ultimaFactura) {
        provider.ultimaFactura = invoice.fechaEmision;
      }
    }

    const providers = Array.from(providerMap.values())
      .sort((a, b) => b.totalMXN + b.totalUSD - (a.totalMXN + a.totalUSD));

    return json({ providers, error: null, user });
  } catch (error) {
    console.error("Providers loader error:", error);
    return json({
      providers: [] as ProviderSummary[],
      user,
      error: "Error al cargar proveedores",
    });
  }
}

export default function Providers() {
  const { providers, error } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtros
  const [searchFilter, setSearchFilter] = useState(searchParams.get("search") || "");
  const [estadoFilter, setEstadoFilter] = useState(searchParams.get("estado") || "all");

  // Detail dialog
  const [selectedProvider, setSelectedProvider] = useState<ProviderSummary | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Aplicar filtros localmente
  const filteredProviders = providers.filter(provider => {
    const matchesSearch = !searchFilter ||
      provider.nombre.toLowerCase().includes(searchFilter.toLowerCase()) ||
      provider.rfc.toLowerCase().includes(searchFilter.toLowerCase());

    const matchesEstado = estadoFilter === "all" ||
      (estadoFilter === "con_pendientes" && provider.estados.pendiente > 0) ||
      (estadoFilter === "sin_pendientes" && provider.estados.pendiente === 0);

    return matchesSearch && matchesEstado;
  });

  const clearFilters = useCallback(() => {
    setSearchFilter("");
    setEstadoFilter("all");
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const hasActiveFilters = searchFilter || estadoFilter !== "all";

  // Stats
  const totalProveedores = filteredProviders.length;
  const totalMXN = filteredProviders.reduce((sum, p) => sum + p.totalMXN, 0);
  const totalUSD = filteredProviders.reduce((sum, p) => sum + p.totalUSD, 0);
  const totalFacturas = filteredProviders.reduce((sum, p) => sum + p.facturas, 0);

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

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-7rem)] flex flex-col gap-3">
        {/* Header compacto con stats inline */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-semibold">Proveedores</h2>
            {/* Stats inline */}
            <div className="hidden md:flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Proveedores:</span>
                <span className="font-semibold">{totalProveedores}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Facturas:</span>
                <span className="font-semibold">{totalFacturas}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">MXN:</span>
                <span className="font-semibold text-primary">
                  ${totalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {totalUSD > 0 && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">USD:</span>
                    <span className="font-semibold text-green-600">
                      ${totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => revalidator.revalidate()}
              disabled={revalidator.state === "loading"}
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${revalidator.state === "loading" ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filtros compactos */}
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <div className="relative min-w-[200px] max-w-[300px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o RFC..."
              className="pl-8 h-9"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>

          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="con_pendientes">Con pendientes</SelectItem>
              <SelectItem value="sin_pendientes">Sin pendientes</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Tabla */}
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="h-10 text-xs font-semibold">Proveedor</TableHead>
                  <TableHead className="h-10 text-xs font-semibold w-[130px]">RFC</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-center w-[80px]">Facturas</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-right w-[130px]">Total MXN</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-right w-[120px]">Total USD</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-center w-[100px]">Pendientes</TableHead>
                  <TableHead className="h-10 text-xs font-semibold w-[100px]">Última</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProviders.map((provider) => (
                  <TableRow
                    key={provider.rfc}
                    className="group cursor-pointer hover:bg-muted/50"
                    onDoubleClick={() => {
                      setSelectedProvider(provider);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="font-medium text-sm truncate max-w-[250px]">
                          {provider.nombre}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className="font-mono text-xs text-muted-foreground">{provider.rfc}</span>
                    </TableCell>
                    <TableCell className="py-2.5 text-center">
                      <span className="text-sm font-medium">{provider.facturas}</span>
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <span className="font-semibold text-sm tabular-nums">
                        ${provider.totalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                      {provider.totalUSD > 0
                        ? `$${provider.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "-"
                      }
                    </TableCell>
                    <TableCell className="py-2.5 text-center">
                      {provider.estados.pendiente > 0 ? (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {provider.estados.pendiente}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm tabular-nums text-muted-foreground">
                      {new Date(provider.ultimaFactura).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short"
                      })}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProviders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                      <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No se encontraron proveedores</p>
                      <p className="text-sm mt-1">
                        {providers.length === 0
                          ? "Aún no hay facturas registradas"
                          : "Intenta ajustar los filtros de búsqueda"
                        }
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Provider Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="text-lg">{selectedProvider?.nombre}</span>
                <p className="text-sm font-normal text-muted-foreground mt-0.5 font-mono">
                  {selectedProvider?.rfc}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedProvider && (
            <div className="space-y-6 mt-4">
              {/* Resumen de montos */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Total MXN</span>
                  </div>
                  <p className="text-2xl font-bold">
                    ${selectedProvider.totalMXN.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Total USD</span>
                  </div>
                  <p className="text-2xl font-bold">
                    ${selectedProvider.totalUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Estadísticas de facturas */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Facturas ({selectedProvider.facturas})</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <div className="text-center p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                    <p className="text-lg font-bold text-yellow-600">{selectedProvider.estados.pendiente}</p>
                    <p className="text-xs text-muted-foreground">Pendiente</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-lg font-bold text-blue-600">{selectedProvider.estados.recibido}</p>
                    <p className="text-xs text-muted-foreground">Recibido</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-lg font-bold text-green-600">{selectedProvider.estados.pagado}</p>
                    <p className="text-xs text-muted-foreground">Pagado</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <p className="text-lg font-bold text-purple-600">{selectedProvider.estados.completado}</p>
                    <p className="text-xs text-muted-foreground">Completado</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <p className="text-lg font-bold text-red-600">{selectedProvider.estados.rechazado}</p>
                    <p className="text-xs text-muted-foreground">Rechazado</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Última actividad */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Última factura</span>
                <span className="font-medium">
                  {new Date(selectedProvider.ultimaFactura).toLocaleDateString("es-MX", {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                  })}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
