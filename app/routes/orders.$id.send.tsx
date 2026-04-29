import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";

import { getFullSession, requireUser } from "~/lib/session.server";
import { sendOrder, type SendOrderPayload } from "~/lib/procurement-api.server";

export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    return json({ ok: false, error: "Sesión inválida" }, { status: 401 });
  }
  const orderId = params.id;
  if (!orderId) {
    return json({ ok: false, error: "Order id required" }, { status: 400 });
  }
  const fd = await request.formData();
  const channelsRaw = String(fd.get("channels") ?? "").trim();
  const channels = channelsRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (channels.length === 0) {
    return json({ ok: false, error: "Selecciona al menos un canal" }, { status: 400 });
  }

  const payload: SendOrderPayload = {
    channels: channels.filter((c): c is "email" | "whatsapp" => c === "email" || c === "whatsapp"),
    to: {
      email: String(fd.get("email") ?? "").trim() || undefined,
      whatsapp: String(fd.get("whatsapp") ?? "").trim() || undefined,
    },
    message: String(fd.get("message") ?? "").trim() || undefined,
  };

  try {
    const result = await sendOrder(
      session.accessToken,
      session.user.company,
      orderId,
      payload,
    );
    return json({
      ok: result.results.some((r) => r.ok),
      results: result.results,
      pdfUrl: result.pdfUrl,
      publicUrl: result.publicUrl,
    });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "Error al enviar" },
      { status: 500 },
    );
  }
}

// No UI — this route is action-only.
export default function NoUI() {
  return null;
}
