// Server-side API wrappers for the Phase-3 procurement endpoints.
// Mirrors the response shapes returned by `be-v2/src/api/{orders,payments,aging,activity,fx_rates,vendors_extended}.rs`.
//
// Usage from a Remix loader:
//   const orders = await fetchOrders(token, companyId, { limit: 50 });
//
// All errors propagate as `ApiServerError` from `api.server.ts`.

import { apiRequest } from "./api.server";

// ============================================================================
// Types — match the camelCase JSON shapes emitted by the Rust handlers.
// ============================================================================

export type OrderStatusBackend =
  | "creada"            // Orden creada, pendiente de autorización
  | "autorizada"        // Orden autorizada, puede enviarse al proveedor
  | "facturada"         // Factura vinculada a la orden
  | "recibido"          // Legacy - order received
  | "en_transito"
  | "confirmado"
  | "revision_calidad"
  | "cerrado"
  | "incidencia"
  | "pendiente_conf"
  | "rechazado"
  | "pagada";          // Pagada en su totalidad (saldo de factura = 0)

export interface OrderDocState {
  ocUrl: string | null;
  facInvoiceId: string | null;
  remUrl: string | null;
  ncUrl: string | null;
  paymentId?: string | null;
  paymentReceiptUrl?: string | null;
}

export interface OrderEvent {
  ts: string;
  kind: string;
  description: string;
  actor: string | null;
}

export interface OrderItem {
  lineNo: number;
  sku?: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface OrderBackend {
  id: string;
  company: string;
  vendor: string;
  folio: string;
  date: string;
  due: string | null;
  amount: number;
  currency: string;
  itemsCount: number;
  items?: OrderItem[];
  notes?: string | null;
  paymentTerms?: string | null;
  deliveryAddress?: string | null;
  // MX-billing fields (backend migration 005)
  deliveryWarehouse?: string | null;
  deliveryDate?: string | null;
  requestingDepartment?: string | null;
  cfdiUse?: string | null;
  paymentMethod?: string | null;
  paymentForm?: string | null;
  observations?: string | null;
  ivaRate?: number;
  status: OrderStatusBackend;
  docState: OrderDocState;
  history: OrderEvent[];
  // Authorization fields
  authorizedBy?: string | null;
  authorizedAt?: string | null;
  rejectionReason?: string | null;
  // Legacy fields
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderItemPayload {
  description: string;
  sku?: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  discount?: number;
}

export interface CreateOrderPayload {
  vendor: string;
  folio: string;
  date: string;
  due?: string;
  currency: string;
  items: CreateOrderItemPayload[];
  notes?: string;
  paymentTerms?: string;
  deliveryAddress?: string;
  deliveryWarehouse?: string;
  deliveryDate?: string;
  requestingDepartment?: string;
  cfdiUse?: string;
  paymentMethod?: string;
  paymentForm?: string;
  observations?: string;
  ivaRate?: number;
}

// ----------------------------------------------------------------------------
// Company (extended in migration 005 for logo branding)
// ----------------------------------------------------------------------------

export type CompanyStatusBackend = "activo" | "suspendido" | "pendiente";

export interface CompanyBackend {
  id: string;
  name: string;
  rfc: string;
  email: string;
  phone: string | null;
  whatsappPhone?: string | null;
  status: CompanyStatusBackend;
  domain: string | null;
  logoContentType?: string | null;
  /** Short-lived signed URL minted by the backend; absent when no logo. */
  logoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatchCompanyPayload {
  name?: string;
  phone?: string;
  whatsappPhone?: string;
  domain?: string;
}

export interface CreateOrderResponse {
  order: OrderBackend;
  shareToken: string;
}

export interface AuthorizeOrderPayload {
  approve: boolean;
  rejectionReason?: string;
}

export interface SendOrderRecipients {
  email?: string;
  whatsapp?: string;
}

export interface SendOrderPayload {
  channels: ("email" | "whatsapp")[];
  to?: SendOrderRecipients;
  message?: string;
  regeneratePdf?: boolean;
}

export interface SendChannelResult {
  channel: string;
  ok: boolean;
  messageId?: string | null;
  error?: string | null;
}

export interface SendOrderResponse {
  results: SendChannelResult[];
  pdfUrl: string;
  publicUrl: string;
}

export interface PublicOrderResponse {
  order: {
    id: string;
    folio: string;
    date: string;
    due: string | null;
    amount: number;
    currency: string;
    items: OrderItem[];
    notes: string | null;
    paymentTerms: string | null;
    deliveryAddress: string | null;
    status: OrderStatusBackend;
    ocUrl: string | null;
  };
  buyer: { name: string; rfc: string };
  vendor: { name: string; rfc: string; email: string };
}

export interface OrderListFilters {
  cursor?: string;
  limit?: number;
  status?: string;
  vendor?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrderListResponse {
  data: OrderBackend[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

export type PaymentMethodBackend =
  | { kind: "TransferenciaSPEI" }
  | { kind: "WireUSD" }
  | { kind: "SEPA" }
  | { kind: "ChequeMxn" }
  | { kind: "Other"; value: string };

export type PaymentStatusBackend =
  | "programado"
  | "pendiente_conf"
  | "confirmado"
  | "rechazado";

export interface BankInfo {
  bank: string;
  clabeMasked: string;
  beneficiary: string;
  rfc: string;
}

export interface PaymentAllocation {
  invoiceId: string;
  amount: number;
  percentage: number;
}

export interface PaymentBackend {
  id: string;
  company: string;
  vendor: string;
  folio: string;
  date: string;
  amount: number;
  currency: string;
  method: PaymentMethodBackend;
  bankInfo: BankInfo | null;
  fxRate: number | null;
  status: PaymentStatusBackend;
  receiptUrl: string | null;
  allocations: PaymentAllocation[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentListFilters {
  cursor?: string;
  limit?: number;
  status?: string;
  vendor?: string;
  dateFrom?: string;
  dateTo?: string;
  /** When ≥ 2, returns only payments with at least this many allocations
   *  (used by the Multipagos tab). */
  minAllocations?: number;
}

export interface PaymentExtractedMeta {
  amount: number | null;
  currency: string | null;
  date: string | null;
  reference: string | null;
  bank: string | null;
}

export interface CreatePaymentPayload {
  vendor: string;
  folio: string;
  date: string;
  amount: number;
  currency: string;
  method: PaymentMethodBackend;
  bankInfo?: BankInfo | null;
  fxRate?: number | null;
  allocations?: PaymentAllocation[];
}

export interface FinalizeMultipaymentResult {
  orderId: string;
  orderStatus: string;
  invoiceId: string;
  outstanding: number;
  paid: number;
}

export interface FinalizeMultipaymentResponse {
  payment: PaymentBackend;
  results: FinalizeMultipaymentResult[];
}

export interface PaymentListResponse {
  data: PaymentBackend[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

export interface AgingBucket {
  label: string;
  daysRange: string;
  amount: number;
  share: number;
  count: number;
}

export interface AgingResponse {
  buckets: AgingBucket[];
  total: number;
  asOf: string;
  currency: string;
}

export type ActivityEventKind =
  | "audit"
  | "order_created"
  | "order_status_changed"
  | "order_doc_uploaded"
  | "payment_created"
  | "payment_confirmed"
  | "payment_rejected";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  ts: string;
  actor: string | null;
  description: string;
  refId: string | null;
}

export interface FxRate {
  base: string;
  quote: string;
  rate: number;
  source: "manual" | "banxico" | "fixer";
  recordedAt: string;
}

export interface MonthlyPerformance {
  year: number;
  month: number;
  onTime: number;
  late: number;
  miss: number;
}

export interface VendorScorecard {
  onTimePct: number;
  rating: number;
  risk: "Bajo" | "Medio" | "Alto";
  monthlyPerformance: MonthlyPerformance[];
  outstandingBalance: number;
  currency: string;
}

// ============================================================================
// Helpers
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

export function fetchOrders(
  token: string,
  companyId: string,
  filters: OrderListFilters = {},
): Promise<OrderListResponse> {
  return apiRequest<OrderListResponse>(
    `/api/orders${qs(filters)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function fetchOrder(
  token: string,
  companyId: string,
  id: string,
): Promise<OrderBackend> {
  return apiRequest<OrderBackend>(
    `/api/orders/${encodeURIComponent(id)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function createOrder(
  token: string,
  companyId: string,
  payload: CreateOrderPayload,
): Promise<CreateOrderResponse> {
  return apiRequest<CreateOrderResponse>(
    `/api/orders`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteOrder(
  token: string,
  companyId: string,
  orderId: string,
): Promise<{ message: string; id: string }> {
  return apiRequest<{ message: string; id: string }>(
    `/api/orders/${encodeURIComponent(orderId)}`,
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

export function authorizeOrder(
  token: string,
  companyId: string,
  orderId: string,
  payload: AuthorizeOrderPayload,
): Promise<OrderBackend> {
  return apiRequest<OrderBackend>(
    `/api/orders/${encodeURIComponent(orderId)}/authorize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function sendOrder(
  token: string,
  companyId: string,
  orderId: string,
  payload: SendOrderPayload,
): Promise<SendOrderResponse> {
  return apiRequest<SendOrderResponse>(
    `/api/orders/${encodeURIComponent(orderId)}/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

/** Saldo de una factura: total facturado, ya pagado, acreditado y lo que falta por cobrar. */
export interface InvoiceBalance {
  total: number;
  paid: number;
  credited: number;
  outstanding: number;
  currency: string;
}

/** Upload a doc (OC/REM/NC) attached to an order. */
export async function uploadOrderDoc(
  token: string,
  companyId: string,
  orderId: string,
  kind: "oc" | "rem" | "nc",
  file: File,
): Promise<OrderBackend> {
  const fd = new FormData();
  fd.append("file", file);
  return apiRequest<OrderBackend>(
    `/api/orders/${encodeURIComponent(orderId)}/docs/${kind}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        // Do NOT set Content-Type — fetch will set the multipart boundary.
      },
      body: fd,
    },
    token,
  );
}

/**
 * Upload de comprobante de pago: el backend extrae el monto, valida contra el
 * saldo pendiente y devuelve la orden actualizada + el saldo posterior.
 */
export async function uploadPaymentReceipt(
  token: string,
  companyId: string,
  orderId: string,
  file: File,
): Promise<{ order: OrderBackend; balance: InvoiceBalance }> {
  const fd = new FormData();
  fd.append("file", file);
  return apiRequest<{ order: OrderBackend; balance: InvoiceBalance }>(
    `/api/orders/${encodeURIComponent(orderId)}/docs/pago`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
      },
      body: fd,
    },
    token,
  );
}

/**
 * Borra un documento adjunto a una OC (oc/rem/nc/fac/pago) y cascadea la
 * limpieza apropiada en el backend (bucket, DB rows, balance, status).
 */
export async function deleteOrderDoc(
  token: string,
  companyId: string,
  orderId: string,
  kind: "oc" | "rem" | "nc" | "fac" | "pago",
): Promise<{ order: OrderBackend; balance: InvoiceBalance | null }> {
  return apiRequest<{ order: OrderBackend; balance: InvoiceBalance | null }>(
    `/api/orders/${encodeURIComponent(orderId)}/docs/${kind}`,
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

/** Lectura independiente del saldo (para vistas que no acaban de subir un comprobante). */
export function fetchInvoiceBalance(
  token: string,
  companyId: string,
  invoiceId: string,
): Promise<InvoiceBalance> {
  return apiRequest<InvoiceBalance>(
    `/api/invoices/${encodeURIComponent(invoiceId)}/balance`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function fetchOrderPdfUrl(
  token: string,
  companyId: string,
  orderId: string,
): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(
    `/api/orders/${encodeURIComponent(orderId)}/pdf`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/** Public landing — no auth header, validates by share token. */
export function fetchPublicOrder(token: string): Promise<PublicOrderResponse> {
  return apiRequest<PublicOrderResponse>(
    `/api/public/orders/${encodeURIComponent(token)}`,
    {},
  );
}

// ----------------------------------------------------------------------------
// Company endpoints
// ----------------------------------------------------------------------------

export function fetchCompany(
  token: string,
  companyId: string,
): Promise<CompanyBackend> {
  return apiRequest<CompanyBackend>(
    `/api/companies/${encodeURIComponent(companyId)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function patchCompany(
  token: string,
  companyId: string,
  payload: PatchCompanyPayload,
): Promise<CompanyBackend> {
  return apiRequest<CompanyBackend>(
    `/api/companies/${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

/**
 * Upload (or replace) the company logo.
 *
 * `file` must be a PNG or JPEG ≤ 2 MB. The backend rejects other formats
 * with a 400. Returns the updated Company including a fresh `logoUrl`.
 */
export async function uploadCompanyLogo(
  token: string,
  companyId: string,
  file: File,
): Promise<CompanyBackend> {
  const fd = new FormData();
  fd.append("logo", file);
  return apiRequest<CompanyBackend>(
    `/api/companies/${encodeURIComponent(companyId)}/logo`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        // Note: do NOT set Content-Type — fetch will set the multipart
        // boundary automatically.
      },
      body: fd,
    },
    token,
  );
}

export async function deleteCompanyLogo(
  token: string,
  companyId: string,
): Promise<void> {
  await apiRequest<void>(
    `/api/companies/${encodeURIComponent(companyId)}/logo`,
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

export interface ActiveVendorSummary {
  id: string;
  name: string;
  rfc: string;
  email: string;
  phone: string | null;
  whatsappPhone: string | null;
}

export function fetchActiveVendors(
  token: string,
  companyId: string,
): Promise<ActiveVendorSummary[]> {
  return apiRequest<ActiveVendorSummary[]>(
    `/api/vendors/active`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function fetchPayments(
  token: string,
  companyId: string,
  filters: PaymentListFilters = {},
): Promise<PaymentListResponse> {
  return apiRequest<PaymentListResponse>(
    `/api/payments${qs(filters)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function fetchPayment(
  token: string,
  companyId: string,
  id: string,
): Promise<PaymentBackend> {
  return apiRequest<PaymentBackend>(
    `/api/payments/${encodeURIComponent(id)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

/**
 * Crea un pago con N allocations en una sola llamada. Devuelve el `Payment`
 * persistido (con `id`) listo para que el caller suba el comprobante y
 * finalice el multipago.
 */
export function createPayment(
  token: string,
  companyId: string,
  payload: CreatePaymentPayload,
): Promise<PaymentBackend> {
  return apiRequest<PaymentBackend>(
    `/api/payments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

/**
 * Sube el archivo del comprobante a Supabase y deja el URL guardado en
 * `payment.receipt_url`. Paso 2 del flujo de multipago.
 */
export async function uploadPaymentReceiptToPayment(
  token: string,
  companyId: string,
  paymentId: string,
  file: File,
): Promise<PaymentBackend> {
  const fd = new FormData();
  fd.append("file", file);
  return apiRequest<PaymentBackend>(
    `/api/payments/${encodeURIComponent(paymentId)}/receipt`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
      },
      body: fd,
    },
    token,
  );
}

/**
 * Lee un comprobante (PDF/imagen/XML) y devuelve los metadatos detectados —
 * amount, currency, date, reference, bank — para pre-llenar el formulario de
 * multipago. No persiste nada.
 */
export async function extractReceiptPdf(
  token: string,
  companyId: string,
  file: File,
): Promise<PaymentExtractedMeta> {
  const fd = new FormData();
  fd.append("file", file);
  return apiRequest<PaymentExtractedMeta>(
    `/api/payments/extract-pdf`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
      },
      body: fd,
    },
    token,
  );
}

/**
 * Paso 3 del multipago: toma un `Payment` con allocations + comprobante ya
 * subido, y propaga el efecto a cada OC vinculada (attach + recompute +
 * evaluate_pagada_for_invoice). Idempotente.
 */
export function finalizeMultipayment(
  token: string,
  companyId: string,
  paymentId: string,
): Promise<FinalizeMultipaymentResponse> {
  return apiRequest<FinalizeMultipaymentResponse>(
    `/api/payments/${encodeURIComponent(paymentId)}/finalize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
    token,
  );
}

/**
 * Orquesta el ciclo completo de un multipago: crear payment → subir
 * comprobante → finalizar. Si cualquiera de los pasos falla intermedios,
 * deja el progreso en backend para que el usuario pueda reintentar
 * (`finalizeMultipayment` es idempotente).
 */
export async function submitMultipayment(
  token: string,
  companyId: string,
  args: {
    payload: CreatePaymentPayload;
    receiptFile: File;
  },
): Promise<FinalizeMultipaymentResponse> {
  const payment = await createPayment(token, companyId, args.payload);
  await uploadPaymentReceiptToPayment(token, companyId, payment.id, args.receiptFile);
  return finalizeMultipayment(token, companyId, payment.id);
}

export function fetchAging(
  token: string,
  companyId: string,
  opts: { asOf?: string; currency?: string } = {},
): Promise<AgingResponse> {
  return apiRequest<AgingResponse>(
    `/api/aging${qs(opts)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function fetchActivity(
  token: string,
  companyId: string,
  opts: { since?: string; limit?: number } = {},
): Promise<ActivityEvent[]> {
  return apiRequest<ActivityEvent[]>(
    `/api/activity${qs(opts)}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function fetchCurrentFxRate(
  token: string,
  companyId: string,
  pair = "USD-MXN",
): Promise<FxRate | null> {
  return apiRequest<FxRate | null>(
    `/api/fx/current${qs({ pair })}`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function fetchVendorScorecard(
  token: string,
  companyId: string,
  vendorId: string,
): Promise<VendorScorecard> {
  return apiRequest<VendorScorecard>(
    `/api/vendors/${encodeURIComponent(vendorId)}/scorecard`,
    withCompanyHeader(token, companyId),
    token,
  );
}

// ============================================================================
// Roles & permission overrides (Discord-style RBAC)
// ============================================================================

export interface RoleBackend {
  id: string;
  company: string;
  name: string;
  permissions: string[];
  color: string | null;
  isSystemRole: boolean;
  isDeletable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRolePayload {
  name: string;
  permissions?: string[];
  color?: string;
}

export interface UpdateRolePayload {
  name?: string;
  permissions?: string[];
  color?: string;
}

export interface PermissionOverride {
  userId: string;
  companyId: string;
  permission: string;
  granted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateOverridesPayload {
  overrides: { permission: string; granted: boolean }[];
}

export function fetchRoles(
  token: string,
  companyId: string,
): Promise<RoleBackend[]> {
  return apiRequest<RoleBackend[]>(
    `/api/roles`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function createRole(
  token: string,
  companyId: string,
  payload: CreateRolePayload,
): Promise<RoleBackend> {
  return apiRequest<RoleBackend>(
    `/api/roles`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateRole(
  token: string,
  companyId: string,
  roleId: string,
  payload: UpdateRolePayload,
): Promise<RoleBackend> {
  return apiRequest<RoleBackend>(
    `/api/roles/${encodeURIComponent(roleId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteRole(
  token: string,
  companyId: string,
  roleId: string,
): Promise<void> {
  return apiRequest<void>(
    `/api/roles/${encodeURIComponent(roleId)}`,
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

export function fetchUserOverrides(
  token: string,
  companyId: string,
  userId: string,
): Promise<PermissionOverride[]> {
  return apiRequest<PermissionOverride[]>(
    `/api/users/${encodeURIComponent(userId)}/permission-overrides`,
    withCompanyHeader(token, companyId),
    token,
  );
}

export function updateUserOverrides(
  token: string,
  companyId: string,
  userId: string,
  payload: UpdateOverridesPayload,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(
    `/api/users/${encodeURIComponent(userId)}/permission-overrides`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function changeUserRole(
  token: string,
  companyId: string,
  userId: string,
  roleId: string,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(
    `/api/users/${encodeURIComponent(userId)}/role`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roleId }),
    },
    token,
  );
}

/**
 * Obtiene las órdenes de compra disponibles para facturar de un proveedor
 */
export function getAvailableOrdersForInvoice(
  token: string,
  companyId: string,
  vendorId: string,
): Promise<import("~/types").OrderForInvoice[]> {
  return apiRequest<import("~/types").OrderForInvoice[]>(
    `/api/orders/available-for-invoice${qs({ vendor_id: vendorId })}`,
    withCompanyHeader(token, companyId),
    token,
  );
}
