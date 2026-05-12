// Server-side API wrappers for the payment-complement endpoints (CFDI tipo "P" / REP).
// Mirrors `be-v2/src/api/payment_complements.rs`.

import { apiRequest, getApiBaseUrl } from "./api.server";
import type {
  PaymentComplementCfdi,
  PaymentComplementDoctoRel,
  PaymentComplementUploadPayload,
  UploadActionResult,
} from "~/types";

function withCompanyHeader(token: string, companyId: string): RequestInit {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Company-Id": companyId,
    },
  };
}

function qs(params: object): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

/**
 * Upload a payment-complement XML (and optional PDF) to the backend.
 *
 * Returns HTTP 201 on success or HTTP 400 on pipeline failure — both deliver
 * a structured `UploadActionResult`.
 */
export async function uploadPaymentComplement(
  token: string,
  companyId: string,
  xml: File,
  pdf: File | null,
  expectedInvoiceId?: string | null,
): Promise<UploadActionResult<PaymentComplementUploadPayload>> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/payment-complements/upload`;

  const fd = new FormData();
  fd.append("xml", xml);
  if (pdf) fd.append("pdf", pdf);
  if (expectedInvoiceId) fd.append("expected_invoice_id", expectedInvoiceId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Company-Id": companyId,
    },
    body: fd,
  });

  if (response.status === 201 || response.status === 400) {
    return response.json() as Promise<
      UploadActionResult<PaymentComplementUploadPayload>
    >;
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      ok: false,
      kind: "comppago",
      steps: [],
      error: errorText || `HTTP ${response.status}: ${response.statusText}`,
    };
  }
  return response.json() as Promise<
    UploadActionResult<PaymentComplementUploadPayload>
  >;
}

/**
 * List payment complements linked to a specific invoice.
 *
 * GET /api/payment-complements?invoiceId=...
 */
export function listPaymentComplementsForInvoice(
  token: string,
  companyId: string,
  invoiceId: string,
): Promise<{ data: PaymentComplementCfdi[]; nextCursor: string | null; hasMore: boolean }> {
  return apiRequest<{
    data: PaymentComplementCfdi[];
    nextCursor: string | null;
    hasMore: boolean;
  }>(
    `/api/payment-complements${qs({ invoiceId, limit: 200 })}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/**
 * Get a single REP with its DoctoRelacionado rows.
 */
export function getPaymentComplement(
  token: string,
  companyId: string,
  id: string,
): Promise<{ paymentComplement: PaymentComplementCfdi; doctos: PaymentComplementDoctoRel[] }> {
  return apiRequest(
    `/api/payment-complements/${encodeURIComponent(id)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/**
 * Short-lived signed URL for a REP document.
 */
export function getPaymentComplementDocument(
  token: string,
  companyId: string,
  id: string,
  type: "pdf" | "xml",
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(
    `/api/payment-complements/${encodeURIComponent(id)}/document${qs({ type })}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/**
 * Soft-delete a payment complement. The backend re-evaluates any affected OC's
 * `Pagada` status and may revert it to `Facturada` if coverage drops.
 */
export async function deletePaymentComplement(
  token: string,
  companyId: string,
  id: string,
): Promise<{ ok: boolean; affectedInvoiceIds: string[] }> {
  return apiRequest<{ ok: boolean; affectedInvoiceIds: string[] }>(
    `/api/payment-complements/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
      },
    },
    token,
  );
}
