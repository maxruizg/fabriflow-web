import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { requireUser, getFullSession } from "~/lib/session.server";
import { deleteCreditNote } from "~/lib/credit-notes-api.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json({ ok: false, error: "Sesión inválida" }, { status: 401 });
  }
  const id = params.id!;
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");
  if (intent !== "delete") {
    return json({ ok: false, error: "Intent no soportado" }, { status: 400 });
  }
  try {
    await deleteCreditNote(session.accessToken, user.company, id);
    return json({ ok: true });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
