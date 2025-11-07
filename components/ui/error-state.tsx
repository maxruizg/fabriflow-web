import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

interface ErrorStateProps {
  title?: string;
  message?: string;
  type?: 'network' | 'server' | 'generic';
  onRetry?: () => void;
  showRetry?: boolean;
}

export function ErrorState({
  title,
  message,
  type = 'generic',
  onRetry,
  showRetry = true,
}: ErrorStateProps) {
  const getErrorIcon = () => {
    switch (type) {
      case 'network':
        return <WifiOff className="h-12 w-12 text-red-500 mb-4" />;
      case 'server':
        return <AlertTriangle className="h-12 w-12 text-orange-500 mb-4" />;
      default:
        return <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />;
    }
  };

  const getDefaultTitle = () => {
    switch (type) {
      case 'network':
        return 'Problema de Conexión';
      case 'server':
        return 'Error del Servidor';
      default:
        return 'Algo salió mal';
    }
  };

  const getDefaultMessage = () => {
    switch (type) {
      case 'network':
        return 'Por favor verifica tu conexión a internet e intenta de nuevo.';
      case 'server':
        return 'Nuestros servidores están experimentando problemas. Por favor intenta de nuevo en unos momentos.';
      default:
        return 'Ocurrió un error inesperado. Por favor intenta de nuevo más tarde.';
    }
  };

  return (
    <Card className="border-0 shadow-none">
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        {getErrorIcon()}
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {title || getDefaultTitle()}
        </h3>
        <p className="text-gray-600 mb-6 max-w-md">
          {message || getDefaultMessage()}
        </p>
        {showRetry && onRetry && (
          <Button 
            onClick={onRetry}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Intentar de Nuevo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      type="network"
      title="Sin Conexión a Internet"
      message="Por favor verifica tu conexión e intenta de nuevo."
      onRetry={onRetry}
    />
  );
}

export function ServerError({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      type="server"
      title="Servidor No Disponible"
      message="Tenemos problemas conectando con nuestros servidores. Por favor intenta de nuevo en un momento."
      onRetry={onRetry}
    />
  );
}

export function DataLoadError({ 
  resource, 
  onRetry 
}: { 
  resource?: string;
  onRetry?: () => void;
}) {
  return (
    <ErrorState
      title={`Error al Cargar ${resource || 'Datos'}`}
      message={`No pudimos cargar tus ${resource?.toLowerCase() || 'datos'}. Esto podría ser un problema temporal.`}
      onRetry={onRetry}
    />
  );
}