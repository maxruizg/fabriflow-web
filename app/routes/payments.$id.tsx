import { redirect, type LoaderFunctionArgs } from "@remix-run/cloudflare";

import { requireUser } from "~/lib/session.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const id = params.id;
  if (!id) throw redirect("/payments");
  throw redirect(`/payments?selected=${encodeURIComponent(id)}`);
}

export default function PaymentDetail() {
  return null;
}
