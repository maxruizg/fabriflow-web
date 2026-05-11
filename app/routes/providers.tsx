import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import {
  useFetcher,
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Separator } from "~/components/ui/separator";
import { Icon } from "~/components/ui/icon";
import { Building2, RefreshCw, UserPlus } from "lucide-react";
import {
  getAccessTokenFromSession,
  requireUser,
  getFullSession,
} from "~/lib/session.server";
import { fetchAllInvoices, sendVendorInvite } from "~/lib/api.server";
import { fetchActiveVendors } from "~/lib/procurement-api.server";
import type { InvoiceBackend } from "~/types";
import { DataLoadError } from "~/components/ui/error-state";
import { cn } from "~/lib/utils";
import { useEffect, useState, useCallback } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "Proveedores — FabriFlow" },
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
    // Cargamos en paralelo: facturas (para agregados $/conteos por RFC) y
    // vendors registrados (para incluir proveedores activos sin facturación
    // todavía — p.ej. recién aceptaron una invitación). Si fetchActiveVendors
    // falla no rompemos la página: caemos al directorio histórico de facturas.
    const [invoiceResp, activeVendors] = await Promise.all([
      fetchAllInvoices(session.accessToken, user.company, { limit: 1000 }),
      fetchActiveVendors(session.accessToken, user.company).catch((e) => {
        console.error("[providers] fetchActiveVendors failed:", e);
        return [] as Awaited<ReturnType<typeof fetchActiveVendors>>;
      }),
    ]);
    const invoices = invoiceResp.data;

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

    // Mezclar proveedores activos sin facturación todavía. RFC es la llave
    // canónica del agregado por facturas (rfcEmisor) y también del vendor.
    for (const vendor of activeVendors) {
      const rfc = vendor.rfc?.toUpperCase();
      if (!rfc || providerMap.has(rfc)) continue;
      providerMap.set(rfc, {
        rfc,
        nombre: vendor.name,
        facturas: 0,
        totalMXN: 0,
        totalUSD: 0,
        ultimaFactura: "",
        estados: { pendiente: 0, recibido: 0, pagado: 0, completado: 0, rechazado: 0 },
      });
    }

    const providers = Array.from(providerMap.values()).sort((a, b) => {
      // Proveedores con facturación primero, ordenados por monto total. Los
      // recién registrados (sin facturas) caen al final, alfabéticamente.
      const aBilled = a.facturas > 0;
      const bBilled = b.facturas > 0;
      if (aBilled !== bBilled) return aBilled ? -1 : 1;
      const aTotal = a.totalMXN + a.totalUSD;
      const bTotal = b.totalMXN + b.totalUSD;
      if (aTotal !== bTotal) return bTotal - aTotal;
      return a.nombre.localeCompare(b.nombre);
    });

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

type InviteActionData =
  | { ok: true; shareLink: string; expiresAt: string }
  | { ok: false; error: string };

export async function action({
  request,
}: ActionFunctionArgs): Promise<ReturnType<typeof json<InviteActionData>>> {
  const user = await requireUser(request);
  const companyId = user.company;
  if (!companyId) {
    return json<InviteActionData>(
      { ok: false, error: "Selecciona una empresa antes de invitar proveedores." },
      { status: 400 },
    );
  }

  const accessToken = await getAccessTokenFromSession(request);
  if (!accessToken) {
    return json<InviteActionData>(
      { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent !== "invite-vendor") {
    return json<InviteActionData>({ ok: false, error: "Acción desconocida" }, { status: 400 });
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) {
    return json<InviteActionData>(
      { ok: false, error: "Ingresa un correo válido." },
      { status: 400 },
    );
  }

  try {
    const result = await sendVendorInvite(email, accessToken, companyId);
    return json<InviteActionData>({
      ok: true,
      shareLink: result.shareLink,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo enviar la invitación.";
    return json<InviteActionData>({ ok: false, error: message }, { status: 500 });
  }
}

// ---- helpers ----

function fmtMXN(n: number) {
  const [int, dec] = n.toFixed(2).split(".");
  return { int: int.replace(/\B(?=(\d{3})+(?!\d))/g, ","), dec };
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  } catch { return "—"; }
}

function fmtDateLong(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  } catch { return "—"; }
}

// ---- status tile for detail dialog ----

const STATUS_TILE_STYLES: Record<string, string> = {
  pendiente: "bg-rust-soft text-rust-deep",
  recibido: "bg-moss-soft text-moss-deep",
  pagado: "bg-moss-soft text-moss-deep",
  completado: "bg-paper-3 text-ink-2",
  rechazado: "bg-wine-soft text-wine",
};

interface StatusTileProps {
  count: number;
  label: string;
  tone: string;
}

function StatusTile({ count, label, tone }: StatusTileProps) {
  return (
    <div className={cn("text-center p-3 rounded-lg", tone)}>
      <p className="text-lg font-semibold font-mono">{count}</p>
      <p className="text-[11px] mt-0.5 opacity-80">{label}</p>
    </div>
  );
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

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);

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

  const mxn = fmtMXN(totalMXN);
  const usd = fmtMXN(totalUSD);

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

        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Proveedores <em>activos</em>
            </h1>
            <p className="ff-page-sub">
              Directorio de proveedores activos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="clay"
              size="sm"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Invitar proveedor
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => revalidator.revalidate()}
              disabled={revalidator.state === "loading"}
              title="Actualizar"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  revalidator.state === "loading" && "animate-spin",
                )}
              />
            </Button>
          </div>
        </header>

        {/* Inline summary strip */}
        <div className="hidden md:flex items-center gap-4 text-[12px] font-mono text-ink-3">
          <span>
            <span className="text-ink font-semibold">{totalProveedores}</span> proveedores
          </span>
          <span className="h-3 w-px bg-line-2" />
          <span>
            <span className="text-ink font-semibold">{totalFacturas}</span> facturas
          </span>
          <span className="h-3 w-px bg-line-2" />
          <span>
            MXN{" "}
            <span className="text-ink font-semibold">
              ${mxn.int}<span className="text-ink-3">.{mxn.dec}</span>
            </span>
          </span>
          {totalUSD > 0 && (
            <>
              <span className="h-3 w-px bg-line-2" />
              <span>
                USD{" "}
                <span className="text-moss-deep font-semibold">
                  ${usd.int}<span className="text-ink-3">.{usd.dec}</span>
                </span>
              </span>
            </>
          )}
        </div>

        {/* Filtros compactos */}
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <label className="inline-flex items-center gap-2 rounded-md border border-line-2 bg-paper px-3 py-1.5 min-w-[220px] focus-within:border-ink-3 transition-colors">
            <Icon name="search" size={14} className="text-ink-3 flex-shrink-0" />
            <input
              type="search"
              placeholder="Buscar por nombre o RFC…"
              className="flex-1 bg-transparent border-0 outline-0 text-[13px] text-ink placeholder:text-ink-4"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </label>

          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <Icon name="filter" size={12} className="text-ink-3 mr-1" />
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
              <Icon name="x" size={14} />
            </Button>
          )}
        </div>

        {/* Tabla */}
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Proveedor</TableHead>
                  <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-ink-3 w-[130px]">RFC</TableHead>
                  <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-ink-3 text-center w-[80px]">Facturas</TableHead>
                  <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-ink-3 text-right w-[140px]">Total MXN</TableHead>
                  <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-ink-3 text-right w-[130px]">Total USD</TableHead>
                  <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-ink-3 text-center w-[100px]">Pendientes</TableHead>
                  <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wider text-ink-3 w-[90px]">Última</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProviders.map((provider) => {
                  const pmxn = fmtMXN(provider.totalMXN);
                  const pusd = fmtMXN(provider.totalUSD);
                  return (
                    <TableRow
                      key={provider.rfc}
                      className="group cursor-pointer hover:bg-paper-2"
                      onDoubleClick={() => {
                        setSelectedProvider(provider);
                        setIsDetailOpen(true);
                      }}
                    >
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-clay-soft flex items-center justify-center flex-shrink-0">
                            <Icon name="vendors" size={14} className="text-clay" />
                          </div>
                          <span className="font-medium text-[13px] text-ink truncate max-w-[250px]">
                            {provider.nombre}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="font-mono text-[11px] text-ink-3">{provider.rfc}</span>
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span className="text-[13px] font-medium text-ink">{provider.facturas}</span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px]">
                        <span className="text-ink">${pmxn.int}</span>
                        <span className="text-ink-3">.{pmxn.dec}</span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-ink-3">
                        {provider.totalUSD > 0 ? (
                          <>
                            <span className="text-ink">${pusd.int}</span>
                            <span className="text-ink-3">.{pusd.dec}</span>
                          </>
                        ) : (
                          <span className="text-ink-4">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        {provider.estados.pendiente > 0 ? (
                          <Badge tone="rust">
                            {provider.estados.pendiente}
                          </Badge>
                        ) : (
                          <span className="text-[12px] text-ink-4">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-[12px] font-mono text-ink-3">
                        {provider.facturas === 0 ? (
                          <Badge tone="rust">Sin facturas</Badge>
                        ) : (
                          fmtDate(provider.ultimaFactura)
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredProviders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-ink-3">
                      <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium text-ink-2">No se encontraron proveedores</p>
                      <p className="text-[12px] mt-1">
                        {providers.length === 0
                          ? "Aún no hay proveedores registrados — invita al primero con el botón de arriba"
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
              <div className="h-10 w-10 rounded-lg bg-clay-soft flex items-center justify-center flex-shrink-0">
                <Icon name="vendors" size={18} className="text-clay" />
              </div>
              <div>
                <span className="text-[17px] font-semibold text-ink">{selectedProvider?.nombre}</span>
                <p className="text-[12px] font-mono text-ink-3 mt-0.5">
                  {selectedProvider?.rfc}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedProvider && (
            <div className="space-y-5 mt-4">
              {/* Resumen de montos */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-paper-2 rounded-lg p-4 border border-line">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="coin" size={14} className="text-ink-3" />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Total MXN</span>
                  </div>
                  {(() => {
                    const m = fmtMXN(selectedProvider.totalMXN);
                    return (
                      <p className="text-2xl font-semibold font-mono text-ink">
                        <span className="text-[18px] italic font-normal text-ink-3 mr-1">$</span>
                        {m.int}<span className="text-ink-3">.{m.dec}</span>
                      </p>
                    );
                  })()}
                </div>
                <div className="bg-paper-2 rounded-lg p-4 border border-line">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon name="coin" size={14} className="text-ink-3" />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Total USD</span>
                  </div>
                  {(() => {
                    const m = fmtMXN(selectedProvider.totalUSD);
                    return (
                      <p className="text-2xl font-semibold font-mono text-ink">
                        <span className="text-[18px] italic font-normal text-ink-3 mr-1">US$</span>
                        {m.int}<span className="text-ink-3">.{m.dec}</span>
                      </p>
                    );
                  })()}
                </div>
              </div>

              <Separator className="bg-line" />

              {/* Estadísticas de facturas */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="file" size={14} className="text-ink-3" />
                  <span className="font-semibold text-[13px] text-ink">
                    Facturas <span className="text-ink-3 font-normal">({selectedProvider.facturas})</span>
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <StatusTile count={selectedProvider.estados.pendiente} label="Pendiente" tone={STATUS_TILE_STYLES.pendiente} />
                  <StatusTile count={selectedProvider.estados.recibido} label="Recibido" tone={STATUS_TILE_STYLES.recibido} />
                  <StatusTile count={selectedProvider.estados.pagado} label="Pagado" tone={STATUS_TILE_STYLES.pagado} />
                  <StatusTile count={selectedProvider.estados.completado} label="Completado" tone={STATUS_TILE_STYLES.completado} />
                  <StatusTile count={selectedProvider.estados.rechazado} label="Rechazado" tone={STATUS_TILE_STYLES.rechazado} />
                </div>
              </div>

              <Separator className="bg-line" />

              {/* Última actividad */}
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-3 font-mono uppercase tracking-wider text-[11px]">Última factura</span>
                <span className="font-medium text-ink">
                  {fmtDateLong(selectedProvider.ultimaFactura)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InviteVendorDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </AuthLayout>
  );
}

function InviteVendorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<InviteActionData>();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const submitting = fetcher.state !== "idle";
  const data = fetcher.data;

  useEffect(() => {
    if (!open) {
      setEmail("");
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    if (data && "ok" in data && data.ok) setCopied(false);
  }, [data]);

  const success = data && "ok" in data && data.ok ? data : null;
  const error = data && "ok" in data && !data.ok ? data.error : null;

  const handleCopy = async () => {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API can fail in insecure contexts; the input is selectable as fallback */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">
            Invitar proveedor
          </DialogTitle>
          <DialogDescription className="text-[13px] text-ink-3">
            Le enviaremos un enlace personalizado para que se registre en tu
            empresa. Podrá completar sus datos manualmente o subir su Constancia
            de Situación Fiscal para autollenarlos.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <Alert className="bg-moss-soft border-moss/20">
              <Icon name="check" size={14} className="text-moss-deep" />
              <AlertDescription className="text-[12.5px] text-moss-deep">
                Invitación enviada. También puedes compartir el enlace
                manualmente.
              </AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
                Enlace de invitación
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={success.shareLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 text-[12px] font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-9 shrink-0"
                >
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="text-[11px] text-ink-3">
                El enlace expira el{" "}
                {new Date(success.expiresAt).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                .
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="clay"
                onClick={() => onOpenChange(false)}
                className="h-10"
              >
                Listo
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="invite-vendor" />
            <div className="space-y-1.5">
              <Label
                htmlFor="invite-email"
                className="text-[11px] font-medium uppercase tracking-wider text-ink-3"
              >
                Correo del proveedor *
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="proveedor@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={submitting}
                className="h-10 text-sm"
              />
            </div>
            {error ? (
              <Alert className="bg-wine-soft border-wine/20">
                <Icon name="warn" size={14} className="text-wine" />
                <AlertDescription className="text-[12px] text-wine">
                  {error}
                </AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="h-10"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="clay"
                disabled={submitting}
                className="h-10"
              >
                {submitting ? (
                  <>
                    <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Enviando…
                  </>
                ) : (
                  "Enviar invitación"
                )}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
