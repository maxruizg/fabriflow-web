import type {
  LinksFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteLoaderData,
} from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthProvider } from "~/lib/auth-context";
import { ThemeProvider } from "~/lib/theme-context";
import { getUserFromSession } from "~/lib/session.server";
import {
  getThemePrefs,
  setThemePrefsCookie,
  type Accent,
  type Density,
  type Theme,
  type ThemePrefs,
} from "~/lib/theme.server";

import "./tailwind.css";

export const meta: MetaFunction = () => [
  { title: "FabriFlow — Sistema de Gestión Industrial" },
  {
    name: "description",
    content: "Plataforma moderna de gestión para fábricas e industrias",
  },
];

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous" as const,
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUserFromSession(request);
  const themePrefs = await getThemePrefs(request);
  return json({ user: user || null, themePrefs });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const current = await getThemePrefs(request);

  const theme = formData.get("theme");
  const accent = formData.get("accent");
  const density = formData.get("density");
  const dottedBg = formData.get("dottedBg");

  const next: ThemePrefs = {
    theme:
      theme === "light" || theme === "dark" ? (theme as Theme) : current.theme,
    accent:
      accent === "warm" || accent === "cool" || accent === "olive"
        ? (accent as Accent)
        : current.accent,
    density:
      density === "comfortable" || density === "compact"
        ? (density as Density)
        : current.density,
    dottedBg:
      dottedBg === "true"
        ? true
        : dottedBg === "false"
          ? false
          : current.dottedBg,
  };

  return json(
    { success: true, prefs: next },
    { headers: { "Set-Cookie": await setThemePrefsCookie(next) } },
  );
}

function bodyClasses(prefs: ThemePrefs): string {
  return [
    "h-full",
    "bg-background",
    "text-foreground",
    "antialiased",
    prefs.density === "compact" ? "density-compact" : "",
    prefs.accent === "cool" ? "theme-cool" : "",
    prefs.accent === "olive" ? "theme-olive" : "",
    prefs.dottedBg ? "" : "no-dot-bg",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Static no-flash script — reads pref values from `data-*` attributes on
 * <html> and applies them to <body>. No values are interpolated into JS,
 * so there is no XSS surface even if a downstream cookie validator regressed.
 */
const NO_FLASH_SCRIPT = `(function(){try{
  var d=document.documentElement, b=document.body;
  if(!d||!b) return;
  var p={
    theme: d.getAttribute('data-theme')||'light',
    accent: d.getAttribute('data-accent')||'warm',
    density: d.getAttribute('data-density')||'comfortable',
    dottedBg: d.getAttribute('data-dotted-bg')!=='false'
  };
  d.classList.add(p.theme);
  b.classList.toggle('density-compact', p.density==='compact');
  b.classList.toggle('theme-cool', p.accent==='cool');
  b.classList.toggle('theme-olive', p.accent==='olive');
  b.classList.toggle('no-dot-bg', !p.dottedBg);
}catch(e){}})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const prefs: ThemePrefs = data?.themePrefs ?? {
    theme: "light",
    accent: "warm",
    density: "comfortable",
    dottedBg: true,
  };

  return (
    <html
      lang="es"
      className={`h-full ${prefs.theme}`}
      data-theme={prefs.theme}
      data-accent={prefs.accent}
      data-density={prefs.density}
      data-dotted-bg={prefs.dottedBg ? "true" : "false"}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/*
          Pair with the CSS `color-scheme` property in tailwind.css. Without
          this meta, some browsers (older Safari / Chrome on iOS) ignore the
          CSS color-scheme and re-apply the system dark-mode adapt pass,
          which renders as a translucent gray film over the page.
        */}
        <meta name="color-scheme" content="light dark" />
        <Meta />
        <Links />
        <script>{NO_FLASH_SCRIPT}</script>
      </head>
      <body className={bodyClasses(prefs)}>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { user, themePrefs } = useLoaderData<typeof loader>();

  return (
    <ThemeProvider defaultPrefs={themePrefs}>
      <AuthProvider user={user}>
        <Outlet />
      </AuthProvider>
    </ThemeProvider>
  );
}
