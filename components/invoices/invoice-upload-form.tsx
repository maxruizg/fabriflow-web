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
import { cn } from "~/lib/utils";
import type { InvoiceBackend } from "~/types";

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
}

/**
 * Complete invoice upload form with 3 file inputs and single submit button.
 * Uses Remix Form with server-side processing for proper SSR and progressive enhancement.
 */
export function InvoiceUploadForm({ className, orderId }: InvoiceUploadFormProps) {
  // Remix hooks
  const navigation = useNavigation();
  const actionData = useActionData<InvoiceUploadActionData>();

  // File states
  const [pdfFactura, setPdfFactura] = React.useState<File | null>(null);
  const [xmlFactura, setXmlFactura] = React.useState<File | null>(null);
  const [pdfOrden, setPdfOrden] = React.useState<File | null>(null);

  // File errors (client-side validation)
  const [pdfFacturaError, setPdfFacturaError] = React.useState<string>("");
  const [xmlFacturaError, setXmlFacturaError] = React.useState<string>("");
  const [pdfOrdenError, setPdfOrdenError] = React.useState<string>("");

  // Check if form is submitting
  const isSubmitting = navigation.state === "submitting" &&
                       navigation.formData?.get("intent") === "uploadComplete";

  // Check if all files are selected
  const allFilesSelected = pdfFactura !== null && xmlFactura !== null && pdfOrden !== null;

  // Validate files before submit
  const validateFiles = (): boolean => {
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

    // Validate PDF Orden
    if (!pdfOrden) {
      setPdfOrdenError("PDF de orden de compra es requerido");
      isValid = false;
    } else if (pdfOrden.type !== "application/pdf") {
      setPdfOrdenError("El archivo debe ser un PDF");
      isValid = false;
    } else if (pdfOrden.size > 10 * 1024 * 1024) {
      setPdfOrdenError("El archivo es demasiado grande (máximo 10 MB)");
      isValid = false;
    } else {
      setPdfOrdenError("");
    }

    return isValid;
  };

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    if (!validateFiles()) {
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
      // Clear files after 2 seconds to show preview
      const timeout = setTimeout(() => {
        setPdfFactura(null);
        setXmlFactura(null);
        setPdfOrden(null);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [actionData?.success]);

  return (
    <div className={cn("space-y-6", className)}>
      <Form method="post" encType="multipart/form-data" onSubmit={handleSubmit}>
        <input type="hidden" name="intent" value="uploadComplete" />
        {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
        {orderId ? (
          <div className="mb-4 rounded-md border border-clay bg-clay-soft px-3 py-2 text-[12.5px] text-clay-deep">
            <span className="font-medium">Vinculando a orden:</span>{" "}
            <span className="font-mono">{orderId}</span>
            <span className="ml-2 text-ink-3">
              (los datos del CFDI se compararán contra esta OC)
            </span>
          </div>
        ) : null}
        {actionData?.matchReport ? <MatchReportPanel report={actionData.matchReport} /> : null}

        {/* File inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

          <FileDropZone
            label="Orden de Compra (PDF)"
            name="pdfOrden"
            accept=".pdf"
            maxSize={10 * 1024 * 1024}
            required
            icon="file"
            hint="Documento que respalda la compra"
            file={pdfOrden}
            onFileSelect={(file) => {
              setPdfOrden(file);
              setPdfOrdenError("");
            }}
            error={pdfOrdenError}
            disabled={isSubmitting}
          />
        </div>

        {/* Submit button */}
        {!actionData?.success && (
          <div className="flex items-center justify-end gap-3">
            <Button
              type="submit"
              disabled={!allFilesSelected || isSubmitting}
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
