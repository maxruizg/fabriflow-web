import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json, redirect, unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "@remix-run/cloudflare";
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { requireUser, getFullSession } from "~/lib/session.server";
import { useUser } from "~/lib/auth-context";
import { fetchInvoices } from "~/lib/api.server";
import {
  fetchActiveVendors,
  submitMultipayment,
  extractReceiptPdf,
  type ActiveVendorSummary,
  type CreatePaymentPayload,
  type PaymentAllocation,
  type PaymentExtractedMeta,
  type FinalizeMultipaymentResponse,
} from "~/lib/procurement-api.server";
import type { InvoiceBackend } from "~/types";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Icon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

export const meta: MetaFunction = () => [
  { title: "Nuevo multipago — FabriFlow" },
];

export const handle = {
  crumb: ["Tesorería", "Multipagos", "Nuevo"],
  cta: null,
};

interface LoaderData {
  vendors: ActiveVendorSummary[];
  invoices: InvoiceBackend[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json({
      vendors: [] as ActiveVendorSummary[],
      invoices: [] as InvoiceBackend[],
    });
  }
  const [vendors, invoicesResponse] = await Promise.all([
    fetchActiveVendors(session.accessToken, user.company).catch(
      () => [] as ActiveVendorSummary[],
    ),
    fetchInvoices(session.accessToken, user.company, {
      estado: "facturada",
      limit: 200,
    }).catch(() => ({
      data: [] as InvoiceBackend[],
      nextCursor: null,
      hasMore: false,
      count: 0,
    })),
  ]);
  return json({
    vendors,
    invoices: invoicesResponse.data,
  });
}

interface ActionResult {
  ok: boolean;
  error?: string;
  step?: "extract" | "submit";
  payload?: PaymentExtractedMeta | FinalizeMultipaymentResponse;
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json<ActionResult>(
      { ok: false, error: "Sesión inválida" },
      { status: 401 },
    );
  }

  const uploadHandler = unstable_createMemoryUploadHandler({
    maxPartSize: 11 * 1024 * 1024, // backend cap is 10MB; allow tiny overhead
  });
  let formData: FormData;
  try {
    formData = await unstable_parseMultipartFormData(request, uploadHandler);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Archivo demasiado grande";
    return json<ActionResult>({ ok: false, error: msg }, { status: 400 });
  }

  const intent = String(formData.get("intent") ?? "");

  // -------- Intent: extract — pre-fill from receipt PDF ---------------------
  if (intent === "extract") {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return json<ActionResult>(
        { ok: false, error: "Archivo requerido", step: "extract" },
        { status: 400 },
      );
    }
    try {
      const meta = await extractReceiptPdf(
        session.accessToken,
        user.company,
        file,
      );
      return json<ActionResult>({ ok: true, step: "extract", payload: meta });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al leer el comprobante";
      return json<ActionResult>(
        { ok: false, error: msg, step: "extract" },
        { status: 400 },
      );
    }
  }

  // -------- Intent: submit — create + upload + finalize ---------------------
  if (intent === "submit") {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return json<ActionResult>(
        { ok: false, error: "Sube el comprobante de pago", step: "submit" },
        { status: 400 },
      );
    }
    const vendor = String(formData.get("vendor") ?? "");
    const folio = String(formData.get("folio") ?? "");
    const date = String(formData.get("date") ?? "");
    const currency = String(formData.get("currency") ?? "MXN");
    const method = String(formData.get("method") ?? "transferencia_spei");
    const amountRaw = String(formData.get("amount") ?? "0");
    const bankName = String(formData.get("bank") ?? "");
    const reference = String(formData.get("reference") ?? "");
    const beneficiary = String(formData.get("beneficiary") ?? "");
    const allocationsRaw = String(formData.get("allocations") ?? "[]");

    let allocations: PaymentAllocation[];
    try {
      allocations = JSON.parse(allocationsRaw) as PaymentAllocation[];
    } catch {
      return json<ActionResult>(
        { ok: false, error: "Asignaciones inválidas", step: "submit" },
        { status: 400 },
      );
    }
    const amount = Number(amountRaw);
    if (!vendor || !folio || !date || !amount || allocations.length === 0) {
      return json<ActionResult>(
        {
          ok: false,
          error: "Completa proveedor, folio, fecha, monto y al menos una factura",
          step: "submit",
        },
        { status: 400 },
      );
    }

    const payload: CreatePaymentPayload = {
      vendor,
      folio,
      date,
      amount,
      currency,
      // Backend enum strings (PaymentMethod::from_str): transferencia_spei,
      // wire_usd, sepa, cheque_mxn. Cast via unknown — the value comes from a
      // <Select> bound to PAYMENT_METHODS, so it's already one of those keys.
      method: method as unknown as CreatePaymentPayload["method"],
      bankInfo: bankName
        ? {
            bank: bankName,
            clabeMasked: "",
            beneficiary: beneficiary || reference || "",
            rfc: "",
          }
        : null,
      allocations,
    };

    try {
      const result = await submitMultipayment(
        session.accessToken,
        user.company,
        { payload, receiptFile: file },
      );
      // Success — bounce to the list view; the action result is set as flash via
      // search params so the toast can pick it up on the next render.
      return redirect(
        `/multipayments?registered=${encodeURIComponent(result.payment.id)}&orders=${result.results.length}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al registrar multipago";
      return json<ActionResult>(
        { ok: false, error: msg, step: "submit" },
        { status: 400 },
      );
    }
  }

  return json<ActionResult>(
    { ok: false, error: "Acción desconocida" },
    { status: 400 },
  );
}

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "transferencia_spei", label: "Transferencia SPEI" },
  { value: "wire_usd", label: "Wire USD" },
  { value: "sepa", label: "SEPA" },
  { value: "cheque_mxn", label: "Cheque MXN" },
];

function fmt(amount: number): string {
  return amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function NewMultipaymentPage() {
  const { vendors, invoices } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const extractFetcher = useFetcher<typeof action>();
  const { user } = useUser();

  const [vendorId, setVendorId] = useState<string>("");
  const [folio, setFolio] = useState<string>("");
  const [date, setDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );
  const [method, setMethod] = useState<string>("transferencia_spei");
  const [currency, setCurrency] = useState<string>("MXN");
  const [amount, setAmount] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [bank, setBank] = useState<string>("");
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When the extract fetcher returns metadata, pre-fill form fields. The user
  // can still edit anything; extraction is best-effort and not authoritative.
  useEffect(() => {
    if (extractFetcher.state !== "idle") return;
    const data = extractFetcher.data;
    if (!data || !data.ok || data.step !== "extract") return;
    const meta = data.payload as PaymentExtractedMeta;
    if (meta.amount != null && !amount) setAmount(String(meta.amount));
    if (meta.date && !date.length) setDate(meta.date);
    else if (meta.date) setDate(meta.date);
    if (meta.reference && !reference) setReference(meta.reference);
    if (meta.bank && !bank) setBank(meta.bank);
    if (meta.currency && !currency) setCurrency(meta.currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractFetcher.state, extractFetcher.data]);

  const vendorInvoices = useMemo(() => {
    if (!vendorId) return [] as InvoiceBackend[];
    return invoices.filter((inv) => inv.vendor === vendorId);
  }, [invoices, vendorId]);

  const totalAllocated = useMemo(() => {
    return selectedInvoices.reduce(
      (sum, id) => sum + (Number(allocations[id] || "0") || 0),
      0,
    );
  }, [selectedInvoices, allocations]);

  const totalSelectedFace = useMemo(() => {
    return selectedInvoices.reduce((sum, id) => {
      const inv = vendorInvoices.find((i) => i.id === id);
      return sum + (inv?.total ?? 0);
    }, 0);
  }, [selectedInvoices, vendorInvoices]);

  const remaining = (Number(amount || "0") || 0) - totalAllocated;
  const allocationsValid =
    selectedInvoices.length > 0 &&
    Math.abs(remaining) < 0.01 &&
    selectedInvoices.every(
      (id) => Number(allocations[id] || "0") > 0,
    );

  const submitDisabled =
    !vendorId ||
    !folio ||
    !date ||
    !amount ||
    Number(amount) <= 0 ||
    !file ||
    !allocationsValid ||
    navigation.state !== "idle";

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    if (!next) return;
    // Auto-trigger extraction. Use FormData manually so we can attach `intent`.
    const fd = new FormData();
    fd.append("intent", "extract");
    fd.append("file", next);
    extractFetcher.submit(fd, {
      method: "post",
      encType: "multipart/form-data",
    });
  }

  function toggleInvoice(id: string, total: number) {
    setSelectedInvoices((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        const newAlloc = { ...allocations };
        delete newAlloc[id];
        setAllocations(newAlloc);
        return next;
      }
      // No auto-fill: empty input per user decision
      void total;
      return [...prev, id];
    });
  }

  function updateAllocation(id: string, value: string) {
    setAllocations((prev) => ({ ...prev, [id]: value }));
  }

  // Hidden serialized allocations for the submit form
  const allocationsPayload = useMemo(() => {
    const totalAmount = Number(amount || "0") || 0;
    if (totalAmount <= 0) return "[]";
    return JSON.stringify(
      selectedInvoices.map((invoiceId) => {
        const amt = Number(allocations[invoiceId] || "0") || 0;
        return {
          invoiceId,
          amount: amt,
          percentage: Math.round((amt / totalAmount) * 10000) / 100,
        };
      }),
    );
  }, [selectedInvoices, allocations, amount]);

  const extracting = extractFetcher.state !== "idle";
  const submitting = navigation.state !== "idle";

  return (
    <AuthLayout>
      <div className="space-y-5 max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Nuevo <em>multipago</em>
            </h1>
            <p className="ff-page-sub">
              {user?.companyName ?? "Tu empresa"} · Distribuye un comprobante
              entre varias facturas del mismo proveedor
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/multipayments">
              <Icon name="chevl" size={13} />
              Volver
            </Link>
          </Button>
        </header>

        {actionData && !actionData.ok ? (
          <Alert variant="destructive">
            <AlertDescription>{actionData.error}</AlertDescription>
          </Alert>
        ) : null}

        <Form method="post" encType="multipart/form-data" className="space-y-6">
          <input type="hidden" name="intent" value="submit" />
          <input type="hidden" name="allocations" value={allocationsPayload} />

          {/* Step 1 — Vendor + Receipt */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">
                1. Proveedor y comprobante
              </h2>
              {extracting ? (
                <Badge tone="clay">Leyendo PDF…</Badge>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vendor">Proveedor</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger id="vendor">
                    <SelectValue placeholder="Selecciona el proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="vendor" value={vendorId} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Comprobante de pago (PDF/PNG/JPEG)</Label>
                <Input
                  ref={fileInputRef}
                  id="file"
                  name="file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={onFileChange}
                />
                <p className="text-[11px] text-ink-3">
                  Al subirlo, leeremos el monto, fecha, referencia y banco
                  automáticamente.
                </p>
              </div>
            </div>
          </Card>

          {/* Step 2 — Payment fields */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">
              2. Datos del pago
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="folio">Folio interno</Label>
                <Input
                  id="folio"
                  name="folio"
                  value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                  placeholder="PAY-2026-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Monto total</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
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
              <div className="space-y-2">
                <Label htmlFor="method">Método</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="method" value={method} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank">Banco emisor</Label>
                <Input
                  id="bank"
                  name="bank"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="BBVA, Banorte…"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="reference">Referencia / clave de rastreo</Label>
                <Input
                  id="reference"
                  name="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="SPEI clave de rastreo o folio de operación"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beneficiary">Beneficiario (opcional)</Label>
                <Input
                  id="beneficiary"
                  name="beneficiary"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                />
              </div>
            </div>
          </Card>

          {/* Step 3 — Allocation table */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">
                3. Facturas a cubrir
              </h2>
              {vendorId ? (
                <span className="text-[12px] text-ink-3">
                  {vendorInvoices.length} factura
                  {vendorInvoices.length === 1 ? "" : "s"} facturada
                  {vendorInvoices.length === 1 ? "" : "s"} pendiente
                  {vendorInvoices.length === 1 ? "" : "s"} de pago
                </span>
              ) : null}
            </div>

            {!vendorId ? (
              <Alert>
                <AlertDescription>
                  Selecciona el proveedor para listar sus facturas.
                </AlertDescription>
              </Alert>
            ) : vendorInvoices.length === 0 ? (
              <Alert>
                <AlertDescription>
                  Este proveedor no tiene facturas en estado{" "}
                  <em>Facturada</em> pendientes de pago.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Folio</TableHead>
                      <TableHead>UUID</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right w-44">
                        Asignar
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorInvoices.map((inv) => {
                      const checked = selectedInvoices.includes(inv.id);
                      return (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <Checkbox
                              id={`inv-${inv.id}`}
                              checked={checked}
                              onCheckedChange={() =>
                                toggleInvoice(inv.id, inv.total)
                              }
                            />
                          </TableCell>
                          <TableCell className="font-mono text-[12px]">
                            {inv.folio}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-ink-3 truncate max-w-[180px]">
                            {inv.uuid}
                          </TableCell>
                          <TableCell className="font-mono text-[12px] text-ink-3">
                            {inv.fechaEmision?.slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${fmt(inv.total)} {inv.moneda}
                          </TableCell>
                          <TableCell className="text-right">
                            {checked ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={allocations[inv.id] ?? ""}
                                onChange={(e) =>
                                  updateAllocation(inv.id, e.target.value)
                                }
                                max={inv.total}
                                className="w-36 ml-auto text-right"
                                placeholder="0.00"
                              />
                            ) : (
                              <span className="text-ink-4 text-[12px]">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {selectedInvoices.length > 0 ? (
              <div className="rounded-lg border bg-paper-2 p-4 space-y-1 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-ink-3">Total facturas seleccionadas</span>
                  <span className="font-mono">${fmt(totalSelectedFace)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Monto del pago</span>
                  <span className="font-mono">${fmt(Number(amount || "0") || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Asignado</span>
                  <span className="font-mono">${fmt(totalAllocated)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="font-medium">Por asignar</span>
                  <span
                    className={
                      "font-mono font-medium " +
                      (Math.abs(remaining) < 0.01
                        ? "text-moss-2"
                        : "text-rust-2")
                    }
                  >
                    ${fmt(remaining)}
                  </span>
                </div>
              </div>
            ) : null}
          </Card>

          <div className="flex justify-end gap-3">
            <Button asChild variant="outline">
              <Link to="/multipayments">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              <Icon name="upload" size={13} />
              {submitting ? "Registrando…" : "Registrar multipago"}
            </Button>
          </div>
        </Form>
      </div>
    </AuthLayout>
  );
}
