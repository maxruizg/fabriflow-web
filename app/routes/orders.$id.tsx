import { redirect, type LoaderFunctionArgs } from "@remix-run/cloudflare";

import { requireUser } from "~/lib/session.server";

/**
 * Deep-link to a specific order. Until Phase 4.5 wires real data the list
 * page handles selection state — redirect there with a hint param so the
 * list can pre-select the order when querystring support lands.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const id = params.id;
  if (!id) throw redirect("/orders");
  throw redirect(`/orders?selected=${encodeURIComponent(id)}`);
}

export default function OrderDetail() {
  return null;
}
