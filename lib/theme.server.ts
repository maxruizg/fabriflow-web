import { createCookie } from "@remix-run/cloudflare";

export type Theme = "light" | "dark";
export type Accent = "warm" | "cool" | "olive";
export type Density = "comfortable" | "compact";

export interface ThemePrefs {
  theme: Theme;
  accent: Accent;
  density: Density;
  dottedBg: boolean;
}

const ONE_YEAR = 31_536_000;

export const themeCookie = createCookie("ff_theme", {
  maxAge: ONE_YEAR,
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
});

const DEFAULT_PREFS: ThemePrefs = {
  theme: "light",
  accent: "warm",
  density: "comfortable",
  dottedBg: true,
};

function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark";
}
function isAccent(v: unknown): v is Accent {
  return v === "warm" || v === "cool" || v === "olive";
}
function isDensity(v: unknown): v is Density {
  return v === "comfortable" || v === "compact";
}

/**
 * Read the user's theme preferences from the cookie. Falls back to
 * DEFAULT_PREFS for any field that is missing or malformed.
 */
export async function getThemePrefs(request: Request): Promise<ThemePrefs> {
  const raw = await themeCookie.parse(request.headers.get("Cookie"));
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;

  const obj = raw as Partial<ThemePrefs> & Record<string, unknown>;
  return {
    theme: isTheme(obj.theme) ? obj.theme : DEFAULT_PREFS.theme,
    accent: isAccent(obj.accent) ? obj.accent : DEFAULT_PREFS.accent,
    density: isDensity(obj.density) ? obj.density : DEFAULT_PREFS.density,
    dottedBg:
      typeof obj.dottedBg === "boolean" ? obj.dottedBg : DEFAULT_PREFS.dottedBg,
  };
}

/** Backwards-compatible single-value getter retained for callers that only need `theme`. */
export async function getTheme(request: Request): Promise<Theme> {
  const prefs = await getThemePrefs(request);
  return prefs.theme;
}

export async function setThemePrefsCookie(prefs: ThemePrefs): Promise<string> {
  return themeCookie.serialize(prefs);
}

/** Backwards-compatible single-value setter — preserves other fields when called. */
export async function setThemeCookie(theme: Theme, request?: Request): Promise<string> {
  if (request) {
    const current = await getThemePrefs(request);
    return setThemePrefsCookie({ ...current, theme });
  }
  return setThemePrefsCookie({ ...DEFAULT_PREFS, theme });
}
