import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  acceptVendorInvite,
  fetchPublicVendorInvite,
  type PublicVendorInviteResponse,
} from "~/lib/api.server";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { cn } from "~/lib/utils";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (data && "kind" in data && data.kind === "ok") {
    return [{ title: `Únete a ${data.invite.company.name} — FabriFlow` }];
  }
  return [{ title: "Invitación — FabriFlow" }];
};

type LoaderData =
  | { kind: "ok"; token: string; invite: PublicVendorInviteResponse }
  | { kind: "expired"; reason: string };

export async function loader({ params }: LoaderFunctionArgs) {
  const token = params.token;
  if (!token) {
    return json<LoaderData>({ kind: "expired", reason: "Enlace incompleto." }, { status: 400 });
  }

  try {
    const invite = await fetchPublicVendorInvite(token);
    return json<LoaderData>({ kind: "ok", token, invite });
  } catch (e) {
    const reason =
      e instanceof Error ? e.message : "El enlace de invitación no es válido o expiró.";
    return json<LoaderData>({ kind: "expired", reason }, { status: 410 });
  }
}

// Schema para paso 2 - completar registro
const registrationSchema = z.object({
  email: z.string().email("Email inválido").max(100),
  password: z.string().min(8, "Mínimo 8 caracteres").max(100),
  confirmPassword: z.string(),
  name: z.string().min(2, "Mínimo 2 caracteres"),
  phone: z.string().min(10, "Mínimo 10 dígitos"),
  vendorLegalName: z.string().min(3, "Mínimo 3 caracteres"),
  providerType: z.enum(["legal", "personal"]),
  constanciaKey: z.string().min(1, "Constancia requerida"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

type AcceptActionData =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function action({ params, request }: ActionFunctionArgs) {
  const token = params.token;
  if (!token) {
    return json<AcceptActionData>({ ok: false, error: "Enlace incompleto." }, { status: 400 });
  }

  const formData = await request.formData();
  const raw = Object.fromEntries(formData);
  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError =
      Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .find((m): m is string => Boolean(m)) ?? "Revisa los datos del formulario.";
    return json<AcceptActionData>({ ok: false, error: firstError }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const res = await acceptVendorInvite(token, {
      email: data.email,
      password: data.password,
      name: data.name,
      constanciaKey: data.constanciaKey, // ✅ Ahora enviamos la key, no el RFC
      vendorCompanyType: data.providerType,
      vendorLegalName: data.vendorLegalName,
      phone: data.phone,
    });
    return json<AcceptActionData>({ ok: true, message: res.message });
  } catch (e) {
    const error = e instanceof Error ? e.message : "No se pudo completar el registro.";
    return json<AcceptActionData>({ ok: false, error }, { status: 400 });
  }
}

export default function VendorInviteLanding() {
  const data = useLoaderData<typeof loader>();
  if (data.kind === "expired") {
    return <ExpiredView reason={data.reason} />;
  }
  return <AcceptForm token={data.token} invite={data.invite} />;
}

function ExpiredView({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-paper-2 flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <BrandRow />
        <h1 className="font-display text-[26px] font-semibold tracking-tight">
          Enlace no disponible
        </h1>
        <p className="text-[14px] text-ink-2 leading-relaxed">{reason}</p>
        <p className="text-[13px] text-ink-3">
          Pide a quien te invitó que envíe una invitación nueva, o{" "}
          <Link to="/login" className="text-clay hover:underline">
            inicia sesión
          </Link>{" "}
          si ya tienes una cuenta.
        </p>
      </div>
    </div>
  );
}

function AcceptForm({
  token,
  invite,
}: {
  token: string;
  invite: PublicVendorInviteResponse;
}) {
  const fetcher = useFetcher<AcceptActionData>();
  const submitting = fetcher.state !== "idle";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [countdown, setCountdown] = useState(8);

  // 🎯 Estado del flujo de 2 pasos
  const [step, setStep] = useState<1 | 2>(1);
  const [uploadingConstancia, setUploadingConstancia] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extractedRfc, setExtractedRfc] = useState<string | null>(null);
  const [constanciaKey, setConstanciaKey] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    mode: "onChange",
    defaultValues: {
      email: invite.vendorEmailHint ?? "",
      providerType: (invite.existingVendor?.vendorCompanyType as "legal" | "personal") || "legal",
      name: invite.existingVendor?.name || "",
      phone: invite.existingVendor?.phone || "",
      vendorLegalName: invite.existingVendor?.name || "",
    },
  });

  const providerType = watch("providerType");

  const serverError =
    fetcher.data && "ok" in fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;
  const success = fetcher.data && "ok" in fetcher.data && fetcher.data.ok ? fetcher.data : null;

  useEffect(() => {
    if (!success) return;
    const id = setInterval(() => {
      setCountdown((c) => Math.max(c - 1, 0));
    }, 1000);
    return () => clearInterval(id);
  }, [success]);

  // 📤 Handler para upload de constancia
  const handleConstanciaUpload = async (file: File) => {
    if (!file) return;

    setUploadingConstancia(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Llamar directamente al backend
      const apiUrl = window.ENV?.API_BASE_URL || "http://localhost:8080";
      const url = `${apiUrl}/api/public/vendor-invite/${encodeURIComponent(token)}/upload-constancia`;

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Error subiendo constancia fiscal';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const result = (await response.json()) as {
        rfc: string;
        constanciaKey: string;
        razonSocial: string | null;
      };

      // ✅ RFC extraído automáticamente
      setExtractedRfc(result.rfc);
      setConstanciaKey(result.constanciaKey);
      setValue("constanciaKey", result.constanciaKey);

      // Auto-llenar razón social si se extrajo
      if (result.razonSocial) {
        setValue("vendorLegalName", result.razonSocial);
      }

      // Avanzar al paso 2
      setStep(2);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Error subiendo constancia";
      setUploadError(error);
    } finally {
      setUploadingConstancia(false);
    }
  };

  const onSubmit = (values: RegistrationFormData) => {
    const formData = new FormData();
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    });
    fetcher.submit(formData, { method: "post" });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-paper-2 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-5">
          <BrandRow />
          <h1 className="font-display text-[26px] font-semibold tracking-tight">
            ¡Cuenta creada!
          </h1>
          <Alert className="bg-moss-soft border-moss/20 text-left">
            <Icon name="check" size={14} className="text-moss-deep" />
            <AlertDescription className="text-[12.5px] text-moss-deep">
              {success.message}
            </AlertDescription>
          </Alert>
          <p className="text-[13px] text-ink-3">
            Tu cuenta en <strong>{invite.company.name}</strong> está activa.
            Inicia sesión para empezar a colaborar.
          </p>
          <Link to="/login">
            <Button variant="clay" className="w-full h-11">
              Ir a iniciar sesión {countdown > 0 ? `(${countdown}s)` : ""}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <main className="mx-auto max-w-[520px] px-4 py-10">
        <BrandRow />
        <div className="mt-6 rounded-lg border border-line bg-paper p-2.5">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 px-2 pt-1">
            Invitación de proveedor
          </p>
          <h1 className="ff-page-title px-2 mt-1">
            Únete a <em>{invite.company.name}</em>
          </h1>
          <p className="ff-page-sub px-2">
            {step === 1
              ? "Sube tu Constancia de Situación Fiscal para extraer tu RFC automáticamente"
              : "Completa tus datos para finalizar tu registro"}
          </p>
        </div>

        {/* 📊 Indicador de pasos */}
        <div className="mt-6 flex items-center gap-2">
          <StepIndicator active={step === 1} completed={step > 1} number={1} label="Constancia fiscal" />
          <div className="h-px flex-1 bg-line" />
          <StepIndicator active={step === 2} completed={false} number={2} label="Datos personales" />
        </div>

        {/* 🔷 PASO 1: Upload de constancia */}
        {step === 1 && (
          <div className="mt-8 space-y-5">
            {/* Mensaje de reactivación */}
            {invite.existingVendor?.isReactivation && (
              <Alert className="bg-clay-soft border-clay/20">
                <Icon name="vendors" size={14} className="text-clay-deep" />
                <AlertDescription className="text-[12px] text-clay-deep">
                  <strong>Reactivación de cuenta.</strong> Detectamos que ya estuviste registrado.
                  Hemos pre-llenado tus datos anteriores. Sube tu constancia fiscal actualizada
                  para continuar.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border border-line bg-paper p-6">
              <h3 className="text-[14px] font-semibold mb-3">
                Sube tu Constancia de Situación Fiscal
              </h3>
              <p className="text-[12px] text-ink-3 mb-4">
                Tu RFC se extraerá automáticamente del documento. Asegúrate de subir la
                constancia vigente emitida por el SAT.
              </p>

              <ConstanciaUploader
                onFileSelect={handleConstanciaUpload}
                uploading={uploadingConstancia}
                error={uploadError}
              />

              {uploadError && (
                <Alert className="mt-4 bg-wine-soft border-wine/20">
                  <Icon name="warn" size={14} className="text-wine" />
                  <AlertDescription className="text-[12px] text-wine">
                    {uploadError}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <p className="text-center text-[11.5px] text-ink-3">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="text-clay hover:underline">
                Inicia sesión
              </Link>
            </p>
          </div>
        )}

        {/* 🔷 PASO 2: Completar registro */}
        {step === 2 && (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
            {/* Mensaje de reactivación con datos pre-llenados */}
            {invite.existingVendor?.isReactivation && (
              <Alert className="bg-clay-soft border-clay/20">
                <Icon name="vendors" size={14} className="text-clay-deep" />
                <AlertDescription className="text-[12px] text-clay-deep">
                  Hemos pre-llenado tus datos anteriores. Puedes actualizarlos si algo cambió.
                </AlertDescription>
              </Alert>
            )}

            {/* RFC extraído (readonly) */}
            <div className="rounded-lg border border-moss/20 bg-moss-soft p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Icon name="check" size={16} className="text-moss-deep" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-moss-deep mb-1">
                    RFC extraído de tu constancia
                  </p>
                  <p className="font-mono text-[18px] font-semibold text-ink">
                    {extractedRfc}
                  </p>
                </div>
              </div>
            </div>

            {/* Tipo de proveedor */}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                Tipo de proveedor *
              </Label>
              <div
                role="radiogroup"
                className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-1 bg-paper"
              >
                <TypeTab
                  active={providerType === "legal"}
                  onClick={() => setValue("providerType", "legal", { shouldValidate: true })}
                  label="Empresa"
                  hint="Persona moral"
                />
                <TypeTab
                  active={providerType === "personal"}
                  onClick={() => setValue("providerType", "personal", { shouldValidate: true })}
                  label="Persona"
                  hint="Física"
                />
              </div>
              <input type="hidden" {...register("providerType")} />
              <input type="hidden" {...register("constanciaKey")} />
            </div>

            {/* Razón social / Nombre completo */}
            <FieldRow
              id="vendorLegalName"
              label={providerType === "legal" ? "Razón social *" : "Nombre completo *"}
              error={errors.vendorLegalName?.message}
            >
              <Input
                id="vendorLegalName"
                {...register("vendorLegalName")}
                placeholder={
                  providerType === "legal"
                    ? "Razón social de tu empresa"
                    : "Tu nombre completo"
                }
                className="h-10 text-sm"
              />
            </FieldRow>

            {/* Nombre de contacto */}
            <FieldRow id="name" label="Nombre de contacto *" error={errors.name?.message}>
              <Input
                id="name"
                {...register("name")}
                placeholder="Tu nombre"
                className="h-10 text-sm"
              />
            </FieldRow>

            {/* Info callout sobre RFC como clave de ingreso */}
            <div className="flex gap-2.5 rounded-lg border border-line bg-paper-2 p-3.5">
              <Icon
                name="vendors"
                size={14}
                className="mt-0.5 flex-shrink-0 text-clay"
              />
              <p className="text-[12px] text-ink-2 leading-relaxed">
                Tu RFC será tu clave de ingreso para iniciar sesión en la plataforma.
              </p>
            </div>

            {/* Email y teléfono */}
            <div className="grid grid-cols-2 gap-3">
              <FieldRow id="email" label="Email *" error={errors.email?.message}>
                <Input
                  id="email"
                  {...register("email")}
                  type="email"
                  placeholder="tu@email.com"
                  className="h-10 text-sm"
                />
              </FieldRow>
              <FieldRow id="phone" label="Teléfono *" error={errors.phone?.message}>
                <Input
                  id="phone"
                  {...register("phone")}
                  type="tel"
                  placeholder="5512345678"
                  className="h-10 text-sm"
                />
              </FieldRow>
            </div>

            {/* Contraseñas */}
            <div className="grid grid-cols-2 gap-3">
              <FieldRow id="password" label="Contraseña *" error={errors.password?.message}>
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
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-3 hover:text-ink"
                  >
                    <Icon name="eye" size={14} />
                  </button>
                </div>
              </FieldRow>
              <FieldRow
                id="confirmPassword"
                label="Confirmar *"
                error={errors.confirmPassword?.message}
              >
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
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-3 hover:text-ink"
                  >
                    <Icon name="eye" size={14} />
                  </button>
                </div>
              </FieldRow>
            </div>

            {serverError && (
              <Alert className="bg-wine-soft border-wine/20">
                <Icon name="warn" size={14} className="text-wine" />
                <AlertDescription className="text-[12px] text-wine">
                  {serverError}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="h-11"
              >
                Atrás
              </Button>
              <Button
                type="submit"
                variant="clay"
                disabled={submitting}
                className="flex-1 h-11"
              >
                {submitting ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creando cuenta…
                  </>
                ) : (
                  "Aceptar invitación"
                )}
              </Button>
            </div>

            <p className="text-center text-[11.5px] text-ink-3">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="text-clay hover:underline">
                Inicia sesión
              </Link>
            </p>
          </form>
        )}

        <p className="text-center text-[10.5px] font-mono text-ink-4 mt-6">
          Enviado de forma segura por FabriFlow · {invite.company.name}
        </p>
      </main>
    </div>
  );
}

// 📤 Componente de upload de constancia
function ConstanciaUploader({
  onFileSelect,
  uploading,
  error,
}: {
  onFileSelect: (file: File) => void;
  uploading: boolean;
  error: string | null;
}) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf") {
        onFileSelect(file);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        dragActive ? "border-clay bg-clay/5" : "border-line hover:border-clay/50",
        uploading && "opacity-50 pointer-events-none",
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleChange}
        disabled={uploading}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      <div className="pointer-events-none">
        {uploading ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-clay border-t-transparent mb-3" />
            <p className="text-[13px] font-medium text-ink-2">
              Procesando constancia...
            </p>
            <p className="text-[11px] text-ink-3 mt-1">Extrayendo RFC del documento</p>
          </>
        ) : (
          <>
            <Icon name="upload" size={24} className="mx-auto text-ink-3 mb-3" />
            <p className="text-[13px] font-medium text-ink-2">
              Arrastra tu constancia aquí o haz clic para seleccionar
            </p>
            <p className="text-[11px] text-ink-3 mt-1">Solo archivos PDF · Máx 5MB</p>
          </>
        )}
      </div>
    </div>
  );
}

// 📊 Indicador de paso
function StepIndicator({
  active,
  completed,
  number,
  label,
}: {
  active: boolean;
  completed: boolean;
  number: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-mono font-semibold transition-colors",
          completed
            ? "bg-moss text-paper"
            : active
              ? "bg-clay text-paper"
              : "bg-paper-2 text-ink-3",
        )}
      >
        {completed ? <Icon name="check" size={12} /> : number}
      </div>
      <span
        className={cn(
          "text-[11px] font-medium",
          active ? "text-ink" : "text-ink-3",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function BrandRow() {
  return (
    <div className="flex items-center gap-3">
      <span className="relative grid h-10 w-10 place-items-center rounded-lg bg-ink text-paper font-display text-[20px] font-semibold italic">
        F
        <span aria-hidden="true" className="absolute inset-1 rounded-[5px] border border-clay" />
      </span>
      <span className="font-display text-[22px] font-semibold tracking-tight">
        Fabri<em className="not-italic font-medium text-clay">Flow</em>
      </span>
    </div>
  );
}

function TypeTab({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md px-3 py-2.5 transition-colors text-left",
        active ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
      )}
    >
      <span className="text-[13px] font-medium">{label}</span>
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

function FieldRow({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
      >
        {label}
      </Label>
      {children}
      {error ? <p className="text-[11px] text-wine">{error}</p> : null}
    </div>
  );
}
