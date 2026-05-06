import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import type { OrderBackend } from "~/lib/procurement-api.server";

export interface AuthorizeOrderDialogProps {
  order: OrderBackend;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "approve" | "reject";
}

interface FetcherShape {
  ok?: boolean;
  error?: string;
}

export function AuthorizeOrderDialog({
  order,
  open,
  onOpenChange,
  mode,
}: AuthorizeOrderDialogProps) {
  const fetcher = useFetcher<FetcherShape>();
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (open) {
      setRejectionReason("");
    }
  }, [open]);

  // Cerrar el diálogo cuando la autorización sea exitosa
  useEffect(() => {
    if (fetcher.data?.ok) {
      onOpenChange(false);
    }
  }, [fetcher.data?.ok, onOpenChange]);

  const submitting = fetcher.state !== "idle";
  const canSubmit = mode === "approve" || rejectionReason.trim().length > 0;

  const handleSubmit = () => {
    fetcher.submit(
      {
        intent: "authorize",
        orderId: order.id,
        approve: mode === "approve" ? "true" : "false",
        rejectionReason: rejectionReason.trim(),
      },
      {
        method: "post",
        action: `/orders/${order.id}`,
        encType: "application/x-www-form-urlencoded",
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-[20px]">
            {mode === "approve" ? (
              <>
                <Icon name="check" size={18} className="text-moss" />
                Autorizar orden {order.folio}
              </>
            ) : (
              <>
                <Icon name="x" size={18} className="text-wine" />
                Rechazar orden {order.folio}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "approve"
              ? "Confirma que esta orden de compra cumple con los requisitos y puede ser enviada al proveedor."
              : "Rechaza esta orden de compra. El creador deberá generar una nueva orden corregida."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Detalles de la orden */}
          <div className="rounded-lg border border-line p-4 space-y-2 bg-canvas-50">
            <div className="flex justify-between text-sm">
              <span className="text-ink-3">Proveedor:</span>
              <span className="font-medium text-ink">{order.vendor}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-3">Monto:</span>
              <span className="font-semibold text-clay">
                {new Intl.NumberFormat("es-MX", {
                  style: "currency",
                  currency: order.currency,
                }).format(order.amount)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-3">Items:</span>
              <span className="text-ink">{order.itemsCount}</span>
            </div>
          </div>

          {/* Campo de razón de rechazo (solo si es rechazo) */}
          {mode === "reject" && (
            <div className="space-y-2">
              <Label htmlFor="rejection-reason" className="text-sm font-medium">
                Motivo del rechazo *
              </Label>
              <Textarea
                id="rejection-reason"
                name="rejectionReason"
                placeholder="Explica por qué se rechaza esta orden..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                required
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-ink-3">
                Este motivo será visible en el historial de la orden
              </p>
            </div>
          )}

          {/* Mensaje de error si hay */}
          {fetcher.data?.error && (
            <div className="rounded-lg border border-wine-300 bg-wine-50 p-3">
              <p className="text-sm text-wine-900">{fetcher.data.error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            variant={mode === "approve" ? "clay" : "destructive"}
            disabled={submitting || !canSubmit}
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Procesando...
              </>
            ) : mode === "approve" ? (
              <>
                <Icon name="check" size={14} />
                Autorizar orden
              </>
            ) : (
              <>
                <Icon name="x" size={14} />
                Rechazar orden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
