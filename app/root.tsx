import type {
  LinksFunction,
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction
} from "@remix-run/cloudflare";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { AuthProvider } from "~/lib/auth-context";
import { ThemeProvider } from "~/lib/theme-context";
import { getUserFromSession } from "~/lib/session.server";
import { getTheme, setThemeCookie, type Theme } from "~/lib/theme.server";

import "./tailwind.css";

export const meta: MetaFunction = () => [
  { title: "FabriFlow - Sistema de Gestión Industrial" },
  { name: "description", content: "Plataforma moderna de gestión para fábricas e industrias" },
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
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUserFromSession(request);
  const theme = await getTheme(request);
  return json({ user: user || null, theme });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const theme = formData.get("theme") as Theme;

  if (theme === "light" || theme === "dark") {
    return json(
      { success: true },
      {
        headers: {
          "Set-Cookie": await setThemeCookie(theme),
        },
      }
    );
  }

  return json({ success: false }, { status: 400 });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const theme = data?.theme || "dark";

  return (
    <html lang="es" className={`h-full ${theme}`}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Prevent flash of wrong theme
              (function() {
                const theme = ${JSON.stringify(theme)};
                document.documentElement.classList.add(theme);
                document.documentElement.setAttribute('data-theme', theme);
              })();
            `,
          }}
        />
      </head>
      <body className="h-full bg-background text-foreground">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { user, theme } = useLoaderData<typeof loader>();

  return (
    <ThemeProvider defaultTheme={theme}>
      <AuthProvider user={user}>
        <Outlet />
      </AuthProvider>
    </ThemeProvider>
  );
}
