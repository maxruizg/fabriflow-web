import * as React from "react";
import { cn } from "~/lib/utils";
import { Icon } from "~/components/ui/icon";

export type ValidationStepStatus = "pending" | "active" | "completed" | "error";

export interface ValidationStep {
  /** Step label */
  label: string;
  /** Current status of the step */
  status: ValidationStepStatus;
  /** Optional error message */
  error?: string;
}

export interface ValidationProgressProps {
  /** List of validation steps */
  steps: ValidationStep[];
  /** Additional CSS class */
  className?: string;
}

/**
 * Displays the progress of invoice validation steps.
 * Shows 6 steps: upload, parse, validate UUIDs/RFCs, verify PO, upload files, save invoice.
 */
export function ValidationProgress({
  steps,
  className,
}: ValidationProgressProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <Icon name="clock" size={16} />
        <span>Validando factura...</span>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <ValidationStepItem
            key={index}
            step={step}
            stepNumber={index + 1}
          />
        ))}
      </div>
    </div>
  );
}

interface ValidationStepItemProps {
  step: ValidationStep;
  stepNumber: number;
}

function ValidationStepItem({ step, stepNumber }: ValidationStepItemProps) {
  const { label, status, error } = step;

  // Determine icon based on status
  const renderIcon = () => {
    switch (status) {
      case "completed":
        return (
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-moss flex items-center justify-center">
            <Icon name="check" size={14} className="text-white" />
          </div>
        );
      case "active":
        return (
          <div className="flex-shrink-0 w-5 h-5">
            <div className="w-5 h-5 border-2 border-clay border-t-transparent rounded-full animate-spin" />
          </div>
        );
      case "error":
        return (
          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
            <Icon name="x" size={14} className="text-white" />
          </div>
        );
      default:
        return (
          <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-ink-4" />
        );
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-colors",
        status === "active" && "bg-clay-bg",
        status === "error" && "bg-red-50"
      )}
    >
      {/* Icon */}
      {renderIcon()}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm font-medium",
            status === "completed" && "text-moss",
            status === "active" && "text-ink",
            status === "error" && "text-red-600",
            status === "pending" && "text-ink-3"
          )}
        >
          {label}
        </div>

        {/* Error message */}
        {error && status === "error" && (
          <div className="mt-1 text-xs text-red-600">{error}</div>
        )}
      </div>

      {/* Step number */}
      <div
        className={cn(
          "flex-shrink-0 text-xs font-medium tabular-nums",
          status === "completed" && "text-moss",
          status === "active" && "text-clay",
          status === "error" && "text-red-600",
          status === "pending" && "text-ink-4"
        )}
      >
        {stepNumber}/6
      </div>
    </div>
  );
}

/**
 * Default validation steps structure.
 * Use this as a starting point and update statuses as validation progresses.
 */
export const DEFAULT_VALIDATION_STEPS: ValidationStep[] = [
  {
    label: "Subiendo archivos...",
    status: "pending",
  },
  {
    label: "Parseando XML CFDI...",
    status: "pending",
  },
  {
    label: "Validando UUID y RFCs...",
    status: "pending",
  },
  {
    label: "Verificando orden de compra...",
    status: "pending",
  },
  {
    label: "Almacenando archivos...",
    status: "pending",
  },
  {
    label: "Guardando factura...",
    status: "pending",
  },
];
