import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

import { getFullSession, requireUser } from "~/lib/session.server";
import { fetchOrderPdfUrl } from "~/lib/procurement-api.server";

/**
 * Resource route — opens the backend-generated OC PDF in a new tab.
 *
 * Keeps the access token server-side: the browser hits `/orders/:id/pdf`,
 * we exchange it for the storage URL via the authenticated API, then 302
 * the browser straight to the PDF. The browser's PDF viewer handles both
 * download and print without us shipping any client-side viewer code.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }
  const id = params.id;
  if (!id) throw redirect("/orders");

  const { url } = await fetchOrderPdfUrl(
    session.accessToken,
    session.user.company,
    id,
  );
  return redirect(url);
}
