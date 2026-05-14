// Server-side API utilities for Remix
// This file should only be used in server-side contexts (loaders, actions)

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

interface ErrorResponse {
  message?: string;
  error?: string;
  [key: string]: unknown;
}

class ApiServerError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ApiServerError';
  }
}

// Get API base URL with fallback
function getApiBaseUrl(): string {
  const url = process.env.API_BASE_URL || 'http://localhost:8080';
  console.log('Using API URL:', url);
  return url;
}

// Server-side fetch wrapper with proper error handling
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  // Para cuerpos `FormData` NO seteamos Content-Type — el runtime de fetch
  // genera el header correcto con el boundary del multipart. Si forzamos
  // `application/json` aquí, actix-multipart rechaza con `ContentTypeIncompatible`.
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const defaultHeaders: HeadersInit = isMultipart ? {} : { 'Content-Type': 'application/json' };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    signal: controller.signal,
  };

  try {
    console.log(`[API] Making API request to: ${url}`);
    console.log(`[API] Request config:`, { method: config.method, headers: config.headers });
    const response = await fetch(url, config);
    clearTimeout(timeoutId);

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorData: ErrorResponse | null = null;

      if (isJson) {
        try {
          errorData = await response.json() as ErrorResponse;
          console.log('[API] Error response data:', JSON.stringify(errorData, null, 2));
          errorMessage = errorData?.message || errorData?.error || errorMessage;
        } catch (parseError) {
          console.log('[API] Failed to parse error JSON:', parseError);
        }
      } else {
        try {
          const textError = await response.text();
          console.log('[API] Error response text:', textError);
        } catch (textParseError) {
          console.log('[API] Failed to parse error text:', textParseError);
        }
      }

      // Map specific HTTP status codes to user-friendly messages
      switch (response.status) {
        case 401:
          throw new ApiServerError('Credenciales inválidas', 401, 'UNAUTHORIZED');
        case 403:
          throw new ApiServerError('Acceso denegado', 403, 'FORBIDDEN');
        case 404:
          throw new ApiServerError('Recurso no encontrado', 404, 'NOT_FOUND');
        case 500:
          throw new ApiServerError('Error interno del servidor', 500, 'INTERNAL_ERROR');
        case 502:
        case 503:
        case 504:
          throw new ApiServerError('El servidor no está disponible. Intente más tarde.', response.status, 'SERVER_UNAVAILABLE');
        default:
          throw new ApiServerError(errorMessage, response.status);
      }
    }

    // Return empty object for 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    // Parse JSON response
    if (isJson) {
      return await response.json();
    }

    // Return text for non-JSON responses
    return (await response.text()) as unknown as T;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('API request failed:', error);

    if (error instanceof ApiServerError) {
      throw error;
    }

    // Handle timeout/abort errors
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiServerError(
        'El servidor tardó demasiado en responder. Por favor intente más tarde.',
        408,
        'TIMEOUT_ERROR'
      );
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiServerError(
        'No se pudo conectar al servidor. Verifique su conexión a internet.',
        0,
        'NETWORK_ERROR'
      );
    }

    // Generic error fallback
    throw new ApiServerError(
      'Error inesperado. Por favor intente más tarde.',
      500,
      'UNKNOWN_ERROR'
    );
  }
}

// Specific API functions
export interface LoginRequest {
  email?: string;
  rfc?: string; // RFC for provider login
  password: string;
  company?: string; // Now optional - multi-company support
}

// User company info for multi-company support
export interface UserCompanyInfo {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isDefault: boolean;
}

// User data in login response
export interface LoginUserData {
  id: string;
  email: string;
  name?: string;
  company?: string;
  companyName?: string;
  role?: string;
  permissions: string[];
  status: string;
  lastLogin?: string;
  createdAt: string;
}

// New login response structure for multi-company support
export interface LoginResponse {
  success: boolean;
  data: {
    token?: string;
    refreshToken?: string;
    user: LoginUserData;
    companies: UserCompanyInfo[];
    requiresCompanySelection: boolean;
  } | null;
  error: string | null;
}

export async function loginUser(credentials: LoginRequest): Promise<LoginResponse> {
  console.log('[API] Login payload:', JSON.stringify(credentials, null, 2));
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

// Select company after login (when user has multiple companies)
export interface SelectCompanyRequest {
  companyId: string;
}

export interface SelectCompanyResponse {
  success: boolean;
  data: {
    token: string;
    refreshToken: string;
    user: LoginUserData;
  } | null;
  error: string | null;
}

export async function selectCompany(companyId: string, token: string): Promise<SelectCompanyResponse> {
  return apiRequest<SelectCompanyResponse>('/api/auth/select-company', {
    method: 'POST',
    body: JSON.stringify({ companyId }),
  }, token);
}

// Switch company (for users already logged in)
export async function switchCompany(companyId: string, token: string): Promise<SelectCompanyResponse> {
  return apiRequest<SelectCompanyResponse>('/api/auth/switch-company', {
    method: 'POST',
    body: JSON.stringify({ companyId }),
  }, token);
}

// Signup - Create user + company
export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  company: {
    name: string;
    rfc: string;
    email: string;
    phone?: string;
  };
}

export interface SignupResponse {
  success: boolean;
  message: string;
  userId: string;
  companyId: string;
}

export async function signupUser(data: SignupRequest): Promise<SignupResponse> {
  return apiRequest<SignupResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Join existing company
export interface JoinRequest {
  email: string;
  password: string;
  name: string;
  companyId: string;
  vendorRfc?: string;
  inviteCode?: string;
}

export interface JoinResponse {
  success: boolean;
  message: string;
  userId: string;
}

export async function joinCompany(data: JoinRequest): Promise<JoinResponse> {
  return apiRequest<JoinResponse>('/api/auth/join', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface User {
  id: string;
  company: string;
  email: string;
  user?: string;
  role?: string;
  permissions?: string[];
  status?: string;
  last_login?: string;
  created_at?: string;
}

export async function validateUserToken(token: string): Promise<User> {
  return apiRequest<User>('/api/user/me', {
    method: 'GET',
  }, token);
}

export interface CompanyInfo {
  id: string;
  name: string;
}

export interface CompaniesResponse {
  success: boolean;
  data: CompanyInfo[] | null;
  error: string | null;
}

export async function fetchCompanies(): Promise<CompanyInfo[]> {
  const response = await apiRequest<CompaniesResponse>('/api/auth/companies', {
    method: 'GET',
  });

  if (response.success && response.data) {
    return response.data;
  }

  return [];
}

// Export the base URL for debugging
export { getApiBaseUrl };

// ============================================================================
// Invoice API Functions
// ============================================================================

import type {
  InvoiceBackend,
  CursorPaginatedResponse,
  InvoiceFiltersBackend,
  CreateInvoiceRequest,
  CreateInvoiceResponse,
  InvoiceUrlsResponse,
  InvoiceStatus,
  UploadResponse,
  PurchaseOrderUploadResponse,
} from '~/types';

// IDs come back from the backend as bare UUIDs (Postgres). No prefix stripping
// is needed — pass them through to path-based endpoints unchanged.

/**
 * Fetch invoices with filters and cursor-based pagination
 */
export async function fetchInvoices(
  token: string,
  companyId: string,
  filters: InvoiceFiltersBackend = {}
): Promise<CursorPaginatedResponse<InvoiceBackend>> {
  const params = new URLSearchParams();

  if (filters.cursor) params.append('cursor', filters.cursor);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.folio) params.append('folio', filters.folio);
  if (filters.uuid) params.append('uuid', filters.uuid);
  if (filters.estado) params.append('estado', filters.estado);
  if (filters.fechaEmisionDesde) params.append('fechaEmisionDesde', filters.fechaEmisionDesde);
  if (filters.fechaEmisionHasta) params.append('fechaEmisionHasta', filters.fechaEmisionHasta);
  if (filters.fechaEntradaDesde) params.append('fechaEntradaDesde', filters.fechaEntradaDesde);
  if (filters.fechaEntradaHasta) params.append('fechaEntradaHasta', filters.fechaEntradaHasta);

  const queryString = params.toString();
  const endpoint = `/api/invoices${queryString ? `?${queryString}` : ''}`;

  return apiRequest<CursorPaginatedResponse<InvoiceBackend>>(
    endpoint,
    {
      method: 'GET',
      headers: {
        'X-Company-Id': companyId,
      },
    },
    token
  );
}

/**
 * Fetch all invoices (admin only)
 */
export async function fetchAllInvoices(
  token: string,
  companyId: string,
  filters: InvoiceFiltersBackend = {}
): Promise<CursorPaginatedResponse<InvoiceBackend>> {
  const params = new URLSearchParams();

  if (filters.cursor) params.append('cursor', filters.cursor);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.folio) params.append('folio', filters.folio);
  if (filters.uuid) params.append('uuid', filters.uuid);
  if (filters.estado) params.append('estado', filters.estado);
  if (filters.fechaEmisionDesde) params.append('fechaEmisionDesde', filters.fechaEmisionDesde);
  if (filters.fechaEmisionHasta) params.append('fechaEmisionHasta', filters.fechaEmisionHasta);
  if (filters.fechaEntradaDesde) params.append('fechaEntradaDesde', filters.fechaEntradaDesde);
  if (filters.fechaEntradaHasta) params.append('fechaEntradaHasta', filters.fechaEntradaHasta);

  const queryString = params.toString();
  const endpoint = `/api/invoices/all${queryString ? `?${queryString}` : ''}`;

  return apiRequest<CursorPaginatedResponse<InvoiceBackend>>(
    endpoint,
    {
      method: 'GET',
      headers: {
        'X-Company-Id': companyId,
      },
    },
    token
  );
}

/**
 * Get a single invoice by ID
 */
export async function fetchInvoice(
  token: string,
  companyId: string,
  invoiceId: string
): Promise<InvoiceBackend> {
  return apiRequest<InvoiceBackend>(
    `/api/invoices/${encodeURIComponent(invoiceId)}`,
    {
      method: 'GET',
      headers: {
        'X-Company-Id': companyId,
      },
    },
    token
  );
}

/**
 * Create a new invoice
 */
export async function createInvoice(
  token: string,
  companyId: string,
  data: CreateInvoiceRequest
): Promise<CreateInvoiceResponse> {
  return apiRequest<CreateInvoiceResponse>(
    '/api/invoices',
    {
      method: 'POST',
      headers: {
        'X-Company-Id': companyId,
      },
      body: JSON.stringify(data),
    },
    token
  );
}

/**
 * Update invoice status (admin only)
 */
export async function updateInvoiceStatus(
  token: string,
  companyId: string,
  invoiceId: string,
  estado: InvoiceStatus
): Promise<InvoiceBackend> {
  return apiRequest<InvoiceBackend>(
    `/api/invoices/${encodeURIComponent(invoiceId)}/status`,
    {
      method: 'PUT',
      headers: {
        'X-Company-Id': companyId,
      },
      body: JSON.stringify({ estado }),
    },
    token
  );
}

/**
 * Soft delete an invoice (admin only)
 */
export async function deleteInvoice(
  token: string,
  companyId: string,
  invoiceId: string
): Promise<{ message: string; invoiceId: string }> {
  return apiRequest<{ message: string; invoiceId: string }>(
    `/api/invoices/${encodeURIComponent(invoiceId)}/delete`,
    {
      method: 'POST',
      headers: {
        'X-Company-Id': companyId,
      },
    },
    token
  );
}

/**
 * Find prev/next invoice ids for a given invoice within the current filter context.
 * Walks the cursor-paginated list (capped) until the target is located, then returns
 * its neighbors. If the target isn't found within the cap, returns nulls.
 */
export async function fetchInvoiceNeighbors(
  token: string,
  companyId: string,
  invoiceId: string,
  filters: InvoiceFiltersBackend,
  isAdmin: boolean,
  options: { maxPages?: number; pageSize?: number } = {}
): Promise<{ prevId: string | null; nextId: string | null }> {
  const maxPages = options.maxPages ?? 5;
  const pageSize = options.pageSize ?? 100;
  const list = isAdmin ? fetchAllInvoices : fetchInvoices;

  const collected: { id: string }[] = [];
  let cursor: string | undefined = filters.cursor;
  const matches = (inv: { id: string }) => inv.id === invoiceId;

  for (let page = 0; page < maxPages; page++) {
    const response = await list(token, companyId, { ...filters, cursor, limit: pageSize });
    collected.push(...response.data);

    const idx = collected.findIndex(matches);
    if (idx !== -1) {
      const prev = collected[idx - 1];
      const next = collected[idx + 1];
      if (next || !response.hasMore) {
        return { prevId: prev?.id ?? null, nextId: next?.id ?? null };
      }
    }

    if (!response.hasMore || !response.nextCursor) break;
    cursor = response.nextCursor;
  }

  const idx = collected.findIndex(matches);
  if (idx === -1) return { prevId: null, nextId: null };
  return {
    prevId: collected[idx - 1]?.id ?? null,
    nextId: collected[idx + 1]?.id ?? null,
  };
}

/**
 * Get invoice PDF/XML URLs
 */
export async function fetchInvoiceUrls(
  token: string,
  companyId: string,
  invoiceId: string
): Promise<InvoiceUrlsResponse> {
  return apiRequest<InvoiceUrlsResponse>(
    `/api/invoices/${encodeURIComponent(invoiceId)}/urls`,
    {
      method: 'GET',
      headers: {
        'X-Company-Id': companyId,
      },
    },
    token
  );
}

// ============================================================================
// File Upload API Functions
// ============================================================================

/**
 * Upload a file using multipart/form-data
 */
async function uploadFile<T>(
  endpoint: string,
  file: File,
  token: string,
  companyId: string
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Company-Id': companyId,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiServerError(
      errorData.message || `Error uploading file: ${response.status}`,
      response.status
    );
  }

  return response.json();
}

/**
 * Upload invoice PDF
 */
export async function uploadInvoicePdf(
  token: string,
  companyId: string,
  file: File
): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/api/uploads/upload/invoice-pdf', file, token, companyId);
}

/**
 * Upload invoice XML
 */
export async function uploadInvoiceXml(
  token: string,
  companyId: string,
  file: File
): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/api/uploads/upload/invoice-xml', file, token, companyId);
}

/**
 * Upload purchase order PDF
 * This validates that the PDF contains "Orden de compra" text
 */
export async function uploadPurchaseOrder(
  token: string,
  companyId: string,
  file: File
): Promise<PurchaseOrderUploadResponse> {
  return uploadFile<PurchaseOrderUploadResponse>('/api/uploads/upload/purchase-order', file, token, companyId);
}

/**
 * Upload complete invoice with all 3 files: PDF factura, XML CFDI, PDF orden
 * This is the unified endpoint that validates and creates the invoice in one operation
 */
export async function uploadCompleteInvoice(
  token: string,
  companyId: string,
  pdfFactura: File,
  xmlFactura: File,
  purchaseOrderId: string,  // REQUERIDO en nuevo flujo
  pdfOrden?: File  // Opcional (deprecated)
): Promise<InvoiceUploadResponse> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/invoices/upload`;

  const formData = new FormData();
  formData.append('pdfFactura', pdfFactura);
  formData.append('xmlFactura', xmlFactura);
  formData.append('purchaseOrderId', purchaseOrderId);
  if (pdfOrden) formData.append('pdfOrden', pdfOrden);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Company-Id': companyId,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiServerError(
      errorData.message || `Error uploading invoice: ${response.status}`,
      response.status,
      errorData.error
    );
  }

  return response.json();
}

/**
 * Response from complete invoice upload
 */
export interface InvoiceUploadResponse {
  message: string;
  invoice: import('~/types').InvoiceBackend;
  validationDetails: {
    xmlParsed: boolean;
    uuidMatched: boolean;
    rfcValidated: boolean;
    fechaValidated: boolean;
    ordenValidated: boolean;
    filesUploaded: boolean;
  };
  matchReport?: {
    overall: 'ok' | 'warning' | 'mismatch';
    fields: Array<{
      field: string;
      verdict: 'ok' | 'warning' | 'mismatch';
      expected: string;
      actual: string;
      message: string | null;
    }>;
    mismatchesCount: number;
    warningsCount: number;
    matchedLines: number;
    unmatchedInvoiceLines: number;
    unmatchedOrderLines: number;
  };
  mismatchSummary?: string;
}

// ============================================================================
// Vendor Management API Functions
// ============================================================================

export interface VendorActionResponse {
  message: string;
  userId: string;
  status: string;
}

export interface PendingVendorRequest {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  requestedAt: string;
  vendorCompanyId: string | null;
  vendorCompanyName: string | null;
  vendorCompanyRfc: string | null;
  linkStatus: string | null;
}

/**
 * List pending vendor-link requests for the authenticated buyer company.
 * Surfaces them on the in-app /notifications screen.
 */
export async function listPendingVendors(
  token: string,
  companyId: string
): Promise<PendingVendorRequest[]> {
  return apiRequest<PendingVendorRequest[]>(
    '/api/vendors/pending',
    {
      method: 'GET',
      headers: {
        'X-Company-Id': companyId,
      },
    },
    token
  );
}

/**
 * Approve a pending vendor
 */
export async function approveVendor(
  token: string,
  companyId: string,
  userId: string
): Promise<VendorActionResponse> {
  return apiRequest<VendorActionResponse>(
    `/api/vendors/${userId}/approve`,
    {
      method: 'POST',
      headers: {
        'X-Company-Id': companyId,
      },
    },
    token
  );
}

/**
 * Reject a pending vendor
 */
export async function rejectVendor(
  token: string,
  companyId: string,
  userId: string,
  reason?: string
): Promise<VendorActionResponse> {
  return apiRequest<VendorActionResponse>(
    `/api/vendors/${userId}/reject`,
    {
      method: 'POST',
      headers: {
        'X-Company-Id': companyId,
      },
      body: JSON.stringify({ reason }),
    },
    token
  );
}

// ============================================
// Vendor invitations
// ============================================

export interface SendVendorInviteResponse {
  id: string;
  shareLink: string;
  expiresAt: string;
}

export async function sendVendorInvite(
  email: string,
  token: string,
  companyId: string
): Promise<SendVendorInviteResponse> {
  return apiRequest<SendVendorInviteResponse>(
    '/api/vendors/invite',
    {
      method: 'POST',
      headers: {
        'X-Company-Id': companyId,
      },
      body: JSON.stringify({ email }),
    },
    token
  );
}

export interface PublicVendorInviteResponse {
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  vendorEmailHint: string;
  expiresAt: string;
}

export async function fetchPublicVendorInvite(
  inviteToken: string
): Promise<PublicVendorInviteResponse> {
  return apiRequest<PublicVendorInviteResponse>(
    `/api/public/vendor-invite/${encodeURIComponent(inviteToken)}`,
    { method: 'GET' }
  );
}

export interface AcceptVendorInvitePayload {
  email: string;
  password: string;
  name: string;
  vendorRfc: string;
  vendorCompanyType: 'legal' | 'personal';
  vendorLegalName: string;
  contactLastname?: string;
  phone?: string;
}

export interface AcceptVendorInviteResponse {
  success: boolean;
  message: string;
  userId: string;
}

export async function acceptVendorInvite(
  inviteToken: string,
  payload: AcceptVendorInvitePayload
): Promise<AcceptVendorInviteResponse> {
  return apiRequest<AcceptVendorInviteResponse>(
    `/api/public/vendor-invite/${encodeURIComponent(inviteToken)}/accept`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}
