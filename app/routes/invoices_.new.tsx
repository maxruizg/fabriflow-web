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
import {
  ArrowLeft,
  Upload,
  FileText,
  FileCode,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { requireUser, getFullSession } from "~/lib/session.server";
import {
  uploadInvoicePdf,
  uploadInvoiceXml,
  uploadPurchaseOrder,
  createInvoice,
} from "~/lib/api.server";
import { useState, useCallback } from "react";
import type { InvoiceDetailBackend } from "~/types";

export const meta: MetaFunction = () => {
  return [
    { title: "Cargar Factura - FabriFlow" },
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

  return json({
    user,
    companyId: user.company,
    token: session.accessToken,
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
      // Parse XML content to extract invoice data
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

// Parse XML content to extract invoice data
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
  // Simple XML parsing for CFDI attributes
  const getAttr = (tag: string, attr: string): string => {
    const regex = new RegExp(`<[^>]*${tag}[^>]*${attr}="([^"]*)"`, 'i');
    const match = xmlContent.match(regex);
    return match ? match[1] : "";
  };

  const getComprobante = (attr: string) => getAttr("cfdi:Comprobante", attr) || getAttr("Comprobante", attr);
  const getEmisor = (attr: string) => getAttr("cfdi:Emisor", attr) || getAttr("Emisor", attr);
  const getReceptor = (attr: string) => getAttr("cfdi:Receptor", attr) || getAttr("Receptor", attr);

  // Get UUID from TimbreFiscalDigital
  const uuidMatch = xmlContent.match(/UUID="([^"]+)"/i);
  const uuid = uuidMatch ? uuidMatch[1] : "";

  // Parse conceptos (details)
  const detalles: InvoiceDetailBackend[] = [];
  const conceptoRegex = /<(?:cfdi:)?Concepto[^>]+>/gi;
  let conceptoMatch;
  while ((conceptoMatch = conceptoRegex.exec(xmlContent)) !== null) {
    const conceptoStr = conceptoMatch[0];
    const descripcion = conceptoStr.match(/Descripcion="([^"]+)"/i)?.[1] || "";
    const unidad = conceptoStr.match(/(?:ClaveUnidad|Unidad)="([^"]+)"/i)?.[1] || "";
    const cantidad = parseFloat(conceptoStr.match(/Cantidad="([^"]+)"/i)?.[1] || "0");
    const precioUnitario = parseFloat(conceptoStr.match(/ValorUnitario="([^"]+)"/i)?.[1] || "0");
    const importe = parseFloat(conceptoStr.match(/Importe="([^"]+)"/i)?.[1] || "0");

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

interface FileUploadState {
  file: File | null;
  url: string | null;
  uploading: boolean;
  error: string | null;
  success: boolean;
}

export default function NewInvoice() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const isSubmitting = navigation.state === "submitting";

  // File states
  const [xmlState, setXmlState] = useState<FileUploadState>({
    file: null, url: null, uploading: false, error: null, success: false
  });
  const [pdfState, setPdfState] = useState<FileUploadState>({
    file: null, url: null, uploading: false, error: null, success: false
  });
  const [poState, setPoState] = useState<FileUploadState>({
    file: null, url: null, uploading: false, error: null, success: false
  });

  // Invoice data from XML
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

  // Handle action responses
  if (actionData && 'xmlUrl' in actionData && actionData.xmlUrl && !xmlState.url) {
    setXmlState(prev => ({ ...prev, url: actionData.xmlUrl, success: true, uploading: false }));
    if (actionData.invoiceData) {
      setInvoiceData(actionData.invoiceData);
    }
  }
  if (actionData && 'pdfUrl' in actionData && actionData.pdfUrl && !pdfState.url) {
    setPdfState(prev => ({ ...prev, url: actionData.pdfUrl, success: true, uploading: false }));
  }
  if (actionData && 'ordenCompraUrl' in actionData && actionData.ordenCompraUrl && !poState.url) {
    setPoState(prev => ({ ...prev, url: actionData.ordenCompraUrl, success: true, uploading: false }));
  }

  const handleFileChange = useCallback((
    event: React.ChangeEvent<HTMLInputElement>,
    setState: React.Dispatch<React.SetStateAction<FileUploadState>>
  ) => {
    const file = event.target.files?.[0] || null;
    setState(prev => ({ ...prev, file, error: null }));
  }, []);

  const canSubmit = xmlState.success && pdfState.success && poState.success && invoiceData.uuid;

  return (
    <AuthLayout>
      <div className="max-w-4xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/invoices")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Cargar Factura</h1>
            <p className="text-sm text-muted-foreground">
              Sube los archivos requeridos para registrar una nueva factura
            </p>
          </div>
        </div>

        {/* Error message */}
        {actionData && 'error' in actionData && actionData.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-700">{actionData.error}</p>
          </div>
        )}

        {/* Step 1: XML Upload */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${xmlState.success ? 'bg-green-100' : 'bg-primary/10'}`}>
              {xmlState.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <FileCode className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h2 className="font-semibold">1. Archivo XML de la Factura</h2>
              <p className="text-sm text-muted-foreground">El archivo CFDI con extension .xml</p>
            </div>
            {xmlState.success && (
              <Badge variant="secondary" className="ml-auto bg-green-100 text-green-700">
                Cargado
              </Badge>
            )}
          </div>

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
                disabled={!xmlState.file || xmlState.uploading || xmlState.success}
              >
                {isSubmitting && navigation.formData?.get("intent") === "uploadXml" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Subir</>
                )}
              </Button>
            </div>
          </Form>
        </Card>

        {/* Step 2: PDF Upload */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${pdfState.success ? 'bg-green-100' : 'bg-primary/10'}`}>
              {pdfState.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <FileText className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h2 className="font-semibold">2. Archivo PDF de la Factura</h2>
              <p className="text-sm text-muted-foreground">El PDF de representacion impresa</p>
            </div>
            {pdfState.success && (
              <Badge variant="secondary" className="ml-auto bg-green-100 text-green-700">
                Cargado
              </Badge>
            )}
          </div>

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
                disabled={!pdfState.file || pdfState.uploading || pdfState.success}
              >
                {isSubmitting && navigation.formData?.get("intent") === "uploadPdf" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subiendo...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Subir</>
                )}
              </Button>
            </div>
          </Form>
        </Card>

        {/* Step 3: Purchase Order Upload */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${poState.success ? 'bg-green-100' : 'bg-primary/10'}`}>
              {poState.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <FileCheck className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h2 className="font-semibold">3. Orden de Compra</h2>
              <p className="text-sm text-muted-foreground">
                PDF que contenga el texto "Orden de compra" o "Purchase Order"
              </p>
            </div>
            {poState.success && (
              <Badge variant="secondary" className="ml-auto bg-green-100 text-green-700">
                Validado
              </Badge>
            )}
          </div>

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
                disabled={!poState.file || poState.uploading || poState.success}
              >
                {isSubmitting && navigation.formData?.get("intent") === "uploadPurchaseOrder" ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validando...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Subir y Validar</>
                )}
              </Button>
            </div>
          </Form>

          {poState.error && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <p className="text-sm text-red-700">{poState.error}</p>
            </div>
          )}
        </Card>

        {/* Invoice Data Preview */}
        {invoiceData.uuid && (
          <>
            <Separator />

            <Card className="p-6">
              <h2 className="font-semibold mb-4">Datos de la Factura</h2>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Folio</Label>
                  <p className="font-medium">{invoiceData.folio || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">UUID</Label>
                  <p className="font-mono text-xs">{invoiceData.uuid}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Fecha de Emision</Label>
                  <p className="font-medium">{invoiceData.fechaEmision || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Moneda</Label>
                  <p className="font-medium">{invoiceData.moneda || "MXN"}</p>
                </div>

                <Separator className="col-span-2" />

                <div>
                  <Label className="text-muted-foreground">Emisor</Label>
                  <p className="font-medium">{invoiceData.nombreEmisor || "-"}</p>
                  <p className="text-xs text-muted-foreground">{invoiceData.rfcEmisor}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Receptor</Label>
                  <p className="font-medium">{invoiceData.nombreReceptor || "-"}</p>
                  <p className="text-xs text-muted-foreground">{invoiceData.rfcReceptor}</p>
                </div>

                <Separator className="col-span-2" />

                <div>
                  <Label className="text-muted-foreground">Subtotal</Label>
                  <p className="font-semibold">
                    ${invoiceData.subtotal?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Total</Label>
                  <p className="font-semibold text-lg text-primary">
                    ${invoiceData.total?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Detalles */}
              {invoiceData.detalles && invoiceData.detalles.length > 0 && (
                <div className="mt-4">
                  <Label className="text-muted-foreground">Conceptos ({invoiceData.detalles.length})</Label>
                  <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                    {invoiceData.detalles.map((detalle, idx) => (
                      <div key={idx} className="text-xs bg-muted/50 rounded p-2">
                        <p className="font-medium truncate">{detalle.descripcion}</p>
                        <div className="flex justify-between text-muted-foreground mt-1">
                          <span>{detalle.cantidad} x ${detalle.precioUnitario?.toLocaleString()}</span>
                          <span className="font-medium text-foreground">${detalle.importe?.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Submit Button */}
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
                <Button variant="outline" type="button" onClick={() => navigate("/invoices")}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!canSubmit || isSubmitting} size="lg">
                  {isSubmitting && navigation.formData?.get("intent") === "createInvoice" ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando...</>
                  ) : (
                    "Guardar Factura"
                  )}
                </Button>
              </div>
            </Form>
          </>
        )}

        {/* Instructions when no data yet */}
        {!invoiceData.uuid && (
          <div className="text-center py-8 text-muted-foreground">
            <p>Sube los archivos requeridos para continuar.</p>
            <p className="text-sm mt-1">El XML se usara para extraer los datos de la factura automaticamente.</p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
