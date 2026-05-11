import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

import { getFullSession, requireUser } from "~/lib/session.server";
import {
  uploadOrderDoc,
  uploadPaymentReceipt,
  type InvoiceBalance,
} from "~/lib/procurement-api.server";
import { uploadCreditNote } from "~/lib/credit-notes-api.server";
import { DocumentUploadScreen } from "~/components/uploads/document-upload-screen";
import type { DocKind, UploadActionResult, CreditNoteUploadPayload } from "~/types";

const VALID_KINDS: DocKind[] = ["oc", "rem", "nc", "pago"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ============================================================================
// Loader — validates kind and returns context for the screen
// ============================================================================

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (!kind || !(VALID_KINDS as string[]).includes(kind)) {
    throw new Response("kind inválido", { status: 400 });
  }
  return json({ orderId: params.id!, kind: kind as DocKind });
}

// ============================================================================
// Default export — screen component
// ============================================================================

export default function OrderUploadDocScreen() {
  const { orderId, kind } = useLoaderData<typeof loader>();
  return (
    <DocumentUploadScreen
      kind={kind}
      actionPath={`/orders/${orderId}/upload-doc?kind=${kind}`}
      acceptXmlOnly={kind === "nc"}
      backHref={`/orders/${orderId}`}
    />
  );
}

// ============================================================================
// Action — receives the multipart upload and forwards to the backend
// ============================================================================

export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }
  const id = params.id;
  if (!id) {
    return json<UploadActionResult>(
      {
        ok: false,
        kind: "oc",
        steps: [{ label: "Subiendo archivo", status: "error", error: "Id obligatorio" }],
        error: "Id obligatorio",
      },
      { status: 400 },
    );
  }

  // kind comes from the query string — the screen submits to a URL that
  // already encodes the kind (e.g. /orders/123/upload-doc?kind=oc).
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as DocKind | null;

  if (!kind || !(VALID_KINDS as string[]).includes(kind)) {
    return json<UploadActionResult>(
      {
        ok: false,
        kind: (kind ?? "oc") as DocKind,
        steps: [{ label: "Subiendo archivo", status: "error", error: "Tipo de documento inválido" }],
        error: "Tipo de documento inválido",
      },
      { status: 400 },
    );
  }

  const fd = await request.formData();

  // ------------------------------------------------------------------
  // nc → uploadCreditNote (new endpoint, returns UploadActionResult directly)
  // ------------------------------------------------------------------
  if (kind === "nc") {
    const xml = fd.get("xml");
    const pdf = fd.get("pdf");

    if (!(xml instanceof File) || xml.size === 0) {
      return json<UploadActionResult>(
        {
          ok: false,
          kind: "nc",
          steps: [{ label: "Subiendo archivo XML", status: "error", error: "Selecciona un archivo XML" }],
          error: "Selecciona un archivo XML",
        },
        { status: 400 },
      );
    }

    const pdfFile = pdf instanceof File && pdf.size > 0 ? pdf : null;
    const result = await uploadCreditNote(
      session.accessToken,
      session.user.company,
      xml,
      pdfFile,
    );
    return json<UploadActionResult<CreditNoteUploadPayload>>(result, {
      status: result.ok ? 201 : 400,
    });
  }

  // ------------------------------------------------------------------
  // oc / rem / pago → single `file` field
  // ------------------------------------------------------------------
  const file = fd.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return json<UploadActionResult>(
      {
        ok: false,
        kind,
        steps: [{ label: "Subiendo archivo", status: "error", error: "Selecciona un archivo" }],
        error: "Selecciona un archivo",
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return json<UploadActionResult>(
      {
        ok: false,
        kind,
        steps: [{ label: "Subiendo archivo", status: "error", error: "El archivo excede 10 MB" }],
        error: "El archivo excede 10 MB",
      },
      { status: 400 },
    );
  }

  try {
    if (kind === "pago") {
      const { balance } = await uploadPaymentReceipt(
        session.accessToken,
        session.user.company,
        id,
        file,
      );
      return json<UploadActionResult<{ balance: InvoiceBalance }>>({
        ok: true,
        kind,
        steps: [
          { label: "Subiendo archivo", status: "completed" },
          { label: "Parseando comprobante", status: "completed" },
          { label: "Identificando facturas afectadas", status: "completed" },
          { label: "Asignando montos a facturas", status: "completed" },
          { label: "Guardando pago y recalculando saldo", status: "completed" },
        ],
        result: { balance },
      });
    }

    // oc or rem
    await uploadOrderDoc(
      session.accessToken,
      session.user.company,
      id,
      kind,
      file,
    );
    return json<UploadActionResult>({
      ok: true,
      kind,
      steps: [
        { label: "Subiendo archivo", status: "completed" },
        {
          label: kind === "oc" ? "Asociando documento a la OC" : "Asociando remisión a la OC",
          status: "completed",
        },
      ],
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Error al subir el documento";
    return json<UploadActionResult>(
      {
        ok: false,
        kind,
        steps: [{ label: "Subiendo archivo", status: "error", error: errorMsg }],
        error: errorMsg,
      },
      { status: 400 },
    );
  }
}
