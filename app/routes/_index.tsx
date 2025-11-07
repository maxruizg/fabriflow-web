import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";

export const meta: MetaFunction = () => {
  return [
    { title: "Magavi v2 - Panel de Control" },
    { name: "description", content: "Plataforma moderna de gestión de facturas" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { getUserFromSession } = await import("~/lib/session.server");
  const user = await getUserFromSession(request);
  if (user) {
    throw redirect("/dashboard");
  }
  throw redirect("/login");
}

export default function Index() {
  // This component will never render due to the loader redirect
  return null;
}
