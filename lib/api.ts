import axios from 'axios';
import type {
  Invoice,
  SerializeInvoice,
  Provider,
  SerializeProvider,
  Filters,
  SerializeDetail,
  SerializeComplement,
  Complement,
  SerializeMultiComplement,
  SerializeCreditNote,
  SerializePaymentComplement,
  SerializePayment,
  SerializeCancel,
  SerializeReceipt,
  Cancel
} from '~/types';

// API configuration pointing to production Rust API
const API_BASE_URL = process.env.API_BASE_URL || 'https://magavi-rust-backend.fly.dev';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false, // Set to true if backend requires credentials
});

// Transform serialized data to client format
export function transformInvoice(serialized: SerializeInvoice): Invoice {
  return {
    company: serialized.company,
    paymentConditions: serialized.condiciones_pago,
    details: serialized.detalle.map((detail: SerializeDetail) => ({
      description: detail.descripcion,
      unit: detail.unidad,
    })),
    entryDate: serialized.entry_date,
    folio: serialized.folio,
    invoiceDate: serialized.invoice_date,
    paymentMethod: serialized.metodo_pago,
    currency: serialized.moneda,
    issuerName: serialized.nombre_emisor,
    status: serialized.status,
    subtotal: serialized.subtotal,
    total: serialized.total,
    urlPdfFile: serialized.url_pdf_file,
    urlXmlFile: serialized.url_xml_file,
    user: serialized.user,
    useCfdi: serialized.uso_cfdi,
    uuid: serialized.uuid,
    balance: serialized.saldo,
    exchangeRate: serialized.tipo_cambio,
    complements: serialized.complementos.map((comp: SerializeComplement): Complement => {
      // Handle SerializeMultiComplement
      if ('folio' in comp && 'uuid' in comp && 'moneda' in comp && 'fecha' in comp) {
        const multiComp = comp as SerializeMultiComplement;
        return {
          documentType: multiComp.tipo_documento,
          folio: multiComp.folio,
          uuid: multiComp.uuid,
          currency: multiComp.moneda,
          total: multiComp.total,
          date: multiComp.fecha,
          entryDate: multiComp.entry_date,
          idPdf: multiComp.id_pdf,
          idXml: multiComp.id_xml,
        };
      }

      // Handle SerializeCreditNote
      if ('folio' in comp && 'uuid' in comp && 'moneda' in comp && !('referencia' in comp)) {
        const creditNote = comp as SerializeCreditNote;
        return {
          entryDate: creditNote.entry_date,
          date: creditNote.fecha,
          folio: creditNote.folio,
          idPdf: creditNote.id_pdf,
          idXml: creditNote.id_xml,
          currency: creditNote.moneda,
          documentType: creditNote.tipo_documento,
          total: creditNote.total,
          uuid: creditNote.uuid,
        };
      }

      // Handle SerializePaymentComplement
      if ('folio' in comp && 'numero_operacion' in comp) {
        const paymentComp = comp as SerializePaymentComplement;
        return {
          documentType: paymentComp.tipo_documento,
          folio: paymentComp.folio,
          operationNumber: paymentComp.numero_operacion,
          total: paymentComp.total,
          date: paymentComp.fecha,
          currency: paymentComp.moneda,
          idPdf: paymentComp.id_pdf,
          idXml: paymentComp.id_xml,
          uuid: paymentComp.uuid,
          entryDate: paymentComp.entry_date,
        };
      }

      // Handle SerializePayment
      if ('referencia' in comp && 'tipo_cambio' in comp) {
        const payment = comp as SerializePayment;
        return {
          entryDate: payment.entry_date,
          date: payment.fecha,
          idPdf: payment.id_pdf,
          reference: payment.referencia,
          documentType: payment.tipo_documento,
          total: payment.total,
          exchangeRate: payment.tipo_cambio,
        };
      }

      // Handle SerializeCancel
      if ('id_xml' in comp && 'id_pdf' in comp && !('folio' in comp)) {
        const cancel = comp as SerializeCancel;
        return {
          documentType: cancel.tipo_documento,
          date: cancel.fecha,
          entryDate: cancel.entry_date,
          idXml: cancel.id_xml,
          idPdf: cancel.id_pdf,
        };
      }

      // Handle SerializeReceipt
      if ('num' in comp) {
        const receipt = comp as SerializeReceipt;
        return {
          documentType: receipt.tipo_documento,
          idPdf: receipt.id_pdf,
          date: receipt.entry_date,
          num: receipt.num,
        };
      }

      // Fallback - create a basic complement
      return {
        documentType: comp.tipo_documento || 'unknown',
        date: '',
        entryDate: comp.entry_date || '',
        idXml: '',
        idPdf: '',
      } as Cancel;
    }),
  };
}

export function transformProvider(serialized: SerializeProvider): Provider {
  return {
    moneda: serialized.moneda,
    nombre: serialized.nombre,
    rfc: serialized.rfc,
    mxnTotal: serialized.total_mxn,
    usdTotal: serialized.total_usd,
    status: serialized.status === 'activo' ? 'activo' :
            serialized.status === 'pendiente' ? 'pendiente' :
            serialized.status === 'rechazado' ? 'rechazado' : 'revisar',
    clave: serialized.clave,
    email: serialized.email,
    password: serialized.password,
  };
}

// Enhanced error handling
interface AxiosError {
  code?: string;
  message?: string;
  response?: {
    status: number;
  };
}

function isAxiosError(error: unknown): error is AxiosError {
  return typeof error === 'object' && error !== null && 'response' in error;
}

function handleApiError(error: unknown, resource: string) {
  if (isAxiosError(error)) {
    if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error') {
      throw new Error(`Network connection failed while loading ${resource}. Please check your internet connection.`);
    }

    if (error.response?.status === 401) {
      throw new Error(`Authentication failed. Please login again.`);
    }

    if (error.response?.status === 404) {
      throw new Error(`${resource} endpoint not found. The service may be temporarily unavailable.`);
    }

    if (error.response?.status === 502) {
      throw new Error(`Server is currently unavailable. Please try again later.`);
    }

    if (error.response?.status === 500) {
      throw new Error(`Server error while loading ${resource}. Our servers are experiencing issues.`);
    }

    if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
      throw new Error(`Failed to load ${resource}. Please try again later.`);
    }
  }

  throw new Error(`Unable to load ${resource}. Please check your connection and try again.`);
}

// Utility function to set authentication token
export function setAuthToken(token: string) {
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

// Utility function to clear authentication token
export function clearAuthToken() {
  delete api.defaults.headers.common.Authorization;
}

// API functions for the new Rust API
export async function fetchInvoices(filters?: Filters): Promise<Invoice[]> {
  try {
    const response = await api.get('/api/invoices', { params: filters });
    return response.data.invoices?.map(transformInvoice) || [];
  } catch (error) {
    console.error('Error fetching invoices:', error);
    handleApiError(error, 'invoices');
    return []; // This line should never be reached due to throw above
  }
}

export async function fetchProviders(): Promise<Provider[]> {
  try {
    const response = await api.get('/api/vendors');
    return response.data.map(transformProvider);
  } catch (error) {
    console.error('Error fetching providers:', error);
    handleApiError(error, 'providers');
    return []; // This line should never be reached due to throw above
  }
}

interface Balance {
  currency: string;
  total_balance: number;
  pending_balance: number;
  paid_balance: number;
  invoice_count: number;
}

export async function fetchBalances(filters?: Filters): Promise<Balance[]> {
  try {
    const response = await api.get('/api/invoices/balances', { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching balances:', error);
    handleApiError(error, 'balances');
    return []; // This line should never be reached due to throw above
  }
}

export async function uploadInvoice(files: File[]): Promise<{ success: boolean; message: string; fileUrl?: string; fileId?: string }> {
  try {
    const formData = new FormData();
    
    // For now, we'll upload one file at a time (backend supports single file upload)
    if (files.length > 0) {
      formData.append('file', files[0]);
    }

    const response = await api.post('/api/invoices/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading invoice:', error);
    if (isAxiosError(error)) {
      if (error.response?.status === 413) {
        throw new Error('File size too large. Maximum size is 50MB.');
      }
      if (error.response?.status === 415) {
        throw new Error('File type not supported. Please upload PDF, XML, Excel, or Image files.');
      }
    }
    throw new Error('Failed to upload file. Please try again.');
  }
}

export async function getFileMetadata(fileId: string): Promise<{
  originalName: string;
  fileSize: number;
  contentType: string;
  uploadDate: string;
}> {
  try {
    const response = await api.get(`/api/invoices/file/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching file metadata:', error);
    handleApiError(error, 'file metadata');
    throw error;
  }
}

export async function deleteFile(fileId: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await api.delete(`/api/invoices/file/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting file:', error);
    handleApiError(error, 'file deletion');
    throw error;
  }
}

export async function deleteInvoice(uuid: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await api.delete(`/api/invoices/${uuid}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting invoice:', error);
    throw error;
  }
}

// Dashboard metrics functions
export async function getDashboardMetrics() {
  try {
    const [invoices, providers] = await Promise.all([
      fetchInvoices(),
      fetchProviders(),
      fetchBalances()
    ]);

    const totalRevenue = invoices.reduce((sum, invoice) => sum + parseFloat(invoice.total), 0);
    const totalInvoices = invoices.length;
    const activeProviders = providers.filter(p => p.status === 'activo').length;

    // Calculate growth rate (mock for now, would need historical data)
    const growthRate = 12;

    return {
      totalRevenue,
      totalInvoices,
      activeProviders,
      growthRate,
      recentActivity: invoices.slice(0, 3).map(invoice => ({
        description: `New invoice received from ${invoice.issuerName}`,
        amount: invoice.total,
        time: '2 hours ago' // Would calculate from invoice.entryDate
      }))
    };
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    handleApiError(error, 'dashboard data');
    return null; // This line should never be reached due to throw above
  }
}
