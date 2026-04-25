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
import { Loader2, AlertTriangle, Factory, CheckCircle, Eye, EyeOff } from "lucide-react";

export const meta: MetaFunction = () => {
  return [
    { title: "Restablecer Contraseña - FabriFlow" },
    {
      name: "description",
      content: "Restablece tu contraseña de FabriFlow",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json({ error: "Token no proporcionado", token: null });
  }

  return json({ token, error: null });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const token = formData.get("token")?.toString();
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();

  if (!token) {
    return json({
      error: "Token no válido",
      success: false,
    });
  }

  if (!password || !confirmPassword) {
    return json({
      error: "Todos los campos son requeridos",
      success: false,
    });
  }

  if (password !== confirmPassword) {
    return json({
      error: "Las contraseñas no coinciden",
      success: false,
    });
  }

  if (password.length < 8) {
    return json({
      error: "La contraseña debe tener al menos 8 caracteres",
      success: false,
    });
  }

  try {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:8080";
    const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });

    const data = await response.json();

    if (!response.ok) {
      return json({
        error: data.message || "Error al restablecer la contraseña",
        success: false,
      });
    }

    return json({
      success: true,
      message: "Tu contraseña ha sido restablecida exitosamente.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return json({
      error: "Error de conexión. Intenta de nuevo más tarde.",
      success: false,
    });
  }
}

export default function ResetPassword() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (loaderData.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <Card className="w-full max-w-md shadow-xl border-border/50">
          <CardHeader className="space-y-4 text-center pb-2">
            <div className="flex justify-center">
              <div className="bg-destructive/10 p-3 rounded-xl">
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </div>
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">
                Enlace Inválido
              </CardTitle>
              <CardDescription className="mt-2">
                El enlace para restablecer la contraseña no es válido o ha expirado.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password">
              <Button className="w-full">
                Solicitar nuevo enlace
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-xl border-border/50">
        <CardHeader className="space-y-4 text-center pb-2">
          <div className="flex justify-center">
            <div className="bg-primary/10 p-3 rounded-xl">
              <Factory className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">
              Nueva Contraseña
            </CardTitle>
            <CardDescription className="mt-2">
              Ingresa tu nueva contraseña
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          {actionData?.success ? (
            <div className="space-y-4">
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950/30">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  {actionData.message}
                </AlertDescription>
              </Alert>
              <Link to="/login">
                <Button className="w-full">
                  Ir a Iniciar Sesión
                </Button>
              </Link>
            </div>
          ) : (
            <Form method="post" className="space-y-4">
              <input type="hidden" name="token" value={loaderData.token || ""} />

              {actionData?.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{actionData.error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">Nueva Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo 8 caracteres
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Restablecer Contraseña"
                )}
              </Button>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
