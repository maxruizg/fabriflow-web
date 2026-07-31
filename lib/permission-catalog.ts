/**
 * Permission catalog — mirrors `be/src/permissions.rs`.
 *
 * Estructura 100% consistente:
 * - Documentos (archivos PDF/XML): read, upload, approve, delete
 *   • Facturas, Notas, Complementos, Recepciones, Pagos
 *   • upload = "Subir" (siempre)
 * - Entidades (registros internos): read, create, update, delete
 *   • Órdenes de Compra, Proveedores, Usuarios
 *   • create = "Crear" (siempre)
 *
 * Notas:
 * - "approve" incluye aprobar Y rechazar (no son permisos separados)
 * - Filtrado automático por company_id (vendors solo ven sus documentos)
 *
 * Total: 46 permisos organizados en 11 categorías
 */

export interface PermissionDef {
  /** The literal permission token sent to the backend (e.g. "orders:create"). */
  key: string;
  /** Short Spanish label shown to operators. */
  label: string;
  /** Optional one-liner description. */
  hint?: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    permissions: [{ key: "dashboard:read", label: "Ver dashboard" }],
  },
  {
    key: "orders",
    label: "Órdenes de compra",
    permissions: [
      { key: "orders:read", label: "Ver órdenes de compra" },
      { key: "orders:create", label: "Crear órdenes de compra" },
      { key: "orders:update", label: "Editar órdenes de compra" },
      { key: "orders:delete", label: "Eliminar órdenes de compra" },
      {
        key: "orders:authorize",
        label: "Autorizar órdenes de compra",
        hint: "Aprobar OCs creadas por otros usuarios",
      },
      { key: "orders:send", label: "Enviar órdenes al proveedor" },
    ],
  },
  {
    key: "invoices",
    label: "Facturas (CFDI)",
    permissions: [
      { key: "invoices:read", label: "Ver facturas" },
      { key: "invoices:upload", label: "Subir facturas" },
      { key: "invoices:approve", label: "Aprobar/Rechazar facturas" },
      { key: "invoices:delete", label: "Eliminar facturas" },
    ],
  },
  {
    key: "credit_notes",
    label: "Notas de crédito",
    permissions: [
      { key: "credit_notes:read", label: "Ver notas de crédito" },
      { key: "credit_notes:upload", label: "Subir notas de crédito" },
      { key: "credit_notes:approve", label: "Aprobar notas de crédito" },
      { key: "credit_notes:delete", label: "Eliminar notas de crédito" },
    ],
  },
  {
    key: "debit_notes",
    label: "Notas de cargo",
    permissions: [
      { key: "debit_notes:read", label: "Ver notas de cargo" },
      { key: "debit_notes:upload", label: "Subir notas de cargo" },
      { key: "debit_notes:approve", label: "Aprobar notas de cargo" },
      { key: "debit_notes:delete", label: "Eliminar notas de cargo" },
    ],
  },
  {
    key: "complements",
    label: "Complementos de pago",
    permissions: [
      { key: "complements:read", label: "Ver complementos" },
      { key: "complements:upload", label: "Subir complementos" },
      { key: "multi_complements:upload", label: "Subir múltiples complementos" },
      { key: "complements:delete", label: "Eliminar complementos" },
    ],
  },
  {
    key: "reception",
    label: "Recepción",
    permissions: [
      { key: "reception:read", label: "Ver recepciones" },
      { key: "reception:upload", label: "Subir recepciones" },
      { key: "reception:delete", label: "Eliminar recepciones" },
    ],
  },
  {
    key: "payments",
    label: "Pagos",
    permissions: [
      { key: "payments:read", label: "Ver pagos" },
      { key: "payments:upload", label: "Subir pagos" },
      { key: "payments:approve", label: "Aprobar pagos" },
      { key: "payments:delete", label: "Eliminar pagos" },
    ],
  },
  {
    key: "vendors",
    label: "Proveedores",
    permissions: [
      { key: "vendors:read", label: "Ver proveedores" },
      { key: "vendors:create", label: "Crear proveedores" },
      { key: "vendors:update", label: "Editar proveedores" },
      { key: "vendors:delete", label: "Eliminar proveedores" },
    ],
  },
  {
    key: "users",
    label: "Usuarios y roles",
    permissions: [
      { key: "users:read", label: "Ver usuarios" },
      {
        key: "users:create",
        label: "Crear usuarios",
        hint: "Invitar nuevos usuarios a la compañía",
      },
      {
        key: "users:update",
        label: "Editar usuarios",
        hint: "Modificar información y roles de usuarios",
      },
      { key: "users:delete", label: "Eliminar usuarios" },
    ],
  },
  {
    key: "reports",
    label: "Reportes",
    permissions: [
      { key: "reports:read", label: "Ver reportes" },
      { key: "reports:export", label: "Exportar reportes" },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionDef[] = PERMISSION_GROUPS.flatMap(
  (g) => g.permissions,
);

export function permissionLabel(key: string): string {
  for (const group of PERMISSION_GROUPS) {
    for (const p of group.permissions) {
      if (p.key === key) return p.label;
    }
  }
  return key;
}
