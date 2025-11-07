import { createCookie } from "@remix-run/cloudflare";

export const themeCookie = createCookie("theme", {
  maxAge: 31536000, // 1 year
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
});

export type Theme = "light" | "dark";

export async function getTheme(request: Request): Promise<Theme> {
  const cookieHeader = request.headers.get("Cookie");
  const theme = await themeCookie.parse(cookieHeader);

  // Default to dark mode if no preference is set
  return theme === "light" || theme === "dark" ? theme : "dark";
}

export async function setThemeCookie(theme: Theme) {
  return await themeCookie.serialize(theme);
}
