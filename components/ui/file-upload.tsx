import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, FileText, Image, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { compressImage, throttle } from '~/lib/performance';
import { Button } from './button';
import { Card, CardContent } from './card';
import { Badge } from './badge';
import { Progress } from './progress';

interface FileUploadProps {
  onFileUpload: (files: File[]) => Promise<{ success: boolean; message: string; fileUrl?: string; fileId?: string }>;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  acceptedTypes?: string[];
  disabled?: boolean;
  className?: string;
}

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
  fileUrl?: string;
  fileId?: string;
}

const DEFAULT_ACCEPTED_TYPES = [
  'application/pdf',
  'application/xml',
  'text/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/gif',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function FileUpload({
  onFileUpload,
  maxFiles = 5,
  maxFileSize = MAX_FILE_SIZE,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  disabled = false,
  className = '',
}: FileUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return Image;
    if (file.type.includes('pdf')) return FileText;
    if (file.type.includes('xml')) return FileText;
    if (file.type.includes('sheet') || file.type.includes('excel')) return FileSpreadsheet;
    return FileText;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile = (file: File): { valid: boolean; message?: string } => {
    if (!acceptedTypes.includes(file.type)) {
      return {
        valid: false,
        message: `File type "${file.type}" is not supported. Supported types: PDF, XML, Excel, Images.`,
      };
    }

    if (file.size > maxFileSize) {
      return {
        valid: false,
        message: `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxFileSize)}).`,
      };
    }

    return { valid: true };
  };

  const updateProgress = useCallback(
    throttle((fileId: string, progress: number) => {
      setFiles(prev =>
        prev.map(f =>
          f.id === fileId ? { ...f, progress } : f
        )
      );
    }, 100),
    []
  );

  const handleFiles = useCallback(
    async (newFiles: FileList) => {
      const fileArray = Array.from(newFiles);
      
      if (files.length + fileArray.length > maxFiles) {
        alert(`Cannot upload more than ${maxFiles} files at once.`);
        return;
      }

      const validatedFiles: UploadFile[] = [];

      for (const file of fileArray) {
        const validation = validateFile(file);
        const uploadFile: UploadFile = {
          file,
          id: Math.random().toString(36).substr(2, 9),
          progress: 0,
          status: validation.valid ? 'pending' : 'error',
          message: validation.message,
        };
        validatedFiles.push(uploadFile);
      }

      setFiles(prev => [...prev, ...validatedFiles]);

      // Upload valid files
      for (const uploadFile of validatedFiles) {
        if (uploadFile.status === 'pending') {
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 0 } : f
            )
          );

          try {
            let processedFile = uploadFile.file;

            // Compress images if they're large
            if (uploadFile.file.type.startsWith('image/') && uploadFile.file.size > 2 * 1024 * 1024) {
              try {
                processedFile = await compressImage(uploadFile.file);
                console.log(`Image compressed from ${uploadFile.file.size} to ${processedFile.size} bytes`);
              } catch (compressionError) {
                console.warn('Image compression failed, using original file:', compressionError);
              }
            }

            // Simulate progress with throttled updates
            const progressInterval = setInterval(() => {
              setFiles(prev =>
                prev.map(f =>
                  f.id === uploadFile.id && f.progress < 90
                    ? { ...f, progress: Math.min(90, f.progress + Math.random() * 20) }
                    : f
                )
              );
            }, 200);

            const result = await onFileUpload([processedFile]);

            clearInterval(progressInterval);

            setFiles(prev =>
              prev.map(f =>
                f.id === uploadFile.id
                  ? {
                      ...f,
                      status: result.success ? 'success' : 'error',
                      progress: 100,
                      message: result.message,
                      fileUrl: result.fileUrl,
                      fileId: result.fileId,
                    }
                  : f
              )
            );
          } catch (error) {
            setFiles(prev =>
              prev.map(f =>
                f.id === uploadFile.id
                  ? {
                      ...f,
                      status: 'error' as const,
                      progress: 0,
                      message: error instanceof Error ? error.message : 'Upload failed',
                    }
                  : f
              )
            );
          }
        }
      }
    },
    [files.length, maxFiles, onFileUpload, maxFileSize, acceptedTypes, updateProgress]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      
      if (disabled) return;

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        handleFiles(droppedFiles);
      }
    },
    [disabled, handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        handleFiles(selectedFiles);
      }
      // Reset input value to allow uploading the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  const removeFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const openFileDialog = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const getStatusColor = (status: UploadFile['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'uploading':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Drop Zone */}
      <Card
        className={`
          border-2 border-dashed transition-colors cursor-pointer
          ${isDragOver && !disabled ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <Upload className={`h-12 w-12 mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
          <div className="mb-2">
            <p className="text-lg font-medium">
              {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="text-sm text-gray-500">or click to browse</p>
          </div>
          <div className="text-xs text-gray-400 space-y-1">
            <p>Supported: PDF, XML, Excel, Images</p>
            <p>Max file size: {formatFileSize(maxFileSize)}</p>
            <p>Max files: {maxFiles}</p>
          </div>
        </CardContent>
      </Card>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(',')}
        onChange={handleFileInput}
        className="hidden"
        disabled={disabled}
      />

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Uploaded Files</h4>
          {files.map((uploadFile) => {
            const FileIcon = getFileIcon(uploadFile.file);
            return (
              <Card key={uploadFile.id} className="p-4">
                <div className="flex items-center space-x-3">
                  <FileIcon className="h-8 w-8 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{uploadFile.file.name}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(uploadFile.id)}
                        className="flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <p className="text-xs text-gray-500">{formatFileSize(uploadFile.file.size)}</p>
                      <Badge className={getStatusColor(uploadFile.status)}>
                        {uploadFile.status === 'success' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {uploadFile.status === 'error' && <AlertCircle className="h-3 w-3 mr-1" />}
                        {uploadFile.status}
                      </Badge>
                    </div>
                    
                    {uploadFile.status === 'uploading' && (
                      <Progress value={uploadFile.progress} className="mt-2" />
                    )}
                    
                    {uploadFile.message && (
                      <p className={`text-xs mt-1 ${
                        uploadFile.status === 'error' ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {uploadFile.message}
                      </p>
                    )}
                    
                    {uploadFile.fileUrl && uploadFile.status === 'success' && (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto text-xs mt-1"
                        asChild
                      >
                        <a href={uploadFile.fileUrl} target="_blank" rel="noopener noreferrer">
                          View File
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}