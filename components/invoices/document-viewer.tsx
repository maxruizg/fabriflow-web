import { useState } from "react";
import {
  Download,
  ExternalLink,
  Minus,
  Plus,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  FileCode2,
  File as FileIcon,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { XmlPreview } from "./xml-preview";

export type DocumentKind = "pdf" | "xml" | "image" | "other";

export interface DocumentItem {
  id: string;
  label: string;
  kind: DocumentKind;
  url: string;
  description?: string;
  downloadName?: string;
}

interface DocumentViewerProps {
  documents: DocumentItem[];
  activeId: string;
  onActiveChange: (id: string) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

const KIND_ICON: Record<DocumentKind, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  xml: FileCode2,
  image: ImageIcon,
  other: FileIcon,
};

const ZOOM_STEPS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 1.75, 2];

export function DocumentViewer({
  documents,
  activeId,
  onActiveChange,
  emptyState,
  className,
}: DocumentViewerProps) {
  const [zoom, setZoom] = useState(1);

  if (documents.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-paper-2 border border-line rounded-lg",
          className,
        )}
      >
        {emptyState ?? (
          <div className="text-center text-ink-3 px-6">
            <FileIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-[13px] text-ink-2">
              Sin documentos disponibles
            </p>
            <p className="text-[11px] mt-1">
              Esta factura aún no tiene archivos adjuntos.
            </p>
          </div>
        )}
      </div>
    );
  }

  const active = documents.find((d) => d.id === activeId) ?? documents[0];
  const ActiveIcon = KIND_ICON[active.kind];

  const zoomIn = () => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom);
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx + 1)] ?? zoom);
  };
  const zoomOut = () => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom);
    setZoom(ZOOM_STEPS[Math.max(0, idx - 1)] ?? zoom);
  };
  const zoomReset = () => setZoom(1);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-paper-2 border border-line rounded-lg overflow-hidden",
        className,
      )}
    >
      {/* Tab strip */}
      <div className="flex-shrink-0 bg-paper border-b border-line px-2">
        <Tabs value={active.id} onValueChange={onActiveChange}>
          <TabsList className="border-b-0 gap-0">
            {documents.map((doc) => {
              const Icon = KIND_ICON[doc.kind];
              return (
                <TabsTrigger key={doc.id} value={doc.id} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{doc.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Active document preview */}
      <div className="flex-1 min-h-0 relative bg-ink-5 overflow-hidden">
        {active.kind === "pdf" ? (
          <div
            className="w-full h-full origin-top-left"
            style={{
              transform: `scale(${zoom})`,
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
            }}
          >
            <iframe
              key={active.url}
              src={active.url}
              className="w-full h-full border-0 bg-white"
              title={active.label}
            />
          </div>
        ) : active.kind === "xml" ? (
          <XmlPreview key={active.url} url={active.url} />
        ) : active.kind === "image" ? (
          <div className="w-full h-full overflow-auto flex items-start justify-center p-4">
            <img
              key={active.url}
              src={active.url}
              alt={active.label}
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              className="max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-ink-3 px-6">
            <div className="text-center">
              <ActiveIcon className="h-14 w-14 mx-auto mb-3 opacity-40" />
              <p className="font-medium text-[13px] text-ink-2">
                Vista previa no disponible
              </p>
              <p className="text-[11px] mt-1 mb-4">
                Descarga el archivo para abrirlo en tu equipo.
              </p>
              <Button variant="clay" size="sm" asChild>
                <a
                  href={active.url}
                  download={active.downloadName}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar {active.label}
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-line bg-paper">
        <div className="flex items-center gap-1">
          {(active.kind === "pdf" || active.kind === "image") && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={zoomOut}
                disabled={zoom <= ZOOM_STEPS[0]}
                title="Reducir"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <button
                type="button"
                onClick={zoomReset}
                className="font-mono text-[11px] tabular-nums text-ink-2 px-2 py-0.5 hover:bg-ink-5 rounded"
                title="Restablecer zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={zoomIn}
                disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                title="Ampliar"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              {zoom !== 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={zoomReset}
                  title="100%"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" asChild>
            <a href={active.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">Abrir</span>
            </a>
          </Button>
          <Button variant="clay" size="sm" className="h-7 text-[11px]" asChild>
            <a
              href={active.url}
              download={active.downloadName}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="h-3 w-3" />
              Descargar
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
