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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Icon } from "~/components/ui/icon";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Activa tu cuenta — FabriFlow" },
    {
      name: "description",
      content: "Activa tu cuenta de FabriFlow creando tu contraseña",
    },
  ];
};

interface LoaderData {
  token: string | null;
  error: string | null;
  name: string | null;
  email: string | null;
}

export async function loader({ request }: LoaderFunctionArgs): Promise<ReturnType<typeof json<LoaderData>>> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json<LoaderData>({
      token: null,
      error: "Token no proporcionado",
      name: null,
      email: null,
    });
  }

  try {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:8080";
    const response = await fetch(
      `${apiUrl}/api/auth/activation-token/validate?token=${encodeURIComponent(token)}`,
      { method: "GET" },
    );

    if (!response.ok) {
      return json<LoaderData>({
        token: null,
        error: "No pudimos validar el enlace de activación.",
        name: null,
        email: null,
      });
    }

    const data = (await response.json()) as {
      valid: boolean;
      email?: string | null;
      name?: string | null;
    };

    if (!data.valid) {
      return json<LoaderData>({
        token: null,
        error: "El enlace de activación no es válido o ha expirado.",
        name: null,
        email: null,
      });
    }

    return json<LoaderData>({
      token,
      error: null,
      name: data.name ?? null,
      email: data.email ?? null,
    });
  } catch (error) {
    console.error("Activation token validation error:", error);
    return json<LoaderData>({
      token: null,
      error: "Error de conexión. Intenta de nuevo más tarde.",
      name: null,
      email: null,
    });
  }
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
      message: null as string | null,
    });
  }

  if (!password || !confirmPassword) {
    return json({
      error: "Todos los campos son requeridos",
      success: false,
      message: null as string | null,
    });
  }

  if (password !== confirmPassword) {
    return json({
      error: "Las contraseñas no coinciden",
      success: false,
      message: null as string | null,
    });
  }

  if (password.length < 8) {
    return json({
      error: "La contraseña debe tener al menos 8 caracteres",
      success: false,
      message: null as string | null,
    });
  }

  try {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:8080";
    const response = await fetch(`${apiUrl}/api/auth/set-initial-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: password }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      return json({
        error: data.message || "No pudimos activar la cuenta. El enlace puede haber expirado.",
        success: false,
        message: null as string | null,
      });
    }

    return json({
      success: true,
      message: "Tu cuenta ha sido activada. Ya puedes iniciar sesión.",
      error: null as string | null,
    });
  } catch (error) {
    console.error("Set initial password error:", error);
    return json({
      error: "Error de conexión. Intenta de nuevo más tarde.",
      success: false,
      message: null as string | null,
    });
  }
}

export default function SetPassword() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Invalid / expired token state
  if (loaderData.error) {
    return (
      <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
        <aside className="hidden lg:flex relative flex-col justify-between bg-paper-2 border-r border-line p-12 overflow-hidden">
          <BrandMark />
          <HeroCopy />
          <DotPattern />
        </aside>

        <main className="relative flex items-center justify-center p-6 lg:p-12">
          <div className="absolute top-4 right-4">
            <ThemeToggle />
          </div>

          <div className="w-full max-w-[420px]">
            <div className="lg:hidden mb-8 flex items-center gap-3">
              <span className="relative grid h-10 w-10 place-items-center rounded-lg bg-ink text-paper font-display text-[20px] font-semibold italic">
                F
                <span
                  aria-hidden="true"
                  className="absolute inset-1 rounded-[5px] border border-clay"
                />
              </span>
              <span className="font-display text-[22px] font-semibold tracking-tight">
                Fabri<em className="not-italic font-medium text-clay">Flow</em>
              </span>
            </div>

            <h1 className="ff-page-title">
              Enlace <em>inválido</em>
            </h1>
            <p className="ff-page-sub mb-8">
              El enlace de activación no es válido o ha expirado. Pídele a tu
              administrador que te envíe una nueva invitación.
            </p>

            <Alert className="bg-wine-soft border-wine/20 mb-5">
              <Icon name="warn" size={14} className="text-wine" />
              <AlertDescription className="text-[12px] text-wine">
                {loaderData.error}
              </AlertDescription>
            </Alert>

            <Link to="/login">
              <Button variant="outline" className="w-full h-11">
                Ir a iniciar sesión
              </Button>
            </Link>

            <p className="mt-12 text-center text-[11px] font-mono text-ink-4">
              © 2026 FabriFlow · Todos los derechos reservados
            </p>
          </div>
        </main>
      </div>
    );
  }

  const greetingName = loaderData.name?.split(" ")[0];

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Hero panel — desktop only */}
      <aside className="hidden lg:flex relative flex-col justify-between bg-paper-2 border-r border-line p-12 overflow-hidden">
        <BrandMark />
        <HeroCopy />
        <DotPattern />
      </aside>

      {/* Form column */}
      <main className="relative flex items-center justify-center p-6 lg:p-12">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[420px]">
          {/* Mobile-only brand */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <span className="relative grid h-10 w-10 place-items-center rounded-lg bg-ink text-paper font-display text-[20px] font-semibold italic">
              F
              <span
                aria-hidden="true"
                className="absolute inset-1 rounded-[5px] border border-clay"
              />
            </span>
            <span className="font-display text-[22px] font-semibold tracking-tight">
              Fabri<em className="not-italic font-medium text-clay">Flow</em>
            </span>
          </div>

          <h1 className="ff-page-title">
            Crea tu <em>contraseña</em>
          </h1>
          <p className="ff-page-sub mb-8">
            {greetingName ? `Bienvenido, ${greetingName}. ` : "Bienvenido. "}
            Define una contraseña segura de al menos 8 caracteres para acceder a
            tu cuenta.
          </p>

          {actionData?.success ? (
            <div className="space-y-5">
              <Alert className="bg-moss-soft border-moss/20">
                <Icon name="check" size={14} className="text-moss-deep" />
                <AlertDescription className="text-[12px] text-moss-deep">
                  {actionData.message}
                </AlertDescription>
              </Alert>
              <Link to="/login">
                <Button variant="clay" className="w-full h-11">
                  Ir a iniciar sesión
                </Button>
              </Link>
            </div>
          ) : (
            <Form method="post" className="space-y-4">
              <input type="hidden" name="token" value={loaderData.token || ""} />

              {actionData?.error ? (
                <Alert className="bg-wine-soft border-wine/20">
                  <Icon name="warn" size={14} className="text-wine" />
                  <AlertDescription className="text-[12px] text-wine">
                    {actionData.error}
                  </AlertDescription>
                </Alert>
              ) : null}

              {loaderData.email ? (
                <div className="rounded-md border border-line bg-paper-2 px-3 py-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-ink-3">
                    Cuenta
                  </p>
                  <p className="text-[13px] text-ink">{loaderData.email}</p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                >
                  Contraseña
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-3 hover:text-ink"
                    onClick={() => setShowPassword((s) => !s)}
                  >
                    <Icon name="eye" size={16} />
                  </button>
                </div>
                <p className="text-[11px] text-ink-3">Mínimo 8 caracteres</p>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="confirmPassword"
                  className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                >
                  Confirmar contraseña
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    disabled={isSubmitting}
                    className="h-11 pr-10"
                  />
                  <button
                    type="button"
                    aria-label={
                      showConfirmPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-3 hover:text-ink"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                  >
                    <Icon name="eye" size={16} />
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="clay"
                className="w-full h-11"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Activando…
                  </>
                ) : (
                  "Activar cuenta"
                )}
              </Button>
            </Form>
          )}

          <p className="mt-12 text-center text-[11px] font-mono text-ink-4">
            © 2026 FabriFlow · Todos los derechos reservados
          </p>
        </div>
      </main>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="relative flex items-center gap-3 z-10">
      <span className="relative grid h-12 w-12 place-items-center rounded-lg bg-ink text-paper font-display text-[24px] font-semibold italic">
        F
        <span
          aria-hidden="true"
          className="absolute inset-1.5 rounded-[6px] border border-clay"
        />
      </span>
      <span className="font-display text-[28px] font-semibold tracking-tight">
        Fabri<em className="not-italic font-medium text-clay">Flow</em>
      </span>
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="relative z-10 max-w-[480px]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-4">
        Operaciones · Facturas · Pagos
      </p>
      <h2 className="font-display text-[44px] leading-[1.05] font-medium tracking-tight">
        Bienvenido a
        <br />
        <em className="text-clay">FabriFlow.</em>
      </h2>
      <p className="mt-5 text-[14px] text-ink-2 leading-relaxed">
        Crea tu contraseña y empieza a gestionar órdenes de compra, facturas y
        pagos con la misma plataforma que usa todo tu equipo.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        {[
          { tone: "moss", text: "OTIF en tiempo real" },
          { tone: "clay", text: "FX automático" },
          { tone: "rust", text: "CFDI validado" },
          { tone: "ink", text: "AP aging" },
        ].map((c) => (
          <span
            key={c.text}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider",
              c.tone === "moss" && "bg-moss-soft text-moss-deep",
              c.tone === "clay" && "bg-clay-soft text-clay-deep",
              c.tone === "rust" && "bg-rust-soft text-rust-deep",
              c.tone === "ink" && "bg-paper-3 text-ink-2",
            )}
          >
            <span className="h-1 w-1 rounded-full bg-current" />
            {c.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function DotPattern() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 opacity-[0.55]"
      style={{
        backgroundImage:
          "radial-gradient(oklch(0.88 0.012 70 / 0.6) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
        backgroundPosition: "-10px -10px",
        maskImage:
          "radial-gradient(ellipse at 75% 60%, transparent 30%, black 80%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at 75% 60%, transparent 30%, black 80%)",
      }}
    />
  );
}
