export class APIError extends Error {
  public status: number;
  public code: string;

  constructor(message: string, status: number = 500, code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends Error {
  public field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export function handleAPIError(error: unknown): APIError {
  if (error instanceof APIError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new APIError(error.message, 500, 'INTERNAL_ERROR');
  }
  
  return new APIError('An unexpected error occurred', 500, 'UNKNOWN_ERROR');
}

export function createErrorResponse(error: APIError) {
  return {
    error: true,
    message: error.message,
    code: error.code,
    status: error.status,
  };
}

// Error boundary hook for components
export function useErrorHandler() {
  return (error: unknown, fallbackMessage?: string) => {
    const apiError = handleAPIError(error);
    console.error('Application Error:', apiError);
    
    // In a real app, you'd send this to your error tracking service
    // Example: Sentry.captureException(apiError);
    
    return {
      message: fallbackMessage || apiError.message,
      code: apiError.code,
      status: apiError.status,
    };
  };
}