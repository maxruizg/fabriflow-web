import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface VendorContact {
  name: string;
  email?: string | null;
  whatsappPhone?: string | null;
}

interface SendOrderDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  orderId: string;
  folio: string;
  vendor: VendorContact;
}

interface ChannelResult {
  channel: string;
  ok: boolean;
  messageId?: string | null;
  error?: string | null;
}

interface FetcherShape {
  ok: boolean;
  results?: ChannelResult[];
  pdfUrl?: string;
  publicUrl?: string;
  error?: string;
}

export function SendOrderDialog({
  open,
  onOpenChange,
  orderId,
  folio,
  vendor,
}: SendOrderDialogProps) {
  const fetcher = useFetcher<FetcherShape>();
  const [email, setEmail] = useState(vendor.email ?? "");
  const [whatsapp, setWhatsapp] = useState(vendor.whatsappPhone ?? "");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWa, setSendWa] = useState(Boolean(vendor.whatsappPhone));
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) {
      setEmail(vendor.email ?? "");
      setWhatsapp(vendor.whatsappPhone ?? "");
      setSendEmail(true);
      setSendWa(Boolean(vendor.whatsappPhone));
      setMessage("");
    }
  }, [open, vendor.email, vendor.whatsappPhone]);

  const submitting = fetcher.state !== "idle";
  const canSubmit = (sendEmail && email.trim()) || (sendWa && whatsapp.trim());
  const results = fetcher.data?.results ?? [];
  const allOk = results.length > 0 && results.every((r) => r.ok);

  const handleSubmit = () => {
    const channels: string[] = [];
    if (sendEmail) channels.push("email");
    if (sendWa) channels.push("whatsapp");
    fetcher.submit(
      {
        intent: "send",
        orderId,
        channels: channels.join(","),
        email: email.trim(),
        whatsapp: whatsapp.trim(),
        message: message.trim(),
      },
      { method: "post", action: `/orders/${orderId}/send`, encType: "application/x-www-form-urlencoded" },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">
            Enviar OC <em className="not-italic text-clay">{folio}</em>
          </DialogTitle>
          <DialogDescription>
            Selecciona los canales y revisa los datos antes de notificar a{" "}
            <strong>{vendor.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                aria-label="Enviar por correo"
              />
              <span className="font-medium text-ink">Correo electrónico</span>
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!sendEmail}
              placeholder="proveedor@empresa.com"
              aria-label="Correo del proveedor"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px]">
              <Checkbox
                checked={sendWa}
                onChange={(e) => setSendWa(e.target.checked)}
                aria-label="Enviar por WhatsApp"
              />
              <span className="font-medium text-ink">WhatsApp</span>
            </label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              disabled={!sendWa}
              placeholder="+5215512345678"
              aria-label="WhatsApp del proveedor (E.164)"
              className="font-mono text-[12.5px]"
            />
            <p className="text-[11px] text-ink-3">
              Formato internacional E.164. Si está vacío, se intenta usar el teléfono general.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
              Mensaje (opcional)
            </Label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Notas para el proveedor que se incluirán en el correo y la plantilla de WhatsApp."
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {results.length > 0 ? (
            <ul className="space-y-1.5 rounded-md border border-line bg-paper-2 p-3">
              {results.map((r) => (
                <li key={r.channel} className="flex items-center gap-2 text-[12.5px]">
                  <Icon
                    name={r.ok ? "check" : "warn"}
                    size={14}
                    className={r.ok ? "text-moss" : "text-wine"}
                  />
                  <span className="font-medium text-ink capitalize">{r.channel}</span>
                  <span className={r.ok ? "text-ink-2" : "text-wine"}>
                    {r.ok
                      ? r.messageId
                        ? `Enviado (id ${truncate(r.messageId, 14)})`
                        : "Enviado"
                      : r.error ?? "Error desconocido"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {fetcher.data?.error ? (
            <p className="text-[12.5px] text-wine">{fetcher.data.error}</p>
          ) : null}
        </div>

        <DialogFooter>
          {allOk ? (
            <Button variant="clay" onClick={() => onOpenChange(false)}>
              Listo
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                variant="clay"
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
              >
                <Icon name="upload" size={13} />
                {submitting ? "Enviando…" : "Enviar al proveedor"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
