import { createCookieSessionStorage, redirect } from "@remix-run/cloudflare";

export interface User {
  user: string;
  status: string;
  role: string;
  permissions: string[];
  company?: string;
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
  redirectTo,
}: {
  request: Request;
  userId: string;
  user: User;
  accessToken: string;
  redirectTo: string;
}) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  
  session.set("userId", userId);
  session.set("user", user);
  session.set("accessToken", accessToken);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session),
    },
  });
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