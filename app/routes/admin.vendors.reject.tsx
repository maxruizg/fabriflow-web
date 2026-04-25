import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { CheckCircle, XCircle, Loader2, UserX } from "lucide-react";
import { requireUser, getFullSession } from "~/lib/session.server";
import { rejectVendor } from "~/lib/api.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Rechazar Proveedor - FabriFlow" },
    { name: "description", content: "Rechazar solicitud de proveedor" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);

  const userId = url.searchParams.get("user");
  const companyId = url.searchParams.get("company");

  if (!userId || !companyId) {
    return json({
      error: "Parametros invalidos. Se requiere user y company.",
      user,
      userId: null,
      companyId: null,
    });
  }

  // Extract just the ID without the prefix
  const cleanUserId = userId.includes(":") ? userId.split(":")[1] : userId;
  const cleanCompanyId = companyId.includes(":") ? companyId.split(":")[1] : companyId;

  return json({
    error: null,
    user,
    userId: cleanUserId,
    companyId: cleanCompanyId,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getFullSession(request);

  if (!session?.accessToken) {
    return json({
      success: false,
      error: "Sesion invalida. Por favor inicia sesion primero."
    });
  }

  const formData = await request.formData();
  const userId = formData.get("userId") as string;
  const companyId = formData.get("companyId") as string;
  const reason = formData.get("reason") as string | null;

  if (!userId || !companyId) {
    return json({
      success: false,
      error: "Datos incompletos"
    });
  }

  try {
    const result = await rejectVendor(
      session.accessToken,
      companyId,
      userId,
      reason || undefined
    );

    return json({
      success: true,
      message: result.message,
      error: null
    });
  } catch (error) {
    console.error("Error rejecting vendor:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Error al rechazar proveedor"
    });
  }
}

export default function RejectVendor() {
  const { error, userId, companyId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Error de parametros
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button variant="outline" onClick={() => window.close()}>
            Cerrar
          </Button>
        </Card>
      </div>
    );
  }

  // Exito
  if (actionData?.success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <CheckCircle className="h-16 w-16 text-gray-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Proveedor Rechazado
          </h1>
          <p className="text-gray-600 mb-6">
            {actionData.message || "La solicitud del proveedor ha sido rechazada."}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => window.close()}>
              Cerrar
            </Button>
            <Button onClick={() => window.location.href = "/users"}>
              Ver Usuarios
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Error de action
  if (actionData?.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Error al Rechazar
          </h1>
          <p className="text-gray-600 mb-6">{actionData.error}</p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => window.close()}>
              Cerrar
            </Button>
            <Form method="post">
              <input type="hidden" name="userId" value={userId || ""} />
              <input type="hidden" name="companyId" value={companyId || ""} />
              <Button type="submit">Reintentar</Button>
            </Form>
          </div>
        </Card>
      </div>
    );
  }

  // Confirmacion
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8">
        <div className="text-center mb-6">
          <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserX className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Rechazar Proveedor
          </h1>
          <p className="text-gray-600">
            Estas a punto de rechazar la solicitud de este proveedor.
            El proveedor recibira un correo informandole de esta decision.
          </p>
        </div>

        <Form method="post" className="space-y-4">
          <input type="hidden" name="userId" value={userId || ""} />
          <input type="hidden" name="companyId" value={companyId || ""} />

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo del rechazo (opcional)</Label>
            <textarea
              id="reason"
              name="reason"
              placeholder="Explica el motivo del rechazo..."
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex gap-3 justify-center pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.close()}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rechazando...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Rechazar Proveedor
                </>
              )}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
