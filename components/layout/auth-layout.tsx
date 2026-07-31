import { Form, Link, useLocation, useMatches, useRouteLoaderData } from "@remix-run/react";
import { useMemo } from "react";

import { useUser } from "~/lib/auth-context";
import { useRole } from "~/lib/role-context";
import { useSidebar } from "~/lib/sidebar-context";
import { cn } from "~/lib/utils";
import { Icon, type IconName } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { Breadcrumbs } from "~/components/layout/breadcrumbs";
import { TweaksPanel } from "~/components/_dev/tweaks-panel";

interface AuthLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: IconName;
  /** Any of these permissions grants visibility. Empty array = always visible. */
  permissions: string[];
  /** Hide for vendor role (e.g. admin-only items). */
  factoryOnly?: boolean;
  /**
   * When set, the item is only shown if the matching root-loader flag is
   * `true`. Used for one-shot, state-dependent CTAs (e.g. "Plataforma" only
   * appears for vendors that still need to activate buyer mode).
   */
  visibleWhen?: "pendingBuyerActivation";
  /** Optional badge count — wired in Phase 4 once the data is real. */
  count?: number;
}

const PRIMARY_NAV: NavItem[] = [
  { name: "Panel", href: "/dashboard", icon: "dash", permissions: ["dashboard:read"] },
  { name: "Órdenes", href: "/orders", icon: "orders", permissions: [], factoryOnly: false },
  { name: "Facturas", href: "/invoices", icon: "file", permissions: [] },
  { name: "Notas de crédito", href: "/credit-notes", icon: "file", permissions: ["credit_notes:read", "invoices:read", "invoices:manage"] },
  { name: "Pagos", href: "/payments", icon: "pay", permissions: [] },
  { name: "Multipagos", href: "/multipayments", icon: "pay", permissions: ["payments:create"], factoryOnly: true },
  { name: "Proveedores", href: "/providers", icon: "vendors", permissions: ["vendors:read", "vendors:manage"], factoryOnly: true },
  { name: "Reportes", href: "/reports", icon: "reports", permissions: ["reports:read", "reports:export"] },
  { name: "Notificaciones", href: "/notifications", icon: "bell", permissions: ["users:manage", "vendors:manage", "*"], factoryOnly: true },
];

const SECONDARY_NAV: NavItem[] = [
  { name: "Usuarios", href: "/users", icon: "vendors", permissions: ["users:read", "users:create", "users:update", "users:delete", "*"] },
  { name: "Roles", href: "/settings/roles", icon: "settings", permissions: ["users:update", "*"] },
  { name: "Empresa", href: "/settings/company", icon: "settings", permissions: [] },
  {
    name: "Plataforma",
    href: "/settings/platform",
    icon: "settings",
    permissions: [],
    visibleWhen: "pendingBuyerActivation",
  },
];

interface RouteCta {
  cta?: { label: string; to?: string; icon?: IconName } | null;
}

function ctaForRoute(
  matches: ReturnType<typeof useMatches>,
  pathname: string,
  userPermissions: string[],
): { label: string; to: string; icon: IconName } | null {
  // Helper para verificar si el usuario tiene alguno de los permisos
  const hasPermission = (perms: string[]) => {
    if (userPermissions.includes("*")) return true;
    return perms.some(p => userPermissions.includes(p));
  };

  // 1) any matched route can opt into a custom CTA via `handle.cta`
  for (const m of matches) {
    const h = m.handle as RouteCta | undefined;
    if (h?.cta === null) return null;
    if (h?.cta) {
      return {
        label: h.cta.label,
        to: h.cta.to ?? "#",
        icon: h.cta.icon ?? "plus",
      };
    }
  }

  // 2) sensible defaults by route + permissions
  if (pathname.startsWith("/orders")) {
    if (hasPermission(["orders:create", "orders:manage"])) {
      return { label: "Nueva OC", to: "/orders/new", icon: "plus" };
    }
    return null;
  }
  if (pathname.startsWith("/invoices") || pathname.startsWith("/invoice/")) {
    if (hasPermission(["invoices:create", "invoices:manage"])) {
      return { label: "Subir factura", to: "/invoices/new", icon: "upload" };
    }
    return null;
  }
  if (pathname.startsWith("/payments")) {
    if (hasPermission(["payments:create", "payments:manage"])) {
      return { label: "Registrar pago", to: "/payments/new", icon: "plus" };
    }
    return null;
  }
  if (pathname.startsWith("/reports")) {
    if (hasPermission(["reports:read", "reports:export"])) {
      return { label: "Exportar PDF", to: "/reports", icon: "download" };
    }
    return null;
  }
  // dashboard → CTA basado en permisos
  if (pathname === "/dashboard") {
    if (hasPermission(["invoices:create", "invoices:manage"])) {
      return { label: "Subir factura", to: "/invoices/new", icon: "upload" };
    }
    if (hasPermission(["orders:create", "orders:manage"])) {
      return { label: "Nueva OC", to: "/orders/new", icon: "plus" };
    }
    return null;
  }
  // Default para otras rutas
  if (hasPermission(["orders:create", "orders:manage"])) {
    return { label: "Nueva OC", to: "/orders/new", icon: "plus" };
  }
  if (hasPermission(["invoices:create", "invoices:manage"])) {
    return { label: "Subir factura", to: "/invoices/new", icon: "upload" };
  }
  return null;
}

function avatarInitials(name?: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

function Brand() {
  return (
    <Link
      to="/dashboard"
      className="flex items-center gap-2.5 px-2.5 pb-4 pt-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-ink text-paper font-display text-[18px] font-semibold italic">
        F
        <span
          aria-hidden="true"
          className="absolute inset-1 rounded-[5px] border border-clay"
        />
      </span>
      <span className="font-display text-[20px] font-semibold tracking-tight text-ink">
        Fabri
        <em className="not-italic font-medium text-clay">Flow</em>
      </span>
    </Link>
  );
}

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}

function NavLink({ item, active, onClick }: NavLinkProps) {
  return (
    <Link
      to={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? "bg-ink text-paper"
          : "text-ink-2 hover:bg-paper-3 hover:text-ink",
      )}
    >
      <Icon name={item.icon} size={16} />
      <span className="truncate">{item.name}</span>
      {item.count != null ? (
        <span
          className={cn(
            "ml-auto rounded-sm px-1.5 py-px font-mono text-[10.5px]",
            active
              ? "bg-ink-2 text-paper"
              : "bg-paper-3 text-ink-3",
          )}
        >
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1.5 pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
      {children}
    </div>
  );
}

/**
 * Reads the live pending-notifications count from the root loader. Used to
 * decorate the "Notificaciones" sidebar item and the bell icon in the topbar.
 * Returns 0 when the count is unavailable (anonymous, vendor user, or fetch
 * error in the root loader) so callers can always render safely.
 */
function usePendingNotificationsCount(): number {
  const data = useRouteLoaderData("root") as
    | { pendingNotificationsCount?: number }
    | undefined;
  return data?.pendingNotificationsCount ?? 0;
}

/**
 * True when the active vendor user still has a pending buyer-mode activation
 * (Super Admin on their own company with `buyer_mode = false`). Gates the
 * "Plataforma" sidebar item — once activated, the item disappears.
 */
function useHasPendingBuyerActivation(): boolean {
  const data = useRouteLoaderData("root") as
    | { hasPendingBuyerActivation?: boolean }
    | undefined;
  return data?.hasPendingBuyerActivation === true;
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useUser();
  const { role } = useRole();
  const pendingCount = usePendingNotificationsCount();
  const hasPendingBuyerActivation = useHasPendingBuyerActivation();

  const userPerms = user?.permissions ?? [];
  const canSeeRoute = (perms: string[]) => {
    if (perms.length === 0) return true;
    if (userPerms.includes("*")) return true;
    return perms.some((p) => userPerms.includes(p));
  };

  const showItem = (it: NavItem) => {
    if (!canSeeRoute(it.permissions)) return false;
    if (it.factoryOnly && role !== "factory") return false;
    if (it.visibleWhen === "pendingBuyerActivation" && !hasPendingBuyerActivation) {
      return false;
    }
    return true;
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return location.pathname === "/dashboard";
    return (
      location.pathname === href || location.pathname.startsWith(href + "/")
    );
  };

  // Inject the live pending count onto the Notificaciones nav item — keep the
  // base PRIMARY_NAV definition static and clone only the entry that needs it.
  const decorate = (it: NavItem): NavItem =>
    it.href === "/notifications" && pendingCount > 0
      ? { ...it, count: pendingCount }
      : it;

  const primary = PRIMARY_NAV.filter(showItem).map(decorate);
  const secondary = SECONDARY_NAV.filter(showItem);

  return (
    <aside className="flex h-full flex-col bg-paper-2 border-r border-line">
      <div className="flex flex-col gap-0.5 px-3.5 pt-5 pb-4 flex-1 overflow-y-auto">
        <Brand />
        <SectionLabel>Operación</SectionLabel>
        {primary.map((it) => (
          <NavLink
            key={it.href}
            item={it}
            active={isActive(it.href)}
            onClick={onNavigate}
          />
        ))}
        {secondary.length > 0 ? (
          <>
            <SectionLabel>Administración</SectionLabel>
            {secondary.map((it) => (
              <NavLink
                key={it.href}
                item={it}
                active={isActive(it.href)}
                onClick={onNavigate}
              />
            ))}
          </>
        ) : null}
      </div>

      <div className="px-3.5 pb-4 border-t border-line bg-paper-2/60">
        <div className="pt-3.5">
          <div className="flex items-center gap-2.5 px-1.5 pt-1">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-clay-soft text-clay-deep font-semibold text-[12px]">
              {avatarInitials(user?.name ?? user?.email)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="truncate text-[13px] font-semibold text-ink">
                {user?.name ?? "Usuario"}
              </div>
              <div className="truncate text-[11px] text-ink-3">
                {user?.companyName ?? user?.role ?? "FabriFlow"}
              </div>
            </div>
            <Form method="post" action="/logout">
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="rounded-md p-1.5 text-ink-3 hover:text-ink hover:bg-paper-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="logout" size={14} />
              </button>
            </Form>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ onMenu, sidebarOpen }: { onMenu: () => void; sidebarOpen: boolean }) {
  const matches = useMatches();
  const location = useLocation();
  const { user } = useUser();
  const { role } = useRole();
  const userPermissions = user?.permissions ?? [];
  const cta = ctaForRoute(matches, location.pathname, userPermissions);
  const pendingCount = usePendingNotificationsCount();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:px-8 lg:py-3.5",
        // Fully opaque so scrolled content doesn't fog the topbar.
        "border-b border-line bg-paper",
      )}
    >
      <button
        type="button"
        onClick={onMenu}
        aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
        className="rounded-md p-1.5 text-ink-2 hover:text-ink hover:bg-paper-3"
      >
        <Icon name={sidebarOpen ? "chevl" : "menu"} size={18} />
      </button>

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-2">
        <label className="hidden md:inline-flex items-center gap-2 rounded-md border border-line bg-paper-2 px-3 py-1.5 w-[280px] focus-within:border-ink-3 transition-colors">
          <Icon name="search" size={14} className="text-ink-3" />
          <input
            type="search"
            placeholder={
              role === "factory"
                ? "Buscar OC, proveedor, factura…"
                : "Buscar mis órdenes y facturas…"
            }
            className="flex-1 bg-transparent border-0 outline-0 text-[13px] text-ink placeholder:text-ink-4"
          />
          <kbd className="hidden lg:inline-flex font-mono text-[10px] border border-line-2 px-1 py-px rounded text-ink-3">
            ⌘K
          </kbd>
        </label>

        <Button
          asChild
          variant="ghost"
          size="icon"
          aria-label={
            pendingCount > 0
              ? `Notificaciones (${pendingCount} pendientes)`
              : "Notificaciones"
          }
          className="relative text-ink-2"
        >
          <Link to="/notifications">
            <Icon name="bell" size={15} />
            {pendingCount > 0 ? (
              <span
                className="absolute -top-0.5 -right-0.5 grid min-w-[16px] h-[16px] place-items-center rounded-full bg-clay px-1 font-mono text-[10px] text-paper"
                aria-hidden="true"
              >
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            ) : null}
          </Link>
        </Button>

        {cta ? (
          <Button asChild size="default">
            <Link to={cta.to} className="inline-flex items-center gap-1.5">
              <Icon name={cta.icon} size={13} />
              <span className="hidden sm:inline">{cta.label}</span>
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setSidebarOpen } = useSidebar();

  return (
    <div className="h-dvh overflow-hidden bg-background text-foreground">
      {/* Mobile drawer overlay */}
      {sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Cerrar menú"
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      ) : null}

      <div className="flex h-full relative">
        {/* Sidebar */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 z-50 w-[220px] lg:w-[200px] transform transition-all duration-200 ease-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>

        {/* Main */}
        <div
          key={`main-${sidebarOpen ? 'open' : 'closed'}`}
          className={cn(
            "flex min-w-0 w-full flex-col transition-all duration-200",
            sidebarOpen ? "lg:pl-[200px]" : "lg:pl-0"
          )}
        >
          <Topbar onMenu={() => setSidebarOpen(!sidebarOpen)} sidebarOpen={sidebarOpen} />
          <main role="main" className="flex-1 min-w-0 overflow-y-auto px-4 py-6 lg:px-8 lg:pt-7 lg:pb-20">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Shell>{children}</Shell>
      <TweaksPanel />
    </>
  );
}
