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

// ----------------------------------------------------------------------------
// SAT catalogs (most-used subset). The user can override via free-text in the
// "Otro" option which renders an inline input.
// ----------------------------------------------------------------------------

const CFDI_USES: { code: string; label: string }[] = [
  { code: "G01", label: "G01 — Adquisición de mercancías" },
  { code: "G02", label: "G02 — Devoluciones, descuentos o bonificaciones" },
  { code: "G03", label: "G03 — Gastos en general" },
  { code: "I01", label: "I01 — Construcciones" },
  { code: "I02", label: "I02 — Mobiliario y equipo de oficina" },
  { code: "I04", label: "I04 — Equipo de cómputo" },
  { code: "I06", label: "I06 — Comunicaciones telefónicas" },
  { code: "I08", label: "I08 — Otra maquinaria y equipo" },
  { code: "P01", label: "P01 — Por definir" },
  { code: "S01", label: "S01 — Sin efectos fiscales" },
];

const PAYMENT_METHODS: { code: string; label: string }[] = [
  { code: "PUE", label: "PUE — Pago en una sola exhibición" },
  { code: "PPD", label: "PPD — Pago en parcialidades o diferido" },
];

const PAYMENT_FORMS: { code: string; label: string }[] = [
  { code: "01", label: "01 — Efectivo" },
  { code: "02", label: "02 — Cheque nominativo" },
  { code: "03", label: "03 — Transferencia electrónica" },
  { code: "04", label: "04 — Tarjeta de crédito" },
  { code: "28", label: "28 — Tarjeta de débito" },
  { code: "99", label: "99 — Por definir" },
];

const COMMON_DEPARTMENTS = [
  "Compras",
  "Producción",
  "Almacén",
  "Mantenimiento",
  "Calidad",
  "Administración",
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
  const deliveryWarehouse = String(fd.get("deliveryWarehouse") ?? "").trim();
  const deliveryDate = String(fd.get("deliveryDate") ?? "").trim();
  const requestingDepartment = String(fd.get("requestingDepartment") ?? "").trim();
  const cfdiUse = String(fd.get("cfdiUse") ?? "").trim();
  const paymentMethod = String(fd.get("paymentMethod") ?? "").trim();
  const paymentForm = String(fd.get("paymentForm") ?? "").trim();
  const observations = String(fd.get("observations") ?? "").trim();
  const ivaRateRaw = String(fd.get("ivaRate") ?? "16").trim();
  const ivaRateNum = parseFloat(ivaRateRaw);
  const ivaRate = Number.isFinite(ivaRateNum) && ivaRateNum >= 0 && ivaRateNum <= 100
    ? ivaRateNum
    : 16;
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
      deliveryWarehouse: deliveryWarehouse || undefined,
      deliveryDate: deliveryDate || undefined,
      requestingDepartment: requestingDepartment || undefined,
      cfdiUse: cfdiUse || undefined,
      paymentMethod: paymentMethod || undefined,
      paymentForm: paymentForm || undefined,
      observations: observations || undefined,
      ivaRate,
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
  // MX-billing fields (backend migration 005)
  const [deliveryWarehouse, setDeliveryWarehouse] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [requestingDepartment, setRequestingDepartment] = useState<string>("Compras");
  const [cfdiUse, setCfdiUse] = useState<string>("G03");
  const [paymentMethod, setPaymentMethod] = useState<string>("PPD");
  const [paymentForm, setPaymentForm] = useState<string>("99");
  const [observations, setObservations] = useState<string>("");
  const [ivaRate, setIvaRate] = useState<number>(16);
  const [ivaEditing, setIvaEditing] = useState<boolean>(false);
  const [lines, setLines] = useState<OrderLineDraft[]>([emptyLine()]);

  const subtotal = lines.reduce((acc, l) => acc + lineTotal(l), 0);
  const ivaCents = Math.round((subtotal * ivaRate / 100) * 100);
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
                Datos <em className="not-italic text-clay">de entrega</em>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Almacén
                </Label>
                <Input
                  name="deliveryWarehouse"
                  value={deliveryWarehouse}
                  onChange={(e) => setDeliveryWarehouse(e.target.value)}
                  placeholder="CADAQUES 50"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Fecha de entrega
                </Label>
                <Input
                  name="deliveryDate"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Dirección de entrega
                </Label>
                <Input
                  name="deliveryAddress"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Cadaqués No. 50 Col. Cerro de la Estrella, Iztapalapa CP 09839"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Departamento solicitante
                </Label>
                <Input
                  name="requestingDepartment"
                  value={requestingDepartment}
                  onChange={(e) => setRequestingDepartment(e.target.value)}
                  placeholder="Compras"
                  list="departments-list"
                />
                <datalist id="departments-list">
                  {COMMON_DEPARTMENTS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
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
                Datos <em className="not-italic text-clay">para facturación</em>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Uso de CFDI
                </Label>
                <Select value={cfdiUse} onValueChange={setCfdiUse} name="cfdiUse">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona uso CFDI" />
                  </SelectTrigger>
                  <SelectContent>
                    {CFDI_USES.map((u) => (
                      <SelectItem key={u.code} value={u.code}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="cfdiUse" value={cfdiUse} />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Método de pago
                </Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod} name="paymentMethod">
                  <SelectTrigger>
                    <SelectValue placeholder="PUE / PPD" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.code} value={m.code}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="paymentMethod" value={paymentMethod} />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Forma de pago
                </Label>
                <Select value={paymentForm} onValueChange={setPaymentForm} name="paymentForm">
                  <SelectTrigger>
                    <SelectValue placeholder="01 / 03 / 99…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_FORMS.map((f) => (
                      <SelectItem key={f.code} value={f.code}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="paymentForm" value={paymentForm} />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    IVA aplicado
                  </Label>
                  {!ivaEditing ? (
                    <button
                      type="button"
                      onClick={() => setIvaEditing(true)}
                      className="text-[11px] text-clay hover:underline font-mono"
                    >
                      cambiar
                    </button>
                  ) : null}
                </div>
                {ivaEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      name="ivaRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={ivaRate}
                      onChange={(e) =>
                        setIvaRate(parseFloat(e.target.value) || 0)
                      }
                      className="w-32"
                    />
                    <span className="text-[12px] text-ink-3 font-mono">%</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIvaRate(16);
                        setIvaEditing(false);
                      }}
                      className="text-[11px] text-ink-3 hover:underline font-mono ml-2"
                    >
                      restablecer 16%
                    </button>
                  </div>
                ) : (
                  <div className="text-[13px] font-mono text-ink">
                    {ivaRate}%
                    <input type="hidden" name="ivaRate" value={ivaRate} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Términos y <em className="not-italic text-clay">notas</em>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Términos de pago / crédito
                </Label>
                <Input
                  name="paymentTerms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="60 días"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Notas internas
                </Label>
                <Input
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Recordatorios, contactos, etc. (no salen impresas en el PDF)"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                  Observaciones
                </Label>
                <textarea
                  name="observations"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Favor de anexar la orden de compra con la factura."
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-paper px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-ink-4 resize-y"
                />
                <p className="text-[11px] text-ink-4">
                  Estas observaciones se imprimen en la OC PDF en la sección
                  "Observaciones".
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="sticky bottom-0 -mx-2 px-2 pb-2">
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3 shadow-sm">
              <div className="text-[12px] text-ink-3 font-mono">
                <span>
                  Subtotal{" "}
                  <span className="text-ink">
                    {subtotal.toLocaleString("es-MX", {
                      style: "currency",
                      currency:
                        currency === "USD" ? "USD" : currency === "EUR" ? "EUR" : "MXN",
                    })}
                  </span>
                </span>
                <span className="mx-2 text-ink-4">·</span>
                <span>
                  IVA {ivaRate}%{" "}
                  <span className="text-ink">
                    {(ivaCents / 100).toLocaleString("es-MX", {
                      style: "currency",
                      currency:
                        currency === "USD" ? "USD" : currency === "EUR" ? "EUR" : "MXN",
                    })}
                  </span>
                </span>
                <span className="mx-2 text-ink-4">·</span>
                <span>
                  Total{" "}
                  <span className="text-ink font-semibold">
                    {total.toLocaleString("es-MX", {
                      style: "currency",
                      currency:
                        currency === "USD" ? "USD" : currency === "EUR" ? "EUR" : "MXN",
                    })}
                  </span>
                </span>
                <span className="mx-2 text-ink-4">·</span>
                <span>
                  {lines.length} línea{lines.length === 1 ? "" : "s"}
                </span>
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
