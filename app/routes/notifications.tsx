import type {
  MetaFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useEffect, useState } from "react";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Icon } from "~/components/ui/icon";
import { Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

import { requireUser, getFullSession } from "~/lib/session.server";
import {
  approveVendor,
  listPendingVendors,
  rejectVendor,
  type PendingVendorRequest,
} from "~/lib/api.server";

export const meta: MetaFunction = () => [
  { title: "Notificaciones — FabriFlow" },
  {
    name: "description",
    content: "Solicitudes pendientes de proveedores",
  },
];

type ActionResult =
  | {
      ok: true;
      intent: "approve" | "reject";
      userId: string;
      message: string;
    }
  | { ok: false; intent: "approve" | "reject" | null; error: string };

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  // Vendors no aprueban a otros vendors. El backend de todas formas devuelve
  // 403, pero el redirect evita el ruido y mantiene al vendor en su dashboard.
  const role = (user.role ?? "").toLowerCase();
  if (role.includes("vendor") || role.includes("proveedor")) {
    throw redirect("/dashboard");
  }

  if (!session?.accessToken || !user.company) {
    return json({ requests: [] as PendingVendorRequest[], error: "Sesión inválida" });
  }

  try {
    const requests = await listPendingVendors(session.accessToken, user.company);
    return json({ requests, error: null as string | null });
  } catch (error) {
    console.error("Error loading pending vendor requests:", error);
    return json({
      requests: [] as PendingVendorRequest[],
      error:
        error instanceof Error
          ? error.message
          : "Error al cargar las solicitudes pendientes",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json<ActionResult>(
      { ok: false, intent: null, error: "Sesión inválida" },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!userId || (intent !== "approve" && intent !== "reject")) {
    return json<ActionResult>(
      { ok: false, intent: null, error: "Solicitud inválida" },
      { status: 400 },
    );
  }

  try {
    if (intent === "approve") {
      const result = await approveVendor(session.accessToken, user.company, userId);
      return json<ActionResult>({
        ok: true,
        intent: "approve",
        userId,
        message: result.message || "Proveedor aprobado exitosamente",
      });
    }

    const reason = String(formData.get("reason") ?? "").trim();
    const result = await rejectVendor(
      session.accessToken,
      user.company,
      userId,
      reason || undefined,
    );
    return json<ActionResult>({
      ok: true,
      intent: "reject",
      userId,
      message: result.message || "Solicitud rechazada",
    });
  } catch (error) {
    console.error(`Error processing ${intent} for ${userId}:`, error);
    return json<ActionResult>(
      {
        ok: false,
        intent: intent as "approve" | "reject",
        error:
          error instanceof Error
            ? error.message
            : intent === "approve"
              ? "Error al aprobar el proveedor"
              : "Error al rechazar el proveedor",
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "hace unos segundos";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `hace ${diffDay} d`;
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function vendorDisplay(req: PendingVendorRequest): {
  primary: string;
  secondary: string | null;
} {
  if (req.vendorCompanyName) {
    return {
      primary: req.vendorCompanyName,
      secondary: req.vendorCompanyRfc,
    };
  }
  return {
    primary: req.userEmail || req.userName || "Proveedor sin nombre",
    secondary: req.linkStatus ? null : "Sin compañía vinculada",
  };
}

// ---------------------------------------------------------------------------
// Reject dialog
// ---------------------------------------------------------------------------

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PendingVendorRequest | null;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
}

function RejectDialog({ open, onOpenChange, target, fetcher }: RejectDialogProps) {
  const isSubmitting =
    fetcher.state === "submitting" &&
    fetcher.formData?.get("intent") === "reject" &&
    fetcher.formData?.get("userId") === target?.userId;

  if (!target) return null;
  const { primary } = vendorDisplay(target);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Rechazar solicitud</DialogTitle>
          <DialogDescription>
            La solicitud de <span className="font-medium text-ink">{primary}</span> será
            rechazada y el proveedor recibirá un correo informándole de esta decisión.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="reject" />
          <input type="hidden" name="userId" value={target.userId} />

          <div className="space-y-1.5">
            <label
              htmlFor="reject-reason"
              className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
            >
              Motivo del rechazo
              <span className="ml-1 normal-case tracking-normal text-ink-4">
                (opcional)
              </span>
            </label>
            <textarea
              id="reject-reason"
              name="reason"
              placeholder="Explica el motivo del rechazo…"
              className="flex min-h-[100px] w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-clay/50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-none"
            />
            <p className="text-[11px] text-ink-3">
              El motivo se incluirá en el correo enviado al proveedor.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rechazando…
                </>
              ) : (
                <>
                  <Icon name="x" size={14} className="mr-2" />
                  Rechazar
                </>
              )}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function NotificationsPage() {
  const { requests, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<PendingVendorRequest | null>(null);

  const actionData = fetcher.data as ActionResult | undefined;

  useEffect(() => {
    if (fetcher.state !== "idle" || !actionData) return;
    if (actionData.ok) {
      setFlash({ kind: "success", text: actionData.message });
      if (actionData.intent === "reject") setRejectTarget(null);
    } else {
      setFlash({ kind: "error", text: actionData.error });
    }
  }, [fetcher.state, actionData]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(id);
  }, [flash]);

  const isSubmittingFor = (userId: string, intent: "approve" | "reject") =>
    fetcher.state === "submitting" &&
    fetcher.formData?.get("userId") === userId &&
    fetcher.formData?.get("intent") === intent;

  const pending = requests || [];

  return (
    <AuthLayout>
      <div className="flex flex-col gap-5">
        {/* Flash banner */}
        {flash && (
          <Alert
            className={cn(
              "flex items-center gap-2",
              flash.kind === "success"
                ? "bg-moss-soft border-moss/20"
                : "bg-wine-soft border-wine/20",
            )}
          >
            <Icon
              name={flash.kind === "success" ? "check" : "warn"}
              size={14}
              className={
                flash.kind === "success" ? "text-moss-deep" : "text-wine"
              }
            />
            <AlertDescription
              className={cn(
                "text-[12px] flex-1",
                flash.kind === "success" ? "text-moss-deep" : "text-wine",
              )}
            >
              {flash.text}
            </AlertDescription>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setFlash(null)}
              className={cn(
                "shrink-0 text-[11px] uppercase tracking-wider font-mono px-2 py-1 rounded hover:bg-paper-3",
                flash.kind === "success" ? "text-moss-deep" : "text-wine",
              )}
            >
              Cerrar
            </button>
          </Alert>
        )}

        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Notificaciones
            </h1>
            <p className="ff-page-sub">
              Solicitudes de proveedores pendientes de aprobación para vincularse a tu
              empresa.
            </p>
          </div>
          {pending.length > 0 ? (
            <Badge tone="clay" noDot>
              {pending.length} pendiente{pending.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </header>

        {error ? (
          <div className="rounded-xl border border-line bg-wine-soft/40 p-8 text-center">
            <Icon name="warn" size={32} className="text-wine mx-auto mb-3" />
            <p className="text-[14px] text-wine font-medium">{error}</p>
          </div>
        ) : pending.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-paper-3">
                  <Icon name="bell" size={22} className="text-ink-3" />
                </div>
                <div>
                  <p className="text-[15px] font-medium text-ink">
                    Sin solicitudes pendientes
                  </p>
                  <p className="text-[13px] text-ink-3 mt-1">
                    Cuando un proveedor solicite vincularse a tu empresa, aparecerá aquí.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">Solicitudes pendientes</CardTitle>
              <CardDescription>
                Aprueba para permitir al proveedor operar contra tu empresa. Rechazar
                cierra la solicitud y notifica al proveedor.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Solicitado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((req) => {
                    const display = vendorDisplay(req);
                    const approving = isSubmittingFor(req.userId, "approve");
                    const rejecting = isSubmittingFor(req.userId, "reject");
                    const busy = approving || rejecting;

                    return (
                      <TableRow key={req.userId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-medium text-ink">
                              {display.primary}
                            </span>
                            {display.secondary ? (
                              <span className="text-[11px] font-mono text-ink-3">
                                {display.secondary}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-[13px] text-ink-2">
                              {req.userName || "—"}
                            </span>
                            <span className="text-[11px] text-ink-3">
                              {req.userEmail || "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-[12px] text-ink-3">
                            {formatRelative(req.requestedAt)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <fetcher.Form method="post" className="inline">
                              <input type="hidden" name="intent" value="approve" />
                              <input type="hidden" name="userId" value={req.userId} />
                              <Button
                                type="submit"
                                size="sm"
                                variant="clay"
                                disabled={busy}
                              >
                                {approving ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    Aprobando…
                                  </>
                                ) : (
                                  <>
                                    <Icon name="check" size={13} className="mr-1.5" />
                                    Aprobar
                                  </>
                                )}
                              </Button>
                            </fetcher.Form>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setRejectTarget(req)}
                            >
                              <Icon name="x" size={13} className="mr-1.5" />
                              Rechazar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <RejectDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRejectTarget(null);
        }}
        target={rejectTarget}
        fetcher={fetcher}
      />
    </AuthLayout>
  );
}
