import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

import { requireUser, getFullSession } from "~/lib/session.server";
import {
  fetchCompany,
  patchCompany,
  uploadCompanyLogo,
  deleteCompanyLogo,
  type CompanyBackend,
} from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Icon } from "~/components/ui/icon";
import { FileDropZone } from "~/components/ui/file-drop-zone";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const meta: MetaFunction = () => [
  { title: "Empresa — FabriFlow" },
];

export const handle = {
  crumb: ["Configuración", "Empresa"],
  cta: null,
};

interface LoaderData {
  company: CompanyBackend | null;
  error: string | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    return json<LoaderData>({ company: null, error: "Sesión inválida" });
  }
  try {
    const company = await fetchCompany(session.accessToken, session.user.company);
    return json<LoaderData>({ company, error: null });
  } catch (e) {
    return json<LoaderData>({
      company: null,
      error: e instanceof Error ? e.message : "No se pudo cargar la empresa",
    });
  }
}

interface ActionResult {
  ok: boolean;
  intent: "update-logo" | "delete-logo" | "update-profile";
  message?: string;
  error?: string;
  company?: CompanyBackend;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    return json<ActionResult>(
      { ok: false, intent: "update-profile", error: "Sesión inválida" },
      { status: 401 },
    );
  }
  const token = session.accessToken;
  const companyId = session.user.company;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "update-profile") as ActionResult["intent"];

  try {
    if (intent === "update-logo") {
      const raw = fd.get("logo");
      if (!(raw instanceof File) || raw.size === 0) {
        return json<ActionResult>(
          { ok: false, intent, error: "Selecciona un archivo PNG o JPEG" },
          { status: 400 },
        );
      }
      if (raw.size > LOGO_MAX_BYTES) {
        return json<ActionResult>(
          { ok: false, intent, error: "El logo excede 2 MB" },
          { status: 400 },
        );
      }
      const ct = raw.type.toLowerCase();
      if (ct !== "image/png" && ct !== "image/jpeg" && ct !== "image/jpg") {
        return json<ActionResult>(
          { ok: false, intent, error: "Sólo se aceptan PNG o JPEG" },
          { status: 400 },
        );
      }
      const company = await uploadCompanyLogo(token, companyId, raw);
      return json<ActionResult>({
        ok: true,
        intent,
        company,
        message: "Logo actualizado",
      });
    }

    if (intent === "delete-logo") {
      await deleteCompanyLogo(token, companyId);
      const company = await fetchCompany(token, companyId);
      return json<ActionResult>({
        ok: true,
        intent,
        company,
        message: "Logo eliminado",
      });
    }

    // update-profile
    const name = String(fd.get("name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    const whatsapp = String(fd.get("whatsappPhone") ?? "").trim();
    const domain = String(fd.get("domain") ?? "").trim();
    const company = await patchCompany(token, companyId, {
      name: name || undefined,
      phone: phone || undefined,
      whatsappPhone: whatsapp || undefined,
      domain: domain || undefined,
    });
    return json<ActionResult>({
      ok: true,
      intent,
      company,
      message: "Datos actualizados",
    });
  } catch (e) {
    return json<ActionResult>(
      {
        ok: false,
        intent,
        error: e instanceof Error ? e.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}

export default function SettingsCompany() {
  const { company: initialCompany, error: loaderError } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const nav = useNavigation();
  const submitting = nav.state !== "idle";

  // Optimistically reflect post-action state.
  const company = actionData?.company ?? initialCompany;

  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (actionData?.ok && actionData.intent === "update-logo") {
      setLogoFile(null);
    }
  }, [actionData]);

  return (
    <AuthLayout>
      <div className="space-y-6 max-w-3xl">
        <header>
          <h1 className="ff-page-title">
            Empresa <em>y branding</em>
          </h1>
          <p className="ff-page-sub">
            Personaliza la identidad de tu empresa. El logo aparecerá en cada
            orden de compra y en el encabezado de la app.
          </p>
        </header>

        {loaderError ? (
          <div
            role="alert"
            className="rounded-md border border-wine bg-wine-soft px-4 py-3 text-[13px] text-wine-deep"
          >
            {loaderError}
          </div>
        ) : null}
        {actionData?.error ? (
          <div
            role="alert"
            className="rounded-md border border-wine bg-wine-soft px-4 py-3 text-[13px] text-wine-deep"
          >
            {actionData.error}
          </div>
        ) : null}
        {actionData?.ok && actionData.message ? (
          <div
            role="status"
            className="rounded-md border border-moss bg-moss-soft px-4 py-3 text-[13px] text-moss-deep"
          >
            {actionData.message}
          </div>
        ) : null}

        {/* Logo card */}
        <Card>
          <CardHeader>
            <CardTitle>
              Logo <em className="not-italic text-clay">de la empresa</em>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5 items-start">
              {/* Current logo preview */}
              <div className="rounded-lg border border-line bg-paper-2 p-4 flex items-center justify-center min-h-[140px]">
                {company?.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={`Logo de ${company.name}`}
                    className="max-h-28 max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-ink-3">
                    <Icon name="paper" size={28} className="mx-auto mb-2 text-ink-4" />
                    <div className="text-[12px] font-mono uppercase tracking-wider">
                      Sin logo
                    </div>
                  </div>
                )}
              </div>

              {/* Upload form */}
              <Form method="post" encType="multipart/form-data" className="space-y-3">
                <input type="hidden" name="intent" value="update-logo" />
                <FileDropZone
                  label="Sube tu logo"
                  name="logo"
                  accept=".png,.jpg,.jpeg"
                  maxSize={LOGO_MAX_BYTES}
                  required
                  icon="upload"
                  hint="Arrastra un PNG o JPEG, o haz clic para seleccionarlo"
                  file={logoFile}
                  onFileSelect={setLogoFile}
                  previewKind="image"
                  error={
                    actionData?.intent === "update-logo" && !actionData.ok
                      ? actionData.error
                      : undefined
                  }
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11.5px] text-ink-3">
                    Recomendado: PNG transparente, ~512×512 px. Máximo 2 MB.
                  </p>
                  <div className="flex items-center gap-2">
                    {company?.logoUrl ? (
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        name="intent"
                        value="delete-logo"
                        formEncType="application/x-www-form-urlencoded"
                        disabled={submitting}
                      >
                        <Icon name="x" size={13} />
                        Quitar logo
                      </Button>
                    ) : null}
                    <Button
                      type="submit"
                      variant="clay"
                      size="sm"
                      disabled={submitting || !logoFile}
                    >
                      <Icon name="upload" size={13} />
                      {submitting ? "Subiendo…" : "Guardar logo"}
                    </Button>
                  </div>
                </div>
              </Form>
            </div>
          </CardContent>
        </Card>

        {/* Profile card */}
        <Card>
          <CardHeader>
            <CardTitle>
              Datos <em className="not-italic text-clay">de la empresa</em>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="hidden" name="intent" value="update-profile" />
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Razón social
                </Label>
                <Input
                  name="name"
                  defaultValue={company?.name ?? ""}
                  placeholder="Empresa S.A. de C.V."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  RFC
                </Label>
                <Input value={company?.rfc ?? ""} readOnly disabled />
                <p className="text-[10.5px] text-ink-4">
                  Para cambiar el RFC contacta a soporte.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Correo
                </Label>
                <Input value={company?.email ?? ""} readOnly disabled />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Teléfono
                </Label>
                <Input
                  name="phone"
                  defaultValue={company?.phone ?? ""}
                  placeholder="55 1234 5678"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  WhatsApp
                </Label>
                <Input
                  name="whatsappPhone"
                  defaultValue={company?.whatsappPhone ?? ""}
                  placeholder="+52 55 1234 5678"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Dominio web
                </Label>
                <Input
                  name="domain"
                  defaultValue={company?.domain ?? ""}
                  placeholder="empresa.mx"
                />
              </div>

              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" variant="clay" disabled={submitting}>
                  <Icon name="check" size={13} />
                  {submitting ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
