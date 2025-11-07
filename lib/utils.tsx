import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Badge } from "~/components/ui/badge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Unified status badge function that handles all status types across the application
export function getStatusBadge(status: string) {
  // Normalize status to lowercase for consistent matching
  const normalizedStatus = status.toLowerCase();

  // Handle specific cases with direct styling
  switch (normalizedStatus) {
    case "pending":
    case "pendiente":
      return (
        <Badge
          className="border-transparent"
          style={{
            backgroundColor: "#fef3c7",
            color: "#92400e",
            borderColor: "transparent",
          }}
        >
          Pendiente
        </Badge>
      );
    case "paid":
    case "pagado":
      return (
        <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
          Pagado
        </Badge>
      );
    case "active":
    case "activo":
      return (
        <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
          Activo
        </Badge>
      );
    case "overdue":
    case "vencido":
      return (
        <Badge className="border-transparent bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
          Vencido
        </Badge>
      );
    case "rechazado":
    case "rejected":
      return (
        <Badge className="border-transparent bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
          Rechazado
        </Badge>
      );
    case "inactive":
    case "inactivo":
      return (
        <Badge className="border-transparent bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
          Inactivo
        </Badge>
      );
    default:
      return (
        <Badge className="border-transparent bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
          {status}
        </Badge>
      );
  }
}
