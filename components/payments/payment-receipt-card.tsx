import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Dropzone } from "~/components/ui/dropzone";
import { Icon } from "~/components/ui/icon";
import { Button } from "~/components/ui/button";
import { STATUS_TONE, type SamplePayment } from "~/lib/sample-data";

export interface BankInfo {
  bank: string;
  clabeMasked: string;
  beneficiary: string;
  rfc: string;
}

interface PaymentReceiptCardProps {
  payment: SamplePayment;
  bankInfo: BankInfo;
}

export function PaymentReceiptCard({ payment, bankInfo }: PaymentReceiptCardProps) {
  const tone = STATUS_TONE[payment.status] ?? "ink";

  return (
    <Card>
      <CardHeader className="justify-between">
        <CardTitle>
          Comprobante de <em className="not-italic text-clay">pago</em>
        </CardTitle>
        <Badge tone={tone}>{payment.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {payment.receipt ? (
          <div className="rounded-md border border-line bg-paper-2 p-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-paper-3 text-ink-2">
                <Icon name="paper" size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">
                  {payment.id}-comprobante.pdf
                </div>
                <div className="text-[11px] text-ink-3 font-mono">
                  248 KB · subido
                </div>
              </div>
              <Button variant="outline" size="xs" aria-label="Ver comprobante">
                <Icon name="eye" size={12} />
              </Button>
            </div>
          </div>
        ) : (
          <Dropzone
            title="Sube el comprobante"
            hint="PDF o imagen — el proveedor confirmará la recepción"
          />
        )}

        <hr className="border-line" />

        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-2.5">
            Datos bancarios
          </div>
          <dl className="space-y-2">
            <div className="grid grid-cols-[110px_1fr] gap-2 text-[12.5px]">
              <dt className="text-ink-3">Banco</dt>
              <dd className="font-medium">{bankInfo.bank}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 text-[12.5px]">
              <dt className="text-ink-3">CLABE</dt>
              <dd className="font-mono">{bankInfo.clabeMasked}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 text-[12.5px]">
              <dt className="text-ink-3">Beneficiario</dt>
              <dd>{bankInfo.beneficiary}</dd>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 text-[12.5px]">
              <dt className="text-ink-3">RFC</dt>
              <dd className="font-mono">{bankInfo.rfc}</dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
