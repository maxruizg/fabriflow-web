import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";

import { getFullSession, requireUser } from "~/lib/session.server";
import { deleteOrderDoc, type InvoiceBalance, type OrderBackend } from "~/lib/procurement-api.server";
import { deletePaymentComplement } from "~/lib/payment-complements-api.server";

/**
 * Delete-side superset of DocKind:
 *  - `fac`: unlinks the invoice from the order (no upload counterpart).
 *  - `comppago`: deletes a Complemento de Pago (CFDI tipo P / REP) by its id.
 *    This kind does NOT touch `doc_state`; it forwards to the dedicated
 *    REP endpoint. The caller must include `complementId` in the form body.
 */
type DeleteDocKind = "oc" | "rem" | "nc" | "fac" | "pago" | "comppago";
const VALID_KINDS: DeleteDocKind[] = ["oc", "rem", "nc", "fac", "pago", "comppago"];

interface DeleteDocResult {
  ok: boolean;
  kind: DeleteDocKind;
  result?: { order: OrderBackend; balance: InvoiceBalance | null } | {
    affectedInvoiceIds: string[];
  };
  error?: string;
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }
  const id = params.id;
  if (!id) {
    return json<DeleteDocResult>(
      { ok: false, kind: "oc", error: "Id obligatorio" },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const kindRaw = url.searchParams.get("kind");
  if (!kindRaw || !(VALID_KINDS as string[]).includes(kindRaw)) {
    return json<DeleteDocResult>(
      { ok: false, kind: (kindRaw ?? "oc") as DeleteDocKind, error: "Tipo de documento inválido" },
      { status: 400 },
    );
  }
  const kind = kindRaw as DeleteDocKind;

  // REP delete forwards to the dedicated payment-complements endpoint by id.
  if (kind === "comppago") {
    const fd = await request.formData();
    const complementId = String(fd.get("complementId") ?? "").trim();
    if (!complementId) {
      return json<DeleteDocResult>(
        { ok: false, kind, error: "complementId requerido" },
        { status: 400 },
      );
    }
    try {
      const res = await deletePaymentComplement(
        session.accessToken,
        session.user.company,
        complementId,
      );
      return json<DeleteDocResult>({
        ok: true,
        kind,
        result: { affectedInvoiceIds: res.affectedInvoiceIds },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al borrar el complemento";
      return json<DeleteDocResult>(
        { ok: false, kind, error: message },
        { status: 400 },
      );
    }
  }

  try {
    const result = await deleteOrderDoc(
      session.accessToken,
      session.user.company,
      id,
      kind,
    );
    return json<DeleteDocResult>({ ok: true, kind, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al borrar el documento";
    return json<DeleteDocResult>(
      { ok: false, kind, error: message },
      { status: 400 },
    );
  }
}
