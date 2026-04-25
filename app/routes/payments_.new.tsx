import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";

import { requireUser } from "~/lib/session.server";
import { SAMPLE_VENDORS } from "~/lib/sample-data";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Icon } from "~/components/ui/icon";
import { Dropzone } from "~/components/ui/dropzone";
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
  await requireUser(request);
  return json({ vendors: SAMPLE_VENDORS });
}

export default function NewPayment() {
  const { vendors } = useLoaderData<typeof loader>();
  const [vendorId, setVendorId] = useState<string>("");
  const [method, setMethod] = useState<string>("Transferencia SPEI");
  const [currency, setCurrency] = useState<string>("MXN");

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
            Crea el pago, asígnalo a una o varias facturas y opcionalmente
            adjunta el comprobante.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>
              Datos <em className="not-italic text-clay">del pago</em>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                // TODO(phase-3): POST /api/payments
              }}
            >
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Proveedor
                </Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Fecha
                </Label>
                <Input type="date" />
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Método
                </Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Transferencia SPEI">Transferencia SPEI</SelectItem>
                    <SelectItem value="Wire USD">Wire USD</SelectItem>
                    <SelectItem value="SEPA">SEPA</SelectItem>
                    <SelectItem value="Cheque MXN">Cheque MXN</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Moneda
                </Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MXN">MXN</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Importe
                </Label>
                <Input type="number" step="0.01" placeholder="0.00" />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Referencia / Folio interno
                </Label>
                <Input placeholder="PG-2026-####" className="font-mono" />
              </div>

              <div className="md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-2 block">
                  Comprobante (opcional)
                </Label>
                <Dropzone
                  title="Sube el comprobante de pago"
                  hint="PDF o imagen — el proveedor lo verá al confirmar"
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-2 pt-2">
                <Button variant="clay" type="submit">
                  <Icon name="check" size={13} />
                  Registrar pago
                </Button>
                <Button variant="ghost" type="button" asChild>
                  <Link to="/payments">Cancelar</Link>
                </Button>
                <span className="ml-auto font-mono text-[11px] text-ink-3">
                  Backend pendiente — guardado real llega en Phase 3
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}
