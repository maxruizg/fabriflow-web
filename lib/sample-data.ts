/**
 * Sample data ported from `/Users/maxruizg/Documents/FabriFlow new design/FabriFlow data.js`.
 *
 * USE ONLY for the procurement pages (orders, payments, vendors) until the
 * Phase-3 Rust backend ships their endpoints. Once `/api/orders`,
 * `/api/payments`, `/api/aging`, `/api/activity`, and `/api/vendors/:id/scorecard`
 * are live, every page that imports from this file should be migrated to
 * fetch real data through `lib/api.server.ts` and this module deleted in
 * one PR.
 */

import type { DocType } from "~/components/ui/doc-chip";

export interface SampleVendor {
  id: string;
  name: string;
  short: string;
  category: string;
  city: string;
  rating: number;
  onTime: number;
  active: number;
  outstanding: number;
  currency: "MXN" | "USD" | "EUR";
  since: string;
  status: "Activo" | "En revisión" | "Atrasado";
  risk: "Bajo" | "Medio" | "Alto";
  contact: string;
}

export interface SampleOrder {
  id: string;
  vendor: string;
  vendorId: string;
  date: string;
  due: string;
  amount: number;
  cur: "MXN" | "USD" | "EUR";
  status: string;
  items: number;
  docs: DocType[];
}

export interface SamplePayment {
  id: string;
  vendor: string;
  inv: string;
  date: string;
  amount: number;
  cur: "MXN" | "USD" | "EUR";
  method: string;
  status: string;
  receipt: boolean;
  part: string;
}

export interface SampleAgingBucket {
  bucket: string;
  days: string;
  amount: number;
  share: number;
}

export const SAMPLE_VENDORS: SampleVendor[] = [
  { id: "v001", name: "Hilados del Norte S.A.", short: "HN", category: "Hilo y fibra", city: "Monterrey, MX", rating: 4.8, onTime: 94, active: 18, outstanding: 284350.5, currency: "MXN", since: "2019", status: "Activo", risk: "Bajo", contact: "Ramiro Delgado" },
  { id: "v002", name: "Tejidos Andinos Ltda.", short: "TA", category: "Tela y textil", city: "Lima, PE", rating: 4.6, onTime: 89, active: 12, outstanding: 156720, currency: "USD", since: "2020", status: "Activo", risk: "Bajo", contact: "Paula Quispe" },
  { id: "v003", name: "Botones & Cierres Ibérica", short: "BI", category: "Accesorios", city: "Barcelona, ES", rating: 4.3, onTime: 76, active: 7, outstanding: 42890.75, currency: "EUR", since: "2021", status: "Activo", risk: "Medio", contact: "Jordi Puig" },
  { id: "v004", name: "Algodones del Valle S.A.", short: "AV", category: "Algodón crudo", city: "Gómez Palacio, MX", rating: 4.9, onTime: 97, active: 24, outstanding: 512440.2, currency: "MXN", since: "2017", status: "Activo", risk: "Bajo", contact: "Martha Ibarra" },
  { id: "v005", name: "Químicos Pacífico", short: "QP", category: "Tintes y químicos", city: "Valparaíso, CL", rating: 4.1, onTime: 71, active: 9, outstanding: 98210.3, currency: "USD", since: "2022", status: "En revisión", risk: "Medio", contact: "Enzo Ramírez" },
  { id: "v006", name: "Metales Tijuana", short: "MT", category: "Herrajes", city: "Tijuana, MX", rating: 3.9, onTime: 68, active: 5, outstanding: 34120, currency: "MXN", since: "2023", status: "Atrasado", risk: "Alto", contact: "Lucio Bermúdez" },
  { id: "v007", name: "Empaques Sostenibles SAS", short: "ES", category: "Empaque", city: "Medellín, CO", rating: 4.7, onTime: 92, active: 15, outstanding: 67830.45, currency: "USD", since: "2020", status: "Activo", risk: "Bajo", contact: "Silvia Arango" },
  { id: "v008", name: "Hilaturas San Jorge", short: "SJ", category: "Hilo y fibra", city: "Puebla, MX", rating: 4.5, onTime: 85, active: 11, outstanding: 213990.8, currency: "MXN", since: "2018", status: "Activo", risk: "Bajo", contact: "Ana Montes" },
];

export const SAMPLE_ORDERS: SampleOrder[] = [
  { id: "OC-2026-00418", vendor: "Algodones del Valle S.A.", vendorId: "v004", date: "2026-04-18", due: "2026-05-18", amount: 124500, cur: "MXN", status: "Recibido", items: 8, docs: ["OC", "FAC", "REM"] },
  { id: "OC-2026-00417", vendor: "Hilados del Norte S.A.", vendorId: "v001", date: "2026-04-17", due: "2026-05-17", amount: 88200, cur: "MXN", status: "En tránsito", items: 4, docs: ["OC", "FAC"] },
  { id: "OC-2026-00414", vendor: "Tejidos Andinos Ltda.", vendorId: "v002", date: "2026-04-15", due: "2026-05-30", amount: 42380, cur: "USD", status: "Confirmado", items: 3, docs: ["OC"] },
  { id: "OC-2026-00412", vendor: "Químicos Pacífico", vendorId: "v005", date: "2026-04-14", due: "2026-05-14", amount: 19840.5, cur: "USD", status: "Revisión calidad", items: 2, docs: ["OC", "FAC", "REM"] },
  { id: "OC-2026-00409", vendor: "Botones & Cierres Ibérica", vendorId: "v003", date: "2026-04-12", due: "2026-05-12", amount: 8790.25, cur: "EUR", status: "Recibido", items: 5, docs: ["OC", "FAC", "REM", "NC"] },
  { id: "OC-2026-00407", vendor: "Empaques Sostenibles SAS", vendorId: "v007", date: "2026-04-10", due: "2026-05-10", amount: 15620, cur: "USD", status: "Cerrado", items: 6, docs: ["OC", "FAC", "REM"] },
  { id: "OC-2026-00405", vendor: "Metales Tijuana", vendorId: "v006", date: "2026-04-08", due: "2026-05-08", amount: 23410, cur: "MXN", status: "Incidencia", items: 3, docs: ["OC", "FAC"] },
  { id: "OC-2026-00402", vendor: "Hilaturas San Jorge", vendorId: "v008", date: "2026-04-06", due: "2026-05-06", amount: 67920, cur: "MXN", status: "Cerrado", items: 4, docs: ["OC", "FAC", "REM"] },
  { id: "OC-2026-00398", vendor: "Algodones del Valle S.A.", vendorId: "v004", date: "2026-04-03", due: "2026-05-03", amount: 198400, cur: "MXN", status: "Cerrado", items: 12, docs: ["OC", "FAC", "REM"] },
];

export const SAMPLE_PAYMENTS: SamplePayment[] = [
  { id: "PG-2026-0318", vendor: "Algodones del Valle S.A.", inv: "FAC-00412", date: "2026-04-20", amount: 124500, cur: "MXN", method: "Transferencia SPEI", status: "Confirmado", receipt: true, part: "1/1" },
  { id: "PG-2026-0317", vendor: "Hilados del Norte S.A.", inv: "FAC-00398", date: "2026-04-19", amount: 44100, cur: "MXN", method: "Transferencia SPEI", status: "Confirmado", receipt: true, part: "1/2" },
  { id: "PG-2026-0316", vendor: "Tejidos Andinos Ltda.", inv: "FAC-00389", date: "2026-04-18", amount: 21190, cur: "USD", method: "Wire USD", status: "Pendiente conf.", receipt: true, part: "1/2" },
  { id: "PG-2026-0315", vendor: "Empaques Sostenibles SAS", inv: "FAC-00384", date: "2026-04-15", amount: 15620, cur: "USD", method: "Wire USD", status: "Confirmado", receipt: true, part: "1/1" },
  { id: "PG-2026-0314", vendor: "Botones & Cierres Ibérica", inv: "FAC-00381", date: "2026-04-14", amount: 8790.25, cur: "EUR", method: "SEPA", status: "Confirmado", receipt: true, part: "1/1" },
  { id: "PG-2026-0313", vendor: "Hilaturas San Jorge", inv: "FAC-00376", date: "2026-04-11", amount: 33960, cur: "MXN", method: "Transferencia SPEI", status: "Confirmado", receipt: false, part: "1/2" },
  { id: "PG-2026-0312", vendor: "Químicos Pacífico", inv: "FAC-00372", date: "2026-04-08", amount: 9920.25, cur: "USD", method: "Wire USD", status: "Rechazado", receipt: false, part: "1/2" },
];

export const SAMPLE_AGING: SampleAgingBucket[] = [
  { bucket: "Corriente", days: "0", amount: 412800, share: 48 },
  { bucket: "1–30 días", days: "1-30", amount: 284300, share: 28 },
  { bucket: "31–60 días", days: "31-60", amount: 126400, share: 14 },
  { bucket: "61–90 días", days: "61-90", amount: 58200, share: 7 },
  { bucket: "+90 días", days: "90+", amount: 24500, share: 3 },
];

/** Format YYYY-MM-DD as "DD MMM YYYY" in Spanish abbreviations. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
}

export function fmtCurrency(n: number, cur: "MXN" | "USD" | "EUR" = "MXN"): { symbol: string; integer: string; decimal: string; code: string } {
  const symbols: Record<string, string> = { MXN: "$", USD: "US$", EUR: "€" };
  const [intPart, decPart] = n.toFixed(2).split(".");
  return {
    symbol: symbols[cur] ?? "$",
    integer: intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    decimal: decPart,
    code: cur,
  };
}

/** Status → tone mirror of design's STATUS_TONE. */
export const STATUS_TONE: Record<string, "moss" | "clay" | "rust" | "wine" | "ink"> = {
  Recibido: "moss",
  "En tránsito": "clay",
  Confirmado: "moss",
  "Revisión calidad": "rust",
  Cerrado: "ink",
  Incidencia: "wine",
  "Pendiente conf.": "rust",
  Rechazado: "wine",
  Activo: "moss",
  "En revisión": "rust",
  Atrasado: "wine",
};
