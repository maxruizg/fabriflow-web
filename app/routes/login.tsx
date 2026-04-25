import { json, redirect } from "@remix-run/cloudflare";
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
import { Loader2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Icon } from "~/components/ui/icon";
import { ThemeToggle } from "~/components/ui/theme-toggle";

import { createUserSession, getUserFromSession } from "~/lib/session.server";
import { login } from "~/lib/auth.server";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => [
  { title: "Iniciar Sesión — FabriFlow" },
  {
    name: "description",
    content: "Plataforma de gestión industrial para fábricas y proveedores",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUserFromSession(request);
  if (user) throw redirect("/dashboard");
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const loginType = formData.get("loginType")?.toString() || "email";
  const email = formData.get("email")?.toString();
  const rfc = formData.get("rfc")?.toString();
  const password = formData.get("password")?.toString();

  if (loginType === "rfc") {
    if (!rfc || !password)
      return json({ error: "RFC y contraseña son requeridos" });
  } else if (!email || !password) {
    return json({ error: "Email y contraseña son requeridos" });
  }

  try {
    const loginResponse = await login({
      email: loginType === "email" ? email : undefined,
      rfc: loginType === "rfc" ? rfc?.toUpperCase() : undefined,
      password: password!,
    });

    if (!loginResponse.success || !loginResponse.user) {
      return json({
        error: loginResponse.message || "Credenciales inválidas",
      });
    }

    const {
      user: userData,
      token,
      refreshToken,
      companies,
      requiresCompanySelection,
    } = loginResponse;

    if (userData.status === "pendiente" || userData.status === "rechazado") {
      return json({
        error:
          "Tu cuenta está pendiente de aprobación. Por favor contacta al administrador.",
      });
    }

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
    return json({ error: errorMessage });
  }
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showPassword, setShowPassword] = useState(false);
  const [loginType, setLoginType] = useState<"email" | "rfc">("email");
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Marketing-side hero (desktop only) */}
      <aside
        className="hidden lg:flex relative flex-col justify-between border-r border-line p-12 overflow-hidden"
        style={{
          backgroundColor: "var(--paper-2)",
          backgroundImage:
            "radial-gradient(ellipse at 90% 100%, oklch(0.88 0.06 45 / 0.4) 0%, transparent 55%), radial-gradient(ellipse at 0% 0%, oklch(0.92 0.05 140 / 0.3) 0%, transparent 45%)",
        }}
      >
        <BrandMark />
        <HeroCopy />
        <DotPattern />
      </aside>

      {/* Form column — warm paper with a soft top-right wash so it reads as
          intentional cream, not flat gray. */}
      <main
        className="relative flex items-center justify-center p-6 lg:p-12"
        style={{
          backgroundColor: "var(--paper)",
          backgroundImage:
            "radial-gradient(ellipse at 100% 0%, oklch(0.95 0.04 50 / 0.5) 0%, transparent 60%)",
        }}
      >
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
            Bienvenido <em>de vuelta</em>
          </h1>
          <p className="ff-page-sub mb-8">
            Ingresa con tu correo si eres administrador, o con tu RFC si eres
            proveedor.
          </p>

          <div
            role="radiogroup"
            aria-label="Tipo de acceso"
            className="grid grid-cols-2 gap-1.5 mb-6 rounded-lg border border-line p-1 bg-paper"
          >
            <RoleTab
              active={loginType === "email"}
              onClick={() => setLoginType("email")}
              icon="vendors"
              label="Empresa"
              hint="Email"
            />
            <RoleTab
              active={loginType === "rfc"}
              onClick={() => setLoginType("rfc")}
              icon="orders"
              label="Proveedor"
              hint="RFC"
            />
          </div>

          <Form method="post" className="space-y-4">
            <input type="hidden" name="loginType" value={loginType} />

            {loginType === "email" ? (
              <div className="space-y-1.5">
                <Label htmlFor="user-email" className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                  Correo
                </Label>
                <Input
                  id="user-email"
                  name="email"
                  type="text"
                  placeholder="ejemplo@empresa.com"
                  required
                  className="h-11"
                  autoComplete="username"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="user-rfc" className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                  RFC
                </Label>
                <Input
                  id="user-rfc"
                  name="rfc"
                  type="text"
                  placeholder="XAXX010101000"
                  required
                  className="h-11 font-mono uppercase"
                  maxLength={13}
                  style={{ textTransform: "uppercase" }}
                  autoComplete="username"
                />
                <p className="text-[11px] text-ink-3">
                  Ingresa tu RFC registrado en la plataforma.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="user-password" className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                  Contraseña
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-[12px] text-clay hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="user-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  className="h-11 pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-3 hover:text-ink"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  <Icon name="eye" size={16} />
                </button>
              </div>
            </div>

            {actionData?.error ? (
              <Alert variant="destructive" className="bg-wine-soft text-wine border-wine/20">
                <Icon name="warn" size={14} className="text-wine" />
                <AlertDescription className="text-[12px]">
                  {actionData.error}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              variant="clay"
              className="w-full h-11"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión…
                </>
              ) : (
                <>Iniciar sesión</>
              )}
            </Button>
          </Form>

          <p className="mt-7 text-center text-[13px] text-ink-3">
            ¿No tienes una cuenta?{" "}
            <Link
              to="/register"
              className="font-medium text-clay hover:underline"
            >
              Regístrate aquí
            </Link>
          </p>

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
        Procurement industrial,
        <br />
        <em className="text-clay">claro y conciliado.</em>
      </h2>
      <p className="mt-5 text-[14.5px] text-ink leading-relaxed">
        Sigue cada orden de compra desde el OC hasta el remito y la
        nota de crédito. Concilia pagos a múltiples facturas. Reportes de
        antigüedad y desempeño listos para contabilidad.
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
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider border shadow-sm",
              c.tone === "moss" && "bg-moss-soft text-moss-deep border-moss/30",
              c.tone === "clay" && "bg-clay-soft text-clay-deep border-clay/30",
              c.tone === "rust" && "bg-rust-soft text-rust-deep border-rust/30",
              c.tone === "ink" && "bg-paper text-ink border-line-2",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                c.tone === "moss" && "bg-moss",
                c.tone === "clay" && "bg-clay",
                c.tone === "rust" && "bg-rust",
                c.tone === "ink" && "bg-ink-3",
              )}
            />
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
      className="absolute inset-0 pointer-events-none opacity-30"
      style={{
        backgroundImage:
          "radial-gradient(oklch(0.55 0.12 40 / 0.45) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        backgroundPosition: "-11px -11px",
        maskImage:
          "radial-gradient(ellipse at 80% 70%, transparent 20%, black 75%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at 80% 70%, transparent 20%, black 75%)",
      }}
    />
  );
}

interface RoleTabProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  hint: string;
}

function RoleTab({ active, onClick, icon, label, hint }: RoleTabProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md px-3 py-2.5 transition-colors text-left",
        active
          ? "bg-ink text-paper"
          : "text-ink-2 hover:bg-paper-2",
      )}
    >
      <span className="flex items-center gap-2 text-[13px] font-medium">
        <Icon name={icon} size={14} />
        {label}
      </span>
      <span
        className={cn(
          "text-[10.5px] font-mono uppercase tracking-wider",
          active ? "text-paper/70" : "text-ink-3",
        )}
      >
        ↳ {hint}
      </span>
    </button>
  );
}
