import { loginUser, apiRequest, validateUserToken } from "./api.server";

export interface LoginRequest {
  email: string;
  password: string;
  company: string;
}

export interface User {
  id: string;
  email: string;
  user?: string;
  company: string;
  role?: string;
  permissions?: string[];
  status?: string;
  last_login?: string;
  created_at?: string;
}

export interface LoginApiResponse {
  success: boolean;
  data: {
    token: string;
    user: User;
  } | null;
  error: string | null;
}

export async function login({ email, password, company }: LoginRequest): Promise<{
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}> {
  const response = await loginUser({ email, password, company });

  if (response.success && response.data) {
    return {
      success: true,
      user: {
        ...response.data.user,
        user: response.data.user.email,  // Use email as user identifier if user field is missing
        role: response.data.user.role || 'user',
        permissions: response.data.user.permissions || [],
        status: response.data.user.status || 'active'
      },
      token: response.data.token
    };
  }

  return {
    success: false,
    message: response.error || 'Login failed'
  };
}

export interface RegisterRequest {
  email: string;
  user: string;
  password: string;
  company: string;
  role: string;
}

export interface CompanyRegisterRequest {
  company: string;
  rfc: string;
  phone: string;
  name: string;
  lastname: string;
  email: string;
  companyEmail?: string;
  password: string;
}

export interface VendorRegisterRequest {
  company: string;                      // Company name selected from dropdown (required)
  email: string;                        // Email (required)
  password: string;                     // Password (required)
  vendor_rfc: string;                   // Vendor RFC (required)
  vendor_company_type: "legal" | "personal"; // Type (required)
  vendor_legal_name: string;            // Legal name or personal name (required)
  contact_name?: string;                // Contact first name (required for legal)
  contact_lastname?: string;            // Contact last name (required for legal)
  clients: string[];                    // Client companies array
}

export async function register(data: RegisterRequest): Promise<User> {
  const response = await apiRequest<LoginApiResponse>('/api/auth/register-companies', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Registration failed');
  }

  return response.data.user;
}

export async function registerCompany(data: CompanyRegisterRequest): Promise<any> {
  // Send the exact payload structure required by the API
  const payload = {
    companyName: data.company,
    companyEmail: data.companyEmail || data.email,
    rfc: data.rfc,
    adminName: `${data.name} ${data.lastname}`,
    adminEmail: data.email,
    adminPassword: data.password
  };

  const response = await apiRequest<any>('/company/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return response;
}

export async function registerVendor(data: VendorRegisterRequest): Promise<any> {
  const response = await apiRequest<any>('/api/auth/register-vendor', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return response;
}

export async function getCurrentUser(token: string): Promise<User | null> {
  try {
    return await validateUserToken(token);
  } catch {
    return null;
  }
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    await validateUserToken(token);
    return true;
  } catch {
    return false;
  }
}
