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
  | "rechazado";

export interface OrderDocState {
  ocUrl: string | null;
  facInvoiceId: string | null;
  remUrl: string | null;
  ncUrl: string | null;
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
