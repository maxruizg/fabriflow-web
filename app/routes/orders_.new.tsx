import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

import { requireUser, getFullSession } from "~/lib/session.server";
import {
  createOrder,
  fetchActiveVendors,
  type ActiveVendorSummary,
  type CreateOrderItemPayload,
} from "~/lib/procurement-api.server";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Icon } from "~/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  OrderItemsTable,
  emptyLine,
  lineTotal,
  type OrderLineDraft,
} from "~/components/orders/order-items-table";

export const meta: MetaFunction = () => [
  { title: "Nueva orden — FabriFlow" },
];

export const handle = {
  crumb: ["Operación", "Órdenes", "Nueva"],
};

interface LoaderData {
  vendors: ActiveVendorSummary[];
  vendorsError: string | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    return json<LoaderData>({ vendors: [], vendorsError: null });
  }
  try {
    const vendors = await fetchActiveVendors(session.accessToken, session.user.company);
    return json<LoaderData>({ vendors, vendorsError: null });
  } catch (e) {
    console.error("[orders/new] fetchActiveVendors failed:", e);
    return json<LoaderData>({
      vendors: [],
      vendorsError: e instanceof Error ? e.message : "No se pudieron cargar los proveedores",
    });
  }
}

interface ActionResult {
  ok: boolean;
  orderId?: string;
  shareToken?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    return json<ActionResult>({ ok: false, error: "Sesión inválida" }, { status: 401 });
  }

  const fd = await request.formData();
  const vendor = String(fd.get("vendor") ?? "").trim();
  const folio = String(fd.get("folio") ?? "").trim();
  const date = String(fd.get("date") ?? "").trim();
  const due = String(fd.get("due") ?? "").trim();
  const currency = String(fd.get("currency") ?? "MXN").trim().toUpperCase();
  const notes = String(fd.get("notes") ?? "").trim();
  const paymentTerms = String(fd.get("paymentTerms") ?? "").trim();
  const deliveryAddress = String(fd.get("deliveryAddress") ?? "").trim();
  const itemsJson = String(fd.get("items") ?? "[]");

  const fieldErrors: Record<string, string> = {};
  if (!vendor) fieldErrors.vendor = "Selecciona un proveedor";
  if (!folio) fieldErrors.folio = "El folio es requerido";
  if (!date) fieldErrors.date = "La fecha es requerida";

  let parsedItems: OrderLineDraft[] = [];
  try {
    parsedItems = JSON.parse(itemsJson) as OrderLineDraft[];
  } catch {
    fieldErrors.items = "Formato de líneas inválido";
  }

  const itemsPayload: CreateOrderItemPayload[] = [];
  parsedItems.forEach((line, idx) => {
    const desc = (line.description || "").trim();
    const qty = parseFloat(line.qty);
    const unitPrice = parseFloat(line.unitPrice);
    const discount = parseFloat(line.discount || "0");
    if (!desc) {
      fieldErrors[`item.${idx}`] = `Línea ${idx + 1}: descripción requerida`;
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      fieldErrors[`item.${idx}`] = `Línea ${idx + 1}: cantidad inválida`;
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      fieldErrors[`item.${idx}`] = `Línea ${idx + 1}: precio inválido`;
      return;
    }
    itemsPayload.push({
      description: desc,
      sku: line.sku?.trim() || undefined,
      qty,
      unit: (line.unit || "PZA").trim(),
      unitPrice,
      discount: Number.isFinite(discount) ? discount : 0,
    });
  });

  if (itemsPayload.length === 0 && !fieldErrors.items) {
    fieldErrors.items = "Agrega al menos una línea";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionResult>({ ok: false, fieldErrors }, { status: 400 });
  }

  try {
    const result = await createOrder(session.accessToken, session.user.company, {
      vendor,
      folio,
      date,
      due: due || undefined,
      currency,
      items: itemsPayload,
      notes: notes || undefined,
      paymentTerms: paymentTerms || undefined,
      deliveryAddress: deliveryAddress || undefined,
    });
    const bareId = result.order.id.startsWith("order:")
      ? result.order.id.slice("order:".length)
      : result.order.id;
    // Redirect to detail with `?send=1&token=...` so the dialog auto-opens.
    const search = new URLSearchParams({ send: "1", token: result.shareToken });
    return redirect(`/orders/${encodeURIComponent(bareId)}?${search.toString()}`);
  } catch (e) {
    return json<ActionResult>(
      { ok: false, error: e instanceof Error ? e.message : "Error al crear la orden" },
      { status: 500 },
    );
  }
}

export default function NewOrder() {
  const { vendors, vendorsError } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionResult | undefined;
  const nav = useNavigation();
  const submitting = nav.state !== "idle";

  const [vendorId, setVendorId] = useState<string>("");
  const [folio, setFolio] = useState<string>(suggestFolio());
  const [date, setDate] = useState<string>(today());
  const [due, setDue] = useState<string>("");
  const [currency, setCurrency] = useState<string>("MXN");
  const [notes, setNotes] = useState<string>("");
  const [paymentTerms, setPaymentTerms] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [lines, setLines] = useState<OrderLineDraft[]>([emptyLine()]);

  const subtotal = lines.reduce((acc, l) => acc + lineTotal(l), 0);
  const ivaCents = Math.round(subtotal * 0.16 * 100);
  const totalCents = Math.round(subtotal * 100) + ivaCents;
  const total = totalCents / 100;

  // If the action returned errors, scroll to the first error
  useEffect(() => {
    if (actionData?.fieldErrors) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [actionData]);

  const fieldErr = (k: string) => actionData?.fieldErrors?.[k];

  return (
    <AuthLayout>
      <div className="space-y-6 max-w-5xl">
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
            Define la OC, agrega líneas y envíala al proveedor por correo o WhatsApp.
          </p>
        </header>

        {actionData?.error ? (
          <div
            role="alert"
            className="rounded-md border border-wine bg-wine-soft px-4 py-3 text-[13px] text-wine-deep"
          >
            {actionData.error}
          </div>
        ) : null}
        {vendorsError ? (
          <div
            role="alert"
            className="rounded-md border border-rust bg-rust-soft px-4 py-3 text-[13px] text-rust-deep"
          >
            No se pudieron cargar los proveedores: {vendorsError}
          </div>
        ) : null}

        <Form method="post" className="space-y-6">
          {/* Hidden field for items as JSON */}
          <input type="hidden" name="items" value={JSON.stringify(lines)} />

          <Card>
            <CardHeader>
              <CardTitle>
                Encabezado <em className="not-italic text-clay">de la orden</em>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    Proveedor
                  </Label>
                  <Select value={vendorId} onValueChange={setVendorId} name="vendor">
                    <SelectTrigger aria-invalid={Boolean(fieldErr("vendor"))}>
                      <SelectValue
                        placeholder={
                          vendors.length === 0
                            ? "No hay proveedores activos"
                            : "Selecciona un proveedor"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          <span className="text-ink-3"> · {v.rfc}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Native fallback so RHF-less Form picks the value */}
                  <input type="hidden" name="vendor" value={vendorId} />
                  {fieldErr("vendor") ? (
                    <p className="text-[11.5px] text-wine">{fieldErr("vendor")}</p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    Folio
                  </Label>
                  <Input
                    name="folio"
                    value={folio}
                    onChange={(e) => setFolio(e.target.value)}
                    placeholder="OC-2026-00001"
                  />
                  {fieldErr("folio") ? (
                    <p className="text-[11.5px] text-wine">{fieldErr("folio")}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    Moneda
                  </Label>
                  <Select value={currency} onValueChange={setCurrency} name="currency">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MXN">MXN</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="currency" value={currency} />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    Fecha de emisión
                  </Label>
                  <Input
                    name="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  {fieldErr("date") ? (
                    <p className="text-[11.5px] text-wine">{fieldErr("date")}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    Vencimiento (opcional)
                  </Label>
                  <Input
                    name="due"
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Líneas <em className="not-italic text-clay">de la orden</em>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrderItemsTable lines={lines} onChange={setLines} currency={currency} />
              {fieldErr("items") ? (
                <p className="mt-2 text-[11.5px] text-wine">{fieldErr("items")}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Términos y <em className="not-italic text-clay">notas</em>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Términos de pago
                </Label>
                <Input
                  name="paymentTerms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="30 días neto"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Dirección de entrega
                </Label>
                <Input
                  name="deliveryAddress"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Av. Principal 123, Almacén 4"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Notas
                </Label>
                <Input
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones, contacto, recordatorios…"
                />
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-0 -mx-2 px-2 pb-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3 shadow-sm">
              <div className="text-[12px] text-ink-3 font-mono">
                Total estimado:{" "}
                <span className="text-ink font-semibold">
                  {total.toLocaleString("es-MX", {
                    style: "currency",
                    currency: currency === "USD" ? "USD" : currency === "EUR" ? "EUR" : "MXN",
                  })}
                </span>{" "}
                · {lines.length} línea{lines.length === 1 ? "" : "s"}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" type="button" asChild>
                  <Link to="/orders">Cancelar</Link>
                </Button>
                <Button variant="clay" type="submit" disabled={submitting}>
                  <Icon name="check" size={13} />
                  {submitting ? "Creando…" : "Crear y continuar"}
                </Button>
              </div>
            </div>
          </div>
        </Form>
      </div>
    </AuthLayout>
  );
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function suggestFolio(): string {
  const y = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 99999)
    .toString()
    .padStart(5, "0");
  return `OC-${y}-${rand}`;
}
