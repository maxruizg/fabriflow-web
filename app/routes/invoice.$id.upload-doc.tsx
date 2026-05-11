import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { DocumentUploadScreen } from "~/components/uploads/document-upload-screen";
import { requireUser, getFullSession } from "~/lib/session.server";
import { uploadCreditNote } from "~/lib/credit-notes-api.server";
import type {
  UploadActionResult,
  CreditNoteUploadPayload,
} from "~/types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "nc") {
    throw new Response("kind no soportado para facturas", { status: 400 });
  }
  return json({ invoiceId: params.id! });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
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
  const fd = await request.formData();
  const xml = fd.get("xml");
  const pdf = fd.get("pdf");
  if (!(xml instanceof File) || xml.size === 0) {
    return json(
      {
        ok: false,
        kind: "nc" as const,
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
  const result = await uploadCreditNote(
    session.accessToken,
    user.company,
    xml,
    pdfFile
  );
  return json(result, { status: result.ok ? 201 : 400 });
}

export default function InvoiceUploadDocScreen() {
  const { invoiceId } = useLoaderData<typeof loader>();
  return (
    <DocumentUploadScreen
      kind="nc"
      actionPath={`/invoice/${invoiceId}/upload-doc?kind=nc`}
      acceptXmlOnly
      backHref={`/invoice/${invoiceId}`}
      renderSuccess={(r) => {
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
