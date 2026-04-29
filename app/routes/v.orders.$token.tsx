import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";

import { fetchPublicOrder, type PublicOrderResponse } from "~/lib/procurement-api.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const folio = data && "order" in data ? data.order.folio : "Orden";
  return [{ title: `${folio} — FabriFlow` }];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const token = params.token;
  if (!token) {
    throw new Response("Token requerido", { status: 400 });
  }
  try {
    const data = await fetchPublicOrder(token);
    return json<PublicOrderResponse>(data);
  } catch (e) {
    const status =
      typeof e === "object" && e !== null && "status" in e
        ? Number((e as { status: unknown }).status) || 404
        : 404;
    throw new Response("Orden no encontrada o enlace expirado.", { status });
  }
}

export default function PublicOrderLanding() {
  const { order, buyer, vendor } = useLoaderData<typeof loader>();

  const subtotal = (order.items ?? []).reduce((acc, it) => acc + (it.lineTotal ?? 0), 0);

  return (
    <div className="min-h-screen bg-paper-2 py-10 px-4">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-ink text-paper font-display text-[14px] font-semibold italic">
              F
            </span>
            <span className="font-display text-[16px] font-semibold tracking-tight text-ink">
              Fabri<em className="not-italic font-medium text-clay">Flow</em>
            </span>
          </div>
          <Link to="/login" className="text-[12.5px] text-clay hover:underline">
            Iniciar sesión
          </Link>
        </header>

        <div className="rounded-lg border border-line bg-paper p-6 shadow-sm">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
            Orden de compra
          </p>
          <h1 className="mt-1 font-display text-[28px] font-semibold tracking-tight text-ink">
            {order.folio}
          </h1>
          <p className="mt-1 text-[14px] text-ink-2">
            <strong>{buyer.name}</strong> te ha enviado esta orden el {order.date}.
          </p>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
            <Block label="Cliente">
              <div className="font-medium text-ink">{buyer.name}</div>
              <div className="font-mono text-[11.5px] text-ink-3">{buyer.rfc}</div>
            </Block>
            <Block label="Proveedor">
              <div className="font-medium text-ink">{vendor.name}</div>
              <div className="font-mono text-[11.5px] text-ink-3">{vendor.rfc}</div>
              <div className="text-[12px] text-ink-2">{vendor.email}</div>
            </Block>
          </div>

          <div className="mt-6 overflow-x-auto rounded-md border border-line">
            <table className="w-full text-[13px]">
              <thead className="bg-paper-2 font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Precio U.</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.items ?? []).map((it) => (
                  <tr key={it.lineNo} className="border-t border-line">
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-3">{it.lineNo}</td>
                    <td className="px-3 py-2 text-ink">
                      <div>{it.description}</div>
                      {it.sku ? (
                        <div className="font-mono text-[10.5px] text-ink-3">{it.sku}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {it.qty} {it.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {money(it.unitPrice, order.currency)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12.5px]">
                      {money(it.lineTotal, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td colSpan={4} className="px-3 py-2 text-right text-[11.5px] text-ink-3">
                    Subtotal
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12.5px]">
                    {money(subtotal, order.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-[12px] font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[14px] font-semibold">
                    {money(order.amount, order.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {(order.paymentTerms || order.deliveryAddress || order.notes) && (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
              {order.paymentTerms ? (
                <Block label="Términos de pago">{order.paymentTerms}</Block>
              ) : null}
              {order.deliveryAddress ? (
                <Block label="Entrega">{order.deliveryAddress}</Block>
              ) : null}
              {order.notes ? (
                <div className="sm:col-span-2">
                  <Block label="Notas">{order.notes}</Block>
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {order.ocUrl ? (
              <a
                href={order.ocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-line bg-paper px-4 py-2 text-[13px] font-medium text-ink hover:bg-paper-3"
              >
                Descargar PDF
              </a>
            ) : null}
            <Link
              to={`/login?next=${encodeURIComponent(`/invoices/new?orderId=${order.id}`)}`}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-ink/90"
            >
              Subir factura
            </Link>
          </div>

          <p className="mt-6 text-[11.5px] text-ink-3">
            Si el botón anterior no funciona, ingresa a FabriFlow y busca esta orden por su folio.
          </p>
        </div>

        <p className="mt-6 text-center text-[11.5px] text-ink-3">
          Enviado de forma segura por FabriFlow · {buyer.name}
        </p>
      </div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-paper-2 p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  );
}

function money(n: number | null | undefined, currency: string): string {
  const c = currency === "USD" ? "USD" : currency === "EUR" ? "EUR" : "MXN";
  return (n ?? 0).toLocaleString("es-MX", { style: "currency", currency: c });
}
