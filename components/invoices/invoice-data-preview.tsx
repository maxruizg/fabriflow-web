import * as React from "react";
import { cn } from "~/lib/utils";
import { Icon } from "~/components/ui/icon";
import type { InvoiceBackend } from "~/types";

export interface InvoiceDataPreviewProps {
  /** The invoice to preview */
  invoice: InvoiceBackend;
  /** Additional CSS class */
  className?: string;
}

/**
 * Displays a preview of invoice data after successful upload.
 * Shows all extracted fields from the CFDI XML.
 */
export function InvoiceDataPreview({
  invoice,
  className,
}: InvoiceDataPreviewProps) {
  // Format currency
  const formatCurrency = (amount: number, currency: string = "MXN") => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat("es-MX", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  return (
    <div className={cn("space-y-5", className)}>
      {/* Success header */}
      <div className="flex items-start gap-3 p-4 bg-moss-bg rounded-lg border border-moss">
        <Icon name="check" size={20} className="text-moss flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-moss">
            Factura validada y creada exitosamente
          </div>
          <div className="text-xs text-ink-3 mt-0.5">
            UUID: {invoice.uuid}
          </div>
        </div>
      </div>

      {/* Main info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Header info */}
          <div className="p-4 bg-ink-5 rounded-lg space-y-3">
            <div>
              <div className="text-xs text-ink-3 uppercase tracking-wide">Folio</div>
              <div className="text-lg font-semibold text-ink">{invoice.folio}</div>
            </div>
            <div>
              <div className="text-xs text-ink-3 uppercase tracking-wide">Fecha de emisión</div>
              <div className="text-sm text-ink">{formatDate(invoice.fechaEmision)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-3 uppercase tracking-wide">Moneda</div>
              <div className="text-sm text-ink">
                {invoice.moneda}
                {invoice.tipoCambio && (
                  <span className="ml-2 text-ink-3">
                    (TC: {invoice.tipoCambio.toFixed(4)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Emisor */}
          <div className="p-4 bg-ink-5 rounded-lg space-y-2">
            <div className="text-xs font-medium text-ink-2 uppercase tracking-wide">
              Emisor
            </div>
            <div className="text-sm font-medium text-ink">{invoice.nombreEmisor}</div>
            <div className="text-xs text-ink-3">RFC: {invoice.rfcEmisor}</div>
          </div>

          {/* Receptor */}
          <div className="p-4 bg-ink-5 rounded-lg space-y-2">
            <div className="text-xs font-medium text-ink-2 uppercase tracking-wide">
              Receptor
            </div>
            <div className="text-sm font-medium text-ink">{invoice.nombreReceptor}</div>
            <div className="text-xs text-ink-3">RFC: {invoice.rfcReceptor}</div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Amounts */}
          <div className="p-4 bg-clay-bg rounded-lg border border-clay space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-2">Subtotal</span>
              <span className="text-sm font-medium text-ink tabular-nums">
                {formatCurrency(invoice.subtotal, invoice.moneda)}
              </span>
            </div>
            <div className="border-t border-ink-4" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Total</span>
              <span className="text-lg font-bold text-clay tabular-nums">
                {formatCurrency(invoice.total, invoice.moneda)}
              </span>
            </div>
          </div>

          {/* Estado */}
          <div className="p-4 bg-ink-5 rounded-lg">
            <div className="text-xs text-ink-3 uppercase tracking-wide mb-2">Estado</div>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              {invoice.estado}
            </div>
          </div>
        </div>
      </div>

      {/* Line items */}
      {invoice.detalles && invoice.detalles.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-ink">
            Conceptos ({invoice.detalles.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-4">
                  <th className="text-left py-2 px-3 text-xs font-medium text-ink-3 uppercase tracking-wide">
                    Descripción
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-ink-3 uppercase tracking-wide">
                    Unidad
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-ink-3 uppercase tracking-wide">
                    Cantidad
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-ink-3 uppercase tracking-wide">
                    Precio Unit.
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-ink-3 uppercase tracking-wide">
                    Importe
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.detalles.map((detalle, index) => (
                  <tr
                    key={index}
                    className="border-b border-ink-5 hover:bg-ink-5 transition-colors"
                  >
                    <td className="py-2 px-3 text-ink">{detalle.descripcion}</td>
                    <td className="py-2 px-3 text-right text-ink-3 tabular-nums">
                      {detalle.unidad}
                    </td>
                    <td className="py-2 px-3 text-right text-ink tabular-nums">
                      {detalle.cantidad}
                    </td>
                    <td className="py-2 px-3 text-right text-ink tabular-nums">
                      {formatCurrency(detalle.precioUnitario, invoice.moneda)}
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-ink tabular-nums">
                      {formatCurrency(detalle.importe, invoice.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Additional info */}
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <Icon name="clock" size={14} />
        <span>Creada el {formatDate(invoice.createdAt)}</span>
      </div>
    </div>
  );
}
