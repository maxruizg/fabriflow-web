export interface SerializeDetail {
  descripcion: string;
  unidad: string;
}

export interface Detail {
  description: string;
  unit: string;
}

export interface SerializeCreditNote {
  entry_date: string;
  fecha: string;
  folio: string;
  id_pdf: string;
  id_xml: string;
  moneda: string;
  tipo_documento: string;
  total: string;
  uuid: string;
}

export interface CreditNote {
  entryDate: string;
  date: string;
  folio: string;
  idPdf: string;
  idXml: string;
  currency: string;
  documentType: string;
  total: string;
  uuid: string;
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
  | SerializeCreditNote
  | SerializePayment
  | SerializePaymentComplement
  | SerializeCancel
  | SerializeReceipt
  | SerializeMultiComplement;

export type Complement =
  | CreditNote
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