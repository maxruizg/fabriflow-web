// Server-side API wrappers for the credit-notes endpoints.
// Mirrors the response shapes returned by `be-v2/src/api/credit_notes.rs`.
//
// Usage from a Remix loader / action:
//   const notes = await listCreditNotesForInvoice(token, companyId, invoiceId);
//
// All errors (except 400 on uploadCreditNote) propagate as ApiServerError from
// `api.server.ts`. For uploadCreditNote, a 400 still returns the structured
// UploadActionResult body so route actions can render the failed steps.

import { apiRequest, getApiBaseUrl } from "./api.server";
import type {
  CreditNote,
  UploadActionResult,
  CreditNoteUploadPayload,
} from "~/types";

// ============================================================================
// Helpers (mirrors procurement-api.server.ts conventions)
// ============================================================================

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

// ============================================================================
// Endpoint wrappers
// ============================================================================

/**
 * Upload a credit-note XML (and optional PDF) to the backend.
 *
 * The endpoint returns HTTP 201 on success and HTTP 400 on validation/pipeline
 * failure — both cases deliver a structured `UploadActionResult` body.  We
 * intentionally do NOT throw on a 400 so that route actions can inspect the
 * `steps` array and surface partial-failure details to the user.
 */
export async function uploadCreditNote(
  token: string,
  companyId: string,
  xml: File,
  pdf: File | null,
  /**
   * Optional. When provided, the backend enforces that the NC's CFDI-relacionado
   * UUID resolves to this exact invoice — i.e. the NC must belong to the same
   * invoice the caller has open. Used by the OC-scoped upload flow so a misfiled
   * NC can't silently attach to a different order's invoice.
   */
  expectedInvoiceId?: string | null,
): Promise<UploadActionResult<CreditNoteUploadPayload>> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/credit-notes/upload`;

  const fd = new FormData();
  fd.append("xml", xml);
  if (pdf) fd.append("pdf", pdf);
  if (expectedInvoiceId) fd.append("expected_invoice_id", expectedInvoiceId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Company-Id": companyId,
      // Do NOT set Content-Type — fetch will set the multipart boundary.
    },
    body: fd,
  });

  // Both 201 (success) and 400 (pipeline failure) carry a structured body.
  // Parse and return either; only truly unexpected statuses should throw.
  if (response.status === 201 || response.status === 400) {
    return response.json() as Promise<UploadActionResult<CreditNoteUploadPayload>>;
  }

  // For other non-ok statuses, surface a minimal error result rather than
  // throwing, so the caller always gets an UploadActionResult shape back.
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      ok: false,
      kind: "nc",
      steps: [],
      error: errorText || `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  return response.json() as Promise<UploadActionResult<CreditNoteUploadPayload>>;
}

/**
 * List all credit notes linked to a specific invoice.
 *
 * GET /api/invoices/{invoiceId}/credit-notes → CreditNote[]
 */
export function listCreditNotesForInvoice(
  token: string,
  companyId: string,
  invoiceId: string,
): Promise<CreditNote[]> {
  return apiRequest<CreditNote[]>(
    `/api/invoices/${encodeURIComponent(invoiceId)}/credit-notes`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/**
 * List credit notes with optional cursor-based pagination and filters.
 *
 * GET /api/credit-notes?cursor=...&invoiceId=...&limit=...
 */
export function listCreditNotes(
  token: string,
  companyId: string,
  params: { cursor?: string; invoiceId?: string; limit?: number } = {},
): Promise<{ data: CreditNote[]; nextCursor: string | null; hasMore: boolean }> {
  return apiRequest<{
    data: CreditNote[];
    nextCursor: string | null;
    hasMore: boolean;
  }>(
    `/api/credit-notes${qs(params)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/**
 * Get a short-lived signed URL for a credit-note document (PDF or XML).
 *
 * GET /api/credit-notes/{id}/document?type=pdf|xml → { url: string }
 */
export function getCreditNoteDocument(
  token: string,
  companyId: string,
  id: string,
  type: "pdf" | "xml",
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(
    `/api/credit-notes/${encodeURIComponent(id)}/document${qs({ type })}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/**
 * Soft-delete (or hard-delete) a credit note.
 *
 * DELETE /api/credit-notes/{id} → 204 No Content
 */
export async function deleteCreditNote(
  token: string,
  companyId: string,
  id: string,
): Promise<void> {
  await apiRequest<void>(
    `/api/credit-notes/${encodeURIComponent(id)}`,
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
