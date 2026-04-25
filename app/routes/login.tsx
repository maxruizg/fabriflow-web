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
import { Loader2, Eye, EyeOff, AlertTriangle, Factory, Building2, Truck } from "lucide-react";
import { createUserSession, getUserFromSession } from "~/lib/session.server";
import { login } from "~/lib/auth.server";
import { redirect } from "@remix-run/cloudflare";

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
  // Check if user is already logged in
  const user = await getUserFromSession(request);
  if (user) {
    throw redirect("/dashboard");
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const loginType = formData.get("loginType")?.toString() || "email";
  const email = formData.get("email")?.toString();
  const rfc = formData.get("rfc")?.toString();
  const password = formData.get("password")?.toString();

  // Validate based on login type
  if (loginType === "rfc") {
    if (!rfc || !password) {
      return json({
        error: "RFC y contraseña son requeridos",
      });
    }
  } else {
    if (!email || !password) {
      return json({
        error: "Email y contraseña son requeridos",
      });
    }
  }

  try {
    // Login with email or RFC
    const loginResponse = await login({
      email: loginType === "email" ? email : undefined,
      rfc: loginType === "rfc" ? rfc?.toUpperCase() : undefined,
      password: password!,
    });

    console.log("Login response:", JSON.stringify(loginResponse, null, 2));

    if (!loginResponse.success || !loginResponse.user) {
      return json({
        error: loginResponse.message || "Credenciales inválidas",
      });
    }

    const { user: userData, token, refreshToken, companies, requiresCompanySelection } = loginResponse;

    // Check user status
    if (userData.status === "pendiente" || userData.status === "rechazado") {
      return json({
        error: "Tu cuenta está pendiente de aprobación. Por favor contacta al administrador.",
      });
    }

    // Determine redirect based on company selection requirement
    const redirectTo = requiresCompanySelection ? "/select-company" : "/dashboard";

    return createUserSession({
      request,
      userId: userData.id,
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        status: userData.status || "active",
        role: userData.role,
        permissions: userData.permissions || [],
        company: userData.company,
        companyName: userData.companyName,
      },
      accessToken: token || "",
      refreshToken,
      companies,
      requiresCompanySelection,
      redirectTo,
    });
  } catch (error) {
    console.error("Login action error:", error);
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
  const navigation = useNavigation();
  const [showPassword, setShowPassword] = useState(false);
  const [loginType, setLoginType] = useState<"email" | "rfc">("email");

  const isSubmitting = navigation.state === "submitting";

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
            {/* Login type toggle */}
            <div className="grid grid-cols-2 gap-2 mb-6">
              <button
                type="button"
                onClick={() => setLoginType("email")}
                className={`flex items-center justify-center space-x-2 rounded-md border-2 px-3 py-2.5 transition-colors ${
                  loginType === "email"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-muted bg-popover hover:bg-accent"
                }`}
              >
                <Building2 className="h-4 w-4" />
                <span className="text-sm font-medium">Empresa</span>
              </button>
              <button
                type="button"
                onClick={() => setLoginType("rfc")}
                className={`flex items-center justify-center space-x-2 rounded-md border-2 px-3 py-2.5 transition-colors ${
                  loginType === "rfc"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-muted bg-popover hover:bg-accent"
                }`}
              >
                <Truck className="h-4 w-4" />
                <span className="text-sm font-medium">Proveedor</span>
              </button>
            </div>

            <Form method="post" className="space-y-4">
              <input type="hidden" name="loginType" value={loginType} />

              {loginType === "email" ? (
                <div className="space-y-2">
                  <Label htmlFor="user-email">Email</Label>
                  <Input
                    id="user-email"
                    name="email"
                    type="text"
                    placeholder="ejemplo@empresa.com"
                    required
                    className="h-11"
                    autoComplete="one-time-code"
                    data-form-type="other"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="user-rfc">RFC</Label>
                  <Input
                    id="user-rfc"
                    name="rfc"
                    type="text"
                    placeholder="XAXX010101000"
                    required
                    className="h-11"
                    maxLength={13}
                    style={{ textTransform: "uppercase" }}
                    autoComplete="one-time-code"
                    data-form-type="other"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ingresa tu RFC registrado
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="user-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="********"
                    required
                    className="h-11 pr-10"
                    autoComplete="new-password"
                    data-form-type="other"
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
