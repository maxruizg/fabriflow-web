import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { logout } from "~/lib/session.server";

export async function action({ request }: ActionFunctionArgs) {
  return logout(request);
}

export async function loader({ request }: ActionFunctionArgs) {
  return logout(request);
}