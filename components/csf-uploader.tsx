/**
 * CSF Uploader - Componente para subir y procesar la Constancia de Situación Fiscal
 */

import { useState, useRef } from 'react';
import { Button } from '~/components/ui/button';
import { Alert, AlertDescription } from '~/components/ui/alert';
import {
  FileText,
  Upload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X
} from 'lucide-react';
import { readCSFFromPDF, validateCSFData, type CSFData } from '~/lib/csf-reader';

interface CSFUploaderProps {
  onDataExtracted: (data: CSFData) => void;
  onError?: (error: string) => void;
}

export function CSFUploader({ onDataExtracted, onError }: CSFUploaderProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<CSFData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar que sea PDF
    if (file.type !== 'application/pdf') {
      const errorMsg = 'Por favor selecciona un archivo PDF';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      const errorMsg = 'El archivo es muy grande. Máximo 5MB.';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setFileName(file.name);
    setExtractedData(null);

    try {
      const result = await readCSFFromPDF(file);

      if (result.success && result.data) {
        const validation = validateCSFData(result.data);

        if (validation.valid) {
          setExtractedData(result.data);
          onDataExtracted(result.data);
        } else {
          const errorMsg = `Datos incompletos. Falta: ${validation.missingFields.join(', ')}`;
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } else {
        const errorMsg = result.error || 'No se pudo leer el documento';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'Error al procesar el documento';
      setError(errorMsg);
      onError?.(errorMsg);
      console.error('CSF processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFileName(null);
    setExtractedData(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      {/* Input oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Estado inicial o error */}
      {!extractedData && (
        <div
          onClick={triggerFileSelect}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
            transition-colors
            ${error
              ? 'border-destructive bg-destructive/5'
              : 'border-muted-foreground/25 hover:border-primary hover:bg-primary/5'
            }
          `}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Procesando CSF...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <div className="p-3 rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Sube tu Constancia de Situación Fiscal
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF del SAT (máx. 5MB)
                </p>
              </div>
              {fileName && !error && (
                <p className="text-xs text-muted-foreground">
                  {fileName}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-6 px-2"
            >
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Datos extraídos exitosamente */}
      {extractedData && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/30">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-green-700 dark:text-green-400 font-medium">
                  {extractedData.nombre ? 'CSF procesada correctamente' : 'RFC extraído del QR'}
                </p>
                <div className="text-sm text-green-600 dark:text-green-500">
                  <p><strong>RFC:</strong> {extractedData.rfc}</p>
                  {extractedData.nombre ? (
                    <p><strong>Nombre:</strong> {extractedData.nombre}</p>
                  ) : (
                    <p className="text-amber-600 dark:text-amber-400">
                      El nombre no está en el QR. Llénalo manualmente abajo.
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Ayuda */}
      {!extractedData && !isProcessing && (
        <div className="flex items-start space-x-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>
            Descarga tu CSF desde el{' '}
            <a
              href="https://www.sat.gob.mx/aplicacion/53027/genera-tu-constancia-de-situacion-fiscal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              portal del SAT
            </a>
            . Leeremos automáticamente tu RFC y nombre del código QR.
          </p>
        </div>
      )}
    </div>
  );
}
