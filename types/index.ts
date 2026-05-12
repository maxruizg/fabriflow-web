export interface SerializeDetail {
  descripcion: string;
  unidad: string;
}

export interface Detail {
  description: string;
  unit: string;
}

export interface SerializePayment {
  entry_date: string;
  fecha: string;
  id_pdf: string;
  referencia: string;
  tipo_documento: string;
  total: string;
  tipo_cambio: string;
}

export interface Payment {
  entryDate: string;
  date: string;
  idPdf: string;
  reference: string;
  documentType: string;
  total: string;
  exchangeRate: string;
}

export interface SerializePaymentComplement {
  tipo_documento: string;
  folio: string;
  numero_operacion: string;
  total: string;
  fecha: string;
  moneda: string;
  id_pdf: string;
  id_xml: string;
  uuid: string;
  entry_date: string;
}

export interface PaymentComplement {
  documentType: string;
  folio: string;
  operationNumber: string;
  total: string;
  date: string;
  currency: string;
  idPdf: string;
  idXml: string;
  uuid: string;
  entryDate: string;
}

export interface SerializeCancel {
  tipo_documento: string;
  fecha: string;
  entry_date: string;
  id_xml: string;
  id_pdf: string;
}

export interface Cancel {
  documentType: string;
  date: string;
  entryDate: string;
  idXml: string;
  idPdf: string;
}

export interface SerializeReceipt {
  tipo_documento: string;
  id_pdf: string;
  entry_date: string;
  num: number;
}

export interface Receipt {
  documentType: string;
  idPdf: string;
  date: string;
  num: number;
}

export interface SerializeMultiComplement {
  tipo_documento: string;
  folio: string;
  uuid: string;
  moneda: string;
  total: string;
  fecha: string;
  entry_date: string;
  id_pdf: string;
  id_xml: string;
}

export interface MultiComplement {
  documentType: string;
  folio: string;
  uuid: string;
  currency: string;
  total: string;
  date: string;
  entryDate: string;
  idPdf: string;
  idXml: string;
}

export type SerializeComplement =
  | SerializePayment
  | SerializePaymentComplement
  | SerializeCancel
  | SerializeReceipt
  | SerializeMultiComplement;

export type Complement =
  | Payment
  | PaymentComplement
  | Cancel
  | Receipt
  | MultiComplement;

export interface SerializeInvoice {
  company: string;
  condiciones_pago: string;
  detalle: SerializeDetail[];
  entry_date: string;
  folio: string;
  invoice_date: string;
  metodo_pago: string;
  moneda: string;
  nombre_emisor: string;
  status: string;
  subtotal: string;
  total: string;
  url_pdf_file: string;
  url_xml_file: string;
  user: string;
  uso_cfdi: string;
  uuid: string;
  saldo: number;
  tipo_cambio: string;
  complementos: SerializeComplement[];
}

export interface RelatedDocument {
  type: 'order' | 'payment';
  name: string;
  url: string;
  mimeType: string;
  uploadDate: string;
}

export interface Invoice {
  company: string;
  paymentConditions: string;
  details: Detail[];
  entryDate: string;
  folio: string;
  invoiceDate: string;
  paymentMethod: string;
  currency: string;
  issuerName: string;
  status: string;
  subtotal: string;
  total: string;
  urlPdfFile: string;
  urlXmlFile: string;
  user: string;
  useCfdi: string;
  uuid: string;
  balance: number;
  exchangeRate: string;
  complements: Complement[];
  relatedDocuments?: RelatedDocument[];
}

export type DocumentType =
  | 'pago'
  | 'factura'
  | 'nota'
  | 'cancelacion'
  | 'complemento'
  | 'recepcion'
  | 'multipago'
  | 'multicomp'
  | 'generica';

export interface SerializeBalances {
  total_balance: number;
  subtotal_balance: number;
  saldo_balance: number;
  document_count: number;
  _id: string;
}

export interface SerializeBalanceData {
  MXN: SerializeBalances;
  USD: SerializeBalances;
}

export interface Balances {
  totalBalance: number;
  subtotalBalance: number;
  balance: number;
  documentCount: number;
  currency: string;
}

export interface BalanceData {
  MXN: Balances;
  USD: Balances;
}

export interface Filters {
  user?: string;
  name?: string;
  company?: string;
  folio?: string;
  status?: string;
  uuid?: string;
  date?: Date;
  entryDate?: Date;
  limit?: number;
  dateSort?: 'asc' | 'desc';
  entryDateSort?: 'asc' | 'desc';
}

export interface SerializeProvider {
  moneda: string;
  nombre: string;
  rfc: string;
  total_mxn: number;
  total_usd: number;
  status: 'activo' | 'pendiente' | 'rechazado';
  clave: string;
  email: string;
  password: string;
}

export interface Provider {
  moneda: string;
  nombre: string;
  rfc: string;
  mxnTotal: number;
  usdTotal: number;
  status: 'activo' | 'pendiente' | 'rechazado' | 'revisar';
  clave: string;
  email: string;
  password: string;
}

export interface Admin {
  email: string;
  permissions: string[];
  last_login: string;
}

export interface SerializeMultiPayment {
  tipo_documento: string;
  referencia: string;
  total: string;
  tipo_cambio: string;
  fecha: string;
  entry_date: string;
  id_pdf: string;
}

export interface MultiPayment {
  documentType: string;
  reference: string;
  total: string;
  exchangeRate: string;
  date: string;
  entryDate: string;
  idPdf: string;
}

// ============================================================================
// Backend Invoice Types (from Rust API)
// ============================================================================

/** Estado de factura del backend */
export type InvoiceStatus = 'pendiente' | 'recibido' | 'pagado' | 'completado' | 'rechazado';

/** Detalle/concepto de factura del backend */
export interface InvoiceDetailBackend {
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
}

/** Factura del backend (Rust API) */
export interface InvoiceBackend {
  id: string;
  createdAt: string;
  updatedAt: string;
  company: string;
  vendor?: string;
  folio: string;
  uuid: string;
  fechaEmision: string;
  fechaEntrada: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  subtotal: number;
  total: number;
  moneda: string;
  tipoCambio?: number;
  estado: InvoiceStatus;
  detalles: InvoiceDetailBackend[];
  pdfUrl?: string;
  xmlUrl?: string;
  ordenCompraUrl?: string;
  // Storage keys — siempre presentes en el payload de listado/detalle.
  // Las `*Url` arriba sólo vienen de `GET /api/invoices/{id}/urls` o `/document`,
  // así que para "tiene PDF/XML/OC" hay que mirar las KEYS.
  pdfKey?: string | null;
  xmlKey?: string | null;
  ordenCompraKey?: string | null;
  // Purchase Order relationship (new flow)
  purchaseOrder?: string;  // ID de la orden de compra
  orderFolio?: string;      // Folio de la OC
  amountVariance?: number;  // Diferencia porcentual
  deleted: boolean;
  deletedAt?: string;
}

/** Respuesta paginada con cursor del backend */
export interface CursorPaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

/** Filtros de facturas */
export interface InvoiceFiltersBackend {
  folio?: string;
  uuid?: string;
  estado?: string;
  fechaEmisionDesde?: string;
  fechaEmisionHasta?: string;
  fechaEntradaDesde?: string;
  fechaEntradaHasta?: string;
  cursor?: string;
  limit?: number;
}

/** Request para crear factura */
export interface CreateInvoiceRequest {
  folio: string;
  uuid: string;
  fechaEmision: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  subtotal: number;
  total: number;
  moneda: string;
  tipoCambio?: number;
  detalles: InvoiceDetailBackend[];
  pdfUrl?: string;
  xmlUrl?: string;
  ordenCompraUrl?: string;
}

/** Respuesta de creación de factura */
export interface CreateInvoiceResponse {
  message: string;
  invoice: InvoiceBackend;
}

/** Request para cambiar estado */
export interface UpdateStatusRequest {
  estado: InvoiceStatus;
}

/** Respuesta de URLs */
export interface InvoiceUrlsResponse {
  pdfUrl?: string;
  xmlUrl?: string;
  ordenCompraUrl?: string;
}

/** Respuesta de subida de archivo */
export interface UploadResponse {
  url: string;
  key: string;
  size: number;
  fileType: string;
}

/** Respuesta de subida de orden de compra */
export interface PurchaseOrderUploadResponse {
  url: string;
  key: string;
  size: number;
  valid: boolean;
  message: string;
}

/** Orden de compra disponible para facturar */
export interface OrderForInvoice {
  id: string;
  folio: string;
  date: string;
  amount: number;
  currency: string;
  itemsCount: number;
  hasInvoice: boolean;
}

/** Resultado de validación de totales */
export interface ValidationResult {
  kind: 'exact' | 'within_tolerance' | 'out_of_tolerance';
  variance?: number;
}

// ============================================================================
// Credit Note Types (new Rust API — Task 7)
// ============================================================================

export interface CreditNote {
  id: string;
  createdAt: string;
  updatedAt: string;
  company: string;
  vendor: string | null;
  invoice: string;
  uuid: string;
  folio: string;
  serie: string | null;
  fechaEmision: string;
  fechaEntrada: string;
  fechaTimbrado: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  subtotal: number;
  total: number;
  moneda: string;
  tipoCambio: number | null;
  formaPago: string | null;
  usoCfdi: string | null;
  lugarExpedicion: string;
  tipoRelacion: string;
  relatedInvoiceUuid: string;
  pdfKey: string | null;
  xmlKey: string | null;
}

export type UploadStepStatus = "completed" | "error";
export interface UploadStep {
  label: string;
  status: UploadStepStatus;
  error?: string | null;
}

export type DocKind = "oc" | "rem" | "nc" | "pago" | "comppago";

/**
 * CFDI tipo "P" (Pago) — Complemento de Pagos / REP estructurado tal como
 * lo persiste `payment_complement` en be-v2. No confundir con el tipo legacy
 * `PaymentComplement` (web-v1, declarado más arriba en este mismo archivo)
 * que se usa dentro de la unión `Complement` para la vista de facturas
 * tradicional.
 */
export interface PaymentComplementCfdi {
  id: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  deletedAt?: string | null;
  company: string;
  vendor?: string | null;
  uuid: string;
  folio: string;
  serie?: string | null;
  fechaEmision: string;
  fechaEntrada: string;
  fechaTimbrado: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  montoTotal: number;
  moneda: string;
  lugarExpedicion: string;
  noCertificadoSat?: string | null;
  rfcProvCertif?: string | null;
  versionPago: string;
  pdfKey?: string | null;
  xmlKey?: string | null;
}

export interface PaymentComplementDoctoRel {
  id: string;
  createdAt: string;
  paymentComplementId: string;
  company: string;
  invoice?: string | null;
  pagoIndex: number;
  fechaPago: string;
  formaDePagoP: string;
  monedaP: string;
  montoP: number;
  tipoCambioP?: number | null;
  idDocumento: string;
  serieDr?: string | null;
  folioDr?: string | null;
  monedaDr: string;
  equivalenciaDr?: number | null;
  numParcialidad: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
  objetoImpDr?: string | null;
}

export interface PaymentComplementUploadPayload {
  paymentComplement: PaymentComplementCfdi;
  doctos: PaymentComplementDoctoRel[];
  affectedInvoiceIds: string[];
}

export interface UploadActionResult<TPayload = unknown> {
  ok: boolean;
  kind: DocKind;
  steps: UploadStep[];
  result?: TPayload;
  error?: string;
}

export interface CreditNoteUploadPayload {
  creditNote: CreditNote;
  balance: import("~/lib/procurement-api.server").InvoiceBalance;
}