import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface SidebarContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    // Default to true if context is not available
    return { sidebarOpen: true, setSidebarOpen: () => {} };
  }
  return context;
}

interface SidebarProviderProps {
  children: ReactNode;
}

export function SidebarProvider({ children }: SidebarProviderProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const value = useMemo(() => {
    return { sidebarOpen, setSidebarOpen };
  }, [sidebarOpen]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}
