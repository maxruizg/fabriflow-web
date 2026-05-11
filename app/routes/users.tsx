import type { MetaFunction, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Icon } from "~/components/ui/icon";
import { StatCard } from "~/components/ui/stat-card";
import { Edit, Mail, Trash2, UserPlus } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { getStatusBadge } from "~/lib/utils";
import { cn, statusTone, statusLabel } from "~/lib/utils";
import { requireUser, getFullSession } from "~/lib/session.server";
import { apiRequest } from "~/lib/api.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Usuarios — FabriFlow" },
    {
      name: "description",
      content: "Administra usuarios y permisos del sistema",
    },
  ];
};

interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
  roleName?: string;
  status: string;
  lastLogin?: string;
  createdAt: string;
  permissions?: string[];
}

interface UsersApiResponse {
  data: User[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({ users: [], error: "Sesión inválida", total: 0 });
  }

  try {
    // Fetch only internal users (exclude vendors)
    const response = await apiRequest<UsersApiResponse>(
      "/api/users?excludeVendors=true",
      {
        method: "GET",
        headers: {
          "X-Company-Id": user.company,
        },
      },
      session.accessToken
    );

    return json({
      users: response.data || [],
      total: response.total || 0,
      error: null,
    });
  } catch (error) {
    console.error("Error loading users:", error);
    return json({
      users: [],
      total: 0,
      error: "Error al cargar usuarios",
    });
  }
};

// Action para crear usuarios
export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({ success: false, error: "Sesión inválida" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const role = formData.get("role") as string;

    // Obtener permisos seleccionados
    const permissions: string[] = [];

    if (role === "super_admin") {
      permissions.push("*");
    } else {
      if (formData.get("perm-dashboard")) permissions.push("dashboard:read");
      if (formData.get("perm-invoices-read")) permissions.push("invoices:read");
      if (formData.get("perm-invoices-delete")) permissions.push("invoices:delete");
      if (formData.get("perm-payments-read")) permissions.push("payments:read");
      if (formData.get("perm-payments-create")) permissions.push("payments:create");
      if (formData.get("perm-payments-delete")) permissions.push("payments:delete");
      if (formData.get("perm-reports")) permissions.push("reports:read");
    }

    if (!name || !email || !role) {
      return json({ success: false, intent: "create", error: "Todos los campos son requeridos" }, { status: 400 });
    }

    try {
      await apiRequest(
        "/api/users",
        {
          method: "POST",
          headers: {
            "X-Company-Id": user.company,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, email, role, permissions }),
        },
        session.accessToken
      );

      return json({ success: true, intent: "create", message: `Invitación enviada a ${email}` });
    } catch (error) {
      console.error("Error creating user:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al crear usuario";
      return json({ success: false, intent: "create", error: errorMessage }, { status: 500 });
    }
  }

  if (intent === "resendInvitation") {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return json({ success: false, intent: "resendInvitation", error: "ID de usuario requerido" }, { status: 400 });
    }

    try {
      const cleanUserId = userId.replace("user:", "");

      await apiRequest(
        `/api/users/${cleanUserId}/resend-invitation`,
        {
          method: "POST",
          headers: {
            "X-Company-Id": user.company,
          },
        },
        session.accessToken
      );

      return json({ success: true, intent: "resendInvitation", message: "Invitación reenviada" });
    } catch (error) {
      console.error("Error resending invitation:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al reenviar invitación";
      return json({ success: false, intent: "resendInvitation", error: errorMessage }, { status: 500 });
    }
  }

  if (intent === "updatePermissions") {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return json({ success: false, intent: "updatePermissions", error: "ID de usuario requerido" }, { status: 400 });
    }

    const permissions: string[] = [];
    if (formData.get("perm-dashboard")) permissions.push("dashboard:read");
    if (formData.get("perm-invoices-read")) permissions.push("invoices:read");
    if (formData.get("perm-invoices-delete")) permissions.push("invoices:delete");
    if (formData.get("perm-payments-read")) permissions.push("payments:read");
    if (formData.get("perm-payments-create")) permissions.push("payments:create");
    if (formData.get("perm-payments-delete")) permissions.push("payments:delete");
    if (formData.get("perm-reports")) permissions.push("reports:read");

    try {
      const cleanUserId = userId.replace("user:", "");

      await apiRequest(
        `/api/users/${cleanUserId}/permissions`,
        {
          method: "PUT",
          headers: {
            "X-Company-Id": user.company,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ permissions }),
        },
        session.accessToken
      );

      return json({ success: true, intent: "updatePermissions", message: "Permisos actualizados exitosamente" });
    } catch (error) {
      console.error("Error updating permissions:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al actualizar permisos";
      return json({ success: false, intent: "updatePermissions", error: errorMessage }, { status: 500 });
    }
  }

  if (intent === "delete") {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return json({ success: false, intent: "delete", error: "ID de usuario requerido" }, { status: 400 });
    }

    try {
      const cleanUserId = userId.replace("user:", "");

      await apiRequest(
        `/api/users/${cleanUserId}`,
        {
          method: "DELETE",
          headers: {
            "X-Company-Id": user.company,
          },
        },
        session.accessToken
      );

      return json({ success: true, intent: "delete", message: "Usuario eliminado exitosamente" });
    } catch (error) {
      console.error("Error deleting user:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al eliminar usuario";
      return json({ success: false, intent: "delete", error: errorMessage }, { status: 500 });
    }
  }

  return json({ success: false, intent: null, error: "Acción no válida" }, { status: 400 });
}

// ---------- role badge ----------

function getRoleBadge(role: string | undefined) {
  const r = (role || "").toLowerCase();
  if (r.includes("super admin") || r === "superadmin") {
    return <Badge tone="wine" noDot>Super Admin</Badge>;
  }
  if (r.includes("admin") || r.includes("administrador")) {
    return <Badge tone="clay" noDot>Administrador</Badge>;
  }
  return <Badge tone="ink" noDot>{role || "Sin rol"}</Badge>;
}

// ---------- permission checkbox group (shared between create/edit forms) ----------

interface PermCheckboxGroupProps {
  checkedPerms: string[];
  onToggle?: (perm: string) => void;
  /** If true, uses defaultChecked (uncontrolled) for the create form. */
  uncontrolled?: boolean;
}

function PermCheckboxGroup({ checkedPerms, onToggle, uncontrolled }: PermCheckboxGroupProps) {
  return (
    <div className="rounded-lg border border-line p-4 space-y-4 bg-paper-2">
      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        <input
          type="checkbox"
          id={uncontrolled ? "perm-dashboard" : "edit-perm-dashboard"}
          name="perm-dashboard"
          className="rounded accent-clay"
          {...(uncontrolled ? { defaultChecked: true } : {
            checked: checkedPerms.includes("dashboard:read"),
            onChange: () => onToggle?.("dashboard:read"),
          })}
        />
        Ver Dashboard
      </label>

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">Facturas</p>
        <div className="grid grid-cols-2 gap-2 pl-2">
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              id={uncontrolled ? "perm-invoices-read" : "edit-perm-invoices-read"}
              name="perm-invoices-read"
              className="rounded accent-clay"
              {...(uncontrolled ? { defaultChecked: true } : {
                checked: checkedPerms.includes("invoices:read"),
                onChange: () => onToggle?.("invoices:read"),
              })}
            />
            Ver facturas
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              id={uncontrolled ? "perm-invoices-delete" : "edit-perm-invoices-delete"}
              name="perm-invoices-delete"
              className="rounded accent-clay"
              {...(uncontrolled ? { defaultChecked: false } : {
                checked: checkedPerms.includes("invoices:delete"),
                onChange: () => onToggle?.("invoices:delete"),
              })}
            />
            Borrar facturas
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">Pagos</p>
        <div className="grid grid-cols-3 gap-2 pl-2">
          {[
            { id: "perm-payments-read", editId: "edit-perm-payments-read", key: "payments:read", label: "Ver pagos" },
            { id: "perm-payments-create", editId: "edit-perm-payments-create", key: "payments:create", label: "Crear pagos" },
            { id: "perm-payments-delete", editId: "edit-perm-payments-delete", key: "payments:delete", label: "Borrar pagos" },
          ].map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                id={uncontrolled ? p.id : p.editId}
                name={p.id}
                className="rounded accent-clay"
                {...(uncontrolled ? { defaultChecked: false } : {
                  checked: checkedPerms.includes(p.key),
                  onChange: () => onToggle?.(p.key),
                })}
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        <input
          type="checkbox"
          id={uncontrolled ? "perm-reports" : "edit-perm-reports"}
          name="perm-reports"
          className="rounded accent-clay"
          {...(uncontrolled ? { defaultChecked: false } : {
            checked: checkedPerms.includes("reports:read"),
            onChange: () => onToggle?.("reports:read"),
          })}
        />
        Ver reportes
      </label>
    </div>
  );
}

// ---------- main component ----------

export default function Users() {
  const { users, error, total } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const revalidator = useRevalidator();
  const fetcher = useFetcher();

  const isSubmitting = fetcher.state === "submitting";
  const actionData = fetcher.data as
    | {
        success?: boolean;
        error?: string;
        message?: string;
        intent?: "create" | "resendInvitation" | "updatePermissions" | "delete" | null;
      }
    | undefined;

  // Flash banner: shows the most recent action result (success or error) at
  // the top of the page and auto-dismisses. The fetcher.data reference also
  // changes when the same action runs again, so a fresh flash always renders.
  const [flash, setFlash] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);

  useEffect(() => {
    if (fetcher.state === "idle" && actionData?.success) {
      setIsDialogOpen(false);
      setIsEditDialogOpen(false);
      setIsDeleteDialogOpen(false);
      setSelectedRole("");
      setEditingUser(null);
      setEditPermissions([]);
      setDeletingUser(null);
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !actionData) return;
    if (actionData.success && actionData.message) {
      setFlash({ kind: "success", text: actionData.message });
    } else if (actionData.error) {
      setFlash({ kind: "error", text: actionData.error });
    }
  }, [fetcher.state, actionData]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(id);
  }, [flash]);

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditPermissions(user.permissions || []);
    setIsEditDialogOpen(true);
  };

  const togglePermission = (permission: string) => {
    setEditPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  };

  const handleDeleteUser = (user: User) => {
    setDeletingUser(user);
    setIsDeleteDialogOpen(true);
  };

  if (error) {
    return (
      <AuthLayout>
        <div className="rounded-xl border border-line bg-wine-soft/40 p-8 text-center">
          <Icon name="warn" size={32} className="text-wine mx-auto mb-3" />
          <p className="text-[14px] text-wine font-medium mb-4">
            Error cargando usuarios: {error}
          </p>
          <Button variant="outline" onClick={() => revalidator.revalidate()}>
            Reintentar
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const safeUsers: User[] = (users || []).filter((u): u is User => u != null);

  const filteredUsers = safeUsers.filter(
    (user) =>
      (user.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeUsers = safeUsers.filter(
    (u) => u.status === "activo" || u.status === "active"
  ).length;
  const totalUsers = total || safeUsers.length;

  const isSuperAdmin = (u: User) => {
    const r = (u.roleName || u.role || "").toLowerCase();
    return r.includes("super admin") || r === "superadmin";
  };

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">

        {/* Flash banner — surfaces success/error feedback for any action */}
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
              Usuarios <em>internos</em>
            </h1>
            <p className="ff-page-sub">
              Administradores y operadores del sistema — no incluye proveedores.
            </p>
          </div>

          {/* Create user dialog trigger */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="clay">
                <UserPlus className="mr-2 h-4 w-4" />
                Nuevo Usuario
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                <DialogDescription>
                  Agrega un nuevo administrador o usuario operativo. Recibirá un
                  email con instrucciones para crear su contraseña.
                </DialogDescription>
              </DialogHeader>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="create" />
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="user-name" className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                        Nombre Completo *
                      </label>
                      <Input id="user-name" name="name" placeholder="Ej: Juan Pérez" required />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="user-email" className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                        Correo Electrónico *
                      </label>
                      <Input id="user-email" name="email" type="email" placeholder="usuario@empresa.com" required />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="user-role" className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                      Rol *
                    </label>
                    <select
                      id="user-role"
                      name="role"
                      className="w-full h-10 rounded-md border border-line bg-paper px-3 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-clay/50"
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar rol</option>
                      <option value="super_admin">Super Admin (Acceso total)</option>
                      <option value="admin">Administrador (Permisos configurables)</option>
                    </select>
                    <p className="text-[11px] text-ink-3">
                      Super Admin tiene acceso total. Administrador tiene permisos específicos.
                    </p>
                  </div>

                  {selectedRole === "admin" && (
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium uppercase tracking-wider text-ink-3">Permisos</label>
                      <PermCheckboxGroup checkedPerms={[]} uncontrolled />
                    </div>
                  )}
                </div>

                {actionData?.error && actionData.intent === "create" && (
                  <div className="text-[13px] text-wine bg-wine-soft border border-wine/20 p-3 rounded-lg mb-4">
                    {actionData.error}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="clay" disabled={isSubmitting}>
                    {isSubmitting ? "Creando..." : "Crear Usuario"}
                  </Button>
                </div>
              </fetcher.Form>
            </DialogContent>
          </Dialog>

          {/* Edit permissions dialog (non-trigger, opened programmatically) */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar Permisos</DialogTitle>
                <DialogDescription>
                  Modifica los permisos de {editingUser?.name || editingUser?.email}
                </DialogDescription>
              </DialogHeader>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="updatePermissions" />
                <input type="hidden" name="userId" value={editingUser?.id || ""} />
                <div className="grid gap-4 py-4">
                  <div className="space-y-1">
                    <p className="text-[13px] font-medium text-ink">{editingUser?.name}</p>
                    <p className="text-[12px] text-ink-3">{editingUser?.email}</p>
                  </div>

                  {editingUser && isSuperAdmin(editingUser) ? (
                    <div className="rounded-lg bg-rust-soft/50 border border-rust/20 p-3 text-[13px] text-rust-deep">
                      Los Super Admin tienen acceso total y no se pueden editar sus permisos.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-[12px] font-medium uppercase tracking-wider text-ink-3">Permisos</label>
                      <PermCheckboxGroup checkedPerms={editPermissions} onToggle={togglePermission} />
                    </div>
                  )}
                </div>

                {actionData?.error && actionData.intent === "updatePermissions" && isEditDialogOpen && (
                  <div className="text-[13px] text-wine bg-wine-soft border border-wine/20 p-3 rounded-lg mb-4">
                    {actionData.error}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Cancelar
                  </Button>
                  {editingUser && !isSuperAdmin(editingUser) && (
                    <Button type="submit" variant="clay" disabled={isSubmitting}>
                      {isSubmitting ? "Guardando..." : "Guardar Permisos"}
                    </Button>
                  )}
                </div>
              </fetcher.Form>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation dialog */}
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Eliminar Usuario</DialogTitle>
                <DialogDescription>
                  ¿Estás seguro de que deseas eliminar a este usuario de la compañía?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="rounded-lg bg-wine-soft border border-wine/20 p-4">
                  <p className="text-[13px] font-medium text-wine">{deletingUser?.name}</p>
                  <p className="text-[12px] text-wine/80">{deletingUser?.email}</p>
                </div>
                <p className="text-[12px] text-ink-3 mt-3">
                  Esta acción eliminará al usuario de esta compañía. El usuario podrá seguir accediendo a otras compañías si pertenece a alguna.
                </p>
              </div>
              {actionData?.error && actionData.intent === "delete" && isDeleteDialogOpen && (
                <div className="text-[13px] text-wine bg-wine-soft border border-wine/20 p-3 rounded-lg mb-4">
                  {actionData.error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                  Cancelar
                </Button>
                <fetcher.Form method="post" className="inline">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="userId" value={deletingUser?.id || ""} />
                  <Button type="submit" variant="destructive" disabled={isSubmitting}>
                    {isSubmitting ? "Eliminando..." : "Eliminar"}
                  </Button>
                </fetcher.Form>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total de usuarios"
            value={String(totalUsers)}
            delta={{ label: "En el sistema" }}
          />
          <StatCard
            label="Activos"
            value={String(activeUsers)}
            delta={{ label: "Con sesión habilitada", direction: "up" }}
          />
          <StatCard
            label="Inactivos"
            value={String(totalUsers - activeUsers)}
            delta={{ label: "Sin acceso activo" }}
          />
          <StatCard
            label="Mostrando"
            value={String(filteredUsers.length)}
            delta={{ label: searchTerm ? "Resultado de búsqueda" : "Total visible" }}
          />
        </div>

        {/* Search bar */}
        <div className="relative max-w-sm">
          <Icon
            name="search"
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
          />
          <Input
            placeholder="Buscar usuarios..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Users table */}
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] flex items-center gap-2">
              <Icon name="vendors" size={15} className="text-ink-3" />
              Lista de Usuarios
            </CardTitle>
            <CardDescription className="text-[12px]">
              Usuarios registrados en el sistema y su información.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último Acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user: User) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-[13px]">
                      {user.name || "Sin nombre"}
                    </TableCell>
                    <TableCell className="text-[13px] text-ink-2">{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.roleName || user.role)}</TableCell>
                    <TableCell>
                      <Badge tone={statusTone(user.status)}>
                        {statusLabel(user.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-ink-3">
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "Nunca"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {user.status !== "activo" && user.status !== "active" && (
                          <fetcher.Form method="post" className="inline">
                            <input type="hidden" name="intent" value="resendInvitation" />
                            <input type="hidden" name="userId" value={user.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="sm"
                              title="Reenviar invitación"
                              className="hover:text-clay-deep hover:bg-clay-soft"
                              disabled={isSubmitting}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          </fetcher.Form>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar permisos"
                          onClick={() => handleEditUser(user as User)}
                        >
                          <Edit className="h-4 w-4 text-ink-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Eliminar usuario"
                          className="hover:text-wine hover:bg-wine-soft"
                          onClick={() => handleDeleteUser(user as User)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-ink-3 text-[13px]">
                      {searchTerm
                        ? `Sin resultados para "${searchTerm}"`
                        : "No se encontraron usuarios internos"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
