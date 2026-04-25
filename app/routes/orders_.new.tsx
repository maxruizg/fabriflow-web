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
  { title: "Nueva orden — FabriFlow" },
];

export const handle = {
  crumb: ["Operación", "Órdenes", "Nueva"],
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return json({ vendors: SAMPLE_VENDORS });
}

export default function NewOrder() {
  const { vendors } = useLoaderData<typeof loader>();
  const [vendorId, setVendorId] = useState<string>("");
  const [currency, setCurrency] = useState<string>("MXN");

  return (
    <AuthLayout>
      <div className="space-y-6 max-w-3xl">
        <header>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link to="/orders">
              <Icon name="chevl" size={12} />
              Volver a órdenes
            </Link>
          </Button>
          <h1 className="ff-page-title">
            Nueva <em>orden</em>
          </h1>
          <p className="ff-page-sub">
            Define la OC, agrega líneas y opcionalmente sube el PDF firmado.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>
              Datos <em className="not-italic text-clay">de la orden</em>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                // TODO(phase-3): wire to POST /api/orders once backend lands
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
                        {v.name} · {v.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Fecha de emisión
                </Label>
                <Input type="date" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Vencimiento
                </Label>
                <Input type="date" />
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
                  Importe total
                </Label>
                <Input type="number" step="0.01" placeholder="0.00" />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Notas
                </Label>
                <Input placeholder="Términos, contacto, instrucciones de entrega…" />
              </div>

              <div className="md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-2 block">
                  PDF de la OC (opcional)
                </Label>
                <Dropzone />
              </div>

              <div className="md:col-span-2 flex items-center gap-2 pt-2">
                <Button variant="clay" type="submit">
                  <Icon name="check" size={13} />
                  Crear orden
                </Button>
                <Button variant="ghost" type="button" asChild>
                  <Link to="/orders">Cancelar</Link>
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
