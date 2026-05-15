import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";

import {
  getAccessTokenFromSession,
  getFullSession,
  setCompaniesInSession,
} from "~/lib/session.server";
import { activateBuyerMode, apiRequest } from "~/lib/api.server";
import type { UserCompanyInfo } from "~/lib/auth.server";

// Backend `/api/user/me` response shape — sólo lo que necesitamos para refrescar
// la lista de compañías de la sesión tras activar modo comprador.
interface UserMeResponse {
  userRoles?: Array<{
    companyId: string;
    companyName: string;
    roleName: string;
    permissions: string[];
  }>;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Esta ruta solo acepta POST; cualquier GET regresa al dashboard.
  void request;
  throw redirect("/dashboard");
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getFullSession(request);
  const token = await getAccessTokenFromSession(request);
  if (!session || !token) {
    throw redirect("/login");
  }

  const formData = await request.formData();
  const companyId = formData.get("companyId")?.toString() ?? session.user.company;
  if (!companyId) {
    return json({ error: "Falta el id de la compañía a activar" }, { status: 400 });
  }

  try {
    await activateBuyerMode(token, companyId);
  } catch (error) {
    console.error("activate-buyer-mode failed:", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo activar el modo comprador",
      },
      { status: 500 },
    );
  }

  // Refrescamos las compañías de la sesión leyendo /api/user/me para que
  // /select-company muestre la nueva Operación Principal de inmediato.
  let companies: UserCompanyInfo[] | null = null;
  try {
    const me = await apiRequest<UserMeResponse>(
      "/api/user/me",
      { method: "GET" },
      token,
    );
    companies =
      me.userRoles?.map((r, i) => ({
        id: r.companyId,
        name: r.companyName,
        role: r.roleName,
        permissions: r.permissions ?? [],
        isDefault: i === 0,
      })) ?? null;
  } catch (e) {
    console.warn("Could not refresh companies list after activation:", e);
  }

  if (companies && companies.length > 1) {
    const { headers } = await setCompaniesInSession({
      request,
      companies,
      requiresCompanySelection: true,
    });
    return redirect("/select-company", { headers });
  }

  return redirect("/dashboard");
}
