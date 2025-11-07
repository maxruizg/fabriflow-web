import { useState, useCallback, useEffect } from 'react';
import { getFileInfo, deleteFileById, type FileInfo } from '../file-utils';

interface UseFileManagerOptions {
  initialFiles?: FileInfo[];
  onFileDelete?: (fileId: string) => void;
  onError?: (error: string) => void;
}

interface FileManagerState {
  files: FileInfo[];
  loading: boolean;
  error: string | null;
  deletingFiles: Set<string>;
}

export function useFileManager(options: UseFileManagerOptions = {}) {
  const [state, setState] = useState<FileManagerState>({
    files: options.initialFiles || [],
    loading: false,
    error: null,
    deletingFiles: new Set(),
  });

  const addFile = useCallback((file: FileInfo) => {
    setState(prev => ({
      ...prev,
      files: [...prev.files, file],
    }));
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState(prev => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId),
    }));
  }, []);

  const loadFileInfo = useCallback(async (fileId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const fileInfo = await getFileInfo(fileId);
      if (fileInfo) {
        addFile(fileInfo);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load file info';
      setState(prev => ({ ...prev, error: errorMessage }));
      options.onError?.(errorMessage);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [addFile, options]);

  const deleteFile = useCallback(async (fileId: string) => {
    setState(prev => ({
      ...prev,
      deletingFiles: new Set([...prev.deletingFiles, fileId]),
    }));

    try {
      const success = await deleteFileById(fileId);
      if (success) {
        removeFile(fileId);
        options.onFileDelete?.(fileId);
      } else {
        throw new Error('Failed to delete file');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete file';
      setState(prev => ({ ...prev, error: errorMessage }));
      options.onError?.(errorMessage);
    } finally {
      setState(prev => ({
        ...prev,
        deletingFiles: new Set([...prev.deletingFiles].filter(id => id !== fileId)),
      }));
    }
  }, [removeFile, options]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback(() => {
    setState({
      files: options.initialFiles || [],
      loading: false,
      error: null,
      deletingFiles: new Set(),
    });
  }, [options.initialFiles]);

  return {
    files: state.files,
    loading: state.loading,
    error: state.error,
    deletingFiles: state.deletingFiles,
    addFile,
    removeFile,
    loadFileInfo,
    deleteFile,
    clearError,
    reset,
  };
}