import { Form, Link, useLocation, useMatches } from "@remix-run/react";
import { useState } from "react";

import { useUser } from "~/lib/auth-context";
import { RoleProvider, useRole } from "~/lib/role-context";
import { cn } from "~/lib/utils";
import { Icon, type IconName } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { Breadcrumbs } from "~/components/layout/breadcrumbs";
import { RoleSwitch } from "~/components/layout/role-switch";
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
  /** Optional badge count — wired in Phase 4 once the data is real. */
  count?: number;
}

const PRIMARY_NAV: NavItem[] = [
  { name: "Panel", href: "/dashboard", icon: "dash", permissions: ["dashboard:read"] },
  { name: "Órdenes", href: "/orders", icon: "orders", permissions: [], factoryOnly: false },
  { name: "Facturas", href: "/invoices", icon: "file", permissions: ["invoices:read", "invoices:manage"] },
  { name: "Proveedores", href: "/providers", icon: "vendors", permissions: ["vendors:read", "vendors:manage"], factoryOnly: true },
  { name: "Pagos", href: "/payments", icon: "pay", permissions: [] },
  { name: "Reportes", href: "/reports", icon: "reports", permissions: ["reports:read", "reports:export"] },
];

const SECONDARY_NAV: NavItem[] = [
  { name: "Usuarios", href: "/users", icon: "vendors", permissions: ["*"] },
];

interface RouteCta {
  cta?: { label: string; to?: string; icon?: IconName } | null;
}

function ctaForRoute(
  matches: ReturnType<typeof useMatches>,
  pathname: string,
  role: "factory" | "vendor",
): { label: string; to: string; icon: IconName } | null {
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

  // 2) sensible defaults by route + role
  if (pathname.startsWith("/orders")) {
    return role === "factory"
      ? { label: "Nueva OC", to: "/orders/new", icon: "plus" }
      : { label: "Subir documento", to: "/orders", icon: "upload" };
  }
  if (pathname.startsWith("/invoices") || pathname.startsWith("/invoice/")) {
    return { label: "Subir factura", to: "/invoices/new", icon: "upload" };
  }
  if (pathname.startsWith("/payments")) {
    return role === "factory"
      ? { label: "Registrar pago", to: "/payments/new", icon: "plus" }
      : { label: "Subir comprobante", to: "/payments", icon: "upload" };
  }
  if (pathname.startsWith("/reports")) {
    return { label: "Exportar PDF", to: "/reports", icon: "download" };
  }
  // dashboard / vendors / users → role-based universal CTA
  return role === "factory"
    ? { label: "Nueva OC", to: "/orders/new", icon: "plus" }
    : { label: "Subir factura", to: "/invoices/new", icon: "upload" };
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

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { user } = useUser();
  const { role } = useRole();

  const userPerms = user?.permissions ?? [];
  const canSeeRoute = (perms: string[]) => {
    if (perms.length === 0) return true;
    if (userPerms.includes("*")) return true;
    return perms.some((p) => userPerms.includes(p));
  };

  const showItem = (it: NavItem) => {
    if (!canSeeRoute(it.permissions)) return false;
    if (it.factoryOnly && role !== "factory") return false;
    return true;
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return location.pathname === "/dashboard";
    return (
      location.pathname === href || location.pathname.startsWith(href + "/")
    );
  };

  const primary = PRIMARY_NAV.filter(showItem);
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
          <RoleSwitch className="mb-3" />
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

function Topbar({ onMenu }: { onMenu: () => void }) {
  const matches = useMatches();
  const location = useLocation();
  const { role } = useRole();
  const cta = ctaForRoute(matches, location.pathname, role);

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
        aria-label="Abrir menú"
        className="lg:hidden rounded-md p-1.5 text-ink-2 hover:text-ink hover:bg-paper-3"
      >
        <Icon name="menu" size={18} />
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
          variant="ghost"
          size="icon"
          aria-label="Notificaciones"
          className="text-ink-2"
        >
          <Icon name="bell" size={15} />
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

      <div className="flex h-full">
        {/* Sidebar */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-200 ease-out",
            "lg:static lg:translate-x-0 lg:w-[248px] lg:flex-shrink-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setSidebarOpen(true)} />
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
    <RoleProvider>
      <Shell>{children}</Shell>
      <TweaksPanel />
    </RoleProvider>
  );
}
