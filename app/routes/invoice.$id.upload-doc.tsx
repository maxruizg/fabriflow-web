import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { DocumentUploadScreen } from "~/components/uploads/document-upload-screen";
import { requireUser, getFullSession } from "~/lib/session.server";
import { uploadCreditNote } from "~/lib/credit-notes-api.server";
import { uploadPaymentComplement } from "~/lib/payment-complements-api.server";
import { redirect } from "@remix-run/cloudflare";
import type {
  UploadActionResult,
  CreditNoteUploadPayload,
  PaymentComplementUploadPayload,
  DocKind,
} from "~/types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "nc" && kind !== "comppago") {
    throw new Response("kind no soportado para facturas", { status: 400 });
  }
  return json({ invoiceId: params.id!, kind: kind as DocKind });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  const invoiceId = params.id!;

  if (!session?.accessToken || !user.company) {
    return json(
      {
        ok: false,
        kind: "nc" as const,
        steps: [],
        error: "Sesión inválida",
      } satisfies UploadActionResult,
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as DocKind | null;

  const fd = await request.formData();
  const xml = fd.get("xml");
  const pdf = fd.get("pdf");

  if (!(xml instanceof File) || xml.size === 0) {
    return json(
      {
        ok: false,
        kind: (kind ?? "nc") as DocKind,
        steps: [
          {
            label: "Subiendo archivo XML",
            status: "error" as const,
            error: "Falta el XML",
          },
        ],
        error: "Falta el XML",
      } satisfies UploadActionResult,
      { status: 400 }
    );
  }

  const pdfFile = pdf instanceof File && pdf.size > 0 ? pdf : null;

  // Complemento de pago (CFDI tipo P)
  if (kind === "comppago") {
    const result = await uploadPaymentComplement(
      session.accessToken,
      user.company,
      xml,
      pdfFile,
      invoiceId, // expected invoice UUID
    );

    if (result.ok) {
      return redirect(`/invoice/${invoiceId}`);
    }

    return json<UploadActionResult<PaymentComplementUploadPayload>>(result, {
      status: 400,
    });
  }

  // Nota de crédito (default)
  const result = await uploadCreditNote(
    session.accessToken,
    user.company,
    xml,
    pdfFile
  );
  return json(result, { status: result.ok ? 201 : 400 });
}

export default function InvoiceUploadDocScreen() {
  const { invoiceId, kind } = useLoaderData<typeof loader>();
  return (
    <DocumentUploadScreen
      kind={kind}
      actionPath={`/invoice/${invoiceId}/upload-doc?kind=${kind}`}
      acceptXmlOnly
      backHref={`/invoice/${invoiceId}`}
      renderSuccess={(r) => {
        if (kind === "comppago") {
          return (
            <div className="text-sm space-y-1">
              <div className="font-medium">Complemento de Pago guardado.</div>
              <div className="text-ink-3">
                El pago ha sido registrado exitosamente.
              </div>
            </div>
          );
        }

        // Nota de crédito (default)
        const payload = r.result as CreditNoteUploadPayload | undefined;
        if (!payload) {
          return <div className="text-sm">Nota de crédito guardada.</div>;
        }
        const { creditNote, balance } = payload;
        return (
          <div className="text-sm space-y-1">
            <div className="font-medium">{creditNote.folio} guardada.</div>
            <div className="text-ink-3">
              Nuevo pendiente: {balance.outstanding.toFixed(2)}{" "}
              {balance.currency}
            </div>
          </div>
        );
      }}
    />
  );
}
