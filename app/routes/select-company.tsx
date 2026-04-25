import { json, redirect } from "@remix-run/cloudflare";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Icon } from "~/components/ui/icon";
import { Badge } from "~/components/ui/badge";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import { cn } from "~/lib/utils";
import {
  getCompaniesFromSession,
  getAccessTokenFromSession,
  updateSessionWithCompany,
  getUserFromSession,
} from "~/lib/session.server";
import { selectCompany } from "~/lib/auth.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Seleccionar Empresa — FabriFlow" },
    {
      name: "description",
      content: "Selecciona la empresa con la que deseas trabajar",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUserFromSession(request);

  if (!user) {
    throw redirect("/login");
  }

  const companies = await getCompaniesFromSession(request);

  if (!companies || companies.length === 0) {
    throw redirect("/dashboard");
  }

  if (companies.length === 1) {
    throw redirect("/dashboard");
  }

  return json({ companies, userName: user.name || user.email });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const companyId = formData.get("companyId")?.toString();

  if (!companyId) {
    return json({
      error: "Por favor selecciona una empresa",
    });
  }

  const accessToken = await getAccessTokenFromSession(request);

  if (!accessToken) {
    throw redirect("/login");
  }

  try {
    const result = await selectCompany(companyId, accessToken);

    if (!result.success || !result.user || !result.token) {
      return json({
        error: result.message || "Error al seleccionar empresa",
      });
    }

    const sessionUpdate = await updateSessionWithCompany({
      request,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        status: result.user.status,
        role: result.user.role,
        permissions: result.user.permissions,
        company: result.user.company,
        companyName: result.user.companyName,
      },
      accessToken: result.token,
      refreshToken: result.refreshToken,
    });

    return redirect("/dashboard", sessionUpdate);
  } catch (error) {
    console.error("Select company error:", error);
    return json({
      error:
        error instanceof Error
          ? error.message
          : "Error del servidor. Por favor intente más tarde.",
    });
  }
}

export default function SelectCompany() {
  const { companies, userName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

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
            Elige tu <em>operación activa</em>
          </h1>
          <p className="ff-page-sub mb-8">
            Hola, <strong className="text-ink">{userName}</strong>. Tienes
            acceso a múltiples empresas. Selecciona con cuál deseas trabajar
            ahora.
          </p>

          <Form method="post" className="space-y-4">
            <div className="space-y-2.5">
              {companies.map((company) => {
                const isSelected = selectedCompany === company.id;
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setSelectedCompany(company.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-4 transition-all duration-150 cursor-pointer",
                      isSelected
                        ? "border-clay bg-clay-soft shadow-ff-sm"
                        : "border-line bg-paper hover:border-clay hover:bg-paper-2",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {/* Company icon */}
                        <span
                          className={cn(
                            "mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-md transition-colors",
                            isSelected
                              ? "bg-clay text-paper"
                              : "bg-paper-3 text-ink-2",
                          )}
                        >
                          <Icon name="vendors" size={15} />
                        </span>

                        <div className="min-w-0">
                          <p
                            className={cn(
                              "text-[13px] font-medium leading-tight",
                              isSelected ? "text-clay-deep" : "text-ink",
                            )}
                          >
                            {company.name}
                          </p>
                          <p className="mt-0.5 text-[11px] font-mono text-ink-3 uppercase tracking-wider">
                            {company.role}
                          </p>
                          {company.isDefault && (
                            <Badge
                              tone="moss"
                              className="mt-1.5"
                              noDot={false}
                            >
                              Principal
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Selection indicator */}
                      <span
                        className={cn(
                          "mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 transition-colors",
                          isSelected
                            ? "border-clay bg-clay text-paper"
                            : "border-line bg-paper",
                        )}
                      >
                        {isSelected && <Icon name="check" size={10} />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <input
              type="hidden"
              name="companyId"
              value={selectedCompany || ""}
            />

            {actionData?.error ? (
              <Alert className="bg-wine-soft border-wine/20">
                <Icon name="warn" size={14} className="text-wine" />
                <AlertDescription className="text-[12px] text-wine">
                  {actionData.error}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              variant="clay"
              className="w-full h-11"
              disabled={isSubmitting || !selectedCompany}
            >
              {isSubmitting ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Cargando…
                </>
              ) : (
                <>
                  Continuar
                  <Icon name="arrow" size={15} className="ml-2" />
                </>
              )}
            </Button>
          </Form>

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
        Elige tu
        <br />
        <em className="text-clay">operación activa.</em>
      </h2>
      <p className="mt-5 text-[14px] text-ink-2 leading-relaxed">
        Cada empresa tiene su propio contexto: órdenes, proveedores, facturas y
        pagos. Cambia de operación en cualquier momento desde el menú.
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
