import { useState, useCallback } from 'react';
import { uploadFileWithValidation, FileUploadError, type FileUploadResult } from '../file-utils';

interface UseFileUploadOptions {
  maxFileSize?: number;
  allowedTypes?: string[];
  onSuccess?: (result: FileUploadResult) => void;
  onError?: (error: FileUploadError) => void;
}

interface FileUploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  result: FileUploadResult | null;
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const [state, setState] = useState<FileUploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    result: null,
  });

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setState({
        isUploading: true,
        progress: 0,
        error: null,
        result: null,
      });

      try {
        const result = await uploadFileWithValidation(files, {
          maxFileSize: options.maxFileSize,
          allowedTypes: options.allowedTypes,
          onProgress: (progress) => {
            setState(prev => ({ ...prev, progress }));
          },
        });

        setState(prev => ({
          ...prev,
          isUploading: false,
          progress: 100,
          result,
        }));

        options.onSuccess?.(result);
        return result;
      } catch (error) {
        const uploadError = error instanceof FileUploadError 
          ? error 
          : new FileUploadError('Upload failed', 'UNKNOWN');

        setState(prev => ({
          ...prev,
          isUploading: false,
          progress: 0,
          error: uploadError.message,
        }));

        options.onError?.(uploadError);
        throw uploadError;
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      result: null,
    });
  }, []);

  return {
    ...state,
    uploadFiles,
    reset,
  };
}