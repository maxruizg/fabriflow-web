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
import { Badge } from "~/components/ui/badge";
import {
  Search,
  UserPlus,
  Edit,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
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
import { requireUser, getFullSession } from "~/lib/session.server";
import { apiRequest } from "~/lib/api.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Usuarios - FabriFlow" },
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
      return json({ success: false, error: "Todos los campos son requeridos" }, { status: 400 });
    }

    try {
      // Llamar al API para crear usuario
      await apiRequest(
        "/api/users",
        {
          method: "POST",
          headers: {
            "X-Company-Id": user.company,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            role,
            permissions,
          }),
        },
        session.accessToken
      );

      return json({
        success: true,
        message: "Usuario creado exitosamente",
      });
    } catch (error) {
      console.error("Error creating user:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al crear usuario";
      return json({ success: false, error: errorMessage }, { status: 500 });
    }
  }

  if (intent === "updatePermissions") {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return json({ success: false, error: "ID de usuario requerido" }, { status: 400 });
    }

    // Obtener permisos seleccionados
    const permissions: string[] = [];
    if (formData.get("perm-dashboard")) permissions.push("dashboard:read");
    if (formData.get("perm-invoices-read")) permissions.push("invoices:read");
    if (formData.get("perm-invoices-delete")) permissions.push("invoices:delete");
    if (formData.get("perm-payments-read")) permissions.push("payments:read");
    if (formData.get("perm-payments-create")) permissions.push("payments:create");
    if (formData.get("perm-payments-delete")) permissions.push("payments:delete");
    if (formData.get("perm-reports")) permissions.push("reports:read");

    try {
      // Extraer solo el ID sin el prefijo "user:"
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

      return json({
        success: true,
        message: "Permisos actualizados exitosamente",
      });
    } catch (error) {
      console.error("Error updating permissions:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al actualizar permisos";
      return json({ success: false, error: errorMessage }, { status: 500 });
    }
  }

  if (intent === "delete") {
    const userId = formData.get("userId") as string;

    if (!userId) {
      return json({ success: false, error: "ID de usuario requerido" }, { status: 400 });
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

      return json({
        success: true,
        message: "Usuario eliminado exitosamente",
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al eliminar usuario";
      return json({ success: false, error: errorMessage }, { status: 500 });
    }
  }

  return json({ success: false, error: "Acción no válida" }, { status: 400 });
}

function getRoleBadge(role: string | undefined) {
  const roleLower = (role || "").toLowerCase();

  if (roleLower.includes("super admin") || roleLower === "superadmin") {
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
        Super Admin
      </Badge>
    );
  }
  if (roleLower.includes("admin") || roleLower.includes("administrador")) {
    return (
      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
        Administrador
      </Badge>
    );
  }
  if (roleLower.includes("user") || roleLower.includes("usuario")) {
    return (
      <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
        Usuario
      </Badge>
    );
  }
  return (
    <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
      {role || "Sin rol"}
    </Badge>
  );
}

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

  // Cerrar dialog cuando la operación es exitosa
  const isSubmitting = fetcher.state === "submitting";
  const actionData = fetcher.data as { success?: boolean; error?: string; message?: string } | undefined;

  // Efecto para cerrar dialogs cuando termina el submit exitosamente
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

  // Función para abrir el dialog de edición
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditPermissions(user.permissions || []);
    setIsEditDialogOpen(true);
  };

  // Función para toggle de permisos
  const togglePermission = (permission: string) => {
    setEditPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  // Función para abrir el dialog de eliminación
  const handleDeleteUser = (user: User) => {
    setDeletingUser(user);
    setIsDeleteDialogOpen(true);
  };

  if (error) {
    return (
      <AuthLayout>
        <div className="text-center py-8">
          <p className="text-red-600">
            Error cargando usuarios: {error}
          </p>
          <Button onClick={() => revalidator.revalidate()} className="mt-4">
            Reintentar
          </Button>
        </div>
      </AuthLayout>
    );
  }

  const filteredUsers =
    users?.filter(
      (user) =>
        (user.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || "").toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  const activeUsers =
    users?.filter((user) => user.status === "activo" || user.status === "active").length || 0;
  const totalUsers = total || users?.length || 0;

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Usuarios Internos
            </h2>
            <p className="text-sm text-muted-foreground">
              Administradores y operadores del sistema (no incluye proveedores)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Nuevo Usuario
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                  <DialogDescription>
                    Agrega un nuevo administrador o usuario operativo.
                  </DialogDescription>
                </DialogHeader>
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="create" />
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="user-name" className="text-sm font-medium">
                          Nombre Completo *
                        </label>
                        <Input id="user-name" name="name" placeholder="Ej: Juan Pérez" required />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="user-email" className="text-sm font-medium">
                          Correo Electrónico *
                        </label>
                        <Input id="user-email" name="email" type="email" placeholder="usuario@empresa.com" required />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="user-role" className="text-sm font-medium">Rol *</label>
                      <select
                        id="user-role"
                        name="role"
                        className="w-full px-3 py-2 border border-input bg-background rounded-md"
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        required
                      >
                        <option value="">Seleccionar rol</option>
                        <option value="super_admin">Super Admin (Acceso total)</option>
                        <option value="admin">Administrador (Permisos configurables)</option>
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Super Admin tiene acceso total. Administrador tiene permisos específicos.
                      </p>
                    </div>

                    {/* Permisos - Solo para Admin, no para Super Admin */}
                    {selectedRole === "admin" && (
                      <div className="space-y-3">
                        <label className="text-sm font-medium">Permisos</label>
                        <div className="border rounded-md p-4 space-y-4 bg-muted/30">
                          {/* Dashboard */}
                          <div className="flex items-center space-x-2">
                            <input type="checkbox" id="perm-dashboard" name="perm-dashboard" className="rounded" defaultChecked />
                            <label htmlFor="perm-dashboard" className="text-sm">Ver Dashboard</label>
                          </div>

                          {/* Facturas */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Facturas</p>
                            <div className="grid grid-cols-2 gap-2 pl-2">
                              <div className="flex items-center space-x-2">
                                <input type="checkbox" id="perm-invoices-read" name="perm-invoices-read" className="rounded" defaultChecked />
                                <label htmlFor="perm-invoices-read" className="text-sm">Ver facturas</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input type="checkbox" id="perm-invoices-delete" name="perm-invoices-delete" className="rounded" />
                                <label htmlFor="perm-invoices-delete" className="text-sm">Borrar facturas</label>
                              </div>
                            </div>
                          </div>

                          {/* Pagos */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Pagos</p>
                            <div className="grid grid-cols-3 gap-2 pl-2">
                              <div className="flex items-center space-x-2">
                                <input type="checkbox" id="perm-payments-read" name="perm-payments-read" className="rounded" />
                                <label htmlFor="perm-payments-read" className="text-sm">Ver pagos</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input type="checkbox" id="perm-payments-create" name="perm-payments-create" className="rounded" />
                                <label htmlFor="perm-payments-create" className="text-sm">Crear pagos</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input type="checkbox" id="perm-payments-delete" name="perm-payments-delete" className="rounded" />
                                <label htmlFor="perm-payments-delete" className="text-sm">Borrar pagos</label>
                              </div>
                            </div>
                          </div>

                          {/* Reportes */}
                          <div className="flex items-center space-x-2">
                            <input type="checkbox" id="perm-reports" name="perm-reports" className="rounded" />
                            <label htmlFor="perm-reports" className="text-sm">Ver reportes</label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {actionData?.error && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                      {actionData.error}
                    </div>
                  )}
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Creando..." : "Crear Usuario"}
                    </Button>
                  </div>
                </fetcher.Form>
              </DialogContent>
            </Dialog>

            {/* Dialog de Edición de Permisos */}
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
                    <div className="space-y-2">
                      <p className="text-sm"><strong>Usuario:</strong> {editingUser?.name}</p>
                      <p className="text-sm text-muted-foreground">{editingUser?.email}</p>
                    </div>

                    {/* Si es Super Admin, mostrar mensaje */}
                    {(editingUser?.roleName?.toLowerCase().includes("super admin") ||
                      editingUser?.roleName?.toLowerCase() === "superadmin") ? (
                      <div className="bg-yellow-50 text-yellow-800 p-3 rounded-md text-sm">
                        Los Super Admin tienen acceso total y no se pueden editar sus permisos.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label className="text-sm font-medium">Permisos</label>
                        <div className="border rounded-md p-4 space-y-4 bg-muted/30">
                          {/* Dashboard */}
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="edit-perm-dashboard"
                              name="perm-dashboard"
                              className="rounded"
                              checked={editPermissions.includes("dashboard:read")}
                              onChange={() => togglePermission("dashboard:read")}
                            />
                            <label htmlFor="edit-perm-dashboard" className="text-sm">Ver Dashboard</label>
                          </div>

                          {/* Facturas */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Facturas</p>
                            <div className="grid grid-cols-2 gap-2 pl-2">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="edit-perm-invoices-read"
                                  name="perm-invoices-read"
                                  className="rounded"
                                  checked={editPermissions.includes("invoices:read")}
                                  onChange={() => togglePermission("invoices:read")}
                                />
                                <label htmlFor="edit-perm-invoices-read" className="text-sm">Ver facturas</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="edit-perm-invoices-delete"
                                  name="perm-invoices-delete"
                                  className="rounded"
                                  checked={editPermissions.includes("invoices:delete")}
                                  onChange={() => togglePermission("invoices:delete")}
                                />
                                <label htmlFor="edit-perm-invoices-delete" className="text-sm">Borrar facturas</label>
                              </div>
                            </div>
                          </div>

                          {/* Pagos */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase">Pagos</p>
                            <div className="grid grid-cols-3 gap-2 pl-2">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="edit-perm-payments-read"
                                  name="perm-payments-read"
                                  className="rounded"
                                  checked={editPermissions.includes("payments:read")}
                                  onChange={() => togglePermission("payments:read")}
                                />
                                <label htmlFor="edit-perm-payments-read" className="text-sm">Ver pagos</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="edit-perm-payments-create"
                                  name="perm-payments-create"
                                  className="rounded"
                                  checked={editPermissions.includes("payments:create")}
                                  onChange={() => togglePermission("payments:create")}
                                />
                                <label htmlFor="edit-perm-payments-create" className="text-sm">Crear pagos</label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id="edit-perm-payments-delete"
                                  name="perm-payments-delete"
                                  className="rounded"
                                  checked={editPermissions.includes("payments:delete")}
                                  onChange={() => togglePermission("payments:delete")}
                                />
                                <label htmlFor="edit-perm-payments-delete" className="text-sm">Borrar pagos</label>
                              </div>
                            </div>
                          </div>

                          {/* Reportes */}
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="edit-perm-reports"
                              name="perm-reports"
                              className="rounded"
                              checked={editPermissions.includes("reports:read")}
                              onChange={() => togglePermission("reports:read")}
                            />
                            <label htmlFor="edit-perm-reports" className="text-sm">Ver reportes</label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {actionData?.error && isEditDialogOpen && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md mb-4">
                      {actionData.error}
                    </div>
                  )}
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancelar
                    </Button>
                    {!(editingUser?.roleName?.toLowerCase().includes("super admin") ||
                       editingUser?.roleName?.toLowerCase() === "superadmin") && (
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Guardando..." : "Guardar Permisos"}
                      </Button>
                    )}
                  </div>
                </fetcher.Form>
              </DialogContent>
            </Dialog>

            {/* Dialog de Confirmación de Eliminación */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>Eliminar Usuario</DialogTitle>
                  <DialogDescription>
                    ¿Estás seguro de que deseas eliminar a este usuario de la compañía?
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <p className="text-sm font-medium text-red-800">{deletingUser?.name}</p>
                    <p className="text-sm text-red-600">{deletingUser?.email}</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Esta acción eliminará al usuario de esta compañía. El usuario podrá seguir accediendo a otras compañías si pertenece a alguna.
                  </p>
                </div>
                {actionData?.error && isDeleteDialogOpen && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md mb-4">
                    {actionData.error}
                  </div>
                )}
                <div className="flex justify-end space-x-2">
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
          </div>
        </div>

        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuarios..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Stats Card - Solo total */}
        <Card className="mb-4">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UsersIcon className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Total de usuarios internos</p>
                  <p className="text-2xl font-bold">{totalUsers}</p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {activeUsers} activos
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 min-h-0 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center">
              <UsersIcon className="mr-2 h-4 w-4" />
              Lista de Usuarios
            </CardTitle>
            <CardDescription className="text-sm">
              Usuarios registrados en el sistema y su información.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-auto">
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
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name || "Sin nombre"}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.roleName || user.role)}</TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell>
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : "Nunca"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar usuario"
                          onClick={() => handleEditUser(user)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                          title="Eliminar usuario"
                          onClick={() => handleDeleteUser(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No se encontraron usuarios internos
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
};
