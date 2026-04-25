import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useUser } from "~/lib/auth-context";

/**
 * "Perspective" the UI is currently rendering for.
 *  - factory: buyer-side — manages POs, payments out, vendor relationships
 *  - vendor:  supplier-side — sees their orders/invoices/payments in
 *
 * Some users have access to both (e.g. super admins of multi-side orgs).
 * Single-role users have their perspective fixed and the switch is hidden.
 */
export type Role = "factory" | "vendor";

interface RoleContextType {
  role: Role;
  setRole: (next: Role) => void;
  /** True if the user has access to both perspectives — drives visibility of the switcher. */
  canSwitch: boolean;
}

const STORAGE_KEY = "ff_role";

const RoleContext = createContext<RoleContextType | null>(null);

function deriveDefault(permissions: string[] | undefined, userRole: string | undefined): {
  role: Role;
  canSwitch: boolean;
} {
  const perms = permissions ?? [];
  const isAdmin = perms.includes("*") || (userRole ?? "").toLowerCase().includes("admin");
  const isVendor = (userRole ?? "").toLowerCase().includes("vendor") || (userRole ?? "").toLowerCase().includes("proveedor");

  // A super-admin or admin starts in "factory" perspective and can flip.
  // A pure vendor stays vendor and the switcher is hidden.
  if (isAdmin) return { role: "factory", canSwitch: true };
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

  const [role, setRoleState] = useState<Role>(initial.role);

  // Hydrate from localStorage on the client (purely UI preference, never auth).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if ((saved === "factory" || saved === "vendor") && initial.canSwitch) {
        setRoleState(saved);
      } else if (!initial.canSwitch) {
        setRoleState(initial.role);
      }
    } catch {
      /* localStorage unavailable — stay with derived default */
    }
  }, [initial.canSwitch, initial.role]);

  const setRole = useCallback(
    (next: Role) => {
      if (!initial.canSwitch) return;
      setRoleState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    },
    [initial.canSwitch],
  );

  const value: RoleContextType = { role, setRole, canSwitch: initial.canSwitch };
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextType {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
