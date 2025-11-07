import { Link, useLocation } from "@remix-run/react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { 
  LayoutDashboard, 
  FileText, 
  Users, 
  BarChart3, 
  Settings, 
  Building 
} from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Providers", href: "/providers", icon: Building },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Administration", href: "/admin", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <div className="flex flex-col w-64 bg-white dark:bg-gray-800 shadow-lg">
        <div className="flex items-center justify-center h-16 bg-primary">
          <Link to="/" className="text-white text-xl font-bold">
            Magavi v2
          </Link>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Button
                key={item.name}
                asChild
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  isActive && "bg-primary text-primary-foreground"
                )}
              >
                <Link to={item.href} className="flex items-center space-x-2">
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              </Button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {navigation.find(item => item.href === location.pathname)?.name || "Magavi"}
            </h1>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}