import { useEffect, useState } from "react";
import { Link } from "@remix-run/react";

import { Button } from "~/components/ui/button";
import { Icon } from "~/components/ui/icon";

/**
 * Toggle the tweaks panel on/off via localStorage. Visiting this route
 * flips the flag; the floating panel mounted in `AuthLayout` reads it on
 * every navigation. The flag is per-browser and never leaves the device.
 */
export default function DevTweaksToggle() {
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setEnabled(window.localStorage.getItem("ff_tweaks_open") === "1");
  }, []);

  function flip(on: boolean) {
    if (on) window.localStorage.setItem("ff_tweaks_open", "1");
    else window.localStorage.removeItem("ff_tweaks_open");
    setEnabled(on);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-[420px] rounded-lg border border-line bg-paper p-6">
        <h1 className="ff-page-title">
          Dev <em>tweaks</em>
        </h1>
        <p className="ff-page-sub">
          Activa el panel flotante para ajustar tema, densidad y fondo en vivo
          mientras navegas.
        </p>

        <div className="mt-6 flex items-center gap-2.5">
          <Button
            variant={enabled ? "outline" : "clay"}
            size="sm"
            onClick={() => flip(true)}
            disabled={!hydrated || enabled}
          >
            <Icon name="check" size={13} />
            Activar
          </Button>
          <Button
            variant={enabled ? "clay" : "outline"}
            size="sm"
            onClick={() => flip(false)}
            disabled={!hydrated || !enabled}
          >
            <Icon name="x" size={13} />
            Desactivar
          </Button>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link to="/dashboard">
              Ir al panel
              <Icon name="arrow" size={12} />
            </Link>
          </Button>
        </div>

        <div className="mt-5 font-mono text-[11px] text-ink-3">
          Estado actual:{" "}
          <span className={enabled ? "text-moss-deep" : "text-ink-2"}>
            {hydrated ? (enabled ? "ACTIVADO" : "DESACTIVADO") : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
