import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";

type ActionData = {
  errors?: {
    [key: string]: string[];
  };
  values?: Record<string, string>;
  success?: string;
  error?: string;
};

import {
  Link,
  redirect,
  useFetcher,
  useNavigate,
  useLoaderData,
} from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buyerRegisterSchema, type BuyerRegisterFormData } from "~/lib/validations/auth";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Icon } from "~/components/ui/icon";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Registrar Empresa — FabriFlow" },
    {
      name: "description",
      content: "Registra tu empresa compradora en FabriFlow",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { getUserFromSession } = await import("~/lib/session.server");
  const user = await getUserFromSession(request);
  if (user) {
    throw redirect("/dashboard");
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();

  // Transformar datos planos a estructura anidada que espera el backend
  const data = {
    name: formData.get("name")?.toString() || "",
    email: formData.get("email")?.toString() || "",
    password: formData.get("password")?.toString() || "",
    company: {
      name: formData.get("company.name")?.toString() || "",
      rfc: formData.get("company.rfc")?.toString() || "",
      email: formData.get("company.email")?.toString() || "",
      phone: formData.get("company.phone")?.toString() || "",
    },
  };

  // Validar con Zod
  const validationResult = buyerRegisterSchema.safeParse(data);

  if (!validationResult.success) {
    return json({
      errors: validationResult.error.flatten().fieldErrors,
      values: Object.fromEntries(formData),
    });
  }

  // Llamar al backend signup
  try {
    const API_URL = typeof process !== "undefined" && process.env?.API_URL
      ? process.env.API_URL
      : "http://localhost:8080";

    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = (await response.json()) as { message?: string; error?: string };

    if (!response.ok) {
      return json({
        error: result.message || result.error || "Error al registrar empresa",
      });
    }

    return json({
      success: "¡Registro exitoso! Tu empresa ha sido creada. Ya puedes iniciar sesión.",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error del servidor. Por favor intente más tarde.";
    return json({ error: errorMessage });
  }
}

export default function BuyerRegister() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BuyerRegisterFormData>({
    resolver: zodResolver(buyerRegisterSchema),
    mode: "onSubmit",
  });

  const isSubmitting = fetcher.state === "submitting";

  // Redirección automática después del éxito
  useEffect(() => {
    if (fetcher.data?.success) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            navigate("/login");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [fetcher.data?.success, navigate]);

  const onSubmit = (data: BuyerRegisterFormData) => {
    const formData = new FormData();
    formData.append("name", data.name);
    formData.append("email", data.email);
    formData.append("password", data.password);
    formData.append("confirmPassword", data.confirmPassword);
    formData.append("company.name", data.company.name);
    formData.append("company.rfc", data.company.rfc.toUpperCase());
    formData.append("company.email", data.company.email);
    formData.append("company.phone", data.company.phone);

    fetcher.submit(formData, { method: "post" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Hero panel — desktop only */}
      <aside className="hidden lg:flex relative flex-col justify-between bg-paper-2 border-r border-line p-12 overflow-hidden">
        <BrandMark />
        <HeroCopy />
        <DotPattern />
      </aside>

      {/* Form column */}
      <main className="relative flex min-h-screen items-start justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[520px] pt-8 pb-12">
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
            Registra tu <em>empresa</em>
          </h1>
          <p className="ff-page-sub mb-6">
            Únete a FabriFlow como empresa compradora y gestiona tus proveedores.
          </p>

          {/* Info callout para proveedores */}
          <div className="flex gap-2.5 rounded-lg border border-clay/20 bg-clay-soft p-3.5 mb-6">
            <Icon
              name="vendors"
              size={14}
              className="mt-0.5 flex-shrink-0 text-clay-deep"
            />
            <p className="text-[12px] text-clay-deep leading-relaxed">
              <strong>¿Eres proveedor?</strong> Los proveedores se registran únicamente por invitación de una empresa compradora. No puedes auto-registrarte aquí.
            </p>
          </div>

          {/* Success state */}
          {fetcher.data?.success ? (
            <div className="space-y-5 mt-6">
              <Alert className="bg-moss-soft border-moss/20">
                <Icon name="check" size={14} className="text-moss-deep" />
                <AlertDescription className="text-[12px] text-moss-deep">
                  {fetcher.data.success}
                </AlertDescription>
              </Alert>
              <p className="text-center text-[13px] text-ink-3">
                Serás redirigido al inicio de sesión en{" "}
                <strong className="text-ink">{countdown}</strong> segundos…
              </p>
              <Link to="/login">
                <Button variant="clay" className="w-full h-11">
                  Ir al inicio de sesión ahora
                </Button>
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-6"
            >
              {/* Sección: Información del Administrador */}
              <div className="space-y-4">
                <div className="border-b border-line pb-2">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">
                    Información del Administrador
                  </h2>
                  <p className="text-[11px] text-ink-3 mt-1">
                    Serás el Super Admin de tu empresa
                  </p>
                </div>

                {/* Nombre del admin */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="name"
                    className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                  >
                    Nombre completo *
                  </Label>
                  <Input
                    id="name"
                    {...register("name")}
                    type="text"
                    placeholder="Juan Pérez"
                    className="h-10 text-sm"
                  />
                  {errors.name && (
                    <p className="text-[11px] text-wine">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* Email del admin */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                  >
                    Email *
                  </Label>
                  <Input
                    id="email"
                    {...register("email")}
                    type="email"
                    placeholder="juan@empresa.com"
                    className="h-10 text-sm"
                  />
                  {errors.email && (
                    <p className="text-[11px] text-wine">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Contraseñas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="password"
                      className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                    >
                      Contraseña *
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        {...register("password")}
                        type={showPassword ? "text" : "password"}
                        placeholder="Mín. 8 caracteres"
                        className="h-10 text-sm pr-9"
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? "Ocultar contraseña"
                            : "Mostrar contraseña"
                        }
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-3 hover:text-ink"
                        onClick={() => setShowPassword((s) => !s)}
                      >
                        <Icon name="eye" size={14} />
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-[11px] text-wine">
                        {errors.password.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="confirmPassword"
                      className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                    >
                      Confirmar *
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        {...register("confirmPassword")}
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repite"
                        className="h-10 text-sm pr-9"
                      />
                      <button
                        type="button"
                        aria-label={
                          showConfirmPassword
                            ? "Ocultar contraseña"
                            : "Mostrar contraseña"
                        }
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-3 hover:text-ink"
                        onClick={() => setShowConfirmPassword((s) => !s)}
                      >
                        <Icon name="eye" size={14} />
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-[11px] text-wine">
                        {errors.confirmPassword.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Sección: Información de la Empresa */}
              <div className="space-y-4">
                <div className="border-b border-line pb-2">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink">
                    Información de la Empresa
                  </h2>
                  <p className="text-[11px] text-ink-3 mt-1">
                    Datos fiscales de tu empresa compradora
                  </p>
                </div>

                {/* Nombre de la empresa */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="company.name"
                    className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                  >
                    Razón Social *
                  </Label>
                  <Input
                    id="company.name"
                    {...register("company.name")}
                    type="text"
                    placeholder="Empresa S.A. de C.V."
                    className="h-10 text-sm"
                  />
                  {errors.company?.name && (
                    <p className="text-[11px] text-wine">
                      {errors.company.name.message}
                    </p>
                  )}
                </div>

                {/* RFC y Teléfono */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="company.rfc"
                      className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                    >
                      RFC *
                    </Label>
                    <Input
                      id="company.rfc"
                      {...register("company.rfc")}
                      type="text"
                      placeholder="ABC123456XYZ"
                      className="h-10 text-sm font-mono uppercase"
                      maxLength={13}
                      style={{ textTransform: "uppercase" }}
                    />
                    {errors.company?.rfc && (
                      <p className="text-[11px] text-wine">
                        {errors.company.rfc.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="company.phone"
                      className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                    >
                      Teléfono *
                    </Label>
                    <Input
                      id="company.phone"
                      {...register("company.phone")}
                      type="tel"
                      placeholder="5512345678"
                      className="h-10 text-sm"
                    />
                    {errors.company?.phone && (
                      <p className="text-[11px] text-wine">
                        {errors.company.phone.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Email de la empresa */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="company.email"
                    className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                  >
                    Email de la Empresa *
                  </Label>
                  <Input
                    id="company.email"
                    {...register("company.email")}
                    type="email"
                    placeholder="contacto@empresa.com"
                    className="h-10 text-sm"
                  />
                  {errors.company?.email && (
                    <p className="text-[11px] text-wine">
                      {errors.company.email.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Error del servidor */}
              {fetcher.data?.error && (
                <Alert className="bg-wine-soft border-wine/20">
                  <Icon name="warn" size={14} className="text-wine" />
                  <AlertDescription className="text-[12px] text-wine">
                    {fetcher.data.error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Botón de envío */}
              <Button
                type="submit"
                variant="clay"
                className="w-full h-11"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creando empresa…
                  </>
                ) : (
                  "Crear empresa"
                )}
              </Button>
            </form>
          )}

          <p className="mt-8 text-center text-[13px] text-ink-3">
            ¿Ya tienes una cuenta?{" "}
            <Link to="/login" className="font-medium text-clay hover:underline">
              Iniciar sesión
            </Link>
          </p>

          <p className="mt-8 text-center text-[11px] font-mono text-ink-4">
            © 2026 FabriFlow · Todos los derechos reservados
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
        Procurement · Facturas · Proveedores
      </p>
      <h2 className="font-display text-[44px] leading-[1.05] font-medium tracking-tight">
        Gestiona tus
        <br />
        <em className="text-clay">proveedores.</em>
      </h2>
      <p className="mt-5 text-[14px] text-ink-2 leading-relaxed">
        Invita a tus proveedores, centraliza facturas y pagos. Reportes de
        antigüedad de cuentas y compliance fiscal en un solo lugar.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        {[
          { tone: "moss", text: "Multi-vendor" },
          { tone: "clay", text: "CFDI validado" },
          { tone: "rust", text: "Invitaciones" },
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
