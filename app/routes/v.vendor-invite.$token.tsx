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

import {
  acceptVendorInvite,
  fetchPublicVendorInvite,
  type PublicVendorInviteResponse,
} from "~/lib/api.server";
import { vendorInviteSchema, type VendorInviteFormData } from "~/lib/validations/auth";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { CSFUploader } from "~/components/csf-uploader";
import type { CSFData } from "~/lib/csf-reader";
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
  const parsed = vendorInviteSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError =
      Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .find((m): m is string => Boolean(m)) ?? "Revisa los datos del formulario.";
    return json<AcceptActionData>({ ok: false, error: firstError }, { status: 400 });
  }

  const data = parsed.data;
  const displayName =
    data.providerType === "legal"
      ? `${data.name ?? ""} ${data.lastname ?? ""}`.trim() || data.providerCompany
      : data.providerCompany;

  try {
    const res = await acceptVendorInvite(token, {
      email: data.email,
      password: data.password,
      name: displayName,
      vendorRfc: data.rfc,
      vendorCompanyType: data.providerType,
      vendorLegalName:
        data.providerType === "legal" ? data.vendorLegalName ?? "" : data.providerCompany,
      contactLastname: data.providerType === "legal" ? data.lastname : undefined,
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
  token: _token,
  invite,
}: {
  token: string;
  invite: PublicVendorInviteResponse;
}) {
  const fetcher = useFetcher<AcceptActionData>();
  const submitting = fetcher.state !== "idle";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [csfExtracted, setCsfExtracted] = useState(false);
  const [countdown, setCountdown] = useState(8);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<VendorInviteFormData>({
    resolver: zodResolver(vendorInviteSchema),
    mode: "onChange",
    defaultValues: {
      email: invite.vendorEmailHint ?? "",
      providerType: "legal",
    },
    shouldUnregister: false,
  });

  const providerType = watch("providerType");

  // Server-side error / success surfacing.
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

  const handleCSFDataExtracted = (csf: CSFData) => {
    if (csf.rfc) {
      setValue("rfc", csf.rfc.toUpperCase(), {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    if (csf.nombre) {
      if (providerType === "personal") {
        setValue("providerCompany", csf.nombre, { shouldValidate: true, shouldDirty: true });
      } else {
        setValue("vendorLegalName", csf.nombre, { shouldValidate: true, shouldDirty: true });
      }
    }
    setCsfExtracted(true);
  };

  const onSubmit = (values: VendorInviteFormData) => {
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
            Completa tus datos para empezar a colaborar. Sube tu Constancia de Situación
            Fiscal y autollenamos lo que podamos.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          {/* Provider type */}
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
              Tipo de proveedor *
            </Label>
            <div
              role="radiogroup"
              aria-label="Tipo de proveedor"
              className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-1 bg-paper"
            >
              <TypeTab
                active={providerType === "legal"}
                onClick={() => {
                  setValue("providerType", "legal", { shouldValidate: true });
                  setValue("providerCompany", "");
                  setValue("vendorLegalName", "");
                  setValue("rfc", "");
                  setCsfExtracted(false);
                }}
                label="Empresa"
                hint="Persona moral"
              />
              <TypeTab
                active={providerType === "personal"}
                onClick={() => {
                  setValue("providerType", "personal", { shouldValidate: true });
                  setValue("providerCompany", "");
                  setValue("vendorLegalName", "");
                  setValue("rfc", "");
                  setCsfExtracted(false);
                }}
                label="Persona"
                hint="Física"
              />
            </div>
            {/* react-hook-form needs the hidden input registered for FormData submission */}
            <input type="hidden" {...register("providerType")} />
            {errors.providerType ? (
              <p className="text-[11px] text-wine">{errors.providerType.message}</p>
            ) : null}
          </div>

          {/* CSF Uploader */}
          <div className="space-y-3">
            <p className="text-[12px] text-ink-3">
              Sube tu Constancia de Situación Fiscal para llenar tu RFC y razón social
              automáticamente.
            </p>
            <CSFUploader
              onDataExtracted={handleCSFDataExtracted}
              onError={(e) => console.error("CSF Error:", e)}
            />
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-line" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-2 text-[11px] font-mono uppercase tracking-wider text-ink-3">
                  o llena manualmente
                </span>
              </div>
            </div>
          </div>

          {/* Name fields */}
          {providerType === "personal" ? (
            <FieldRow
              id="providerCompany"
              label="Tu nombre completo (como en CSF) *"
              error={errors.providerCompany?.message}
            >
              <Input
                id="providerCompany"
                {...register("providerCompany")}
                placeholder="Nombre completo como aparece en tu Constancia"
                className="h-10 text-sm"
              />
            </FieldRow>
          ) : (
            <>
              <FieldRow
                id="providerCompany"
                label="Nombre comercial *"
                error={errors.providerCompany?.message}
              >
                <Input
                  id="providerCompany"
                  {...register("providerCompany")}
                  placeholder="Cómo conoces a tu empresa"
                  className="h-10 text-sm"
                />
              </FieldRow>
              <FieldRow
                id="vendorLegalName"
                label="Razón social *"
                error={errors.vendorLegalName?.message}
              >
                <Input
                  id="vendorLegalName"
                  {...register("vendorLegalName")}
                  placeholder="Razón social completa"
                  className="h-10 text-sm"
                />
              </FieldRow>
            </>
          )}

          {/* RFC + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <FieldRow
              id="rfc"
              label={
                <>
                  RFC *
                  {csfExtracted ? (
                    <span className="normal-case font-normal text-moss-deep ml-1">
                      (de CSF)
                    </span>
                  ) : null}
                </>
              }
              error={errors.rfc?.message}
            >
              <Input
                id="rfc"
                {...register("rfc")}
                placeholder="ABC123456XYZ"
                maxLength={13}
                className={cn(
                  "h-10 text-sm font-mono uppercase",
                  csfExtracted && "bg-paper-2",
                )}
                style={{ textTransform: "uppercase" }}
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

          {/* Contact name (legal only) */}
          {providerType === "legal" ? (
            <div className="grid grid-cols-2 gap-3">
              <FieldRow id="name" label="Contacto: nombre *" error={errors.name?.message}>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder="Nombre"
                  className="h-10 text-sm"
                />
              </FieldRow>
              <FieldRow
                id="lastname"
                label="Contacto: apellido *"
                error={errors.lastname?.message}
              >
                <Input
                  id="lastname"
                  {...register("lastname")}
                  placeholder="Apellido"
                  className="h-10 text-sm"
                />
              </FieldRow>
            </div>
          ) : null}

          {/* Email */}
          <FieldRow id="email" label="Correo electrónico *" error={errors.email?.message}>
            <Input
              id="email"
              {...register("email")}
              type="email"
              placeholder="tu@correo.com"
              className="h-10 text-sm"
            />
          </FieldRow>

          {/* Password */}
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
                  aria-label={showPassword ? "Ocultar" : "Mostrar"}
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
                  aria-label={showConfirmPassword ? "Ocultar" : "Mostrar"}
                >
                  <Icon name="eye" size={14} />
                </button>
              </div>
            </FieldRow>
          </div>

          {serverError ? (
            <Alert className="bg-wine-soft border-wine/20">
              <Icon name="warn" size={14} className="text-wine" />
              <AlertDescription className="text-[12px] text-wine">
                {serverError}
              </AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" variant="clay" disabled={submitting} className="w-full h-11">
            {submitting ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Creando cuenta…
              </>
            ) : (
              <>Aceptar invitación</>
            )}
          </Button>

          <p className="text-center text-[11.5px] text-ink-3 pt-1">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login" className="text-clay hover:underline">
              Inicia sesión
            </Link>
          </p>
          <p className="text-center text-[10.5px] font-mono text-ink-4 pt-2">
            Enviado de forma segura por FabriFlow · {invite.company.name}
          </p>
        </form>
      </main>
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
