/**
 * Permission catalog — mirrors `be-v2/src/permissions.rs`.
 *
 * Source of truth for the permissions UI. Group order is the order shown
 * to operators in the role editor and the per-user override editor.
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
      { key: "orders:read", label: "Ver OCs" },
      { key: "orders:create", label: "Crear OCs" },
      {
        key: "orders:authorize",
        label: "Autorizar / rechazar OCs",
        hint: "Permite aprobar OCs creadas por otros usuarios",
      },
      { key: "orders:update", label: "Editar OCs" },
      { key: "orders:send", label: "Enviar OCs al proveedor" },
      { key: "orders:delete", label: "Eliminar OCs" },
    ],
  },
  {
    key: "invoices",
    label: "Facturas (CFDI)",
    permissions: [
      { key: "invoices:read", label: "Ver facturas" },
      { key: "invoices:upload", label: "Subir facturas" },
      { key: "invoices:approve", label: "Aprobar facturas" },
      { key: "invoices:reject", label: "Rechazar facturas" },
    ],
  },
  {
    key: "reception",
    label: "Recepción",
    permissions: [
      { key: "reception:read", label: "Ver recepciones" },
      { key: "reception:upload", label: "Registrar recepciones" },
    ],
  },
  {
    key: "credit_notes",
    label: "Notas de crédito",
    permissions: [
      { key: "credit_notes:read", label: "Ver" },
      { key: "credit_notes:upload", label: "Subir" },
      { key: "credit_notes:approve", label: "Aprobar" },
    ],
  },
  {
    key: "debit_notes",
    label: "Notas de cargo",
    permissions: [
      { key: "debit_notes:read", label: "Ver" },
      { key: "debit_notes:upload", label: "Subir" },
      { key: "debit_notes:approve", label: "Aprobar" },
    ],
  },
  {
    key: "complements",
    label: "Complementos",
    permissions: [
      { key: "complements:read", label: "Ver" },
      { key: "complements:upload", label: "Subir" },
      { key: "multi_complements:upload", label: "Subir múltiples" },
    ],
  },
  {
    key: "payments",
    label: "Pagos",
    permissions: [
      { key: "payments:read", label: "Ver pagos" },
      { key: "payments:create", label: "Programar pagos" },
      { key: "payments:approve", label: "Aprobar pagos" },
    ],
  },
  {
    key: "vendors",
    label: "Proveedores",
    permissions: [
      { key: "vendors:read", label: "Ver" },
      { key: "vendors:manage", label: "Gestionar" },
    ],
  },
  {
    key: "users",
    label: "Usuarios y roles",
    permissions: [
      { key: "users:read", label: "Ver usuarios" },
      {
        key: "users:manage",
        label: "Gestionar usuarios y roles",
        hint: "Crear, editar y eliminar usuarios; gestionar roles personalizados",
      },
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
