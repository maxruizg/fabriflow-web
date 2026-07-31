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
import {
  fetchActiveVendors,
  fetchOutstandingInvoicesForVendor,
  submitMultipayment,
  extractReceiptPdf,
  type ActiveVendorSummary,
  type CreatePaymentPayload,
  type PaymentAllocationInput,
  type PaymentExtractedMeta,
  type FinalizeMultipaymentResponse,
  type OutstandingInvoiceSummary,
} from "~/lib/procurement-api.server";

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

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !user.company) {
    return json({
      vendors: [] as ActiveVendorSummary[],
      invoices: [] as OutstandingInvoiceSummary[],
    });
  }

  const url = new URL(request.url);
  const vendorId = url.searchParams.get("vendorId");

  const [vendors, invoices] = await Promise.all([
    fetchActiveVendors(session.accessToken, user.company).catch(
      () => [] as ActiveVendorSummary[],
    ),
    vendorId
      ? fetchOutstandingInvoicesForVendor(
          session.accessToken,
          user.company,
          vendorId,
        ).catch(() => [] as OutstandingInvoiceSummary[])
      : Promise.resolve([] as OutstandingInvoiceSummary[]),
  ]);

  return json({ vendors, invoices });
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

    let allocations: PaymentAllocationInput[];
    try {
      allocations = JSON.parse(allocationsRaw) as PaymentAllocationInput[];
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
  const { vendors, invoices: initialInvoices } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const extractFetcher = useFetcher<typeof action>();
  const invoicesFetcher = useFetcher<typeof loader>();
  const { user } = useUser();

  const [vendorId, setVendorId] = useState<string>("");
  const [folio, setFolio] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [method, setMethod] = useState<string>("transferencia_spei");
  const [currency, setCurrency] = useState<string>("MXN");
  const [amount, setAmount] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [bank, setBank] = useState<string>("");
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [vendorInvoices, setVendorInvoices] = useState<OutstandingInvoiceSummary[]>(initialInvoices);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [fxRates, setFxRates] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monto/fecha/moneda/banco/referencia se derivan exclusivamente de la
  // lectura del comprobante — no hay captura manual para estos campos. Si el
  // comprobante no revela un monto, la pantalla se lo hace saber y pide subir
  // otro archivo en vez de permitir teclearlo.
  const extractionDone =
    extractFetcher.state === "idle" &&
    !!extractFetcher.data &&
    extractFetcher.data.step === "extract";
  const extractionMeta = (extractionDone && extractFetcher.data?.ok
    ? (extractFetcher.data.payload as PaymentExtractedMeta)
    : null);
  const extractionFailed =
    extractionDone && (!extractFetcher.data?.ok || extractionMeta?.amount == null);

  useEffect(() => {
    if (!extractionMeta) return;
    setAmount(extractionMeta.amount != null ? String(extractionMeta.amount) : "");
    setDate(extractionMeta.date || new Date().toISOString().slice(0, 10));
    setReference(extractionMeta.reference || "");
    setBank(extractionMeta.bank || "");
    setCurrency(extractionMeta.currency || "MXN");
  }, [extractionMeta]);

  // When the vendor-scoped invoice fetcher returns, refresh the picker list.
  useEffect(() => {
    if (invoicesFetcher.state !== "idle" || !invoicesFetcher.data) return;
    setVendorInvoices(invoicesFetcher.data.invoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoicesFetcher.state, invoicesFetcher.data]);

  function handleVendorChange(id: string) {
    setVendorId(id);
    setSelectedInvoices([]);
    setAllocations({});
    setFxRates({});
    if (id) {
      invoicesFetcher.load(`/multipayments/new?vendorId=${encodeURIComponent(id)}`);
    } else {
      setVendorInvoices([]);
    }
  }

  // Tipo de cambio requerido por cada moneda extranjera presente entre las
  // facturas seleccionadas (1 si la factura ya comparte moneda con el pago).
  const foreignCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const id of selectedInvoices) {
      const inv = vendorInvoices.find((i) => i.id === id);
      if (inv && inv.moneda !== currency) set.add(inv.moneda);
    }
    return Array.from(set);
  }, [selectedInvoices, vendorInvoices, currency]);

  function rateFor(invoiceCurrency: string): number {
    if (invoiceCurrency === currency) return 1;
    return Number(fxRates[invoiceCurrency] || "0") || 0;
  }

  // Total asignado, convertido a la moneda del pago.
  const totalAllocated = useMemo(() => {
    return selectedInvoices.reduce((sum, id) => {
      const inv = vendorInvoices.find((i) => i.id === id);
      if (!inv) return sum;
      const amt = Number(allocations[id] || "0") || 0;
      return sum + amt * rateFor(inv.moneda);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoices, allocations, vendorInvoices, fxRates, currency]);

  const remaining = (Number(amount || "0") || 0) - totalAllocated;
  const allFxRatesFilled = foreignCurrencies.every(
    (c) => (Number(fxRates[c] || "0") || 0) > 0,
  );
  const allocationsValid =
    selectedInvoices.length > 0 &&
    allFxRatesFilled &&
    Math.abs(remaining) < 0.01 &&
    selectedInvoices.every((id) => (Number(allocations[id] || "0") || 0) > 0);

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

  function toggleInvoice(id: string) {
    if (selectedInvoices.includes(id)) {
      setSelectedInvoices(selectedInvoices.filter((x) => x !== id));
      const next = { ...allocations };
      delete next[id];
      setAllocations(next);
      return;
    }

    const inv = vendorInvoices.find((i) => i.id === id);
    const paymentTotal = Number(amount || "0") || 0;
    const alreadyConverted = selectedInvoices.reduce((sum, pid) => {
      const pinv = vendorInvoices.find((i) => i.id === pid);
      if (!pinv) return sum;
      const amt = Number(allocations[pid] || "0") || 0;
      return sum + amt * rateFor(pinv.moneda);
    }, 0);
    const remainingBefore = Math.max(paymentTotal - alreadyConverted, 0);

    // Auto-relleno: el mínimo entre el saldo de la factura y lo que falte por
    // asignar del pago. Si las monedas coinciden (o el tipo de cambio ya se
    // capturó), esto deja el pago balanceado sin que el usuario teclee nada
    // cuando selecciona exactamente el conjunto correcto de facturas. Sigue
    // siendo editable después.
    let prefill = "";
    if (inv) {
      const rate = rateFor(inv.moneda);
      const remainingInInvoiceCurrency =
        rate > 0 ? remainingBefore / rate : inv.outstanding;
      const amt = Math.min(inv.outstanding, remainingInInvoiceCurrency);
      prefill = amt > 0.01 ? amt.toFixed(2) : "";
    }

    setSelectedInvoices([...selectedInvoices, id]);
    setAllocations({ ...allocations, [id]: prefill });
  }

  function updateAllocation(id: string, value: string) {
    setAllocations((prev) => ({ ...prev, [id]: value }));
  }

  // Hidden serialized allocations for the submit form
  const allocationsPayload = useMemo(() => {
    return JSON.stringify(
      selectedInvoices.map((invoiceId) => {
        const inv = vendorInvoices.find((i) => i.id === invoiceId);
        const amt = Number(allocations[invoiceId] || "0") || 0;
        const rate = inv ? rateFor(inv.moneda) : 1;
        const convertedAmt = amt * rate;
        const paymentTotal = Number(amount || "0") || 0;
        const percentage =
          paymentTotal > 0
            ? Math.round((convertedAmt / paymentTotal) * 10000) / 100
            : 0;
        const item: PaymentAllocationInput = {
          invoiceId,
          amount: amt,
          percentage,
          fxRate: rate,
        };
        return item;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoices, allocations, vendorInvoices, fxRates, currency, amount]);

  const extracting = extractFetcher.state !== "idle";
  const loadingInvoices = invoicesFetcher.state !== "idle";
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
                <Select value={vendorId} onValueChange={handleVendorChange}>
                  <SelectTrigger id="vendor">
                    <SelectValue placeholder="Selecciona el proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.vendorLegalName || v.name}
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
                  Fecha, monto, moneda, banco y referencia se leen
                  automáticamente del comprobante — no se capturan a mano.
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
                <Label htmlFor="beneficiary">Beneficiario (opcional)</Label>
                <Input
                  id="beneficiary"
                  name="beneficiary"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                />
              </div>
            </div>

            {/* Fecha/monto/moneda/banco/referencia: solo lectura, derivados
                del comprobante subido en el paso 1. */}
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="currency" value={currency} />
            <input type="hidden" name="bank" value={bank} />
            <input type="hidden" name="reference" value={reference} />

            {!file ? (
              <Alert>
                <AlertDescription>
                  Sube el comprobante en el paso 1 para detectar fecha, monto,
                  moneda y banco automáticamente.
                </AlertDescription>
              </Alert>
            ) : extracting ? (
              <Alert>
                <AlertDescription>Leyendo comprobante…</AlertDescription>
              </Alert>
            ) : extractionFailed ? (
              <Alert variant="destructive">
                <AlertDescription>
                  No pudimos detectar el monto en este comprobante. Sube un
                  archivo distinto en el paso 1 — este campo no se puede
                  capturar a mano.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 rounded-lg border bg-paper-2 p-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-3">
                    Fecha
                  </div>
                  <div className="font-mono text-[13px]">{date || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-3">
                    Monto
                  </div>
                  <div className="font-mono text-[13px]">
                    ${fmt(Number(amount || "0") || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-3">
                    Moneda
                  </div>
                  <div className="font-mono text-[13px]">{currency}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-3">
                    Banco
                  </div>
                  <div className="font-mono text-[13px]">{bank || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-3">
                    Referencia
                  </div>
                  <div className="font-mono text-[13px] truncate">
                    {reference || "—"}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Step 3 — Allocation table */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">
                3. Facturas a cubrir
              </h2>
              {vendorId && !loadingInvoices ? (
                <span className="text-[12px] text-ink-3">
                  {vendorInvoices.length} factura
                  {vendorInvoices.length === 1 ? "" : "s"} facturada
                  {vendorInvoices.length === 1 ? "" : "s"} pendiente
                  {vendorInvoices.length === 1 ? "" : "s"} de pago
                </span>
              ) : null}
            </div>

            {foreignCurrencies.length > 0 ? (
              <div className="space-y-2 rounded-lg border bg-paper-2 p-3">
                <p className="text-[12px] font-medium text-ink-2">
                  Tipo de cambio
                </p>
                {foreignCurrencies.map((cur) => (
                  <div key={cur} className="flex items-center gap-2">
                    <Label className="text-[12px] w-40 shrink-0">
                      1 {cur} = ? {currency}
                    </Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={fxRates[cur] ?? ""}
                      onChange={(e) =>
                        setFxRates((prev) => ({ ...prev, [cur]: e.target.value }))
                      }
                      placeholder="0.0000"
                      className="w-32"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {!vendorId ? (
              <Alert>
                <AlertDescription>
                  Selecciona el proveedor para listar sus facturas.
                </AlertDescription>
              </Alert>
            ) : loadingInvoices ? (
              <Alert>
                <AlertDescription>Cargando facturas…</AlertDescription>
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
                      <TableHead className="text-right">
                        Saldo pendiente
                      </TableHead>
                      <TableHead className="text-right w-44">
                        Asignar
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorInvoices.map((inv) => {
                      const checked = selectedInvoices.includes(inv.id);
                      const isForeign = inv.moneda !== currency;
                      const rate = rateFor(inv.moneda);
                      const enteredAmt = Number(allocations[inv.id] || "0") || 0;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <Checkbox
                              id={`inv-${inv.id}`}
                              checked={checked}
                              onCheckedChange={() => toggleInvoice(inv.id)}
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
                            <div>${fmt(inv.outstanding)} {inv.moneda}</div>
                            {isForeign && rate > 0 ? (
                              <div className="text-[10px] text-ink-3">
                                ≈ ${fmt(inv.outstanding * rate)} {currency}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {checked ? (
                              <>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={allocations[inv.id] ?? ""}
                                  onChange={(e) =>
                                    updateAllocation(inv.id, e.target.value)
                                  }
                                  max={inv.outstanding}
                                  className="w-36 ml-auto text-right"
                                  placeholder="0.00"
                                />
                                {isForeign && rate > 0 && enteredAmt > 0 ? (
                                  <div className="text-[10px] text-ink-3 mt-0.5">
                                    ≈ ${fmt(enteredAmt * rate)} {currency}
                                  </div>
                                ) : null}
                              </>
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
                  <span className="text-ink-3">Monto del pago</span>
                  <span className="font-mono">${fmt(Number(amount || "0") || 0)} {currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-3">Asignado (convertido)</span>
                  <span className="font-mono">${fmt(totalAllocated)} {currency}</span>
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
                    ${fmt(remaining)} {currency}
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
