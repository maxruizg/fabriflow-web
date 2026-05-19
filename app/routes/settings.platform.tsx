import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";

import { getAccessTokenFromSession, requireUser } from "~/lib/session.server";
import {
  fetchPendingBuyerActivation,
  type PendingBuyerActivation,
} from "~/lib/api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";

export const meta: MetaFunction = () => [
  { title: "Plataforma — FabriFlow" },
];

export const handle = {
  crumb: ["Configuración", "Plataforma"],
  cta: null,
};

interface LoaderData {
  pending: PendingBuyerActivation | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const token = await getAccessTokenFromSession(request);
  const pending = token ? await fetchPendingBuyerActivation(token) : null;
  return json<LoaderData>({ pending });
}

export default function SettingsPlatform() {
  const { pending } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isActivating =
    navigation.state !== "idle" &&
    navigation.formAction === "/dashboard/activate-buyer-mode";

  return (
    <AuthLayout>
      <div className="space-y-6 max-w-2xl">
        <header>
          <h1 className="ff-page-title">
            Tu <em>plataforma</em>
          </h1>
          <p className="ff-page-sub">
            Convierte tu cuenta en una operación de compra y empieza a invitar
            a tus propios proveedores.
          </p>
        </header>

        {pending ? (
          <Card className="border-clay/30 bg-clay-soft">
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-clay text-paper">
                  <Icon name="vendors" size={16} />
                </span>
                <div>
                  <CardTitle className="text-[15px] text-clay-deep">
                    Activa tu plataforma para tus propios proveedores
                  </CardTitle>
                  <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">
                    Vamos a habilitar la operación de compra para{" "}
                    <strong className="text-ink">{pending.companyName}</strong>.
                    Usaremos los mismos datos fiscales que ya nos compartiste
                    al registrarte como proveedor. Después podrás invitar a tus
                    proveedores y recibir sus facturas.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form method="post" action="/dashboard/activate-buyer-mode">
                <input
                  type="hidden"
                  name="companyId"
                  value={pending.companyId}
                />
                <Button
                  type="submit"
                  variant="clay"
                  className="w-full sm:w-auto"
                  disabled={isActivating}
                >
                  {isActivating ? "Activando…" : "Activar modo comprador"}
                </Button>
              </Form>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-moss/30 bg-moss-soft">
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-moss text-paper">
                  <Icon name="check" size={16} />
                </span>
                <div>
                  <CardTitle className="text-[15px] text-moss-deep">
                    Plataforma activa
                  </CardTitle>
                  <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">
                    Tu cuenta ya opera como comprador. Cambia entre tu
                    operación y las empresas donde eres proveedor desde el
                    selector de operación al iniciar sesión.
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}
      </div>
    </AuthLayout>
  );
}
