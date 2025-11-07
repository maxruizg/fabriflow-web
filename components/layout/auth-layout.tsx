import { Form, useLocation } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  LogOut,
  Menu,
  X,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { ThemeToggle } from "~/components/theme-toggle";
import { useState } from "react";
import { useUser } from "~/lib/auth-context";

interface AuthLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Panel de Control", href: "/dashboard", icon: LayoutDashboard },
  { name: "Facturas", href: "/invoices", icon: FileText },
  { name: "Proveedores", href: "/providers", icon: Users },
  { name: "Reportes", href: "/reports", icon: BarChart3 },
];

export function AuthLayout({ children }: AuthLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useUser();

  const isCurrentPath = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSidebarOpen(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64 h-screen bg-card border-r border-border shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full">
          {/* Logo and close button */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-border">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                <svg
                  className="h-5 w-5 text-primary-foreground"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="ml-2 text-xl font-semibold text-foreground">
                FabriFlow
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
              aria-label="Close sidebar"
              type="button"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* User info */}
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center">
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-primary font-medium text-sm">
                  {user?.user?.slice(0, 2).toUpperCase() || "U"}
                </span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-foreground">
                  {user?.user || "Usuario"}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user?.role || "vendor"}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav
            className="flex-1 px-4 py-4 space-y-1 relative"
            aria-label="Main navigation menu"
          >
            {navigation.map((item) => {
              const Icon = item.icon;
              const current = isCurrentPath(item.href);

              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={`
                    group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 cursor-pointer
                    ${
                      current
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }
                  `}
                  onClick={() => setSidebarOpen(false)}
                  aria-current={current ? "page" : undefined}
                >
                  <Icon
                    className={`mr-3 h-5 w-5 ${
                      current
                        ? "text-primary-foreground"
                        : "text-muted-foreground group-hover:text-accent-foreground"
                    }`}
                  />
                  {item.name}
                </a>
              );
            })}
            
            {/* Separator */}
            <div className="py-2">
              <Separator />
            </div>
            
            {/* Users Button */}
            <a
              href="/users"
              className={`
                group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 cursor-pointer
                ${
                  isCurrentPath("/users")
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }
              `}
              onClick={() => setSidebarOpen(false)}
              aria-current={isCurrentPath("/users") ? "page" : undefined}
            >
              <Users
                className={`mr-3 h-5 w-5 ${
                  isCurrentPath("/users")
                    ? "text-primary-foreground"
                    : "text-muted-foreground group-hover:text-accent-foreground"
                }`}
              />
              Usuarios
            </a>
          </nav>

          {/* Logout */}
          <div className="px-4 py-4 border-t border-border">
            <Form method="post" action="/logout">
              <Button
                type="submit"
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Cerrar Sesión
              </Button>
            </Form>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-card shadow-sm border-b border-border h-16 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-full">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
              aria-label="Open sidebar"
              aria-expanded={sidebarOpen}
              type="button"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex-1 lg:flex lg:items-center lg:justify-between">
              <h1 className="text-2xl font-semibold text-foreground ml-4 lg:ml-0">
                {navigation.find((item) => isCurrentPath(item.href))?.name ||
                  "Panel de Control"}
              </h1>

              <div className="hidden lg:flex lg:items-center lg:space-x-4">
                <span className="text-sm text-muted-foreground">
                  Bienvenido, {user?.user}
                </span>

                {/* Settings Dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <Settings className="h-4 w-4" />
                      <span className="sr-only">Configuración</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Configuración</DialogTitle>
                      <DialogDescription>
                        Configura tus preferencias para la aplicación.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-medium">Tema</h4>
                        <p className="text-sm text-muted-foreground">
                          Selecciona el tema para la aplicación.
                        </p>
                        <ThemeToggle />
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto py-6 px-4 sm:px-6 lg:px-8"
          role="main"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
