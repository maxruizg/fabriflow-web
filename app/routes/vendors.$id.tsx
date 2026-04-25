import { redirect, type LoaderFunctionArgs } from "@remix-run/cloudflare";

import { requireUser } from "~/lib/session.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const id = params.id;
  if (!id) throw redirect("/vendors");
  throw redirect(`/vendors?selected=${encodeURIComponent(id)}`);
}

export default function VendorDetail() {
  return null;
}
