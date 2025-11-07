import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator } from "@remix-run/react";
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
  CheckCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { getStatusBadge } from "~/lib/utils";
import { requireUser } from "~/lib/session.server";

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
  role: "admin" | "inactive" | "user" | "vendor";
  company: string;
  status: "active" | "inactive" | "pending";
  lastLogin: string;
  createdAt: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Require authentication for users management access
  await requireUser(request);
  const users: User[] = [
    {
      id: "1",
      name: "Ana García López",
      email: "ana.garcia@textilesnorte.com",
      role: "vendor",
      company: "Textiles del Norte S.A. de C.V.",
      status: "active",
      lastLogin: "2024-02-15T10:30:00Z",
      createdAt: "2024-01-10T09:00:00Z",
    },
    {
      id: "2",
      name: "Carlos Mendoza",
      email: "carlos.mendoza@industriamx.com",
      role: "vendor",
      company: "Manufacturera Industrial Mexicana",
      status: "active",
      lastLogin: "2024-02-14T16:45:00Z",
      createdAt: "2024-01-15T11:20:00Z",
    },
    {
      id: "3",
      name: "María Elena Rodríguez",
      email: "maria.rodriguez@componentesauto.com",
      role: "vendor",
      company: "Fábrica de Componentes Automotrices",
      status: "pending",
      lastLogin: "",
      createdAt: "2024-02-01T14:15:00Z",
    },
    {
      id: "4",
      name: "Roberto Silva",
      email: "roberto.silva@metalicas.com",
      role: "vendor",
      company: "Industrias Metálicas del Bajío",
      status: "active",
      lastLogin: "2024-02-13T08:20:00Z",
      createdAt: "2024-01-25T10:30:00Z",
    },
    {
      id: "5",
      name: "Admin FabriFlow",
      email: "admin@fabriflow.com",
      role: "admin",
      company: "FabriFlow",
      status: "active",
      lastLogin: "2024-02-15T09:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
    },
  ];

  return json({ users, error: null });
};

function getRoleBadge(role: string) {
  switch (role) {
    case "admin":
      return (
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
          Administrador
        </Badge>
      );
    case "vendor":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
          Proveedor
        </Badge>
      );
    case "user":
      return (
        <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">
          Usuario
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
          {role}
        </Badge>
      );
  }
}

export default function Users() {
  const { users, error } = useLoaderData<typeof loader>();
  const [searchTerm, setSearchTerm] = useState("");
  const revalidator = useRevalidator();

  if (error) {
    return (
      <AuthLayout>
        <div className="text-center py-8">
          <p className="text-red-600">
            Error cargando usuarios:
            {error}
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
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.company.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  const activeUsers =
    users?.filter((user) => user.status === "active").length || 0;
  const pendingUsers =
    users?.filter((user) => user.status === "pending").length || 0;
  const totalUsers = users?.length || 0;

  return (
    <AuthLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Usuarios
            </h2>
            <p className="text-sm text-muted-foreground">
              Administra usuarios y permisos del sistema
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Nuevo Usuario
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                  <DialogDescription>
                    Agrega un nuevo usuario al sistema. Los campos marcados con
                    * son obligatorios.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <label htmlFor="user-name" className="text-sm font-medium">
                      Nombre Completo *
                    </label>
                    <Input id="user-name" placeholder="Ej: Juan Pérez García" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="user-email" className="text-sm font-medium">
                      Correo Electrónico *
                    </label>
                    <Input id="user-email" type="email" placeholder="usuario@empresa.com" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="user-company" className="text-sm font-medium">Empresa *</label>
                    <Input id="user-company" placeholder="Nombre de la empresa" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="user-role" className="text-sm font-medium">Rol *</label>
                    <select id="user-role" className="w-full px-3 py-2 border border-input bg-background rounded-md">
                      <option value="">Seleccionar rol</option>
                      <option value="vendor">Proveedor</option>
                      <option value="user">Usuario</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <DialogTrigger asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogTrigger>
                  <Button>Crear Usuario</Button>
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

        {/* Stats Cards */}
        <div className="grid gap-3 md:grid-cols-3 mb-4">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Total de Usuarios</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                Usuarios registrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Usuarios Activos</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold text-green-600">
                {activeUsers}
              </div>
              <p className="text-xs text-muted-foreground">
                Con acceso activo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">
                Pendientes
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-xl font-bold text-yellow-600">
                {pendingUsers}
              </div>
              <p className="text-xs text-muted-foreground">
                Esperando aprobación
              </p>
            </CardContent>
          </Card>
        </div>

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
                  <TableHead>Empresa</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último Acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {user.company}
                    </TableCell>

                    <TableCell>{getRoleBadge(user.role)}</TableCell>

                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell>
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : "Nunca"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        {user.status === "pending" && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-green-600 hover:text-green-800"
                            onClick={() => {
                              console.log('Approve user:', user.id);
                              // TODO: Implement approve user functionality
                            }}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      No se encontraron usuarios
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
