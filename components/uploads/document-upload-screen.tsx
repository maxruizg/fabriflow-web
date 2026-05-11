import * as React from "react";
import { Form, Link, useActionData, useNavigation, useSubmit } from "@remix-run/react";
import { AuthLayout } from "~/components/layout/auth-layout";
import type { DocKind, UploadActionResult } from "~/types";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";
import { FileDropZone } from "~/components/ui/file-drop-zone";
import {
  ValidationProgress,
  type ValidationStep,
} from "~/components/uploads/validation-progress";

const KIND_TITLES: Record<DocKind, string> = {
  oc: "Documento de OC",
  rem: "Remisión",
  nc: "Nota de crédito",
  pago: "Comprobante de pago",
};

const KIND_SUBTITLES: Record<DocKind, string> = {
  oc: "Adjunta el PDF de la orden de compra para la OC seleccionada.",
  rem: "Adjunta la remisión que recibiste del proveedor.",
  nc: "Sube el XML de la nota de crédito; el sistema vinculará automáticamente la factura referenciada en CfdiRelacionados.",
  pago: "Adjunta el comprobante de pago — PDF, imagen o XML del Complemento de Pagos (REP).",
};

const KIND_INITIAL_STEPS: Record<DocKind, string[]> = {
  oc: ["Subiendo archivo", "Asociando documento a la OC"],
  rem: ["Subiendo archivo", "Asociando remisión a la OC"],
  nc: [
    "Subiendo archivo XML",
    "Parseando CFDI",
    "Validando tipo de comprobante (tipo E)",
    "Resolviendo CFDI relacionado",
    "Validando saldo y consistencia",
    "Guardando nota de crédito y recalculando saldo",
  ],
  pago: [
    "Subiendo archivo",
    "Parseando comprobante",
    "Identificando facturas afectadas",
    "Asignando montos a facturas",
    "Guardando pago y recalculando saldo",
  ],
};

const ACCEPT_BY_KIND: Record<DocKind, { accept: string; hint: string }> = {
  oc: {
    accept: ".pdf,application/pdf",
    hint: "PDF de la OC",
  },
  rem: {
    accept: ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg",
    hint: "PDF, PNG o JPEG",
  },
  pago: {
    accept:
      ".pdf,.png,.jpg,.jpeg,.xml,application/pdf,image/png,image/jpeg,application/xml,text/xml",
    hint: "PDF, imagen o XML (REP)",
  },
  nc: {
    accept: ".xml,application/xml,text/xml",
    hint: "XML del CFDI",
  },
};

const MB = 1024 * 1024;

interface DocumentUploadScreenProps {
  kind: DocKind;
  actionPath: string;
  acceptXmlOnly?: boolean;
  backHref: string;
  renderSuccess?: (result: UploadActionResult) => React.ReactNode;
}

export function DocumentUploadScreen({
  kind,
  actionPath,
  acceptXmlOnly,
  backHref,
  renderSuccess,
}: DocumentUploadScreenProps) {
  const data = useActionData<UploadActionResult>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle" && nav.formAction === actionPath;

  // Local file state — FileDropZone is controlled.
  const [xmlFile, setXmlFile] = React.useState<File | null>(null);
  const [pdfFile, setPdfFile] = React.useState<File | null>(null);
  const [file, setFile] = React.useState<File | null>(null);

  const steps: ValidationStep[] = React.useMemo(() => {
    const labels = KIND_INITIAL_STEPS[kind];
    if (data?.steps) {
      const reported = new Map(data.steps.map((s) => [s.label, s]));
      return labels.map((label): ValidationStep => {
        const s = reported.get(label);
        if (s) return { label, status: s.status, error: s.error ?? undefined };
        return { label, status: "pending" };
      });
    }
    return labels.map(
      (label, i): ValidationStep => ({
        label,
        status: busy && i === 0 ? "active" : "pending",
      }),
    );
  }, [data, kind, busy]);

  // Manual submit so FileDropZone state ends up in the FormData.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    if (acceptXmlOnly) {
      if (!xmlFile) return;
      fd.set("xml", xmlFile, xmlFile.name);
      if (pdfFile) fd.set("pdf", pdfFile, pdfFile.name);
    } else {
      if (!file) return;
      fd.set("file", file, file.name);
      fd.set("kind", kind);
    }
    submit(fd, { method: "post", action: actionPath, encType: "multipart/form-data" });
  }

  const canSubmit = acceptXmlOnly ? !!xmlFile : !!file;
  const title = KIND_TITLES[kind];
  const subtitle = KIND_SUBTITLES[kind];

  return (
    <AuthLayout>
      <div className="max-w-6xl mx-auto py-6 space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Subir <em className="not-italic text-clay">{title}</em>
            </h1>
            <p className="ff-page-sub max-w-2xl">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={backHref}>
                <Icon name="x" size={13} />
                Volver
              </Link>
            </Button>
          </div>
        </header>

        {!data?.ok && (
          <Form
            method="post"
            action={actionPath}
            encType="multipart/form-data"
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <Card className="p-5">
              <div className="space-y-4">
                {acceptXmlOnly ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FileDropZone
                      label="XML del CFDI"
                      name="xml"
                      accept=".xml,application/xml,text/xml"
                      maxSize={5 * MB}
                      required
                      icon="file"
                      hint="Sólo .xml — máximo 5 MB"
                      file={xmlFile}
                      onFileSelect={setXmlFile}
                      disabled={busy}
                    />
                    <FileDropZone
                      label="PDF (opcional)"
                      name="pdf"
                      accept=".pdf,application/pdf"
                      maxSize={10 * MB}
                      icon="file"
                      hint="PDF firmado — máximo 10 MB"
                      file={pdfFile}
                      onFileSelect={setPdfFile}
                      disabled={busy}
                    />
                  </div>
                ) : (
                  <FileDropZone
                    label="Archivo"
                    name="file"
                    accept={ACCEPT_BY_KIND[kind].accept}
                    maxSize={10 * MB}
                    required
                    icon="file"
                    hint={`${ACCEPT_BY_KIND[kind].hint} — máximo 10 MB`}
                    file={file}
                    onFileSelect={setFile}
                    disabled={busy}
                  />
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  type="submit"
                  variant="clay"
                  disabled={busy || !canSubmit}
                  className="min-w-[180px]"
                >
                  <Icon name="upload" size={13} />
                  {busy ? "Subiendo…" : "Subir y validar"}
                </Button>
              </div>
            </Card>
          </Form>
        )}

        <Card className="p-5">
          <ValidationProgress
            steps={steps}
            title={`Validando ${title.toLowerCase()}...`}
          />
        </Card>

        {data && !data.ok && data.error && (
          <Card className="p-4 border-red-300 bg-red-50">
            <div className="flex items-start gap-3">
              <Icon name="warn" size={16} className="text-red-700 mt-0.5" />
              <div>
                <div className="font-medium text-red-800">Error al subir</div>
                <div className="text-sm text-red-700 mt-0.5">{data.error}</div>
              </div>
            </div>
          </Card>
        )}

        {data?.ok && renderSuccess && (
          <Card className="p-5">{renderSuccess(data)}</Card>
        )}
      </div>
    </AuthLayout>
  );
}
