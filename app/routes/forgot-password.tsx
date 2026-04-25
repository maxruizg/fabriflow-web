import { json } from "@remix-run/cloudflare";
import type {
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import {
  Form,
  Link,
  useActionData,
  useNavigation,
} from "@remix-run/react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Icon } from "~/components/ui/icon";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Recuperar Contraseña — FabriFlow" },
    {
      name: "description",
      content: "Recupera tu contraseña de FabriFlow",
    },
  ];
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email")?.toString();

  if (!email) {
    return json({
      error: "El email es requerido",
      success: false,
      message: null as string | null,
    });
  }

  try {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:8080";
    const response = await fetch(`${apiUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json() as { message?: string };

    if (!response.ok) {
      return json({
        error: data.message || "Error al procesar la solicitud",
        success: false,
        message: null as string | null,
      });
    }

    return json({
      success: true,
      message:
        "Si el email existe, recibirás un correo con instrucciones para restablecer tu contraseña.",
      error: null as string | null,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return json({
      error: "Error de conexión. Intenta de nuevo más tarde.",
      success: false,
      message: null as string | null,
    });
  }
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

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
            Recupera tu <em>acceso</em>
          </h1>
          <p className="ff-page-sub mb-8">
            Ingresa tu correo y te enviamos las instrucciones para restablecer
            tu contraseña.
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
                <Button variant="outline" className="w-full h-11">
                  <Icon name="arrow" size={14} className="rotate-180 mr-2" />
                  Volver al inicio de sesión
                </Button>
              </Link>
            </div>
          ) : (
            <Form method="post" className="space-y-4">
              {actionData?.error ? (
                <Alert className="bg-wine-soft border-wine/20">
                  <Icon name="warn" size={14} className="text-wine" />
                  <AlertDescription className="text-[12px] text-wine">
                    {actionData.error}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                >
                  Correo Electrónico
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-11"
                />
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
                    Enviando…
                  </>
                ) : (
                  "Enviar instrucciones"
                )}
              </Button>

              <p className="text-center text-[12px] text-ink-3">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1 text-clay hover:underline"
                >
                  <Icon name="chevl" size={12} />
                  Volver al inicio de sesión
                </Link>
              </p>
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
        Recupera tu
        <br />
        <em className="text-clay">acceso.</em>
      </h2>
      <p className="mt-5 text-[14px] text-ink-2 leading-relaxed">
        Te enviaremos un correo con un enlace seguro para que puedas crear una
        nueva contraseña y volver a operar sin interrupciones.
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
