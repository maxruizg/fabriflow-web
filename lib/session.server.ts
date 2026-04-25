import { createCookieSessionStorage, redirect } from "@remix-run/cloudflare";
import type { UserCompanyInfo } from "./auth.server";

export interface User {
  id: string;
  email: string;
  name?: string;
  status: string;
  role?: string;
  permissions: string[];
  company?: string;
  companyName?: string;
}

export interface SessionData {
  userId: string;
  user: User;
  accessToken: string;
  refreshToken?: string;
  companies?: UserCompanyInfo[];
  requiresCompanySelection?: boolean;
}

// Session storage configuration
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__magavi_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "magavi-dev-secret-key"],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});

export async function createUserSession({
  request,
  userId,
  user,
  accessToken,
  refreshToken,
  companies,
  requiresCompanySelection,
  redirectTo,
}: {
  request: Request;
  userId: string;
  user: User;
  accessToken: string;
  refreshToken?: string;
  companies?: UserCompanyInfo[];
  requiresCompanySelection?: boolean;
  redirectTo: string;
}) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));

  session.set("userId", userId);
  session.set("user", user);
  session.set("accessToken", accessToken);

  if (refreshToken) {
    session.set("refreshToken", refreshToken);
  }

  if (companies) {
    session.set("companies", companies);
  }

  if (requiresCompanySelection !== undefined) {
    session.set("requiresCompanySelection", requiresCompanySelection);
  }

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
}

// Update session after company selection
export async function updateSessionWithCompany({
  request,
  user,
  accessToken,
  refreshToken,
}: {
  request: Request;
  user: User;
  accessToken: string;
  refreshToken?: string;
}) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));

  session.set("user", user);
  session.set("accessToken", accessToken);
  session.set("requiresCompanySelection", false);

  if (refreshToken) {
    session.set("refreshToken", refreshToken);
  }

  return {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  };
}

export async function getUserFromSession(request: Request): Promise<User | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const user = session.get("user");
  const accessToken = session.get("accessToken");

  if (!user || !accessToken) return null;

  // Validate token with backend API
  try {
    const { validateToken } = await import("~/lib/auth.server");
    const isValid = await validateToken(accessToken);

    if (!isValid) {
      // Token is invalid, clear session
      return null;
    }

    return user;
  } catch {
    // If token validation fails, user is not authenticated
    return null;
  }
}

export async function getAccessTokenFromSession(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return session.get("accessToken") || null;
}

export async function getRefreshTokenFromSession(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return session.get("refreshToken") || null;
}

export async function getCompaniesFromSession(request: Request): Promise<UserCompanyInfo[] | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return session.get("companies") || null;
}

export async function requiresCompanySelection(request: Request): Promise<boolean> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return session.get("requiresCompanySelection") === true;
}

export async function getFullSession(request: Request): Promise<SessionData | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));

  const userId = session.get("userId");
  const user = session.get("user");
  const accessToken = session.get("accessToken");

  if (!userId || !user || !accessToken) return null;

  return {
    userId,
    user,
    accessToken,
    refreshToken: session.get("refreshToken"),
    companies: session.get("companies"),
    requiresCompanySelection: session.get("requiresCompanySelection"),
  };
}

export async function requireUser(request: Request): Promise<User> {
  const user = await getUserFromSession(request);

  if (!user) {
    // Clear any invalid session data before redirecting
    const session = await sessionStorage.getSession(request.headers.get("Cookie"));
    throw redirect("/login", {
      headers: {
        "Set-Cookie": await sessionStorage.destroySession(session),
      },
    });
  }

  // Check if user needs to select a company
  const needsCompanySelection = await requiresCompanySelection(request);
  if (needsCompanySelection) {
    throw redirect("/select-company");
  }

  return user;
}

export async function logout(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));

  return redirect("/login", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}

// Export session storage for advanced use cases
export { sessionStorage };
