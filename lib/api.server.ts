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
  // Hardcode for now to ensure it works, then can be moved back to env var
  const url = 'https://fabriflow-be.fly.dev';
  console.log('Using hardcoded API URL:', url);
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

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    console.log(`[API] Making API request to: ${url}`);
    console.log(`[API] Request config:`, { method: config.method, headers: config.headers });
    const response = await fetch(url, config);

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
    console.error('API request failed:', error);

    if (error instanceof ApiServerError) {
      throw error;
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
  email: string;
  password: string;
  company: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    token: string;
    user: {
      id: string;
      company: string;
      email: string;
      user?: string;
      role?: string;
      permissions?: string[];
      status?: string;
      last_login?: string;
      created_at?: string;
    };
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
  return apiRequest<User>('/api/auth/me', {
    method: 'GET',
  }, token);
}

export interface CompaniesResponse {
  success: boolean;
  data: string[] | null;
  error: string | null;
}

export async function fetchCompanies(): Promise<string[]> {
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
