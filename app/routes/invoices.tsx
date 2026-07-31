import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator, useSearchParams, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/ui/badge";
import { Icon } from "~/components/ui/icon";
import { Toolbar } from "~/components/ui/toolbar";
import { DocStrip, type DocType } from "~/components/ui/doc-chip";
import { cn } from "~/lib/utils";
import { STATUS_TONE } from "~/lib/sample-data";
import { Search, RefreshCw, Filter, X } from "lucide-react";
import { requireUser, getAccessTokenFromSession, getFullSession } from "~/lib/session.server";
import { fetchInvoices, fetchAllInvoices } from "~/lib/api.server";
import type { InvoiceBackend, CursorPaginatedResponse, InvoiceStatus } from "~/types";
import { DataLoadError } from "~/components/ui/error-state";
import {
  TableLoadingSkeleton,
  StatsCardsLoadingSkeleton,
} from "~/components/ui/loading-state";
import { useNavigate } from "@remix-run/react";
import { useCallback, useEffect, useRef, useState } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Facturas - FabriFlow" },
    {
      name: "description",
      content: "Administra facturas, pagos y complementos",
    },
  ];
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  creada: "Creada",
  autorizada: "Autorizada",
  recibido: "Recibido",
  facturada: "Facturada",
  pagada: "Pagada",
  completada: "Completada",
  rechazada: "Rechazada",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({
      invoices: [] as InvoiceBackend[],
      nextCursor: null,
      hasMore: false,
      error: "Sesión inválida",
      user,
      isAdmin: false,
      isVendor: false,
    });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const folio = url.searchParams.get("folio") || undefined;
  const uuid = url.searchParams.get("uuid") || undefined;
  const estado = url.searchParams.get("estado") || undefined;
  const fechaDesde = url.searchParams.get("fechaDesde") || undefined;
  const fechaHasta = url.searchParams.get("fechaHasta") || undefined;

  // Detect role type
  const userRole = (user.role || "").toLowerCase().trim();
  const roleType =
    (userRole === "super admin" || userRole === "superadmin") ? "super_admin" :
    (userRole.includes("admin") || userRole.includes("administrador")) ? "admin" :
    (userRole.includes("proveedor") || userRole.includes("vendor")) ? "proveedor" :
    "unknown";

  const permissions = user.permissions || [];
  const hasFullAccess = permissions.includes("*");

  // Permission checks
  const isAdmin = roleType === "super_admin" || roleType === "admin" || hasFullAccess;
  const isVendor = roleType === "proveedor";

  try {
    const filters = {
      cursor,
      folio,
      uuid,
      estado,
      fechaEntradaDesde: fechaDesde,
      fechaEntradaHasta: fechaHasta,
      limit: 20,
    };

    // Admin sees all invoices, vendor sees only their own
    const response: CursorPaginatedResponse<InvoiceBackend> = isAdmin
      ? await fetchAllInvoices(session.accessToken, user.company, filters)
      : await fetchInvoices(session.accessToken, user.company, filters);

    return json({
      invoices: response.data,
      nextCursor: response.nextCursor,
      hasMore: response.hasMore,
      error: null,
      user,
      roleType,
      permissions,
      isAdmin,
      isVendor,
    });
  } catch (error) {
    console.error("Invoices loader error:", error);
    return json({
      invoices: [] as InvoiceBackend[],
      nextCursor: null,
      hasMore: false,
      error: "Error al cargar facturas. Por favor intenta de nuevo más tarde.",
      user,
      roleType: "unknown" as const,
      permissions: [] as string[],
      isAdmin: false,
      isVendor: false,
    });
  }
}

function inferDocs(inv: InvoiceBackend): DocType[] {
  const docs: DocType[] = [];

  // OC - Si la factura está vinculada a una orden de compra
  if (inv.purchaseOrder || inv.ordenCompraKey || inv.ordenCompraUrl) {
    docs.push("OC");
  }

  // FAC - La factura siempre está presente (XML/PDF)
  if (inv.pdfKey || inv.xmlKey || inv.pdfUrl || inv.xmlUrl) {
    docs.push("FAC");
  }

  // REM - Si hay factura vinculada a una orden (el flujo requiere REM)
  if (inv.purchaseOrder) {
    docs.push("REM");
  }

  // NC - Notas de crédito (si existen en el modelo)
  // TODO: Agregar cuando se implemente el modelo de notas de crédito

  // PAGO - Si el estado es "pagada" o "completada"
  if (inv.estado === "pagada" || inv.estado === "completada") {
    docs.push("PAGO");
  }

  // REP - Complementos de pago (siempre puede haber, independiente del estado)
  // El backend debe indicar si hay REPs vinculados
  // TODO: Agregar indicador desde el backend

  return docs;
}

export default function Invoices() {
  const { invoices, nextCursor, hasMore, error, user, isAdmin, isVendor } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();

  // Filter state
  const [folioFilter, setFolioFilter] = useState(searchParams.get("folio") || "");
  const [uuidFilter, setUuidFilter] = useState(searchParams.get("uuid") || "");
  const [proveedorFilter, setProveedorFilter] = useState(searchParams.get("proveedor") || "");
  const [estadoFilter, setEstadoFilter] = useState(searchParams.get("estado") || "all");
  const [fechaDesde, setFechaDesde] = useState(searchParams.get("fechaDesde") || "");
  const [fechaHasta, setFechaHasta] = useState(searchParams.get("fechaHasta") || "");

  // Helper para obtener el nombre que debe mostrarse (cliente si es vendor, proveedor si no)
  const getDisplayName = (invoice: InvoiceBackend) => {
    return isVendor ? invoice.nombreReceptor : invoice.nombreEmisor;
  };

  // Infinite scroll state
  const [allInvoices, setAllInvoices] = useState<InvoiceBackend[]>(invoices || []);
  const [currentCursor, setCurrentCursor] = useState<string | null>(nextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Reset invoices when filters change
  useEffect(() => {
    setAllInvoices(invoices || []);
    setCurrentCursor(nextCursor);
  }, [invoices, nextCursor]);

  // Auto-apply filters when estado changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const currentEstado = params.get("estado");

    if (estadoFilter === "all" && currentEstado) {
      // Remove estado filter if "all" is selected
      params.delete("estado");
      setSearchParams(params);
    } else if (estadoFilter !== "all" && estadoFilter !== currentEstado) {
      // Apply estado filter
      const newParams = new URLSearchParams(searchParams);
      newParams.set("estado", estadoFilter);
      setSearchParams(newParams);
    }
  }, [estadoFilter, searchParams, setSearchParams]);

  // Apply filters
  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (folioFilter) params.set("folio", folioFilter);
    if (uuidFilter) params.set("uuid", uuidFilter);
    if (proveedorFilter) params.set("proveedor", proveedorFilter);
    if (estadoFilter && estadoFilter !== "all") params.set("estado", estadoFilter);
    if (fechaDesde) params.set("fechaDesde", fechaDesde);
    if (fechaHasta) params.set("fechaHasta", fechaHasta);
    setSearchParams(params);
  }, [folioFilter, uuidFilter, proveedorFilter, estadoFilter, fechaDesde, fechaHasta, setSearchParams]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFolioFilter("");
    setUuidFilter("");
    setProveedorFilter("");
    setEstadoFilter("all");
    setFechaDesde("");
    setFechaHasta("");
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  // Check if any filter is active
  const hasActiveFilters = folioFilter || uuidFilter || proveedorFilter || (estadoFilter && estadoFilter !== "all") || fechaDesde || fechaHasta;

  // Load more invoices (infinite scroll)
  const loadMore = useCallback(async () => {
    if (!currentCursor || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const params = new URLSearchParams(searchParams);
    params.set("cursor", currentCursor);

    fetcher.load(`/invoices?${params.toString()}`);
  }, [currentCursor, isLoadingMore, hasMore, searchParams, fetcher]);

  // Handle fetcher data for infinite scroll
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const data = fetcher.data as ReturnType<typeof useLoaderData<typeof loader>>;
      if (data.invoices && data.invoices.length > 0) {
        setAllInvoices(prev => [...prev, ...data.invoices]);
        setCurrentCursor(data.nextCursor);
      }
      setIsLoadingMore(false);
    }
  }, [fetcher.data, fetcher.state]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // Calculate stats - separado por moneda para evitar sumar peras con manzanas
  const totalFacturas = allInvoices.length;

  // Total por moneda (para el toolbar summary)
  const totalMXN = allInvoices.filter(inv => inv.moneda === "MXN").reduce((sum, inv) => sum + inv.total, 0);
  const totalUSD = allInvoices.filter(inv => inv.moneda === "USD").reduce((sum, inv) => sum + inv.total, 0);
  const totalEUR = allInvoices.filter(inv => inv.moneda === "EUR").reduce((sum, inv) => sum + inv.total, 0);

  // Por pagar (recibido + facturada) por moneda
  const porPagarMXN = allInvoices
    .filter(inv => (inv.estado === "recibido" || inv.estado === "facturada") && inv.moneda === "MXN")
    .reduce((sum, inv) => sum + inv.total, 0);

  const porPagarUSD = allInvoices
    .filter(inv => (inv.estado === "recibido" || inv.estado === "facturada") && inv.moneda === "USD")
    .reduce((sum, inv) => sum + inv.total, 0);

  const porPagarEUR = allInvoices
    .filter(inv => (inv.estado === "recibido" || inv.estado === "facturada") && inv.moneda === "EUR")
    .reduce((sum, inv) => sum + inv.total, 0);

  // Total pagado por moneda
  const pagadoMXN = allInvoices
    .filter(inv => (inv.estado === "pagada" || inv.estado === "completada") && inv.moneda === "MXN")
    .reduce((sum, inv) => sum + inv.total, 0);

  const pagadoUSD = allInvoices
    .filter(inv => (inv.estado === "pagada" || inv.estado === "completada") && inv.moneda === "USD")
    .reduce((sum, inv) => sum + inv.total, 0);

  const pagadoEUR = allInvoices
    .filter(inv => (inv.estado === "pagada" || inv.estado === "completada") && inv.moneda === "EUR")
    .reduce((sum, inv) => sum + inv.total, 0);

  // Facturas sin documentación completa (sin OC o sin REM vinculado)
  const sinDocumentacion = allInvoices.filter(inv =>
    !inv.purchaseOrder && !inv.ordenCompraKey && !inv.ordenCompraUrl
  ).length;

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
      <div className="space-y-3">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-[20px] font-semibold text-ink">
              Facturas <em>CFDI</em>
            </h1>
            <p className="text-[12px] text-ink-3 mt-0.5">
              {isVendor
                ? "Sube y gestiona las facturas que has emitido a tus clientes."
                : "Recibe, valida y concilia facturas emitidas por tus proveedores."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => revalidator.revalidate()}
              disabled={revalidator.state === "loading"}
              aria-label="Actualizar"
            >
              <RefreshCw className={cn("h-4 w-4", revalidator.state === "loading" && "animate-spin")} />
            </Button>
            <Button variant="outline" size="sm" aria-label="Exportar">
              <Icon name="download" size={13} />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            {(() => {
              const canUploadInvoice =
                isVendor ||
                isAdmin ||
                (user?.permissions ?? []).some(
                  (p) =>
                    p === "invoices:create" ||
                    p === "invoices:manage" ||
                    p === "*",
                );
              return canUploadInvoice ? (
                <Button size="sm" onClick={() => navigate("/invoices/new")} variant="clay">
                  <Icon name="plus" size={13} />
                  Subir factura
                </Button>
              ) : null;
            })()}
          </div>
        </header>

        {/* KPIs - Información útil para decisiones */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {/* Total facturas */}
          <div className="bg-paper border border-line rounded-lg p-2.5">
            <div className="text-[9px] font-mono uppercase tracking-wider text-ink-3">Total</div>
            <div className="text-[18px] font-bold text-ink mt-0.5">{totalFacturas}</div>
            <div className="text-[9px] text-ink-3 mt-0.5">facturas</div>
          </div>

          {/* Por pagar - MXN */}
          {porPagarMXN > 0 && (
            <div className="bg-paper border border-clay/30 rounded-lg p-2.5">
              <div className="text-[9px] font-mono uppercase tracking-wider text-clay">Por pagar MXN</div>
              <div className="text-[16px] font-bold text-clay mt-0.5 font-mono">
                ${porPagarMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-clay/70 mt-0.5">recibido + facturada</div>
            </div>
          )}

          {/* Por pagar - USD */}
          {porPagarUSD > 0 && (
            <div className="bg-paper border border-clay/30 rounded-lg p-2.5">
              <div className="text-[9px] font-mono uppercase tracking-wider text-clay">Por pagar USD</div>
              <div className="text-[16px] font-bold text-clay mt-0.5 font-mono">
                ${porPagarUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-clay/70 mt-0.5">recibido + facturada</div>
            </div>
          )}

          {/* Por pagar - EUR */}
          {porPagarEUR > 0 && (
            <div className="bg-paper border border-clay/30 rounded-lg p-2.5">
              <div className="text-[9px] font-mono uppercase tracking-wider text-clay">Por pagar EUR</div>
              <div className="text-[16px] font-bold text-clay mt-0.5 font-mono">
                €{porPagarEUR.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-clay/70 mt-0.5">recibido + facturada</div>
            </div>
          )}

          {/* Pagado - MXN */}
          {pagadoMXN > 0 && (
            <div className="bg-paper border border-moss/30 rounded-lg p-2.5">
              <div className="text-[9px] font-mono uppercase tracking-wider text-moss">Pagado MXN</div>
              <div className="text-[16px] font-bold text-moss mt-0.5 font-mono">
                ${pagadoMXN.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-moss/70 mt-0.5">pagada + completada</div>
            </div>
          )}

          {/* Pagado - USD */}
          {pagadoUSD > 0 && (
            <div className="bg-paper border border-moss/30 rounded-lg p-2.5">
              <div className="text-[9px] font-mono uppercase tracking-wider text-moss">Pagado USD</div>
              <div className="text-[16px] font-bold text-moss mt-0.5 font-mono">
                ${pagadoUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-moss/70 mt-0.5">pagada + completada</div>
            </div>
          )}

          {/* Pagado - EUR */}
          {pagadoEUR > 0 && (
            <div className="bg-paper border border-moss/30 rounded-lg p-2.5">
              <div className="text-[9px] font-mono uppercase tracking-wider text-moss">Pagado EUR</div>
              <div className="text-[16px] font-bold text-moss mt-0.5 font-mono">
                €{pagadoEUR.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-moss/70 mt-0.5">pagada + completada</div>
            </div>
          )}

          {/* Sin documentación (alerta) */}
          {sinDocumentacion > 0 && (
            <div className="bg-paper border border-wine/30 rounded-lg p-2.5">
              <div className="text-[9px] font-mono uppercase tracking-wider text-wine">Sin OC</div>
              <div className="text-[18px] font-bold text-wine mt-0.5">{sinDocumentacion}</div>
              <div className="text-[9px] text-wine/70 mt-0.5">sin orden vinculada</div>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <Toolbar>
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
            <Input
              placeholder={isVendor ? "Buscar cliente…" : "Buscar proveedor…"}
              className="pl-8"
              value={proveedorFilter}
              onChange={(e) => setProveedorFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <Input
            placeholder="Folio"
            className="w-[110px]"
            value={folioFilter}
            onChange={(e) => setFolioFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
          <Input
            placeholder="UUID"
            className="w-[150px] font-mono text-[12px]"
            value={uuidFilter}
            onChange={(e) => setUuidFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="facturada">Facturada</SelectItem>
              <SelectItem value="pagada">Pagada</SelectItem>
              <SelectItem value="completada">Completada</SelectItem>
              <SelectItem value="rechazada">Rechazada</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="w-[140px]"
            title="Desde"
          />
          <Input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="w-[140px]"
            title="Hasta"
          />
          <Button onClick={applyFilters} size="sm" variant="outline">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filtrar
          </Button>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters} aria-label="Limpiar filtros">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
          <Toolbar.Spacer />
          <Toolbar.Summary>
            {(() => {
              const filteredCount = allInvoices.filter((invoice) => {
                if (proveedorFilter) {
                  const displayName = getDisplayName(invoice);
                  if (!displayName.toLowerCase().includes(proveedorFilter.toLowerCase())) {
                    return false;
                  }
                }
                return true;
              }).length;
              return `${filteredCount} resultado${filteredCount === 1 ? "" : "s"}`;
            })()}
            {totalMXN > 0 && <> · ${totalMXN.toLocaleString("es-MX", { minimumFractionDigits: 0 })} MXN</>}
            {totalUSD > 0 && <> · ${totalUSD.toLocaleString("en-US", { minimumFractionDigits: 0 })} USD</>}
            {totalEUR > 0 && <> · €{totalEUR.toLocaleString("es-MX", { minimumFractionDigits: 0 })} EUR</>}
          </Toolbar.Summary>
        </Toolbar>

        {/* Lista de facturas - Diseño mejorado con más información */}
        <div className="space-y-1.5 flex-1 overflow-y-auto">
          {(() => {
            // Aplicar filtro de proveedor/cliente (cliente-side)
            const filteredInvoices = allInvoices.filter((invoice) => {
              if (proveedorFilter) {
                const displayName = getDisplayName(invoice);
                if (!displayName.toLowerCase().includes(proveedorFilter.toLowerCase())) {
                  return false;
                }
              }
              return true;
            });

            if (filteredInvoices.length === 0) {
              return (
                <div className="bg-paper border border-line rounded-lg p-14 text-center">
                  <Icon name="file" size={40} className="mx-auto mb-3 text-ink-4" />
                  <div className="text-[14px] font-medium text-ink-2">No se encontraron facturas</div>
                  <div className="text-[12px] text-ink-3 mt-1">
                    Intenta ajustar los filtros de búsqueda
                  </div>
                </div>
              );
            }

            return filteredInvoices.map((invoice) => {
              // Calcular saldo (pendiente por pagar)
              // Por ahora usamos el total como saldo si el estado no es pagada/completada
              const isPaid = invoice.estado === "pagada" || invoice.estado === "completada";
              const saldo = isPaid ? 0 : invoice.total;

              return (
                <div
                  key={invoice.id}
                  className="cursor-pointer transition-all rounded-md border bg-paper border-line hover:border-clay/40 hover:shadow-sm"
                  onClick={() => {
                    const qs = searchParams.toString();
                    navigate(qs ? `/invoice/${invoice.id}?${qs}` : `/invoice/${invoice.id}`);
                  }}
                >
                  <div className="flex items-start gap-4 px-4 py-3">
                    {/* Avatar + Proveedor/Cliente - Más prominente */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-[2]">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-clay-soft text-clay-deep font-display text-[13px] font-semibold flex-shrink-0">
                        {getDisplayName(invoice).slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[15px] text-ink truncate" title={getDisplayName(invoice)}>
                          {getDisplayName(invoice)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                          <span className="font-mono text-ink-3" title={`UUID: ${invoice.uuid}`}>
                            {invoice.uuid}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Folio - Más grande */}
                    <div className="shrink-0">
                      <div className="text-[11px] text-ink-3 mb-0.5">Folio</div>
                      <div className="font-mono text-[15px] font-bold text-ink">
                        {invoice.folio}
                      </div>
                    </div>

                    {/* Condiciones de pago */}
                    {invoice.condicionesPago && (
                      <div className="shrink-0">
                        <div className="text-[11px] text-ink-3 mb-0.5">Condiciones</div>
                        <div className="text-[13px] font-medium text-ink">
                          {invoice.condicionesPago}
                        </div>
                      </div>
                    )}

                    {/* Fechas */}
                    <div className="shrink-0">
                      <div className="text-[11px] text-ink-3 mb-0.5">F. Emisión</div>
                      <div className="text-[13px] font-medium text-ink">
                        {(() => {
                          const d = new Date(invoice.fechaEmision);
                          const day = d.getDate().toString().padStart(2, '0');
                          const month = (d.getMonth() + 1).toString().padStart(2, '0');
                          const year = d.getFullYear();
                          return `${day}/${month}/${year}`;
                        })()}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <div className="text-[11px] text-ink-3 mb-0.5">F. Carga</div>
                      <div className="text-[13px] font-medium text-ink">
                        {(() => {
                          const d = new Date(invoice.createdAt);
                          const day = d.getDate().toString().padStart(2, '0');
                          const month = (d.getMonth() + 1).toString().padStart(2, '0');
                          const year = d.getFullYear();
                          return `${day}/${month}/${year}`;
                        })()}
                      </div>
                    </div>

                    {/* Estado - Más prominente */}
                    <div className="shrink-0">
                      {(() => {
                        const statusLabel = STATUS_LABEL[invoice.estado] ?? invoice.estado;
                        const tone = STATUS_TONE[statusLabel] ?? "ink";
                        return (
                          <Badge tone={tone} className="text-[12px] px-3 py-1.5 font-medium">
                            {statusLabel}
                          </Badge>
                        );
                      })()}
                    </div>

                    {/* Documentos */}
                    <div className="shrink-0 w-[200px]">
                      <div className="text-[11px] text-ink-3 mb-0.5">Docs</div>
                      <DocStrip docs={inferDocs(invoice)} />
                    </div>

                    {/* Botón para subir complemento (solo si está facturada o pagada) */}
                    {(invoice.estado === "facturada" || invoice.estado === "pagada") && (
                      <div className="shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/invoice/${invoice.id}/upload-doc?kind=comppago`);
                          }}
                          className="text-[11px] h-7 px-2"
                          title="Subir complemento de pago (REP)"
                        >
                          <Icon name="upload" size={12} className="mr-1" />
                          REP
                        </Button>
                      </div>
                    )}

                    {/* Total */}
                    <div className="shrink-0">
                      <div className="text-[11px] text-ink-3 mb-0.5">Total</div>
                      <div className="font-mono text-[14px] font-semibold text-ink">
                        ${invoice.total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[12px] text-ink-3 font-medium mt-0.5">
                        {invoice.moneda}
                      </div>
                    </div>

                    {/* Tipo de cambio - Solo para moneda extranjera */}
                    {invoice.moneda !== "MXN" && (
                      <div className="shrink-0">
                        <div className="text-[11px] text-ink-3 mb-0.5">T/C</div>
                        <div className="font-mono text-[14px] font-semibold text-ink">
                          {invoice.tipoCambio ? invoice.tipoCambio.toFixed(4) : "—"}
                        </div>
                      </div>
                    )}

                    {/* Saldo pendiente */}
                    <div className="shrink-0 ml-auto">
                      <div className="text-[11px] text-ink-3 mb-0.5">Saldo</div>
                      <div className="font-mono text-[14px] font-semibold">
                        {isPaid ? (
                          <span className="text-green-600">$0.00</span>
                        ) : (
                          <span className="text-orange-600">
                            ${saldo.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          })()}

          {hasMore && (
            <div ref={loadMoreRef} className="py-3 text-center">
              {isLoadingMore && (
                <div className="flex items-center justify-center gap-2 text-[12px] text-ink-3">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Cargando más…
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </AuthLayout>
  );
}
