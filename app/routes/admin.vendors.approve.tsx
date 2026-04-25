import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import { json, redirect } from "@remix-run/cloudflare";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { CheckCircle, XCircle, Loader2, UserCheck } from "lucide-react";
import { requireUser, getFullSession } from "~/lib/session.server";
import { approveVendor } from "~/lib/api.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Aprobar Proveedor - FabriFlow" },
    { name: "description", content: "Aprobar solicitud de proveedor" },
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

  if (!userId || !companyId) {
    return json({
      success: false,
      error: "Datos incompletos"
    });
  }

  console.log("[APPROVE] Approving vendor:", userId, "in company:", companyId);

  try {
    const result = await approveVendor(
      session.accessToken,
      companyId,
      userId
    );
    console.log("[APPROVE] Result:", result);

    return json({
      success: true,
      message: result.message,
      error: null
    });
  } catch (error) {
    console.error("Error approving vendor:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Error al aprobar proveedor"
    });
  }
}

export default function ApproveVendor() {
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
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Proveedor Aprobado
          </h1>
          <p className="text-gray-600 mb-6">
            {actionData.message || "El proveedor ha sido aprobado exitosamente y recibira un correo de confirmacion."}
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
            Error al Aprobar
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
      <Card className="max-w-md w-full p-8 text-center">
        <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <UserCheck className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Aprobar Proveedor
        </h1>
        <p className="text-gray-600 mb-6">
          Estas a punto de aprobar la solicitud de este proveedor.
          El proveedor recibira un correo de confirmacion y podra acceder a la plataforma.
        </p>
        <Form method="post">
          <input type="hidden" name="userId" value={userId || ""} />
          <input type="hidden" name="companyId" value={companyId || ""} />
          <div className="flex gap-3 justify-center">
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
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Aprobando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Aprobar Proveedor
                </>
              )}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
