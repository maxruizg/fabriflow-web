import { Link } from "@remix-run/react";
import { ArrowLeft, RefreshCw, Home } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export interface ErrorScreenAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "clay" | "outline" | "ghost";
  icon?: React.ReactNode;
}

export interface ErrorScreenProps {
  /** Numeric status (404, 500, ...) — rendered as the headline. */
  status?: number;
  /** Eyebrow above the title (defaults to map of status code). */
  eyebrow?: string;
  /** Headline text — defaults to a status-aware Spanish copy. */
  title?: string;
  /** Body paragraph — short Spanish explanation. */
  description?: string;
  /** Optional fixed-width "slug" (mono font) — shows path or error code. */
  detail?: string;
  /** 1–3 actions. The first is rendered as primary (clay). */
  actions?: ErrorScreenAction[];
  /** When true, the layout fills the viewport (used by global boundaries). */
  fullScreen?: boolean;
  className?: string;
}

const STATUS_COPY: Record<
  number,
  { eyebrow: string; title: string; description: string }
> = {
  400: {
    eyebrow: "Solicitud inválida",
    title: "Algo en la petición no cuadra.",
    description:
      "Revisa los datos enviados. Si el problema persiste, intenta recargar la página.",
  },
  401: {
    eyebrow: "Sesión requerida",
    title: "Tu sesión ya no es válida.",
    description:
      "Inicia sesión nuevamente para continuar donde te quedaste.",
  },
  403: {
    eyebrow: "Acceso denegado",
    title: "No tienes permisos para ver esto.",
    description:
      "Pide a un administrador de la empresa que ajuste tus permisos.",
  },
  404: {
    eyebrow: "No encontrado",
    title: "Esta página se nos escapó.",
    description:
      "El recurso que buscas no existe o fue eliminado. Verifica el enlace o vuelve al inicio.",
  },
  500: {
    eyebrow: "Error del servidor",
    title: "Algo se rompió de nuestro lado.",
    description:
      "Estamos al tanto. Intenta de nuevo en unos momentos — si persiste, contáctanos.",
  },
  502: {
    eyebrow: "Servicio no disponible",
    title: "El servidor no está respondiendo.",
    description:
      "Probablemente sea pasajero. Reintenta en unos segundos.",
  },
  503: {
    eyebrow: "Servicio no disponible",
    title: "Estamos en mantenimiento.",
    description: "Volveremos pronto. Gracias por tu paciencia.",
  },
};

function getStatusCopy(status?: number) {
  if (!status) return STATUS_COPY[500];
  return STATUS_COPY[status] ?? STATUS_COPY[500];
}

function StatusGlyph({ status }: { status?: number }) {
  // Render the digits separately so we can tilt the middle one for character.
  const digits = (status ?? 500).toString().padStart(3, "0").split("");
  return (
    <div
      aria-hidden
      className="font-display select-none flex items-baseline gap-1 text-[clamp(7rem,18vw,12rem)] leading-none"
    >
      {digits.map((d, i) => (
        <span
          key={i}
          className={cn(
            "italic text-ink",
            i === 0 && "text-clay-deep",
            i === 1 && "rotate-[-4deg] inline-block",
            i === 2 && "text-wine",
          )}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

export function ErrorScreen({
  status = 500,
  eyebrow,
  title,
  description,
  detail,
  actions,
  fullScreen = false,
  className,
}: ErrorScreenProps) {
  const copy = getStatusCopy(status);
  const finalEyebrow = eyebrow ?? copy.eyebrow;
  const finalTitle = title ?? copy.title;
  const finalDescription = description ?? copy.description;

  return (
    <div
      className={cn(
        "relative bg-paper text-ink",
        fullScreen
          ? "min-h-screen flex items-center justify-center overflow-hidden"
          : "flex items-center justify-center py-16",
        className,
      )}
    >
      {/* Subtle warm gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          background:
            "radial-gradient(60% 60% at 18% 22%, var(--clay-soft) 0%, transparent 60%), radial-gradient(50% 50% at 85% 80%, var(--wine-soft) 0%, transparent 65%)",
        }}
      />
      {/* Faint dotted grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(currentColor 0.5px, transparent 0.5px)",
          backgroundSize: "18px 18px",
          color: "var(--line)",
          maskImage:
            "radial-gradient(ellipse at center, black 35%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 35%, transparent 80%)",
        }}
      />

      <div className="relative z-10 max-w-xl px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-clay-deep mb-4">
          {finalEyebrow}
        </p>

        <StatusGlyph status={status} />

        <h1 className="ff-page-title !text-[clamp(20px,3vw,26px)] mt-6 max-w-md mx-auto leading-tight">
          {finalTitle}
        </h1>
        <p className="ff-page-sub mt-2.5 max-w-md mx-auto">
          {finalDescription}
        </p>

        {detail ? (
          <p className="mt-5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-paper-3 border border-line font-mono text-[11px] text-ink-3">
            <span className="h-1.5 w-1.5 rounded-full bg-clay" />
            <span className="break-all">{detail}</span>
          </p>
        ) : null}

        {actions && actions.length > 0 ? (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {actions.map((action, idx) => {
              const variant =
                action.variant ?? (idx === 0 ? "clay" : "outline");
              const content = (
                <>
                  {action.icon}
                  {action.label}
                </>
              );
              if (action.href) {
                return (
                  <Button key={action.label} variant={variant} asChild>
                    <Link to={action.href}>{content}</Link>
                  </Button>
                );
              }
              return (
                <Button
                  key={action.label}
                  variant={variant}
                  onClick={action.onClick}
                >
                  {content}
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Default actions for common cases — exported for reuse.
 */
export const errorActions = {
  home: (label = "Ir al inicio"): ErrorScreenAction => ({
    label,
    href: "/",
    variant: "clay",
    icon: <Home className="h-3.5 w-3.5" />,
  }),
  back: (href: string, label = "Volver"): ErrorScreenAction => ({
    label,
    href,
    variant: "clay",
    icon: <ArrowLeft className="h-3.5 w-3.5" />,
  }),
  retry: (onClick: () => void, label = "Reintentar"): ErrorScreenAction => ({
    label,
    onClick,
    variant: "outline",
    icon: <RefreshCw className="h-3.5 w-3.5" />,
  }),
};
