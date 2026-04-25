import { useRole } from "~/lib/role-context";
import { cn } from "~/lib/utils";

export function RoleSwitch({ className }: { className?: string }) {
  const { role, setRole, canSwitch } = useRole();
  if (!canSwitch) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Cambiar perspectiva"
      className={cn(
        "grid grid-cols-2 gap-px rounded-lg border border-line-2 bg-paper p-1",
        className,
      )}
    >
      {(["factory", "vendor"] as const).map((r) => {
        const active = role === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setRole(r)}
            className={cn(
              "rounded-md px-3 py-2 text-[12px] font-semibold text-center transition-colors",
              active
                ? "bg-clay text-paper shadow-[0_1px_2px_oklch(0.3_0.1_40_/_0.3)]"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {r === "factory" ? "Fábrica" : "Proveedor"}
          </button>
        );
      })}
    </div>
  );
}
