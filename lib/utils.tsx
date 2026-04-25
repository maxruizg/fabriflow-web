import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Tone tokens for status badges. Mirrors `STATUS_TONE` in the design system.
 *  - moss   → success / on-time
 *  - clay   → in-flight / primary action
 *  - rust   → caution / pending review
 *  - wine   → error / late / rejected
 *  - ink    → neutral / closed
 */
export type StatusTone = "moss" | "clay" | "rust" | "wine" | "ink";

const TONE_CLASS: Record<StatusTone, string> = {
  moss: "ff-badge ff-badge-moss",
  clay: "ff-badge ff-badge-clay",
  rust: "ff-badge ff-badge-rust",
  wine: "ff-badge ff-badge-wine",
  ink: "ff-badge ff-badge-ink",
};

/**
 * Maps every status string used across FabriFlow (legacy backend + new design)
 * to its semantic tone and a normalized Spanish display label.
 */
const STATUS_MAP: Record<string, { tone: StatusTone; label: string }> = {
  // legacy invoice/CFDI statuses
  pending: { tone: "rust", label: "Pendiente" },
  pendiente: { tone: "rust", label: "Pendiente" },
  paid: { tone: "moss", label: "Pagado" },
  pagado: { tone: "moss", label: "Pagado" },
  active: { tone: "moss", label: "Activo" },
  activo: { tone: "moss", label: "Activo" },
  overdue: { tone: "wine", label: "Vencido" },
  vencido: { tone: "wine", label: "Vencido" },
  rejected: { tone: "wine", label: "Rechazado" },
  rechazado: { tone: "wine", label: "Rechazado" },
  inactive: { tone: "wine", label: "Inactivo" },
  inactivo: { tone: "wine", label: "Inactivo" },
  recibido: { tone: "moss", label: "Recibido" },
  completado: { tone: "ink", label: "Completado" },

  // procurement (new design vocabulary)
  "en tránsito": { tone: "clay", label: "En tránsito" },
  "en transito": { tone: "clay", label: "En tránsito" },
  confirmado: { tone: "moss", label: "Confirmado" },
  "revisión calidad": { tone: "rust", label: "Revisión calidad" },
  "revision calidad": { tone: "rust", label: "Revisión calidad" },
  cerrado: { tone: "ink", label: "Cerrado" },
  incidencia: { tone: "wine", label: "Incidencia" },
  "pendiente conf.": { tone: "rust", label: "Pendiente conf." },
  "pendiente conf": { tone: "rust", label: "Pendiente conf." },
  "en revisión": { tone: "rust", label: "En revisión" },
  "en revision": { tone: "rust", label: "En revisión" },
  atrasado: { tone: "wine", label: "Atrasado" },
  programado: { tone: "ink", label: "Programado" },
};

export function statusTone(status: string): StatusTone {
  return STATUS_MAP[status.toLowerCase()]?.tone ?? "ink";
}

export function statusLabel(status: string): string {
  return STATUS_MAP[status.toLowerCase()]?.label ?? status;
}

/** Class string for the `<Badge tone>` primitive. */
export function statusToneClass(status: string): string {
  return TONE_CLASS[statusTone(status)];
}

/**
 * Backwards-compatible JSX badge renderer. New code should prefer the
 * `<Badge tone={statusTone(s)}>{statusLabel(s)}</Badge>` form (added in Phase 1)
 * once the Badge primitive supports it.
 */
export function getStatusBadge(status: string): JSX.Element {
  const tone = statusTone(status);
  const label = statusLabel(status);
  return <span className={TONE_CLASS[tone]}>{label}</span>;
}

/** Return the bar color modifier class for an aging bucket index (0..4). */
export function agingBarTone(index: number): string {
  switch (index) {
    case 0:
      return ""; // moss (default)
    case 1:
      return "ff-bar-clay";
    case 2:
      return "ff-bar-rust";
    case 3:
    case 4:
      return "ff-bar-wine";
    default:
      return "";
  }
}
