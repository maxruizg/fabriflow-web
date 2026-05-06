import * as React from "react";
import { Form, useNavigation, useActionData } from "@remix-run/react";
import { FileDropZone } from "~/components/ui/file-drop-zone";
import {
  ValidationProgress,
  DEFAULT_VALIDATION_STEPS,
  type ValidationStep,
} from "~/components/invoices/validation-progress";
import { InvoiceDataPreview } from "~/components/invoices/invoice-data-preview";
import { Button } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import type { InvoiceBackend, OrderForInvoice } from "~/types";

export interface InvoiceUploadActionData {
  success?: boolean;
  error?: string;
  invoice?: InvoiceBackend;
  validationDetails?: {
    xmlParsed: boolean;
    uuidMatched: boolean;
    rfcValidated: boolean;
    fechaValidated: boolean;
    ordenValidated: boolean;
    filesUploaded: boolean;
  };
  matchReport?: MatchReportShape;
}

export interface MatchReportShape {
  overall: "ok" | "warning" | "mismatch";
  fields: Array<{
    field: string;
    verdict: "ok" | "warning" | "mismatch";
    expected: string;
    actual: string;
    message: string | null;
  }>;
  mismatchesCount: number;
  warningsCount: number;
  matchedLines: number;
  unmatchedInvoiceLines: number;
  unmatchedOrderLines: number;
}

export interface InvoiceUploadFormProps {
  /** Additional CSS class */
  className?: string;
  /** Optional order id to validate this invoice against. */
  orderId?: string | null;
  /** Available purchase orders for invoice */
  availableOrders: OrderForInvoice[];
}

/**
 * Complete invoice upload form with 2 file inputs (PDF + XML) and purchase order selector.
 * Uses Remix Form with server-side processing for proper SSR and progressive enhancement.
 */
export function InvoiceUploadForm({ className, orderId, availableOrders }: InvoiceUploadFormProps) {
  // Remix hooks
  const navigation = useNavigation();
  const actionData = useActionData<InvoiceUploadActionData>();

  // File states
  const [pdfFactura, setPdfFactura] = React.useState<File | null>(null);
  const [xmlFactura, setXmlFactura] = React.useState<File | null>(null);
  const [selectedOrderId, setSelectedOrderId] = React.useState<string>("");

  // File errors (client-side validation)
  const [pdfFacturaError, setPdfFacturaError] = React.useState<string>("");
  const [xmlFacturaError, setXmlFacturaError] = React.useState<string>("");
  const [orderError, setOrderError] = React.useState<string>("");

  // Check if form is submitting
  const isSubmitting = navigation.state === "submitting" &&
                       navigation.formData?.get("intent") === "uploadComplete";

  // Check if all required fields are filled
  const allFieldsSelected = pdfFactura !== null && xmlFactura !== null && selectedOrderId !== "";

  // Find selected order for preview
  const selectedOrder = availableOrders.find(o => o.id === selectedOrderId);

  // Validate files and order before submit
  const validateForm = (): boolean => {
    let isValid = true;

    // Validate PDF Factura
    if (!pdfFactura) {
      setPdfFacturaError("PDF de factura es requerido");
      isValid = false;
    } else if (pdfFactura.type !== "application/pdf") {
      setPdfFacturaError("El archivo debe ser un PDF");
      isValid = false;
    } else if (pdfFactura.size > 10 * 1024 * 1024) {
      setPdfFacturaError("El archivo es demasiado grande (máximo 10 MB)");
      isValid = false;
    } else {
      setPdfFacturaError("");
    }

    // Validate XML Factura
    if (!xmlFactura) {
      setXmlFacturaError("XML CFDI es requerido");
      isValid = false;
    } else if (!xmlFactura.name.endsWith(".xml")) {
      setXmlFacturaError("El archivo debe ser XML");
      isValid = false;
    } else if (xmlFactura.size > 5 * 1024 * 1024) {
      setXmlFacturaError("El archivo es demasiado grande (máximo 5 MB)");
      isValid = false;
    } else {
      setXmlFacturaError("");
    }

    // Validate Purchase Order selection
    if (!selectedOrderId) {
      setOrderError("Orden de compra es requerida");
      isValid = false;
    } else {
      setOrderError("");
    }

    return isValid;
  };

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    if (!validateForm()) {
      e.preventDefault();
    }
  };

  // Determine validation steps based on state
  const getValidationSteps = (): ValidationStep[] => {
    if (isSubmitting) {
      // Show all steps as active during submission
      return DEFAULT_VALIDATION_STEPS.map((step, index) => ({
        ...step,
        status: index === 0 ? "active" : "pending",
      }));
    }

    if (actionData?.success && actionData.validationDetails) {
      // Show all completed if successful
      return DEFAULT_VALIDATION_STEPS.map((step) => ({
        ...step,
        status: "completed",
      }));
    }

    if (actionData?.error) {
      // Determine which step failed based on error message
      let failedStep = 0;
      const errorMsg = actionData.error;

      if (errorMsg.includes("XML") || errorMsg.includes("parseando")) {
        failedStep = 1;
      } else if (errorMsg.includes("UUID") || errorMsg.includes("RFC")) {
        failedStep = 2;
      } else if (errorMsg.includes("orden de compra") || errorMsg.includes("purchase order")) {
        failedStep = 3;
      } else if (errorMsg.includes("almacen") || errorMsg.includes("upload")) {
        failedStep = 4;
      } else if (errorMsg.includes("guardan") || errorMsg.includes("crean")) {
        failedStep = 5;
      }

      return DEFAULT_VALIDATION_STEPS.map((step, index) => ({
        ...step,
        status: index === failedStep ? "error" : index < failedStep ? "completed" : "pending",
        error: index === failedStep ? errorMsg : undefined,
      }));
    }

    return DEFAULT_VALIDATION_STEPS;
  };

  // Reset form after successful upload
  React.useEffect(() => {
    if (actionData?.success) {
      // Clear files and selection after 2 seconds to show preview
      const timeout = setTimeout(() => {
        setPdfFactura(null);
        setXmlFactura(null);
        setSelectedOrderId("");
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [actionData?.success]);

  return (
    <div className={cn("space-y-6", className)}>
      <Form method="post" encType="multipart/form-data" onSubmit={handleSubmit}>
        <input type="hidden" name="intent" value="uploadComplete" />
        <input type="hidden" name="purchaseOrderId" value={selectedOrderId} />
        {actionData?.matchReport ? <MatchReportPanel report={actionData.matchReport} /> : null}

        {/* Purchase Order Selector */}
        <div className="mb-6">
          <Label htmlFor="order-select" className="text-sm font-medium mb-2 block">
            Orden de Compra *
          </Label>
          <Select
            value={selectedOrderId}
            onValueChange={(value) => {
              setSelectedOrderId(value);
              setOrderError("");
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger
              id="order-select"
              className={cn(
                "w-full",
                orderError && "border-red-500"
              )}
            >
              <SelectValue placeholder="Selecciona la orden de compra" />
            </SelectTrigger>
            <SelectContent>
              {availableOrders.length === 0 ? (
                <div className="px-2 py-6 text-center text-sm text-ink-3">
                  No hay órdenes de compra disponibles
                </div>
              ) : (
                availableOrders.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span className="font-mono text-sm">{order.folio}</span>
                      <span className="text-ink-3">—</span>
                      <span className="font-medium">
                        {new Intl.NumberFormat("es-MX", {
                          style: "currency",
                          currency: order.currency,
                        }).format(order.amount)}
                      </span>
                      {order.hasInvoice && (
                        <span className="text-xs text-rust-deep ml-2">(ya facturado)</span>
                      )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {orderError && (
            <p className="text-sm text-red-600 mt-1">{orderError}</p>
          )}
          {selectedOrder && (
            <div className="mt-3 p-3 rounded-md border border-clay bg-clay-soft text-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-2">Folio:</span>
                    <span className="font-mono text-clay-deep">{selectedOrder.folio}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-2">Fecha:</span>
                    <span className="text-ink-3">{selectedOrder.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-2">Items:</span>
                    <span className="text-ink-3">{selectedOrder.itemsCount}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-clay-deep">
                    {new Intl.NumberFormat("es-MX", {
                      style: "currency",
                      currency: selectedOrder.currency,
                    }).format(selectedOrder.amount)}
                  </div>
                  <div className="text-xs text-ink-3 mt-1">
                    Los totales deben coincidir
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* File inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <FileDropZone
            label="PDF de Factura"
            name="pdfFactura"
            accept=".pdf"
            maxSize={10 * 1024 * 1024}
            required
            icon="file"
            hint="Representación impresa del CFDI"
            file={pdfFactura}
            onFileSelect={(file) => {
              setPdfFactura(file);
              setPdfFacturaError("");
            }}
            error={pdfFacturaError}
            disabled={isSubmitting}
          />

          <FileDropZone
            label="XML CFDI"
            name="xmlFactura"
            accept=".xml"
            maxSize={5 * 1024 * 1024}
            required
            icon="file"
            hint="Comprobante Fiscal Digital"
            file={xmlFactura}
            onFileSelect={(file) => {
              setXmlFactura(file);
              setXmlFacturaError("");
            }}
            error={xmlFacturaError}
            disabled={isSubmitting}
          />
        </div>

        {/* Submit button */}
        {!actionData?.success && (
          <div className="flex items-center justify-end gap-3">
            <Button
              type="submit"
              disabled={!allFieldsSelected || isSubmitting}
              size="lg"
              variant="clay"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Validando y Cargando...</span>
                </>
              ) : (
                <>
                  <Icon name="upload" size={18} />
                  <span>Cargar y Validar Factura</span>
                </>
              )}
            </Button>
          </div>
        )}
      </Form>

      {/* Validation progress (shown during upload or if error) */}
      {(isSubmitting || actionData?.error) && (
        <ValidationProgress steps={getValidationSteps()} />
      )}

      {/* Error message (shown if upload failed) */}
      {actionData?.error && !isSubmitting && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Icon name="warn" size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-red-800">
                Error al cargar la factura
              </div>
              <div className="text-sm text-red-700 mt-1">
                {actionData.error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice preview (shown after success) */}
      {actionData?.success && actionData.invoice && !isSubmitting && (
        <InvoiceDataPreview invoice={actionData.invoice} />
      )}
    </div>
  );
}

function MatchReportPanel({ report }: { report: MatchReportShape }) {
  const toneByOverall = {
    ok: { border: "border-moss", bg: "bg-moss-soft", text: "text-moss-deep", icon: "check" as const, title: "Coincide con la OC" },
    warning: { border: "border-rust", bg: "bg-rust-soft", text: "text-rust-deep", icon: "warn" as const, title: "Coincide con observaciones" },
    mismatch: { border: "border-wine", bg: "bg-wine-soft", text: "text-wine-deep", icon: "warn" as const, title: "Datos no coinciden" },
  }[report.overall];

  const verdictTone = (v: "ok" | "warning" | "mismatch") =>
    v === "ok"
      ? "text-moss-deep"
      : v === "warning"
      ? "text-rust-deep"
      : "text-wine-deep";

  return (
    <div className={cn("mb-5 rounded-md border px-4 py-3", toneByOverall.border, toneByOverall.bg)}>
      <div className={cn("flex items-center gap-2 font-medium text-[13px]", toneByOverall.text)}>
        <Icon name={toneByOverall.icon} size={14} />
        {toneByOverall.title}
      </div>
      <div className="mt-1 text-[11.5px] text-ink-3 font-mono">
        {report.matchedLines} línea{report.matchedLines === 1 ? "" : "s"} match · {report.warningsCount} aviso(s) · {report.mismatchesCount} error(es)
      </div>
      <ul className="mt-3 space-y-1.5">
        {report.fields.map((f, i) => (
          <li key={`${f.field}-${i}`} className="flex items-start gap-2 text-[12.5px]">
            <span className={cn("font-mono mt-0.5", verdictTone(f.verdict))}>
              {f.verdict === "ok" ? "✓" : f.verdict === "warning" ? "!" : "✗"}
            </span>
            <span className="flex-1">
              <span className="font-medium text-ink">{f.field}</span>
              {f.message ? <span className="text-ink-2"> — {f.message}</span> : null}
              {f.verdict !== "ok" ? (
                <span className="ml-1 font-mono text-ink-3">
                  (esperado <strong>{f.expected}</strong>, factura <strong>{f.actual}</strong>)
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
