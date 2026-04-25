import { useEffect, useRef, useState } from "react";

import { useTheme } from "~/lib/theme-context";
import { Icon } from "~/components/ui/icon";
import { cn } from "~/lib/utils";

/**
 * Dev-only floating panel for tweaking the design system at runtime.
 *
 * - Persists changes through the existing theme cookie (so the next page
 *   load also reflects them; never rewrites source files like the prototype).
 * - Visible only when `NODE_ENV === 'development'` AND the user has flipped
 *   `localStorage.ff_tweaks_open === '1'`. Visit `/_dev/tweaks` once to enable.
 */
export function TweaksPanel() {
  const { prefs, setTheme, setAccent, setDensity, setDottedBg } = useTheme();
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const [open, setOpen] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ dx: number; dy: number; dragging: boolean }>({
    dx: 0,
    dy: 0,
    dragging: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(window.localStorage.getItem("ff_tweaks_open") === "1");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: PointerEvent) => {
      if (!dragState.current.dragging) return;
      setPos({
        x: Math.max(8, window.innerWidth - e.clientX + dragState.current.dx),
        y: Math.max(8, window.innerHeight - e.clientY + dragState.current.dy),
      });
    };
    const onUp = () => {
      dragState.current.dragging = false;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={dragRef}
      className="fixed z-[60] w-[280px] rounded-lg border border-line bg-paper/95 shadow-ff-lg backdrop-blur-md"
      style={{ right: pos.x, bottom: pos.y }}
      role="dialog"
      aria-label="Tweaks panel"
    >
      <div
        className="flex items-center gap-2 border-b border-line px-3 py-2 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          dragState.current = {
            dx: window.innerWidth - e.clientX - pos.x,
            dy: window.innerHeight - e.clientY - pos.y,
            dragging: true,
          };
          document.body.style.userSelect = "none";
        }}
      >
        <Icon name="settings" size={13} className="text-ink-3" />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
          Tweaks
        </span>
        <button
          type="button"
          aria-label={open ? "Colapsar" : "Expandir"}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded p-1 text-ink-3 hover:bg-paper-3 hover:text-ink"
        >
          <Icon name={open ? "chevd" : "chevu"} size={12} />
        </button>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={() => {
            window.localStorage.removeItem("ff_tweaks_open");
            setEnabled(false);
          }}
          className="rounded p-1 text-ink-3 hover:bg-paper-3 hover:text-ink"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {open ? (
        <div className="px-3 py-3 space-y-4">
          <Section title="Tema">
            <Radio
              label="Acento"
              value={prefs.accent}
              onChange={(v) => setAccent(v as "warm" | "cool" | "olive")}
              options={[
                { value: "warm", label: "Terracota" },
                { value: "cool", label: "Pizarra" },
                { value: "olive", label: "Olivo" },
              ]}
            />
            <Radio
              label="Modo"
              value={prefs.theme}
              onChange={(v) => setTheme(v as "light" | "dark")}
              options={[
                { value: "light", label: "Claro" },
                { value: "dark", label: "Oscuro" },
              ]}
            />
            <Toggle
              label="Fondo punteado"
              checked={prefs.dottedBg}
              onChange={setDottedBg}
            />
          </Section>

          <Section title="Densidad">
            <Radio
              label="Filas"
              value={prefs.density}
              onChange={(v) =>
                setDensity(v as "comfortable" | "compact")
              }
              options={[
                { value: "comfortable", label: "Cómoda" },
                { value: "compact", label: "Compacta" },
              ]}
            />
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface RadioProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}

function Radio({ label, value, options, onChange }: RadioProps) {
  return (
    <div>
      <div className="text-[11px] text-ink-3 mb-1">{label}</div>
      <div
        role="radiogroup"
        className="grid gap-1 rounded-md border border-line p-1 bg-paper"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-ink text-paper"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-ink-2">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-clay" : "bg-paper-3",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-paper transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
    </label>
  );
}
