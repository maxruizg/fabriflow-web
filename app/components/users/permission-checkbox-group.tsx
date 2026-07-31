/**
 * Componente para mostrar y seleccionar permisos organizados por categorías.
 * Obtiene la lista de permisos dinámicamente del backend.
 */

interface PermissionInfo {
  key: string;
  label: string;
}

interface PermissionCategory {
  name: string;
  label: string;
  permissions: PermissionInfo[];
}

interface PermCheckboxGroupProps {
  categories: PermissionCategory[];
  checkedPerms: string[];
  onToggle?: (perm: string) => void;
  /** If true, uses defaultChecked (uncontrolled) for the create form. */
  uncontrolled?: boolean;
}

export function PermCheckboxGroup({
  categories,
  checkedPerms,
  onToggle,
  uncontrolled,
}: PermCheckboxGroupProps) {
  // Si no hay categorías, mostrar mensaje
  if (!categories || categories.length === 0) {
    return (
      <div className="rounded-lg border border-line p-4 bg-paper-2">
        <p className="text-[13px] text-ink-3">
          No se pudieron cargar los permisos. Recarga la página.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line p-4 space-y-6 bg-paper-2 max-h-[60vh] overflow-y-auto">
      {categories.map((category) => (
        <div key={category.name} className="space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-wider text-ink font-semibold border-b border-line pb-1">
            {category.label}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-2">
            {category.permissions.map((perm) => {
              const id = uncontrolled
                ? `perm-${perm.key.replace(/:/g, "-")}`
                : `edit-perm-${perm.key.replace(/:/g, "-")}`;

              return (
                <label
                  key={perm.key}
                  className="flex items-start gap-2 text-[13px] text-ink-2 hover:text-ink transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    id={id}
                    name={`perm-${perm.key.replace(/:/g, "-")}`}
                    value={perm.key}
                    className="rounded accent-clay mt-0.5 shrink-0"
                    {...(uncontrolled
                      ? { defaultChecked: checkedPerms.includes(perm.key) }
                      : {
                          checked: checkedPerms.includes(perm.key),
                          onChange: () => onToggle?.(perm.key),
                        })}
                  />
                  <span className="leading-tight">{perm.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
