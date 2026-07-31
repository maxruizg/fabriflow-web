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
  // Estados unificados para todos los documentos (Órdenes, Facturas, etc.)
  creada: { tone: "rust", label: "Creada" },
  autorizada: { tone: "clay", label: "Autorizada" },
  recibido: { tone: "moss", label: "Recibido" },
  facturada: { tone: "clay", label: "Facturada" },
  pagada: { tone: "moss", label: "Pagada" },
  completada: { tone: "ink", label: "Completada" },
  rechazada: { tone: "wine", label: "Rechazada" },

  // Estados legacy/variantes para compatibilidad
  pendiente: { tone: "rust", label: "Creada" },
  completado: { tone: "ink", label: "Completada" },
  pagado: { tone: "moss", label: "Pagada" },
  rechazado: { tone: "wine", label: "Rechazada" },

  // Estados adicionales de vendor/provider
  active: { tone: "moss", label: "Activo" },
  activo: { tone: "moss", label: "Activo" },
  overdue: { tone: "wine", label: "Vencido" },
  vencido: { tone: "wine", label: "Vencido" },
  inactive: { tone: "wine", label: "Inactivo" },
  inactivo: { tone: "wine", label: "Inactivo" },
  revisar: { tone: "rust", label: "Revisar" },

  // Estados de logística (para órdenes en tránsito)
  "en tránsito": { tone: "clay", label: "En tránsito" },
  "en transito": { tone: "clay", label: "En tránsito" },
  en_transito: { tone: "clay", label: "En tránsito" },
  confirmado: { tone: "moss", label: "Confirmado" },
  "revisión calidad": { tone: "rust", label: "Revisión calidad" },
  "revision calidad": { tone: "rust", label: "Revisión calidad" },
  revision_calidad: { tone: "rust", label: "Revisión calidad" },
  cerrado: { tone: "ink", label: "Cerrado" },
  incidencia: { tone: "wine", label: "Incidencia" },
  "pendiente conf.": { tone: "rust", label: "Pendiente conf." },
  "pendiente conf": { tone: "rust", label: "Pendiente conf." },
  pendiente_conf: { tone: "rust", label: "Pendiente conf." },
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

/**
 * True when the given backend role string represents a vendor/provider role.
 * The backend emits "Vendor" today; the legacy `proveedor` spelling is kept
 * for tolerance with older fixtures and any future localized variants.
 */
export function isVendorRole(role: string | undefined | null): boolean {
  if (!role) return false;
  const r = role.toLowerCase();
  return r.includes("vendor") || r.includes("proveedor");
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
