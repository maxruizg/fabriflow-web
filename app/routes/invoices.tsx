import type { MetaFunction, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator, useSearchParams, useSubmit, useFetcher } from "@remix-run/react";
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
import { TabsCount } from "~/components/ui/tabs";
import { DocStrip, type DocType } from "~/components/ui/doc-chip";
import { statusTone, statusLabel, cn } from "~/lib/utils";
import { Search, FileText, Download, RefreshCw, Filter, X, Plus, Calendar, Building2, Hash, DollarSign, FileCheck, ExternalLink, File } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Separator } from "~/components/ui/separator";
import { requireUser, getAccessTokenFromSession, getFullSession } from "~/lib/session.server";
import { fetchInvoices, fetchAllInvoices, updateInvoiceStatus } from "~/lib/api.server";
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

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({ success: false, error: "Sesión inválida" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateStatus") {
    const invoiceId = formData.get("invoiceId") as string;
    const newStatus = formData.get("status") as InvoiceStatus;

    if (!invoiceId || !newStatus) {
      return json({ success: false, error: "Datos incompletos" }, { status: 400 });
    }

    try {
      await updateInvoiceStatus(session.accessToken, user.company, invoiceId, newStatus);
      return json({ success: true });
    } catch (error) {
      console.error("Error updating status:", error);
      return json({ success: false, error: "Error al actualizar estado" }, { status: 500 });
    }
  }

  return json({ success: false, error: "Acción no válida" }, { status: 400 });
}

function inferDocs(inv: InvoiceBackend): DocType[] {
  const docs: DocType[] = [];
  if (inv.ordenCompraUrl) docs.push("OC");
  if (inv.xmlUrl || inv.pdfUrl) docs.push("FAC");
  return docs;
}

export default function Invoices() {
  const { invoices, nextCursor, hasMore, error, user, isAdmin, isVendor } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const submit = useSubmit();
  const fetcher = useFetcher();

  // Filter state
  const [folioFilter, setFolioFilter] = useState(searchParams.get("folio") || "");
  const [uuidFilter, setUuidFilter] = useState(searchParams.get("uuid") || "");
  const [proveedorFilter, setProveedorFilter] = useState(searchParams.get("proveedor") || "");
  const [estadoFilter, setEstadoFilter] = useState(searchParams.get("estado") || "all");
  const [fechaDesde, setFechaDesde] = useState(searchParams.get("fechaDesde") || "");
  const [fechaHasta, setFechaHasta] = useState(searchParams.get("fechaHasta") || "");

  // Detail dialog state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceBackend | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "document" | "details">("split");

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
      const data = fetcher.data as typeof useLoaderData<typeof loader>;
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

  // Handle status change
  const handleStatusChange = (invoiceId: string, newStatus: string) => {
    const formData = new FormData();
    formData.set("intent", "updateStatus");
    formData.set("invoiceId", invoiceId);
    formData.set("status", newStatus);
    submit(formData, { method: "post" });
  };

  // Calculate stats
  const totalFacturas = allInvoices.length;
  const montoTotal = allInvoices.reduce((sum, inv) => sum + inv.total, 0);
  const montoPendiente = allInvoices
    .filter(inv => inv.estado === "pendiente" || inv.estado === "recibido")
    .reduce((sum, inv) => sum + inv.total, 0);

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
      <div className="space-y-5">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Facturas <em>CFDI</em>
            </h1>
            <p className="ff-page-sub">
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
            {(isVendor || user?.permissions?.includes("invoices:create")) ? (
              <Button size="sm" onClick={() => navigate("/invoices/new")} variant="clay">
                <Icon name="plus" size={13} />
                Subir factura
              </Button>
            ) : null}
          </div>
        </header>

        {/* Inline KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="ff-stat">
            <div className="ff-stat-label">Total</div>
            <div className="ff-stat-val ff-num">{totalFacturas}</div>
            <div className="text-[11px] text-ink-3 mt-2 font-mono">
              Facturas en la lista actual
            </div>
          </div>
          <div className="ff-stat">
            <div className="ff-stat-label">Importe total</div>
            <div className="ff-stat-val ff-num">
              <span className="text-[18px] italic text-ink-3 mr-1">$</span>
              {montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-ink-3 mt-2 font-mono">MXN equivalente</div>
          </div>
          <div className="ff-stat">
            <div className="ff-stat-label">Pendiente</div>
            <div className="ff-stat-val ff-num">
              <span className="text-[18px] italic text-ink-3 mr-1">$</span>
              {montoPendiente.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-rust-deep mt-2 font-mono">
              · Pendiente + recibido
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <Toolbar>
          <div className="relative min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-3" />
            <Input
              placeholder="Buscar proveedor…"
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
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="recibido">Recibido</SelectItem>
              <SelectItem value="pagado">Pagado</SelectItem>
              <SelectItem value="completado">Completado</SelectItem>
              <SelectItem value="rechazado">Rechazado</SelectItem>
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
            {allInvoices.length} resultados · ${montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 0 })} MXN
          </Toolbar.Summary>
        </Toolbar>

        {/* Table */}
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="w-[110px]">Folio</TableHead>
                  <TableHead className="w-[140px]">UUID</TableHead>
                  <TableHead className="w-[80px]">Docs</TableHead>
                  <TableHead className="w-[100px]">Fecha</TableHead>
                  <TableHead className="w-[120px] text-right">Subtotal</TableHead>
                  <TableHead className="w-[140px] text-right">Total</TableHead>
                  <TableHead className="w-[140px]">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allInvoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer hover:bg-ink-5/50 transition-colors"
                    onClick={() => {
                      setSelectedInvoice(invoice);
                      setIsDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-clay-soft text-clay-deep font-display text-[12px] font-semibold flex-shrink-0">
                          {invoice.nombreEmisor.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[13px] truncate max-w-[220px]">
                            {invoice.nombreEmisor}
                          </p>
                          <p className="font-mono text-[11px] text-ink-3">{invoice.rfcEmisor}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[12px]">{invoice.folio}</TableCell>
                    <TableCell>
                      <span
                        className="font-mono text-[11px] text-ink-3"
                        title={invoice.uuid}
                      >
                        {invoice.uuid.slice(0, 8)}…{invoice.uuid.slice(-4)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DocStrip docs={inferDocs(invoice)} />
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-ink-3">
                      {new Date(invoice.fechaEmision).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-ink-3 text-[12px]">
                      ${invoice.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-medium text-[13px]">
                        ${invoice.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="ml-1 font-mono text-[10px] text-ink-3">
                        {invoice.moneda}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Select
                          value={invoice.estado}
                          onValueChange={(value) => handleStatusChange(invoice.id, value)}
                        >
                          <SelectTrigger
                            className="w-[140px] h-8 text-[12px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Badge tone={statusTone(invoice.estado)}>
                              {statusLabel(invoice.estado)}
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
                        <Badge tone={statusTone(invoice.estado)}>
                          {statusLabel(invoice.estado)}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {allInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-14">
                      <Icon
                        name="file"
                        size={32}
                        className="mx-auto mb-3 text-ink-4"
                      />
                      <p className="font-medium text-[13px] text-ink-2">
                        No se encontraron facturas
                      </p>
                      <p className="text-[11px] text-ink-3 mt-1">
                        Intenta ajustar los filtros de búsqueda
                      </p>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>

            {hasMore ? (
              <div ref={loadMoreRef} className="py-3 text-center">
                {isLoadingMore ? (
                  <div className="flex items-center justify-center gap-2 text-[12px] text-ink-3">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Cargando más…
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Invoice Detail Dialog - Improved UI/UX */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-7xl h-[90vh] p-0 overflow-hidden flex flex-col gap-0">
          {/* Header */}
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-line bg-paper">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-clay-soft flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-clay" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-[18px] font-semibold">
                    Factura {selectedInvoice?.folio}
                  </DialogTitle>
                  <p className="text-[13px] text-ink-3 mt-0.5 truncate max-w-[400px]">
                    {selectedInvoice?.nombreEmisor}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selectedInvoice ? (
                  <Badge tone={statusTone(selectedInvoice.estado)}>
                    {statusLabel(selectedInvoice.estado)}
                  </Badge>
                ) : null}
                {/* View Mode Toggles */}
                <div className="flex items-center gap-1 ml-3 border border-line rounded-lg p-1">
                  <Button
                    variant={viewMode === "split" ? "clay" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("split")}
                    className="h-7 px-2 text-[11px]"
                    title="Vista combinada"
                  >
                    <Icon name="grid" size={12} className="mr-1" />
                    Combinada
                  </Button>
                  <Button
                    variant={viewMode === "document" ? "clay" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("document")}
                    className="h-7 px-2 text-[11px]"
                    title="Solo documento"
                  >
                    <Icon name="file" size={12} className="mr-1" />
                    Documento
                  </Button>
                  <Button
                    variant={viewMode === "details" ? "clay" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("details")}
                    className="h-7 px-2 text-[11px]"
                    title="Solo detalles"
                  >
                    <Icon name="list" size={12} className="mr-1" />
                    Detalles
                  </Button>
                </div>
              </div>
            </div>
          </DialogHeader>

          {selectedInvoice && (
            <div className="flex-1 min-h-0 overflow-hidden">
              {/* Split View */}
              {viewMode === "split" && (
                <div className="h-full grid grid-cols-2 gap-0 divide-x divide-line">
                  {/* Left: PDF Viewer */}
                  <div className="h-full overflow-hidden flex flex-col bg-ink-5">
                    <div className="flex-shrink-0 px-4 py-2 bg-paper border-b border-line">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-medium text-ink-2">Documento PDF</span>
                        {selectedInvoice.pdfUrl && (
                          <Button variant="ghost" size="sm" className="h-7 text-[11px]" asChild>
                            <a href={selectedInvoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Abrir en nueva pestaña
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      {selectedInvoice.pdfUrl ? (
                        <iframe
                          src={selectedInvoice.pdfUrl}
                          className="w-full h-full border-0"
                          title={`PDF de ${selectedInvoice.folio}`}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center text-ink-3">
                            <File className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="font-medium text-[13px]">No hay PDF disponible</p>
                            <p className="text-[11px] mt-1">Esta factura no tiene documento adjunto</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Details */}
                  <div className="h-full overflow-auto">
                    <div className="p-6 space-y-6">
                      {/* Quick Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-clay-bg border border-clay rounded-lg">
                          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1">Total</p>
                          <p className="text-[24px] font-bold text-clay font-mono">
                            ${selectedInvoice.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                            <span className="text-[14px] font-normal text-ink-3 ml-1">{selectedInvoice.moneda}</span>
                          </p>
                        </div>
                        <div className="p-4 bg-ink-5 rounded-lg">
                          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1">Fecha</p>
                          <p className="text-[14px] font-medium text-ink">
                            {new Date(selectedInvoice.fechaEmision).toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "long",
                              year: "numeric"
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Emisor / Receptor */}
                      <div className="space-y-3">
                        <h4 className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Partes</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-ink-5 rounded-lg">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-1">Emisor</p>
                            <p className="font-medium text-[13px] text-ink">{selectedInvoice.nombreEmisor}</p>
                            <p className="text-[11px] font-mono text-ink-3 mt-0.5">{selectedInvoice.rfcEmisor}</p>
                          </div>
                          <div className="p-3 bg-ink-5 rounded-lg">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-1">Receptor</p>
                            <p className="font-medium text-[13px] text-ink">{selectedInvoice.nombreReceptor}</p>
                            <p className="text-[11px] font-mono text-ink-3 mt-0.5">{selectedInvoice.rfcReceptor}</p>
                          </div>
                        </div>
                      </div>

                      {/* UUID */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">UUID Fiscal</p>
                        <p className="font-mono text-[11px] text-ink-2 bg-ink-5 p-2 rounded break-all">
                          {selectedInvoice.uuid}
                        </p>
                      </div>

                      {/* Conceptos */}
                      {selectedInvoice.detalles && selectedInvoice.detalles.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
                            Conceptos ({selectedInvoice.detalles.length})
                          </h4>
                          <div className="border border-line rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-ink-5">
                                  <TableHead className="text-[10px] font-mono">Descripción</TableHead>
                                  <TableHead className="text-[10px] font-mono text-right w-[60px]">Cant.</TableHead>
                                  <TableHead className="text-[10px] font-mono text-right w-[100px]">Importe</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedInvoice.detalles.map((detalle, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="text-[12px]">
                                      <p className="font-medium truncate">{detalle.descripcion}</p>
                                      <p className="text-[10px] text-ink-3">{detalle.unidad}</p>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-[12px]">
                                      {detalle.cantidad}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums font-medium text-[12px]">
                                      ${detalle.importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="space-y-2 pt-4 border-t border-line">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-2">Acciones</p>
                        <div className="grid grid-cols-2 gap-2">
                          {selectedInvoice.pdfUrl && (
                            <Button variant="outline" size="sm" className="justify-start" asChild>
                              <a href={selectedInvoice.pdfUrl} target="_blank" rel="noopener noreferrer" download>
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Descargar PDF
                              </a>
                            </Button>
                          )}
                          {selectedInvoice.xmlUrl && (
                            <Button variant="outline" size="sm" className="justify-start" asChild>
                              <a href={selectedInvoice.xmlUrl} target="_blank" rel="noopener noreferrer" download>
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Descargar XML
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Document Only View */}
              {viewMode === "document" && (
                <div className="h-full flex flex-col bg-ink-5">
                  <div className="flex-shrink-0 px-6 py-3 bg-paper border-b border-line flex items-center justify-between">
                    <span className="text-[13px] font-medium text-ink">Documento PDF</span>
                    {selectedInvoice.pdfUrl && (
                      <Button variant="ghost" size="sm" className="h-8" asChild>
                        <a href={selectedInvoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                          Abrir en nueva pestaña
                        </a>
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {selectedInvoice.pdfUrl ? (
                      <iframe
                        src={selectedInvoice.pdfUrl}
                        className="w-full h-full border-0"
                        title={`PDF de ${selectedInvoice.folio}`}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center text-ink-3">
                          <File className="h-16 w-16 mx-auto mb-4 opacity-40" />
                          <p className="font-medium text-[14px]">No hay PDF disponible</p>
                          <p className="text-[12px] mt-1">Esta factura no tiene documento adjunto</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Details Only View */}
              {viewMode === "details" && (
                <div className="h-full overflow-auto">
                  <div className="p-8 max-w-4xl mx-auto space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-5 bg-clay-bg border border-clay rounded-lg">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1.5">Total</p>
                        <p className="text-[28px] font-bold text-clay font-mono leading-none">
                          ${selectedInvoice.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[12px] text-ink-3 mt-1">{selectedInvoice.moneda}</p>
                      </div>
                      <div className="p-5 bg-ink-5 rounded-lg">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1.5">Subtotal</p>
                        <p className="text-[18px] font-semibold text-ink font-mono">
                          ${selectedInvoice.subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="p-5 bg-ink-5 rounded-lg">
                        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1.5">Folio</p>
                        <p className="text-[18px] font-semibold text-ink font-mono">{selectedInvoice.folio}</p>
                      </div>
                    </div>

                    {/* Emisor / Receptor */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-5 bg-ink-5 rounded-lg">
                        <h4 className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-3">Emisor</h4>
                        <p className="font-semibold text-[15px] text-ink">{selectedInvoice.nombreEmisor}</p>
                        <p className="text-[12px] font-mono text-ink-3 mt-1">{selectedInvoice.rfcEmisor}</p>
                      </div>
                      <div className="p-5 bg-ink-5 rounded-lg">
                        <h4 className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-3">Receptor</h4>
                        <p className="font-semibold text-[15px] text-ink">{selectedInvoice.nombreReceptor}</p>
                        <p className="text-[12px] font-mono text-ink-3 mt-1">{selectedInvoice.rfcReceptor}</p>
                      </div>
                    </div>

                    {/* Fechas y UUID */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1.5">Fecha Emisión</p>
                          <p className="text-[13px] font-medium text-ink">
                            {new Date(selectedInvoice.fechaEmision).toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "long",
                              year: "numeric"
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1.5">Fecha Entrada</p>
                          <p className="text-[13px] font-medium text-ink">
                            {new Date(selectedInvoice.fechaEntrada).toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "long",
                              year: "numeric"
                            })}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-1.5">UUID Fiscal</p>
                        <p className="font-mono text-[11px] text-ink-2 bg-ink-5 p-3 rounded break-all">
                          {selectedInvoice.uuid}
                        </p>
                      </div>
                    </div>

                    {/* Conceptos */}
                    {selectedInvoice.detalles && selectedInvoice.detalles.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
                          Conceptos ({selectedInvoice.detalles.length})
                        </h4>
                        <div className="border border-line rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-ink-5">
                                <TableHead className="text-[11px] font-mono">Descripción</TableHead>
                                <TableHead className="text-[11px] font-mono text-center w-[80px]">Unidad</TableHead>
                                <TableHead className="text-[11px] font-mono text-right w-[80px]">Cant.</TableHead>
                                <TableHead className="text-[11px] font-mono text-right w-[120px]">P. Unit.</TableHead>
                                <TableHead className="text-[11px] font-mono text-right w-[120px]">Importe</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedInvoice.detalles.map((detalle, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="text-[13px] font-medium">{detalle.descripcion}</TableCell>
                                  <TableCell className="text-center text-[12px] text-ink-3">{detalle.unidad}</TableCell>
                                  <TableCell className="text-right tabular-nums text-[13px]">{detalle.cantidad}</TableCell>
                                  <TableCell className="text-right tabular-nums text-[13px]">
                                    ${detalle.precioUnitario.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums font-semibold text-[13px]">
                                    ${detalle.importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {/* Documentos */}
                    <div className="space-y-3 pt-4 border-t border-line">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Documentos disponibles</p>
                      <div className="grid grid-cols-2 gap-3">
                        {selectedInvoice.pdfUrl && (
                          <Button variant="outline" className="justify-start h-auto p-4" asChild>
                            <a href={selectedInvoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <div className="flex items-center gap-3 w-full">
                                <div className="h-10 w-10 rounded-lg bg-wine-soft flex items-center justify-center flex-shrink-0">
                                  <File className="h-5 w-5 text-wine" />
                                </div>
                                <div className="flex-1 text-left">
                                  <p className="font-medium text-[13px]">Factura PDF</p>
                                  <p className="text-[11px] text-ink-3">Representación impresa</p>
                                </div>
                                <Download className="h-4 w-4 text-ink-3" />
                              </div>
                            </a>
                          </Button>
                        )}
                        {selectedInvoice.xmlUrl && (
                          <Button variant="outline" className="justify-start h-auto p-4" asChild>
                            <a href={selectedInvoice.xmlUrl} target="_blank" rel="noopener noreferrer">
                              <div className="flex items-center gap-3 w-full">
                                <div className="h-10 w-10 rounded-lg bg-moss-soft flex items-center justify-center flex-shrink-0">
                                  <FileText className="h-5 w-5 text-moss" />
                                </div>
                                <div className="flex-1 text-left">
                                  <p className="font-medium text-[13px]">CFDI XML</p>
                                  <p className="text-[11px] text-ink-3">Comprobante fiscal</p>
                                </div>
                                <Download className="h-4 w-4 text-ink-3" />
                              </div>
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
