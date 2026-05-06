import type { MetaFunction, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate, useActionData, Form, useNavigation } from "@remix-run/react";
import { json, redirect } from "@remix-run/cloudflare";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Badge } from "~/components/ui/badge";
import { Icon } from "~/components/ui/icon";
import { Loader2 } from "lucide-react";
import { requireUser, getFullSession } from "~/lib/session.server";
import {
  uploadInvoicePdf,
  uploadInvoiceXml,
  uploadPurchaseOrder,
  createInvoice,
  uploadCompleteInvoice,
} from "~/lib/api.server";
import { getAvailableOrdersForInvoice } from "~/lib/procurement-api.server";
import { useState, useCallback, useEffect } from "react";
import type { InvoiceDetailBackend } from "~/types";
import { cn } from "~/lib/utils";
import { InvoiceUploadForm } from "~/components/invoices/invoice-upload-form";

export const meta: MetaFunction = () => {
  return [
    { title: "Cargar Factura — FabriFlow" },
    { name: "description", content: "Cargar una nueva factura al sistema" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return redirect("/login");
  }

  // Solo vendors pueden cargar facturas (case-insensitive check)
  const isVendor = user.role?.toLowerCase() === "vendor" ||
                   user.role?.toLowerCase().includes("proveedor") ||
                   user.permissions?.includes("invoices:create");
  if (!isVendor && !user.permissions?.includes("*")) {
    return redirect("/invoices");
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

  // Obtener órdenes de compra disponibles para facturar
  const availableOrders = await getAvailableOrdersForInvoice(
    session.accessToken,
    user.company,
    user.company  // vendorId = company del usuario vendor
  );

  return json({
    user,
    companyId: user.company,
    token: session.accessToken,
    orderId,
    availableOrders,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({ error: "Sesion invalida" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "uploadXml") {
    const xmlFile = formData.get("xmlFile") as File;
    if (!xmlFile || xmlFile.size === 0) {
      return json({ error: "No se selecciono archivo XML" }, { status: 400 });
    }

    try {
      const result = await uploadInvoiceXml(session.accessToken, user.company, xmlFile);
      const xmlContent = await xmlFile.text();
      const invoiceData = parseXmlContent(xmlContent);
      return json({ success: true, xmlUrl: result.url, invoiceData });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Error al subir XML" }, { status: 500 });
    }
  }

  if (intent === "uploadPdf") {
    const pdfFile = formData.get("pdfFile") as File;
    if (!pdfFile || pdfFile.size === 0) {
      return json({ error: "No se selecciono archivo PDF" }, { status: 400 });
    }

    try {
      const result = await uploadInvoicePdf(session.accessToken, user.company, pdfFile);
      return json({ success: true, pdfUrl: result.url });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Error al subir PDF" }, { status: 500 });
    }
  }

  if (intent === "uploadPurchaseOrder") {
    const poFile = formData.get("purchaseOrderFile") as File;
    if (!poFile || poFile.size === 0) {
      return json({ error: "No se selecciono archivo de orden de compra" }, { status: 400 });
    }

    try {
      const result = await uploadPurchaseOrder(session.accessToken, user.company, poFile);
      return json({ success: true, ordenCompraUrl: result.url, valid: result.valid, message: result.message });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Error al subir orden de compra" }, { status: 500 });
    }
  }

  // New unified upload endpoint - uploads 2 files (PDF + XML) and creates invoice linked to purchase order
  if (intent === "uploadComplete") {
    const pdfFactura = formData.get("pdfFactura") as File;
    const xmlFactura = formData.get("xmlFactura") as File;
    const pdfOrden = formData.get("pdfOrden") as File | null;  // Opcional (deprecated)
    const purchaseOrderId = formData.get("purchaseOrderId") as string;

    // Validate required fields
    if (!pdfFactura || pdfFactura.size === 0) {
      return json({ error: "PDF de factura es requerido" }, { status: 400 });
    }
    if (!xmlFactura || xmlFactura.size === 0) {
      return json({ error: "XML CFDI es requerido" }, { status: 400 });
    }
    if (!purchaseOrderId || purchaseOrderId.trim().length === 0) {
      return json({ error: "Orden de compra es requerida" }, { status: 400 });
    }

    try {
      const result = await uploadCompleteInvoice(
        session.accessToken,
        user.company,
        pdfFactura,
        xmlFactura,
        purchaseOrderId,
        pdfOrden && pdfOrden.size > 0 ? pdfOrden : undefined,
      );
      return json({
        success: true,
        invoice: result.invoice,
        validationDetails: result.validationDetails,
        matchReport: result.matchReport,
      });
    } catch (error) {
      const err = error as Error;
      return json({ error: err.message || "Error al cargar factura" }, { status: 500 });
    }
  }

  if (intent === "createInvoice") {
    try {
      const invoiceData = {
        folio: formData.get("folio") as string,
        uuid: formData.get("uuid") as string,
        fechaEmision: formData.get("fechaEmision") as string,
        rfcEmisor: formData.get("rfcEmisor") as string,
        nombreEmisor: formData.get("nombreEmisor") as string,
        rfcReceptor: formData.get("rfcReceptor") as string,
        nombreReceptor: formData.get("nombreReceptor") as string,
        subtotal: parseFloat(formData.get("subtotal") as string) || 0,
        total: parseFloat(formData.get("total") as string) || 0,
        moneda: formData.get("moneda") as string || "MXN",
        tipoCambio: formData.get("tipoCambio") ? parseFloat(formData.get("tipoCambio") as string) : undefined,
        detalles: JSON.parse(formData.get("detalles") as string || "[]") as InvoiceDetailBackend[],
        pdfUrl: formData.get("pdfUrl") as string || undefined,
        xmlUrl: formData.get("xmlUrl") as string || undefined,
        ordenCompraUrl: formData.get("ordenCompraUrl") as string || undefined,
      };

      await createInvoice(session.accessToken, user.company, invoiceData);
      return redirect("/invoices?success=created");
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Error al crear factura" }, { status: 500 });
    }
  }

  return json({ error: "Accion no valida" }, { status: 400 });
}

// ---- XML parser (same logic as original, untouched) ----

function parseXmlContent(xmlContent: string): Partial<{
  folio: string;
  uuid: string;
  fechaEmision: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  nombreReceptor: string;
  subtotal: number;
  total: number;
  moneda: string;
  tipoCambio: number;
  detalles: InvoiceDetailBackend[];
}> {
  const getAttr = (tag: string, attr: string): string => {
    const pattern = `<[^>]*${tag}[^>]*${attr}="([^"]*)"`;
    const rx = new RegExp(pattern, "i");
    const m = xmlContent.match(rx);
    return m ? m[1] : "";
  };

  const getComprobante = (attr: string) =>
    getAttr("cfdi:Comprobante", attr) || getAttr("Comprobante", attr);
  const getEmisor = (attr: string) =>
    getAttr("cfdi:Emisor", attr) || getAttr("Emisor", attr);
  const getReceptor = (attr: string) =>
    getAttr("cfdi:Receptor", attr) || getAttr("Receptor", attr);

  const uuidMatch = xmlContent.match(/UUID="([^"]+)"/i);
  const uuid = uuidMatch ? uuidMatch[1] : "";

  const detalles: InvoiceDetailBackend[] = [];
  const conceptoPattern = /<(?:cfdi:)?Concepto[^>]+>/gi;
  let conceptoMatch;
  while ((conceptoMatch = conceptoPattern.exec(xmlContent)) !== null) {
    const s = conceptoMatch[0];
    const descripcion = s.match(/Descripcion="([^"]+)"/i)?.[1] || "";
    const unidad = s.match(/(?:ClaveUnidad|Unidad)="([^"]+)"/i)?.[1] || "";
    const cantidad = parseFloat(s.match(/Cantidad="([^"]+)"/i)?.[1] || "0");
    const precioUnitario = parseFloat(s.match(/ValorUnitario="([^"]+)"/i)?.[1] || "0");
    const importe = parseFloat(s.match(/Importe="([^"]+)"/i)?.[1] || "0");
    if (descripcion) {
      detalles.push({ descripcion, unidad, cantidad, precioUnitario, importe });
    }
  }

  return {
    folio: getComprobante("Folio"),
    uuid,
    fechaEmision: getComprobante("Fecha"),
    rfcEmisor: getEmisor("Rfc"),
    nombreEmisor: getEmisor("Nombre"),
    rfcReceptor: getReceptor("Rfc"),
    nombreReceptor: getReceptor("Nombre"),
    subtotal: parseFloat(getComprobante("SubTotal") || "0"),
    total: parseFloat(getComprobante("Total") || "0"),
    moneda: getComprobante("Moneda") || "MXN",
    tipoCambio: parseFloat(getComprobante("TipoCambio") || "1"),
    detalles,
  };
}

// ---- types ----

interface FileUploadState {
  file: File | null;
  url: string | null;
  uploading: boolean;
  error: string | null;
  success: boolean;
}

// ---- Step card component ----

interface StepCardProps {
  step: number;
  title: string;
  hint: string;
  done: boolean;
  icon: React.ComponentProps<typeof Icon>["name"];
  children: React.ReactNode;
}

function StepCard({ step, title, hint, done, icon, children }: StepCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0",
            done ? "bg-moss-soft" : "bg-clay-soft",
          )}
        >
          {done ? (
            <Icon name="check" size={16} className="text-moss-deep" />
          ) : (
            <Icon name={icon} size={16} className="text-clay" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-[14px] text-ink">
            {step}. {title}
          </h2>
          <p className="text-[12px] text-ink-3">{hint}</p>
        </div>
        {done && (
          <Badge tone="moss" className="ml-auto flex-shrink-0">
            Listo
          </Badge>
        )}
      </div>
      {children}
    </Card>
  );
}

// ---- Page component ----

// New simplified component using unified upload
function NewInvoiceSimplified() {
  const { user, orderId, availableOrders } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  // Redirect to invoices list after successful upload (with a small delay to show preview)
  useEffect(() => {
    if (actionData?.success) {
      const timeout = setTimeout(() => {
        navigate("/invoices?success=created");
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [actionData?.success, navigate]);

  return (
    <AuthLayout>
      <div className="max-w-6xl mx-auto py-6 space-y-5">
        {/* Header */}
        <div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/invoices")}
            className="mb-2"
          >
            <Icon name="chevl" size={16} />
          </Button>
          <h1 className="ff-page-title">
            Cargar <em>factura</em>
          </h1>
          <p className="ff-page-sub">
            Seleccione la orden de compra y los archivos de factura (PDF + XML)
          </p>
        </div>

        {/* Upload form */}
        <InvoiceUploadForm
          orderId={orderId ?? undefined}
          availableOrders={availableOrders}
        />
      </div>
    </AuthLayout>
  );
}

// Old wizard component (keeping as fallback)
function NewInvoiceOld() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const isSubmitting = navigation.state === "submitting";

  const [xmlState, setXmlState] = useState<FileUploadState>({
    file: null, url: null, uploading: false, error: null, success: false,
  });
  const [pdfState, setPdfState] = useState<FileUploadState>({
    file: null, url: null, uploading: false, error: null, success: false,
  });
  const [poState, setPoState] = useState<FileUploadState>({
    file: null, url: null, uploading: false, error: null, success: false,
  });

  const [invoiceData, setInvoiceData] = useState<Partial<{
    folio: string;
    uuid: string;
    fechaEmision: string;
    rfcEmisor: string;
    nombreEmisor: string;
    rfcReceptor: string;
    nombreReceptor: string;
    subtotal: number;
    total: number;
    moneda: string;
    tipoCambio: number;
    detalles: InvoiceDetailBackend[];
  }>>({});

  // Sync action results into local state
  if (actionData && "xmlUrl" in actionData && actionData.xmlUrl && !xmlState.url) {
    setXmlState(prev => ({ ...prev, url: actionData.xmlUrl, success: true, uploading: false }));
    if (actionData.invoiceData) setInvoiceData(actionData.invoiceData);
  }
  if (actionData && "pdfUrl" in actionData && actionData.pdfUrl && !pdfState.url) {
    setPdfState(prev => ({ ...prev, url: actionData.pdfUrl, success: true, uploading: false }));
  }
  if (actionData && "ordenCompraUrl" in actionData && actionData.ordenCompraUrl && !poState.url) {
    setPoState(prev => ({ ...prev, url: actionData.ordenCompraUrl, success: true, uploading: false }));
  }

  const handleFileChange = useCallback((
    event: React.ChangeEvent<HTMLInputElement>,
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>,
  ) => {
    const file = event.target.files?.[0] || null;
    setState(prev => ({ ...prev, file, error: null }));
  }, []);

  const canSubmit = xmlState.success && pdfState.success && poState.success && invoiceData.uuid;

  // Format amounts for preview
  const fmtAmt = (n: number | undefined) => {
    const [int, dec] = (n ?? 0).toFixed(2).split(".");
    return { int: int.replace(/\B(?=(\d{3})+(?!\d))/g, ","), dec };
  };
  const totalFmt = fmtAmt(invoiceData.total);
  const subtotalFmt = fmtAmt(invoiceData.subtotal);

  return (
    <AuthLayout>
      <div className="max-w-4xl mx-auto py-6 space-y-5">

        {/* Page header */}
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")}>
            <Icon name="chevl" size={16} />
          </Button>
          <div>
            <h1 className="ff-page-title">
              Cargar <em>factura</em>
            </h1>
            <p className="ff-page-sub">
              Sube los archivos requeridos para registrar una nueva factura
            </p>
          </div>
        </header>

        {/* Global error */}
        {"error" in (actionData ?? {}) && (actionData as { error?: string })?.error && (
          <div className="bg-wine-soft border border-wine/20 rounded-lg p-4 flex items-center gap-3">
            <Icon name="warn" size={16} className="text-wine flex-shrink-0" />
            <p className="text-[13px] text-wine">
              {(actionData as { error?: string }).error}
            </p>
          </div>
        )}

        {/* Step 1: XML */}
        <StepCard
          step={1}
          title="Archivo XML de la Factura"
          hint="El archivo CFDI con extensión .xml"
          done={xmlState.success}
          icon="file"
        >
          <Form method="post" encType="multipart/form-data">
            <input type="hidden" name="intent" value="uploadXml" />
            <div className="flex gap-3">
              <Input
                type="file"
                name="xmlFile"
                accept=".xml,application/xml,text/xml"
                onChange={(e) => handleFileChange(e, setXmlState)}
                disabled={xmlState.uploading || xmlState.success}
                className="flex-1"
              />
              <Button
                type="submit"
                variant="clay"
                disabled={!xmlState.file || xmlState.uploading || xmlState.success}
              >
                {isSubmitting && navigation.formData?.get("intent") === "uploadXml" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
                ) : (
                  <><Icon name="upload" size={14} /> Subir</>
                )}
              </Button>
            </div>
          </Form>
        </StepCard>

        {/* Step 2: PDF */}
        <StepCard
          step={2}
          title="Archivo PDF de la Factura"
          hint="El PDF de representación impresa"
          done={pdfState.success}
          icon="file"
        >
          <Form method="post" encType="multipart/form-data">
            <input type="hidden" name="intent" value="uploadPdf" />
            <div className="flex gap-3">
              <Input
                type="file"
                name="pdfFile"
                accept=".pdf,application/pdf"
                onChange={(e) => handleFileChange(e, setPdfState)}
                disabled={pdfState.uploading || pdfState.success}
                className="flex-1"
              />
              <Button
                type="submit"
                variant="clay"
                disabled={!pdfState.file || pdfState.uploading || pdfState.success}
              >
                {isSubmitting && navigation.formData?.get("intent") === "uploadPdf" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo…</>
                ) : (
                  <><Icon name="upload" size={14} /> Subir</>
                )}
              </Button>
            </div>
          </Form>
        </StepCard>

        {/* Step 3: Purchase Order */}
        <StepCard
          step={3}
          title="Orden de Compra"
          hint='PDF que contenga "Orden de compra" o "Purchase Order"'
          done={poState.success}
          icon="orders"
        >
          <Form method="post" encType="multipart/form-data">
            <input type="hidden" name="intent" value="uploadPurchaseOrder" />
            <div className="flex gap-3">
              <Input
                type="file"
                name="purchaseOrderFile"
                accept=".pdf,application/pdf"
                onChange={(e) => handleFileChange(e, setPoState)}
                disabled={poState.uploading || poState.success}
                className="flex-1"
              />
              <Button
                type="submit"
                variant="clay"
                disabled={!poState.file || poState.uploading || poState.success}
              >
                {isSubmitting && navigation.formData?.get("intent") === "uploadPurchaseOrder" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Validando…</>
                ) : (
                  <><Icon name="upload" size={14} /> Subir y Validar</>
                )}
              </Button>
            </div>
          </Form>

          {poState.error && (
            <div className="mt-3 bg-wine-soft border border-wine/20 rounded-lg p-3 flex items-center gap-2">
              <Icon name="warn" size={14} className="text-wine flex-shrink-0" />
              <p className="text-[12px] text-wine">{poState.error}</p>
            </div>
          )}
        </StepCard>

        {/* Invoice data preview — shown once XML is parsed */}
        {invoiceData.uuid && (
          <>
            <Separator className="bg-line" />

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <Icon name="file" size={14} className="text-ink-3" />
                <h2 className="font-semibold text-[14px] text-ink">Datos de la Factura</h2>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Folio</Label>
                  <p className="font-medium text-ink mt-0.5">{invoiceData.folio || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">UUID</Label>
                  <p className="font-mono text-[11px] text-ink-2 mt-0.5 break-all">{invoiceData.uuid}</p>
                </div>
                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Fecha de Emisión</Label>
                  <p className="font-medium text-ink mt-0.5">{invoiceData.fechaEmision || "—"}</p>
                </div>
                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Moneda</Label>
                  <p className="font-medium text-ink mt-0.5">{invoiceData.moneda || "MXN"}</p>
                </div>

                <Separator className="col-span-2 bg-line" />

                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Emisor</Label>
                  <p className="font-medium text-ink mt-0.5">{invoiceData.nombreEmisor || "—"}</p>
                  <p className="text-[11px] font-mono text-ink-3">{invoiceData.rfcEmisor}</p>
                </div>
                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Receptor</Label>
                  <p className="font-medium text-ink mt-0.5">{invoiceData.nombreReceptor || "—"}</p>
                  <p className="text-[11px] font-mono text-ink-3">{invoiceData.rfcReceptor}</p>
                </div>

                <Separator className="col-span-2 bg-line" />

                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Subtotal</Label>
                  <p className="font-semibold font-mono text-ink mt-0.5">
                    <span className="text-[14px] italic font-normal text-ink-3 mr-0.5">$</span>
                    {subtotalFmt.int}<span className="text-ink-3">.{subtotalFmt.dec}</span>
                  </p>
                </div>
                <div>
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">Total</Label>
                  <p className="font-semibold font-mono text-[18px] text-clay mt-0.5">
                    <span className="text-[14px] italic font-normal text-ink-3 mr-0.5">$</span>
                    {totalFmt.int}<span className="text-ink-3 text-[14px]">.{totalFmt.dec}</span>
                  </p>
                </div>
              </div>

              {/* Conceptos list */}
              {invoiceData.detalles && invoiceData.detalles.length > 0 && (
                <div className="mt-5">
                  <Label className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
                    Conceptos ({invoiceData.detalles.length})
                  </Label>
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                    {invoiceData.detalles.map((detalle, idx) => (
                      <div key={idx} className="text-[12px] bg-paper-2 border border-line rounded-md px-3 py-2">
                        <p className="font-medium text-ink truncate">{detalle.descripcion}</p>
                        <div className="flex justify-between text-ink-3 mt-0.5 font-mono">
                          <span>{detalle.cantidad} × ${detalle.precioUnitario?.toLocaleString()}</span>
                          <span className="font-medium text-ink">${detalle.importe?.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Submit */}
            <Form method="post">
              <input type="hidden" name="intent" value="createInvoice" />
              <input type="hidden" name="folio" value={invoiceData.folio || ""} />
              <input type="hidden" name="uuid" value={invoiceData.uuid || ""} />
              <input type="hidden" name="fechaEmision" value={invoiceData.fechaEmision || ""} />
              <input type="hidden" name="rfcEmisor" value={invoiceData.rfcEmisor || ""} />
              <input type="hidden" name="nombreEmisor" value={invoiceData.nombreEmisor || ""} />
              <input type="hidden" name="rfcReceptor" value={invoiceData.rfcReceptor || ""} />
              <input type="hidden" name="nombreReceptor" value={invoiceData.nombreReceptor || ""} />
              <input type="hidden" name="subtotal" value={invoiceData.subtotal?.toString() || "0"} />
              <input type="hidden" name="total" value={invoiceData.total?.toString() || "0"} />
              <input type="hidden" name="moneda" value={invoiceData.moneda || "MXN"} />
              <input type="hidden" name="tipoCambio" value={invoiceData.tipoCambio?.toString() || ""} />
              <input type="hidden" name="detalles" value={JSON.stringify(invoiceData.detalles || [])} />
              <input type="hidden" name="pdfUrl" value={pdfState.url || ""} />
              <input type="hidden" name="xmlUrl" value={xmlState.url || ""} />
              <input type="hidden" name="ordenCompraUrl" value={poState.url || ""} />

              <div className="flex justify-end gap-3">
                <Button variant="ghost" type="button" onClick={() => navigate("/invoices")}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="clay"
                  size="lg"
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting && navigation.formData?.get("intent") === "createInvoice" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</>
                  ) : (
                    <><Icon name="check" size={15} /> Guardar Factura</>
                  )}
                </Button>
              </div>
            </Form>
          </>
        )}

        {/* Idle hint when nothing parsed yet */}
        {!invoiceData.uuid && (
          <div className="text-center py-8">
            <p className="text-[13px] text-ink-3">Sube los archivos requeridos para continuar.</p>
            <p className="text-[12px] text-ink-4 mt-1">
              El XML se usará para extraer los datos de la factura automáticamente.
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
export default NewInvoiceSimplified;
