import { useLocation, useMatches } from "@remix-run/react";

import { cn } from "~/lib/utils";

/**
 * A `handle` export on a Remix route can declare its breadcrumb pieces.
 * If a route doesn't declare one we fall back to the static map below.
 */
export interface RouteHandle {
  crumb?: string | string[];
}

const STATIC_CRUMBS: Record<string, string[]> = {
  "/dashboard": ["Panel"],
  "/orders": ["Operación", "Órdenes"],
  "/orders/new": ["Operación", "Órdenes", "Nueva"],
  "/invoices": ["Operación", "Facturas"],
  "/invoices/new": ["Operación", "Facturas", "Nueva"],
  "/providers": ["Maestros", "Proveedores"],
  "/vendors": ["Maestros", "Proveedores"],
  "/payments": ["Tesorería", "Pagos"],
  "/payments/new": ["Tesorería", "Pagos", "Registrar"],
  "/reports": ["Contabilidad", "Reportes"],
  "/users": ["Administración", "Usuarios"],
  "/admin/vendors/approve": ["Administración", "Aprobar proveedor"],
  "/admin/vendors/reject": ["Administración", "Rechazar proveedor"],
  "/select-company": ["Acceso", "Empresa"],
};

function trimTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function dynamicCrumbsFor(pathname: string): string[] {
  // /invoice/:id → ["Operación", "Facturas", "Detalle"]
  if (/^\/invoice\/[^/]+$/.test(pathname))
    return ["Operación", "Facturas", "Detalle"];
  // /orders/:id
  if (/^\/orders\/[^/]+$/.test(pathname))
    return ["Operación", "Órdenes", "Detalle"];
  // /vendors/:id
  if (/^\/vendors\/[^/]+$/.test(pathname))
    return ["Maestros", "Proveedores", "Detalle"];
  // /payments/:id
  if (/^\/payments\/[^/]+$/.test(pathname))
    return ["Tesorería", "Pagos", "Detalle"];
  return [];
}

function readHandleCrumbs(matches: ReturnType<typeof useMatches>): string[] {
  const crumbs: string[] = [];
  for (const match of matches) {
    const handle = match.handle as RouteHandle | undefined;
    if (!handle?.crumb) continue;
    if (Array.isArray(handle.crumb)) crumbs.push(...handle.crumb);
    else crumbs.push(handle.crumb);
  }
  return crumbs;
}

export function Breadcrumbs({ className }: { className?: string }) {
  const matches = useMatches();
  const location = useLocation();
  const pathname = trimTrailingSlash(location.pathname);

  const fromHandle = readHandleCrumbs(matches);
  const crumbs =
    fromHandle.length > 0
      ? fromHandle
      : (STATIC_CRUMBS[pathname] ?? dynamicCrumbsFor(pathname));

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "font-mono text-[11px] uppercase tracking-wider text-ink-3",
        className,
      )}
    >
      {crumbs.map((c, i, arr) => {
        const last = i === arr.length - 1;
        return (
          <span key={`${c}-${i}`}>
            {last ? (
              <strong className="font-medium text-ink">{c}</strong>
            ) : (
              <>
                {c}
                <span className="mx-1.5 text-ink-4">/</span>
              </>
            )}
          </span>
        );
      })}
    </nav>
  );
}
