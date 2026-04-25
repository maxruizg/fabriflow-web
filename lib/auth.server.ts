import {
  loginUser,
  selectCompany as apiSelectCompany,
  switchCompany as apiSwitchCompany,
  signupUser,
  joinCompany as apiJoinCompany,
  validateUserToken,
  type LoginUserData,
  type UserCompanyInfo,
} from "./api.server";

export interface LoginRequest {
  email?: string;
  rfc?: string;
  password: string;
  company?: string; // Now optional
}

export interface User {
  id: string;
  email: string;
  name?: string;
  company?: string;
  companyName?: string;
  role?: string;
  permissions: string[];
  status: string;
  lastLogin?: string;
  createdAt?: string;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  companies?: UserCompanyInfo[];
  requiresCompanySelection?: boolean;
  message?: string;
}

export async function login({ email, rfc, password, company }: LoginRequest): Promise<LoginResult> {
  const response = await loginUser({ email, rfc, password, company });

  if (response.success && response.data) {
    const { user, companies, requiresCompanySelection, token, refreshToken } = response.data;

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        companyName: user.companyName,
        role: user.role,
        permissions: user.permissions || [],
        status: user.status || 'active',
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      token: token,
      refreshToken: refreshToken,
      companies,
      requiresCompanySelection,
    };
  }

  return {
    success: false,
    message: response.error || 'Login failed'
  };
}

export interface SelectCompanyResult {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  message?: string;
}

export async function selectCompany(companyId: string, token: string): Promise<SelectCompanyResult> {
  const response = await apiSelectCompany(companyId, token);

  if (response.success && response.data) {
    const { user, token: newToken, refreshToken } = response.data;

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        companyName: user.companyName,
        role: user.role,
        permissions: user.permissions || [],
        status: user.status || 'active',
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      token: newToken,
      refreshToken,
    };
  }

  return {
    success: false,
    message: response.error || 'Failed to select company'
  };
}

export async function switchCompany(companyId: string, token: string): Promise<SelectCompanyResult> {
  const response = await apiSwitchCompany(companyId, token);

  if (response.success && response.data) {
    const { user, token: newToken, refreshToken } = response.data;

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        companyName: user.companyName,
        role: user.role,
        permissions: user.permissions || [],
        status: user.status || 'active',
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      token: newToken,
      refreshToken,
    };
  }

  return {
    success: false,
    message: response.error || 'Failed to switch company'
  };
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

export interface SignupResult {
  success: boolean;
  message?: string;
  userId?: string;
  companyId?: string;
}

export async function signup(data: SignupRequest): Promise<SignupResult> {
  try {
    const response = await signupUser(data);
    return {
      success: response.success,
      message: response.message,
      userId: response.userId,
      companyId: response.companyId,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Signup failed',
    };
  }
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

export interface JoinResult {
  success: boolean;
  message?: string;
  userId?: string;
}

export async function joinCompany(data: JoinRequest): Promise<JoinResult> {
  try {
    const response = await apiJoinCompany(data);
    return {
      success: response.success,
      message: response.message,
      userId: response.userId,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Join failed',
    };
  }
}

// Legacy register functions (kept for backward compatibility)
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
  company: string;
  email: string;
  password: string;
  vendor_rfc: string;
  vendor_company_type: "legal" | "personal";
  vendor_legal_name: string;
  contact_name?: string;
  contact_lastname?: string;
  clients: string[];
}

export async function registerCompany(data: CompanyRegisterRequest): Promise<SignupResult> {
  // Map old format to new signup format
  return signup({
    email: data.email,
    password: data.password,
    name: `${data.name} ${data.lastname}`,
    company: {
      name: data.company,
      rfc: data.rfc,
      email: data.companyEmail || data.email,
      phone: data.phone,
    },
  });
}

export async function registerVendor(data: VendorRegisterRequest): Promise<JoinResult> {
  // Map old format to new join format
  const name = data.contact_name && data.contact_lastname
    ? `${data.contact_name} ${data.contact_lastname}`
    : data.vendor_legal_name;

  return joinCompany({
    email: data.email,
    password: data.password,
    name,
    companyId: data.company,
    vendorRfc: data.vendor_rfc, // Pass the vendor RFC for provider login
  });
}

export async function getCurrentUser(token: string): Promise<User | null> {
  try {
    const apiUser = await validateUserToken(token);
    return {
      id: apiUser.id,
      email: apiUser.email,
      name: apiUser.user,
      company: apiUser.company,
      role: apiUser.role,
      permissions: apiUser.permissions || [],
      status: apiUser.status || 'active',
      lastLogin: apiUser.last_login,
      createdAt: apiUser.created_at,
    };
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

// Re-export UserCompanyInfo for use in other files
export type { UserCompanyInfo };
