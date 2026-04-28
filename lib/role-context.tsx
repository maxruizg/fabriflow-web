import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useUser } from "~/lib/auth-context";

/**
 * "Perspective" the UI is currently rendering for.
 *  - factory: buyer-side — manages POs, payments out, vendor relationships (admins/super-admins)
 *  - vendor:  supplier-side — sees their orders/invoices/payments in (vendors/proveedores)
 *
 * El rol es FIJO y determinado por el rol del usuario en la base de datos.
 * NO se puede cambiar manualmente.
 */
export type Role = "factory" | "vendor";

interface RoleContextType {
  role: Role;
  setRole: (next: Role) => void;
  /** Siempre false - el rol no se puede cambiar */
  canSwitch: boolean;
}

const RoleContext = createContext<RoleContextType | null>(null);

function deriveDefault(permissions: string[] | undefined, userRole: string | undefined): {
  role: Role;
  canSwitch: boolean;
} {
  const perms = permissions ?? [];
  const isAdmin = perms.includes("*") || (userRole ?? "").toLowerCase().includes("admin");
  const isVendor = (userRole ?? "").toLowerCase().includes("vendor") || (userRole ?? "").toLowerCase().includes("proveedor");

  // El rol es FIJO basado en el usuario - NO se puede cambiar
  // Admins y super-admins ven perspectiva "factory" (cuentas por pagar)
  // Vendors ven perspectiva "vendor" (cuentas por cobrar)
  if (isAdmin) return { role: "factory", canSwitch: false };
  if (isVendor) return { role: "vendor", canSwitch: false };
  // Fallback: regular factory user.
  return { role: "factory", canSwitch: false };
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const initial = useMemo(
    () => deriveDefault(user?.permissions, user?.role),
    [user?.permissions, user?.role],
  );

  // El rol es FIJO - no se puede cambiar, siempre viene del usuario
  const [role, setRoleState] = useState<Role>(initial.role);

  // Actualizar el rol si el usuario cambia (ej: login/logout)
  useEffect(() => {
    setRoleState(initial.role);
  }, [initial.role]);

  // setRole es no-op - el rol no se puede cambiar manualmente
  const setRole = (_next: Role) => {
    // No hacer nada - el rol es fijo basado en el usuario
    return;
  };

  const value: RoleContextType = { role, setRole, canSwitch: false };
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextType {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
