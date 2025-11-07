import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "~/lib/utils"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      props.onChange?.(e)
      onCheckedChange?.(e.target.checked)
    }

    return (
      <div className="relative inline-flex">
        <input
          type="checkbox"
          ref={ref}
          className="sr-only peer"
          onChange={handleChange}
          {...props}
        />
        <label
          className={cn(
            "h-4 w-4 shrink-0 rounded-sm border border-primary shadow",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "peer-checked:bg-primary peer-checked:text-primary-foreground",
            "cursor-pointer transition-colors",
            "hover:border-primary/80",
            "dark:border-zinc-600 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300",
            "dark:peer-checked:bg-zinc-50 dark:peer-checked:text-zinc-900",
            "inline-flex items-center justify-center",
            className
          )}
          htmlFor={props.id}
        >
          <Check 
            className={cn(
              "h-4 w-4 p-0.5",
              "opacity-0 peer-checked:opacity-100",
              "transition-opacity duration-200"
            )} 
          />
        </label>
      </div>
    )
  }
)

Checkbox.displayName = "Checkbox"

export { Checkbox }