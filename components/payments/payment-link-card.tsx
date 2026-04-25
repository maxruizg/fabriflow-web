import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { DocChip } from "~/components/ui/doc-chip";
import { AgingBar } from "~/components/ui/aging-bar";
import { fmtCurrency, fmtDate, type SamplePayment } from "~/lib/sample-data";

interface InvoiceLine {
  id: string;
  amount: number;
  due: string;
  /** 0..100 */
  paid: number;
}

interface PaymentLinkCardProps {
  payment: SamplePayment;
  /** Pre-built sample invoice allocations. Will swap for real data in Phase 4 wiring. */
  invoices: InvoiceLine[];
}

export function PaymentLinkCard({ payment, invoices }: PaymentLinkCardProps) {
  const m = fmtCurrency(payment.amount, payment.cur);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Vinculación pago <em className="not-italic text-clay">↔ factura</em>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-5">
          <div className="rounded-md border border-line bg-paper-2 p-3.5">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-1">
              Pago
            </div>
            <div className="font-mono text-[12.5px] text-ink-2">
              {payment.id}
            </div>
            <div className="font-mono text-[15px] text-ink mt-1.5">
              {m.symbol}
              {m.integer}
              <span className="text-ink-3">.{m.decimal}</span>{" "}
              <span className="text-[10.5px] text-ink-3">{m.code}</span>
            </div>
            <div className="text-[11px] text-ink-3 mt-1.5">
              {payment.method} · {fmtDate(payment.date)}
            </div>
          </div>

          <div className="grid h-9 w-9 place-items-center rounded-full bg-clay-soft text-clay-deep">
            <Icon name="split" size={14} />
          </div>

          <div className="rounded-md border border-line bg-paper-2 p-3.5">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-1">
              Facturas
            </div>
            <div className="font-mono text-[12.5px] text-ink-2">
              {invoices.length} documento{invoices.length === 1 ? "" : "s"}
            </div>
            <div className="text-[12px] text-ink mt-1.5 truncate">
              {payment.vendor}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {invoices.map((inv) => {
            const im = fmtCurrency(inv.amount, payment.cur);
            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-md border border-line bg-paper-2 p-3"
              >
                <DocChip type="FAC" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[12px]">{inv.id}</span>
                    <span className="font-mono text-[12px]">
                      {im.symbol}
                      {im.integer}
                      <span className="text-ink-3">.{im.decimal}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-[10.5px] text-ink-3 font-mono">
                      vence {fmtDate(inv.due)}
                    </span>
                    <span className="text-[10.5px] text-ink-3 font-mono">
                      {inv.paid}% pagado
                    </span>
                  </div>
                  <AgingBar
                    pct={inv.paid}
                    tone={inv.paid >= 100 ? "moss" : "clay"}
                    className="mt-1.5"
                    label={`Cobertura factura ${inv.id}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <Button variant="outline" size="sm" className="mt-4 w-full justify-center">
          <Icon name="plus" size={12} />
          Vincular otra factura
        </Button>
      </CardContent>
    </Card>
  );
}
