import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";

import { getFullSession, requireUser } from "~/lib/session.server";
import {
  uploadOrderDoc,
  uploadPaymentReceipt,
  type InvoiceBalance,
} from "~/lib/procurement-api.server";

const ALLOWED_KINDS = new Set(["oc", "rem", "nc", "pago"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

type DocKind = "oc" | "rem" | "nc" | "pago";

interface ActionResult {
  ok: boolean;
  error?: string;
  kind?: DocKind;
  balance?: InvoiceBalance;
}

/**
 * Resource route — receives a multipart upload from the order detail panel,
 * forwards it to the backend with the user's session token, and returns a
 * JSON result. Keeps the access token server-side.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }
  const id = params.id;
  if (!id) {
    return json<ActionResult>({ ok: false, error: "Id obligatorio" }, { status: 400 });
  }

  const fd = await request.formData();
  const kind = String(fd.get("kind") ?? "").toLowerCase();
  const file = fd.get("file");

  if (!ALLOWED_KINDS.has(kind)) {
    return json<ActionResult>(
      { ok: false, error: "Tipo de documento inválido" },
      { status: 400 },
    );
  }
  if (!(file instanceof File) || file.size === 0) {
    return json<ActionResult>(
      { ok: false, error: "Selecciona un archivo" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return json<ActionResult>(
      { ok: false, error: "El archivo excede 10 MB" },
      { status: 400 },
    );
  }

  try {
    const typed = kind as DocKind;
    if (typed === "pago") {
      const { balance } = await uploadPaymentReceipt(
        session.accessToken,
        session.user.company,
        id,
        file,
      );
      return json<ActionResult>({ ok: true, kind: typed, balance });
    }
    await uploadOrderDoc(
      session.accessToken,
      session.user.company,
      id,
      typed,
      file,
    );
    return json<ActionResult>({ ok: true, kind: typed });
  } catch (e) {
    return json<ActionResult>(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Error al subir el documento",
      },
      { status: 400 },
    );
  }
}
