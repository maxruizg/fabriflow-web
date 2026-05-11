import * as React from "react";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import type { DocKind, UploadActionResult } from "~/types";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
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
  const busy = nav.state !== "idle" && nav.formAction === actionPath;

  const steps: ValidationStep[] = React.useMemo(() => {
    const labels = KIND_INITIAL_STEPS[kind];
    if (data?.steps) {
      const reported = new Map(data.steps.map((s) => [s.label, s]));
      return labels.map(
        (label): ValidationStep => {
          const s = reported.get(label);
          if (s) return { label, status: s.status, error: s.error ?? undefined };
          return { label, status: "pending" };
        }
      );
    }
    return labels.map(
      (label, i): ValidationStep => ({
        label,
        status: busy && i === 0 ? "active" : "pending",
      })
    );
  }, [data, kind, busy]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Subir {KIND_TITLES[kind]}</h1>

      {!data?.ok && (
        <Form
          method="post"
          action={actionPath}
          encType="multipart/form-data"
          className="space-y-3"
        >
          {acceptXmlOnly ? (
            <>
              <div>
                <Label htmlFor="xml">XML del CFDI</Label>
                <Input
                  id="xml"
                  name="xml"
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  required
                />
              </div>
              <div>
                <Label htmlFor="pdf">PDF (opcional)</Label>
                <Input
                  id="pdf"
                  name="pdf"
                  type="file"
                  accept=".pdf,application/pdf"
                />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="file">Archivo</Label>
              <Input id="file" name="file" type="file" required />
              <input type="hidden" name="kind" value={kind} />
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Subiendo…" : "Subir"}
          </Button>
        </Form>
      )}

      <Card className="p-4">
        <ValidationProgress
          steps={steps}
          title={`Validando ${KIND_TITLES[kind].toLowerCase()}...`}
        />
      </Card>

      {data && !data.ok && data.error && (
        <Card className="p-4 border-red-300 bg-red-50">
          <div className="text-sm text-red-700">{data.error}</div>
        </Card>
      )}

      {data?.ok && renderSuccess && (
        <Card className="p-4">{renderSuccess(data)}</Card>
      )}

      <div className="flex gap-2">
        <a href={backHref}>
          <Button variant="outline">Volver</Button>
        </a>
      </div>
    </div>
  );
}
