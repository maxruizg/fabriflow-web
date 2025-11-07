import { json } from "@remix-run/cloudflare";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { ThemeToggle } from "../../components/ui/theme-toggle";
import { Loader2, Eye, EyeOff, AlertTriangle, Factory } from "lucide-react";
import { createUserSession } from "~/lib/session.server";
import { login } from "~/lib/auth.server";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export const meta: MetaFunction = () => {
  return [
    { title: "Iniciar Sesión - FabriFlow" },
    {
      name: "description",
      content: "Plataforma de gestión industrial para fábricas",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  // Allow access to login page without checking authentication
  // const user = await getUserFromSession(request);
  // if (user) {
  //   throw redirect("/dashboard");
  // }

  // Fetch companies from API
  const { fetchCompanies } = await import("~/lib/api.server");
  try {
    const companies = await fetchCompanies();
    return json({ companies });
  } catch (error) {
    console.error("Failed to fetch companies:", error);
    return json({ companies: [] });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const company = formData.get("company")?.toString();

  if (!email || !password) {
    return json({
      error: "Email y contraseña son requeridos",
    });
  }

  if (!company) {
    return json({
      error: "Por favor selecciona una empresa",
    });
  }

  try {
    const loginResponse = await login({
      email: email,
      password,
      company,
    });

    console.log("Login response from auth.server:", loginResponse);

    if (!loginResponse.success || !loginResponse.user || !loginResponse.token) {
      console.log(
        "Login failed:",
        loginResponse.message || "Credenciales inválidas"
      );
      return json({
        error: loginResponse.message || "Credenciales inválidas",
      });
    }

    const { user: userData, token } = loginResponse;

    if (userData.status === "pendiente" || userData.status === "rechazado") {
      return json({
        error:
          "Este usuario sigue pendiente de aprobación, favor de contactarse con el administrador",
      });
    }

    console.log("Creating user session with:", {
      userId: userData.user || userData.email,
      userInfo: {
        user: userData.user || userData.email,
        status: userData.status,
        role: userData.role,
        permissions: userData.permissions,
        company: company,
      },
      token: token,
    });

    return createUserSession({
      request,
      userId: userData.user || userData.email,
      user: {
        user: userData.user || userData.email,
        status: userData.status || "active",
        role: userData.role || "user",
        permissions: userData.permissions || [],
        company: company, // Store selected company in session
      },
      accessToken: token,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    console.error("Login action error details:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error del servidor. Por favor intente más tarde.";
    return json({
      error: errorMessage,
    });
  }
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const loaderData = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [showPassword, setShowPassword] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  const isSubmitting = navigation.state === "submitting";

  // Use companies from API or fallback to empty array
  const companies = loaderData?.companies || [];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {/* Theme toggle positioned on the right side */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 bg-primary rounded-xl flex items-center justify-center mb-4">
            <Factory className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">FabriFlow</h1>
          <p className="text-muted-foreground mt-2">
            Sistema de Gestión Industrial
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold text-center">
              Iniciar Sesión
            </CardTitle>
            <CardDescription className="text-center">
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company">Empresa</Label>
                <Select
                  value={selectedCompany}
                  onValueChange={setSelectedCompany}
                  required
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Selecciona tu empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.length > 0 ? (
                      companies.map((company) => (
                        <SelectItem key={company} value={company}>
                          {company}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">
                        No hay empresas disponibles
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <input type="hidden" name="company" value={selectedCompany} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">RFC o Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="text"
                  placeholder="RFC con homoclave o email"
                  required
                  className="h-11"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Ingresa tu contraseña"
                    required
                    className="h-11 pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              {actionData?.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{actionData.error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full h-11"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </Form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                ¿No tienes una cuenta?{" "}
                <Link
                  to="/register"
                  className="font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Regístrate aquí
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            © 2024 FabriFlow. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
