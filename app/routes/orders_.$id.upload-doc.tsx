import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";

import { getFullSession, requireUser } from "~/lib/session.server";
import {
  fetchOrder,
  uploadOrderDoc,
  uploadPaymentReceipt,
  type InvoiceBalance,
} from "~/lib/procurement-api.server";
import { uploadCreditNote } from "~/lib/credit-notes-api.server";
import { uploadPaymentComplement } from "~/lib/payment-complements-api.server";
import { DocumentUploadScreen } from "~/components/uploads/document-upload-screen";
import { Icon } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { fmtCurrency } from "~/lib/sample-data";
import type {
  DocKind,
  UploadActionResult,
  CreditNoteUploadPayload,
  PaymentComplementUploadPayload,
} from "~/types";

const VALID_KINDS: DocKind[] = ["oc", "rem", "nc", "pago", "comppago"];
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
  const backHref = `/orders/${orderId}`;
  return (
    <DocumentUploadScreen
      kind={kind}
      actionPath={`/orders/${orderId}/upload-doc?kind=${kind}`}
      acceptXmlOnly={kind === "nc" || kind === "comppago"}
      backHref={backHref}
      renderSuccess={
        kind === "pago"
          ? (data) => {
              const balance = (
                data as UploadActionResult<{ balance?: InvoiceBalance }>
              ).result?.balance;
              if (!balance) return null;
              return <PaymentSuccessCard balance={balance} backHref={backHref} />;
            }
          : undefined
      }
    />
  );
}

// ============================================================================
// PaymentSuccessCard — confirmación post-upload en el flujo full-screen.
// Muestra el saldo recién recalculado y un CTA para volver a la orden.
// ============================================================================

function PaymentSuccessCard({
  balance,
  backHref,
}: {
  balance: InvoiceBalance;
  backHref: string;
}) {
  const cur: "MXN" | "USD" | "EUR" =
    balance.currency === "USD" || balance.currency === "EUR" || balance.currency === "MXN"
      ? (balance.currency as "MXN" | "USD" | "EUR")
      : "MXN";
  const money = (n: number) => {
    const m = fmtCurrency(n, cur);
    return `${m.symbol}${m.integer}.${m.decimal}`;
  };
  const fullyPaid = balance.outstanding <= 0.01;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Icon
          name={fullyPaid ? "check" : "file"}
          size={16}
          className={fullyPaid ? "text-moss" : "text-clay"}
        />
        <div className="text-[14px] font-medium text-ink">
          {fullyPaid ? "Pago completo registrado" : "Pago parcial registrado"}
        </div>
      </div>
      <div className="space-y-1.5 text-[13px]">
        <Row label="Total facturado" value={money(balance.total)} />
        <Row
          label="Pagado"
          value={money(balance.paid)}
          valueClass={fullyPaid ? "text-moss font-medium" : "text-ink"}
        />
        {balance.credited > 0.01 ? (
          <Row label="Notas de crédito" value={money(balance.credited)} />
        ) : null}
        <div className="border-t border-line my-1.5" />
        {fullyPaid ? (
          <div className="flex items-center gap-1.5 font-medium text-moss">
            <Icon name="check" size={12} />
            Saldo cubierto en su totalidad — la OC pasa a estado "Pagada".
          </div>
        ) : (
          <Row
            label="Saldo pendiente"
            value={money(balance.outstanding)}
            valueClass="text-rust font-medium"
          />
        )}
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to={backHref}>
          <Icon name="chevl" size={12} className="mr-1.5" />
          Volver a la orden
        </Link>
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      <span className={`font-mono tabular-nums ${valueClass ?? "text-ink"}`}>{value}</span>
    </div>
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

    // Resolve the invoice this OC is linked to. The backend will enforce that
    // the NC's CFDI-relacionado matches it — uploading from an OC's flow must
    // not silently attach a NC that belongs to a different invoice.
    let expectedInvoiceId: string | null = null;
    try {
      const order = await fetchOrder(session.accessToken, session.user.company, id);
      expectedInvoiceId = order.docState?.facInvoiceId ?? null;
    } catch (e) {
      console.warn("[orders/:id/upload-doc] could not fetch order for NC validation:", e);
    }

    if (!expectedInvoiceId) {
      return json<UploadActionResult>(
        {
          ok: false,
          kind: "nc",
          steps: [
            {
              label: "Validando factura vinculada",
              status: "error",
              error:
                "Esta orden no tiene factura vinculada. Vincula la factura antes de subir la nota de crédito.",
            },
          ],
          error:
            "Esta orden no tiene factura vinculada. Vincula la factura antes de subir la nota de crédito.",
        },
        { status: 400 },
      );
    }

    const expectedInvoiceUuid = expectedInvoiceId.startsWith("invoice:")
      ? expectedInvoiceId.slice("invoice:".length)
      : expectedInvoiceId;

    const pdfFile = pdf instanceof File && pdf.size > 0 ? pdf : null;
    const result = await uploadCreditNote(
      session.accessToken,
      session.user.company,
      xml,
      pdfFile,
      expectedInvoiceUuid,
    );
    return json<UploadActionResult<CreditNoteUploadPayload>>(result, {
      status: result.ok ? 201 : 400,
    });
  }

  // ------------------------------------------------------------------
  // comppago → uploadPaymentComplement (CFDI tipo P / REP). XML requerido,
  // PDF opcional. El backend exige que el REP referencie la factura PPD de
  // la OC vía expected_invoice_id.
  // ------------------------------------------------------------------
  if (kind === "comppago") {
    const xml = fd.get("xml");
    const pdf = fd.get("pdf");

    if (!(xml instanceof File) || xml.size === 0) {
      return json<UploadActionResult>(
        {
          ok: false,
          kind: "comppago",
          steps: [
            {
              label: "Subiendo archivo XML",
              status: "error",
              error: "Selecciona un archivo XML",
            },
          ],
          error: "Selecciona un archivo XML",
        },
        { status: 400 },
      );
    }

    let expectedInvoiceId: string | null = null;
    try {
      const order = await fetchOrder(session.accessToken, session.user.company, id);
      expectedInvoiceId = order.docState?.facInvoiceId ?? null;
    } catch (e) {
      console.warn("[orders/:id/upload-doc] could not fetch order for REP validation:", e);
    }

    if (!expectedInvoiceId) {
      return json<UploadActionResult>(
        {
          ok: false,
          kind: "comppago",
          steps: [
            {
              label: "Validando factura vinculada",
              status: "error",
              error:
                "Esta orden no tiene factura vinculada. Vincula la factura antes de subir el Complemento de Pago.",
            },
          ],
          error:
            "Esta orden no tiene factura vinculada. Vincula la factura antes de subir el Complemento de Pago.",
        },
        { status: 400 },
      );
    }

    const expectedInvoiceUuid = expectedInvoiceId.startsWith("invoice:")
      ? expectedInvoiceId.slice("invoice:".length)
      : expectedInvoiceId;

    const pdfFile = pdf instanceof File && pdf.size > 0 ? pdf : null;
    const result = await uploadPaymentComplement(
      session.accessToken,
      session.user.company,
      xml,
      pdfFile,
      expectedInvoiceUuid,
    );
    return json<UploadActionResult<PaymentComplementUploadPayload>>(result, {
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
