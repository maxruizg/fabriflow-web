import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";

import { getFullSession, requireUser } from "~/lib/session.server";
import { fetchInvoice, uploadInvoicePayment } from "~/lib/api.server";
import { DocumentUploadScreen } from "~/components/uploads/document-upload-screen";
import { Icon } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { fmtCurrency } from "~/lib/sample-data";
import type { UploadActionResult } from "~/types";
import type { InvoicePaymentUploadResponse } from "~/lib/api.server";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ============================================================================
// Loader — validates invoice exists and returns context for the screen
// ============================================================================

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    throw redirect("/login");
  }

  const invoiceId = params.invoiceId;
  if (!invoiceId) {
    throw new Response("Invoice ID required", { status: 400 });
  }

  // Fetch invoice to verify it exists and get details
  const invoice = await fetchInvoice(session.accessToken, user.company, invoiceId);

  return json({ invoiceId, invoice });
}

// ============================================================================
// Default export — screen component
// ============================================================================

export default function PaymentUploadScreen() {
  const { invoiceId, invoice } = useLoaderData<typeof loader>();
  const backHref = "/payments/new";

  return (
    <DocumentUploadScreen
      kind="pago"
      actionPath={`/payments/${invoiceId}/upload`}
      backHref={backHref}
      renderSuccess={(data) => {
        const result = data.result as { balance?: InvoicePaymentUploadResponse["balanceAfter"] };
        const balance = result?.balance;
        if (!balance) return null;
        return <PaymentSuccessCard balance={balance} invoice={invoice} />;
      }}
    />
  );
}

// ============================================================================
// PaymentSuccessCard — confirmación post-upload
// Muestra el saldo recién recalculado y un CTA para volver a pagos
// ============================================================================

function PaymentSuccessCard({
  balance,
  invoice,
}: {
  balance: InvoicePaymentUploadResponse["balanceAfter"];
  invoice: { folio: string; nombreEmisor: string };
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

      <div className="p-3 rounded-md border border-line bg-paper-2">
        <div className="text-[11px] text-ink-3 font-mono uppercase tracking-wider mb-1">
          Factura
        </div>
        <div className="text-[13px] font-medium">{invoice.nombreEmisor}</div>
        <div className="text-[11px] text-ink-3 font-mono mt-0.5">
          Folio: {invoice.folio}
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
            Saldo cubierto en su totalidad — la factura está completamente pagada.
          </div>
        ) : (
          <Row
            label="Saldo pendiente"
            value={money(balance.outstanding)}
            valueClass="text-rust font-medium"
          />
        )}
      </div>
      <Button asChild variant="clay" size="sm">
        <Link to="/payments">
          <Icon name="chevl" size={12} className="mr-1.5" />
          Ver todos los pagos
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
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    throw redirect("/login");
  }

  const invoiceId = params.invoiceId;
  if (!invoiceId) {
    return json<UploadActionResult>(
      {
        ok: false,
        kind: "pago",
        steps: [{ label: "Subiendo archivo", status: "error", error: "Invoice ID obligatorio" }],
        error: "Invoice ID obligatorio",
      },
      { status: 400 },
    );
  }

  const fd = await request.formData();
  const file = fd.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return json<UploadActionResult>(
      {
        ok: false,
        kind: "pago",
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
        kind: "pago",
        steps: [{ label: "Subiendo archivo", status: "error", error: "El archivo excede 10 MB" }],
        error: "El archivo excede 10 MB",
      },
      { status: 400 },
    );
  }

  try {
    const result = await uploadInvoicePayment(
      session.accessToken,
      user.company,
      invoiceId,
      file,
    );

    return json<UploadActionResult<{ balance: InvoicePaymentUploadResponse["balanceAfter"] }>>({
      ok: true,
      kind: "pago",
      steps: [
        { label: "Subiendo archivo", status: "completed" },
        { label: "Parseando comprobante", status: "completed" },
        { label: "Identificando facturas afectadas", status: "completed" },
        { label: "Asignando montos a facturas", status: "completed" },
        { label: "Guardando pago y recalculando saldo", status: "completed" },
      ],
      result: { balance: result.balanceAfter },
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Error al subir el comprobante";
    return json<UploadActionResult>(
      {
        ok: false,
        kind: "pago",
        steps: [{ label: "Subiendo archivo", status: "error", error: errorMsg }],
        error: errorMsg,
      },
      { status: 400 },
    );
  }
}
