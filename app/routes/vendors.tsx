import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";

import { getAccessTokenFromSession, requireUser, getFullSession } from "~/lib/session.server";
import { sendVendorInvite, deleteVendorByRfc } from "~/lib/api.server";
import { cn } from "~/lib/utils";
import {
  fetchActiveVendors,
  type ActiveVendorSummary,
} from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { StatCard } from "~/components/ui/stat-card";
import { Toolbar } from "~/components/ui/toolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { AgingBar } from "~/components/ui/aging-bar";
import { PillGroup } from "~/components/ui/pill-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { VendorDetailPanel } from "~/components/vendors/vendor-detail-panel";

export const meta: MetaFunction = () => [
  { title: "Proveedores — FabriFlow" },
  {
    name: "description",
    content: "Directorio de proveedores con desempeño, riesgo y saldo",
  },
];

export const handle = {
  crumb: ["Maestros", "Proveedores"],
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json({ vendors: [] as ActiveVendorSummary[], companyId: user.company ?? null });
  }
  const vendors = await fetchActiveVendors(session.accessToken, user.company).catch((e: unknown) => {
    console.warn("[vendors] fetchActiveVendors failed:", e);
    return [] as ActiveVendorSummary[];
  });
  return json({ vendors, companyId: user.company });
}

type InviteActionData =
  | { ok: true; shareLink: string; expiresAt: string }
  | { ok: false; error: string };

type DeleteActionData =
  | { ok: true; message: string }
  | { ok: false; error: string };

type ActionData = InviteActionData | DeleteActionData;

export async function action({
  request,
}: ActionFunctionArgs): Promise<ReturnType<typeof json<ActionData>>> {
  const user = await requireUser(request);
  const companyId = user.company;
  if (!companyId) {
    return json<ActionData>(
      { ok: false, error: "Selecciona una empresa antes de continuar." },
      { status: 400 },
    );
  }

  const accessToken = await getAccessTokenFromSession(request);
  if (!accessToken) {
    return json<ActionData>(
      { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  // Handle invite vendor
  if (intent === "invite-vendor") {
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

  // Handle delete vendor
  if (intent === "delete-vendor") {
    const rfc = String(formData.get("rfc") ?? "").trim();
    if (!rfc) {
      return json<DeleteActionData>(
        { ok: false, error: "RFC del proveedor requerido." },
        { status: 400 },
      );
    }

    try {
      await deleteVendorByRfc(rfc, accessToken, companyId);
      return json<DeleteActionData>({
        ok: true,
        message: `Proveedor ${rfc} eliminado exitosamente.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo eliminar el proveedor.";
      return json<DeleteActionData>({ ok: false, error: message }, { status: 500 });
    }
  }

  return json<ActionData>({ ok: false, error: "Acción desconocida" }, { status: 400 });
}

const RISK_TONE = {
  Bajo: "moss",
  Medio: "rust",
  Alto: "wine",
} as const;

function onTimeBarTone(pct: number): "moss" | "clay" | "rust" {
  if (pct >= 90) return "moss";
  if (pct >= 80) return "clay";
  return "rust";
}

type ViewMode = "table" | "cards";

export default function VendorsPage() {
  const { vendors } = useLoaderData<typeof loader>();
  const deleteFetcher = useFetcher<DeleteActionData>();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [selectedId, setSelectedId] = useState<string | null>(vendors[0]?.id ?? null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<ActiveVendorSummary | null>(null);

  const categories = useMemo(() => {
    // Categorías deshabilitadas hasta que haya scorecard
    return [];
  }, [vendors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      // Filtros simplificados - solo búsqueda por nombre/email/RFC
      if (q) {
        const name = (v.vendorLegalName || v.name).toLowerCase();
        const email = v.email.toLowerCase();
        const rfc = (v.rfc || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !rfc.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [vendors, search]);

  const selected = vendors.find((v) => v.id === selectedId) ?? null;

  // KPIs simplificados (scorecard pendiente)
  const activos = vendors.length; // Todos son activos por ahora
  const onTimeAvg: number = 0; // Scorecard pendiente
  const totalOutstandingMxn: number = 0; // Scorecard pendiente
  const highRisk: number = 0; // Scorecard pendiente

  // Handle successful deletion
  useEffect(() => {
    if (deleteFetcher.data && "ok" in deleteFetcher.data && deleteFetcher.data.ok) {
      setDeleteConfirmOpen(false);
      setVendorToDelete(null);
      // Recargar después de eliminar exitosamente
      window.location.reload();
    }
  }, [deleteFetcher.data]);

  const isDeleting = deleteFetcher.state !== "idle";
  const deleteError =
    deleteFetcher.data && "ok" in deleteFetcher.data && !deleteFetcher.data.ok
      ? deleteFetcher.data.error
      : null;

  return (
    <AuthLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Directorio de <em>proveedores</em>
            </h1>
            <p className="ff-page-sub">
              {vendors.length} proveedor{vendors.length === 1 ? "" : "es"} · {activos} activo{activos === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Icon name="download" size={13} />
              Exportar catálogo
            </Button>
            <Button variant="clay" size="sm" onClick={() => setInviteOpen(true)}>
              <Icon name="plus" size={13} />
              Nuevo proveedor
            </Button>
          </div>
        </header>

        {/* KPI strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Activos"
            value={
              <>
                {activos}
                <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
                  {" "}/ {vendors.length}
                </span>
              </>
            }
            delta={{ label: "+2 este mes", direction: "up" }}
          />
          <StatCard
            label="A tiempo (promedio)"
            value={`${onTimeAvg}%`}
            delta={{
              label: onTimeAvg >= 85 ? "estable" : "atención",
              direction: onTimeAvg >= 85 ? "flat" : "dn",
            }}
            sparkPath="M0 22 L10 18 L20 14 L30 16 L40 8 L50 12 L60 6 L70 10 L80 4"
            sparkTone="moss"
          />
          <StatCard
            label="Saldo pendiente"
            currency="$"
            value={
              <>
                {(totalOutstandingMxn / 1000).toFixed(1)}
                <span className="ff-stat-val text-ink-3 text-[20px] font-normal">
                  K
                </span>
              </>
            }
            delta={{ label: "MXN equivalente" }}
          />
          <StatCard
            label="Riesgo alto"
            value={String(highRisk)}
            delta={{
              label: `${highRisk} proveedor${highRisk === 1 ? "" : "es"}`,
              direction: highRisk > 0 ? "dn" : "flat",
            }}
            sparkTone="wine"
          />
        </div>

        {/* Toolbar */}
        <Toolbar>
          <Toolbar.Search
            value={search}
            onChange={setSearch}
            placeholder="Buscar proveedor, contacto, RFC…"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Activo">Activo</SelectItem>
              <SelectItem value="En revisión">En revisión</SelectItem>
              <SelectItem value="Atrasado">Atrasado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Riesgo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Bajo">Bajo</SelectItem>
              <SelectItem value="Medio">Medio</SelectItem>
              <SelectItem value="Alto">Alto</SelectItem>
            </SelectContent>
          </Select>
          <Toolbar.Spacer />
          <PillGroup
            ariaLabel="Modo de vista"
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: "Tabla" },
              { value: "cards", label: "Tarjetas" },
            ]}
          />
        </Toolbar>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {view === "table" ? (
            <Card>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-[80px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((v) => {
                      const active = v.id === selectedId;
                      const displayName = v.vendorLegalName || v.name;
                      const initials = displayName.slice(0, 2).toUpperCase();
                      return (
                        <TableRow
                          key={v.id}
                          data-state={active ? "selected" : undefined}
                          className={cn(
                            "cursor-pointer",
                            active && "bg-paper-3",
                          )}
                          onClick={() => setSelectedId(v.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay-deep font-display text-[12px] font-semibold flex-shrink-0">
                                {initials}
                              </span>
                              <div className="min-w-0">
                                <div className="font-medium text-[13px] truncate max-w-[200px]">
                                  {displayName}
                                </div>
                                <div className="font-mono text-[10.5px] text-ink-3">
                                  {v.rfc}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-[12px] text-ink-2">
                            {v.email}
                          </TableCell>
                          <TableCell className="text-[12px] text-ink-2">
                            {v.phone || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge tone="moss">Activo</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVendorToDelete(v);
                                setDeleteConfirmOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-wine hover:bg-wine-soft hover:text-wine-deep"
                            >
                              <Icon name="trash" size={14} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-14">
                          <Icon
                            name="vendors"
                            size={32}
                            className="mx-auto mb-2 text-ink-4"
                          />
                          <div className="text-[13px] font-medium text-ink-2">
                            Sin resultados
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((v) => (
                <VendorCard
                  key={v.id}
                  vendor={v}
                  active={v.id === selectedId}
                  onClick={() => setSelectedId(v.id)}
                />
              ))}
            </div>
          )}

          <VendorDetailPanel vendor={selected} />
        </div>
      </div>
      <InviteVendorDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <DeleteVendorDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        vendor={vendorToDelete}
        fetcher={deleteFetcher}
        isDeleting={isDeleting}
        error={deleteError}
      />
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

  // Reset local UI when the dialog closes.
  useEffect(() => {
    if (!open) {
      setEmail("");
      setCopied(false);
    }
  }, [open]);

  // Reset copied state when a new share link arrives.
  useEffect(() => {
    if (data && "ok" in data && data.ok) {
      setCopied(false);
    }
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
      // Clipboard API can fail in insecure contexts; the input is selectable as fallback.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">Invitar proveedor</DialogTitle>
          <DialogDescription className="text-[13px] text-ink-3">
            Le enviaremos un enlace personalizado para que se registre en tu empresa.
            Podrá completar sus datos manualmente o subir su Constancia de Situación
            Fiscal para autollenarlos.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <Alert className="bg-moss-soft border-moss/20">
              <Icon name="check" size={14} className="text-moss-deep" />
              <AlertDescription className="text-[12.5px] text-moss-deep">
                Invitación enviada. También puedes compartir el enlace manualmente.
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
                <AlertDescription className="text-[12px] text-wine">{error}</AlertDescription>
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
              <Button type="submit" variant="clay" disabled={submitting} className="h-10">
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

function DeleteVendorDialog({
  open,
  onOpenChange,
  vendor,
  fetcher,
  isDeleting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: ActiveVendorSummary | null;
  fetcher: ReturnType<typeof useFetcher<DeleteActionData>>;
  isDeleting: boolean;
  error: string | null;
}) {
  if (!vendor) return null;

  const handleDelete = () => {
    fetcher.submit(
      { intent: "delete-vendor", rfc: vendor.id },
      { method: "post" }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px] text-wine">
            ¿Eliminar proveedor?
          </DialogTitle>
          <DialogDescription className="text-[13px] text-ink-3">
            Esta acción eliminará permanentemente al proveedor{" "}
            <strong className="text-ink-1">{vendor.name}</strong> (RFC: {vendor.id}) y todos
            sus datos relacionados:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Alert className="bg-wine-soft/30 border-wine/20">
            <Icon name="warn" size={14} className="text-wine" />
            <AlertDescription className="text-[12px] text-ink-2">
              Se eliminarán:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Todas las facturas asociadas</li>
                <li>Órdenes de compra</li>
                <li>Notas de crédito y complementos</li>
                <li>Usuarios y vínculos con la empresa</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        {error && (
          <Alert className="bg-wine-soft border-wine/20">
            <Icon name="warn" size={14} className="text-wine" />
            <AlertDescription className="text-[12px] text-wine">
              {error}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="h-10"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-10 bg-wine hover:bg-wine-deep"
          >
            {isDeleting ? (
              <>
                <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Eliminando…
              </>
            ) : (
              <>
                <Icon name="trash" size={14} className="mr-2" />
                Eliminar permanentemente
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VendorCard({
  vendor,
  active,
  onClick,
}: {
  vendor: ActiveVendorSummary;
  active: boolean;
  onClick: () => void;
}) {
  const displayName = vendor.vendorLegalName || vendor.name;
  const initials = displayName.slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        active
          ? "border-clay bg-paper-2"
          : "border-line bg-paper hover:border-line-2",
      )}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-clay-soft text-clay-deep font-display text-[13px] font-semibold flex-shrink-0">
          {initials}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">{displayName}</div>
          <div className="text-[10.5px] text-ink-3 font-mono truncate">
            {vendor.rfc}
          </div>
        </div>
        <Badge tone="moss">Activo</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-md bg-paper-2 px-2.5 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            Email
          </div>
          <div className="text-[11px] mt-0.5 truncate">{vendor.email}</div>
        </div>
        <div className="rounded-md bg-paper-2 px-2.5 py-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
            Teléfono
          </div>
          <div className="text-[11px] mt-0.5">
            {vendor.phone || "—"}
          </div>
        </div>
      </div>
    </button>
  );
}
