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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { ThemeToggle } from "../../components/ui/theme-toggle";
import {
  Loader2,
  AlertTriangle,
  Factory,
  Building2,
  CheckCircle2,
} from "lucide-react";
import {
  getCompaniesFromSession,
  getAccessTokenFromSession,
  updateSessionWithCompany,
  getUserFromSession,
  sessionStorage,
} from "~/lib/session.server";
import { selectCompany } from "~/lib/auth.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Seleccionar Empresa - FabriFlow" },
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
    // No companies to select, redirect to dashboard
    throw redirect("/dashboard");
  }

  if (companies.length === 1) {
    // Only one company, auto-select it
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

    // Update session with new company context
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
            Hola, {userName}
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold text-center">
              Selecciona una Empresa
            </CardTitle>
            <CardDescription className="text-center">
              Tienes acceso a múltiples empresas. Selecciona con cuál deseas
              trabajar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="space-y-4">
              <div className="space-y-3">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setSelectedCompany(company.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      selectedCompany === company.id
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div
                          className={`p-2 rounded-lg ${
                            selectedCompany === company.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {company.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {company.role}
                          </p>
                          {company.isDefault && (
                            <span className="inline-flex items-center mt-1 text-xs text-primary">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Empresa principal
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedCompany === company.id && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <input type="hidden" name="companyId" value={selectedCompany || ""} />

              {actionData?.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{actionData.error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full h-11"
                disabled={isSubmitting || !selectedCompany}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  "Continuar"
                )}
              </Button>
            </Form>
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
