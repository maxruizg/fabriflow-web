import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useNavigate } from "@remix-run/react";

import { requireUser, getFullSession } from "~/lib/session.server";
import { fetchInvoices } from "~/lib/api.server";
import { fetchActiveVendors } from "~/lib/procurement-api.server";
import type { InvoiceBackend } from "~/types";
import type { ActiveVendorSummary } from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Icon } from "~/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export const meta: MetaFunction = () => [
  { title: "Registrar pago — FabriFlow" },
];

export const handle = {
  crumb: ["Tesorería", "Pagos", "Registrar"],
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({
      invoices: [] as InvoiceBackend[],
      vendors: [] as ActiveVendorSummary[]
    });
  }

  const invoicesResponse = await fetchInvoices(session.accessToken, user.company, {
    estado: "facturada",
    limit: 200,
  }).catch(() => ({
    data: [] as InvoiceBackend[],
    nextCursor: null,
    hasMore: false,
    count: 0,
  }));

  const vendors = await fetchActiveVendors(session.accessToken, user.company).catch(() => {
    return [] as ActiveVendorSummary[];
  });

  return json({
    invoices: invoicesResponse.data,
    vendors
  });
}

export default function NewPayment() {
  const { invoices, vendors } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [vendorId, setVendorId] = useState<string>("");
  const [invoiceId, setInvoiceId] = useState<string>("");

  // Función para formatear fecha sin hora
  const formatDate = (dateString: string) => {
    return dateString.split('T')[0];
  };

  // Filtrar facturas por el proveedor seleccionado
  const vendorInvoices = vendorId
    ? invoices.filter((inv) => inv.vendor === vendorId)
    : [];

  const selectedInvoice = invoices.find((inv) => inv.id === invoiceId);

  // Reset invoice selection when vendor changes
  const handleVendorChange = (newVendorId: string) => {
    setVendorId(newVendorId);
    setInvoiceId("");
  };

  // Navigate to upload screen when invoice is selected
  const handleContinue = () => {
    if (invoiceId) {
      navigate(`/payments/${invoiceId}/upload`);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-6 max-w-3xl">
        <header>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link to="/payments">
              <Icon name="chevl" size={12} />
              Volver a pagos
            </Link>
          </Button>
          <h1 className="ff-page-title">
            Registrar <em>pago</em>
          </h1>
          <p className="ff-page-sub">
            Selecciona el proveedor y la factura que deseas pagar.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>
              Seleccionar <em className="not-italic text-clay">factura</em>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                Proveedor
              </Label>
              <Select value={vendorId} onValueChange={handleVendorChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      <div className="flex items-center gap-2">
                        <span>{vendor.vendorLegalName || vendor.name}</span>
                        <span className="text-ink-3">·</span>
                        <span className="font-mono text-ink-3">{vendor.rfc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {vendorId && (
              <div className="space-y-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Factura a pagar
                </Label>
                {vendorInvoices.length > 0 ? (
                  <Select value={invoiceId} onValueChange={setInvoiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una factura" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendorInvoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="font-mono font-medium">{inv.folio}</span>
                            <span className="text-ink-3">·</span>
                            <span>{inv.nombreEmisor}</span>
                            <span className="text-ink-3">·</span>
                            <span className="font-mono">{inv.uuid.slice(0, 8)}...{inv.uuid.slice(-8)}</span>
                            <span className="text-ink-3">·</span>
                            <span className="text-ink-3">{formatDate(inv.fechaEmision)}</span>
                            <span className="text-ink-3">·</span>
                            <span className="font-mono font-medium">${inv.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} {inv.moneda}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-4 rounded-md border border-line bg-paper-2 text-center">
                    <p className="text-[12px] text-ink-3">
                      Este proveedor no tiene facturas pendientes de pago
                    </p>
                  </div>
                )}
                {selectedInvoice && (
                  <div className="mt-2 p-3 rounded-md border border-line bg-paper-2">
                    <div className="text-[11px] text-ink-3 font-mono uppercase tracking-wider mb-1">
                      Factura seleccionada
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium">{selectedInvoice.nombreEmisor}</div>
                        <div className="text-[11px] text-ink-3 font-mono mt-0.5">
                          {selectedInvoice.folio} · {selectedInvoice.uuid.slice(0, 8)}...{selectedInvoice.uuid.slice(-8)} · {formatDate(selectedInvoice.fechaEmision)}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-mono font-medium text-[14px]">
                          ${selectedInvoice.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-ink-3 font-mono">{selectedInvoice.moneda}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="clay"
                type="button"
                disabled={!invoiceId}
                onClick={handleContinue}
              >
                <Icon name="chev" size={13} />
                Continuar
              </Button>
              <Button variant="ghost" type="button" asChild>
                <Link to="/payments">Cancelar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-paper-2">
          <CardContent className="pt-5">
            <div className="text-[12px] font-medium mb-2 text-clay">¿Cómo funciona?</div>
            <ul className="text-[11px] text-ink-3 space-y-1">
              <li>• Selecciona el proveedor al que le vas a pagar</li>
              <li>• Selecciona la factura que deseas pagar de ese proveedor</li>
              <li>• En la siguiente pantalla subirás el comprobante de pago</li>
              <li>• El sistema extraerá automáticamente el importe del comprobante</li>
              <li>• El pago se registrará y vinculará a la factura seleccionada</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
