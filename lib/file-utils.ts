import { uploadInvoice, getFileMetadata, deleteFile } from './api';

export interface FileUploadResult {
  success: boolean;
  message: string;
  fileUrl?: string;
  fileId?: string;
}

export interface FileInfo {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadDate: string;
}

export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/xml',
  'text/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/jpeg',
  'image/png',
  'image/gif',
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILES_PER_UPLOAD = 5;

export function validateFileType(file: File): boolean {
  return ALLOWED_FILE_TYPES.includes(file.type as any);
}

export function validateFileSize(file: File, maxSize: number = MAX_FILE_SIZE): boolean {
  return file.size <= maxSize;
}

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getFileTypeLabel(mimeType: string): string {
  const typeMap: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/xml': 'XML',
    'text/xml': 'XML',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.ms-excel': 'Excel',
    'image/jpeg': 'JPEG',
    'image/jpg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
  };
  
  return typeMap[mimeType] || 'Unknown';
}

export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function isPdfFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export function isXmlFile(mimeType: string): boolean {
  return mimeType === 'application/xml' || mimeType === 'text/xml';
}

export function isExcelFile(mimeType: string): boolean {
  return mimeType.includes('sheet') || mimeType.includes('excel');
}

export function canPreviewInBrowser(mimeType: string): boolean {
  return isImageFile(mimeType) || isPdfFile(mimeType);
}

export function generateUniqueFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = getFileExtension(originalName);
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  
  return `${baseName}_${timestamp}_${random}.${extension}`;
}

export function sanitizeFileName(fileName: string): string {
  // Remove or replace dangerous characters
  return fileName
    .replace(/[<>:"/\\|?*]/g, '_') // Replace unsafe chars with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .toLowerCase();
}

export class FileUploadError extends Error {
  constructor(
    message: string,
    public code: 'FILE_TOO_LARGE' | 'INVALID_TYPE' | 'UPLOAD_FAILED' | 'NETWORK_ERROR' | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'FileUploadError';
  }
}

export async function uploadFileWithValidation(
  files: File[],
  options: {
    maxFileSize?: number;
    allowedTypes?: string[];
    onProgress?: (progress: number) => void;
  } = {}
): Promise<FileUploadResult> {
  const {
    maxFileSize = MAX_FILE_SIZE,
    allowedTypes = ALLOWED_FILE_TYPES,
    onProgress,
  } = options;

  if (files.length === 0) {
    throw new FileUploadError('No files selected', 'UPLOAD_FAILED');
  }

  const file = files[0]; // For now, handle single file uploads

  // Validate file type
  if (!allowedTypes.includes(file.type as any)) {
    throw new FileUploadError(
      `File type "${getFileTypeLabel(file.type as string)}" is not supported. Supported types: ${allowedTypes.map(type => getFileTypeLabel(type as string)).join(', ')}`,
      'INVALID_TYPE'
    );
  }

  // Validate file size
  if (file.size > maxFileSize) {
    throw new FileUploadError(
      `File size (${formatFileSize(file.size)}) exceeds maximum allowed size (${formatFileSize(maxFileSize)})`,
      'FILE_TOO_LARGE'
    );
  }

  try {
    // Simulate progress updates
    if (onProgress) {
      onProgress(0);
      const progressInterval = setInterval(() => {
        onProgress(Math.min(90, Math.random() * 80 + 10));
      }, 200);

      const result = await uploadInvoice(files);
      
      clearInterval(progressInterval);
      onProgress(100);
      
      return result;
    }

    return await uploadInvoice(files);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Network')) {
        throw new FileUploadError('Network error during upload. Please check your connection.', 'NETWORK_ERROR');
      }
      if (error.message.includes('size')) {
        throw new FileUploadError(error.message, 'FILE_TOO_LARGE');
      }
      if (error.message.includes('type')) {
        throw new FileUploadError(error.message, 'INVALID_TYPE');
      }
      throw new FileUploadError(error.message, 'UPLOAD_FAILED');
    }
    throw new FileUploadError('Unknown error during upload', 'UNKNOWN');
  }
}

export async function getFileInfo(fileId: string): Promise<FileInfo | null> {
  try {
    const metadata = await getFileMetadata(fileId);
    return {
      id: fileId,
      name: metadata.originalName,
      url: `https://f000.backblazeb2.com/file/bucket-name/invoices/${fileId}`, // This should come from backend
      type: metadata.contentType,
      size: metadata.fileSize,
      uploadDate: metadata.uploadDate,
    };
  } catch (error) {
    console.error('Error fetching file info:', error);
    return null;
  }
}

export async function deleteFileById(fileId: string): Promise<boolean> {
  try {
    const result = await deleteFile(fileId);
    return result.success;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

// File validation helpers for client-side validation
export function validateFiles(
  files: FileList | File[],
  options: {
    maxFiles?: number;
    maxFileSize?: number;
    allowedTypes?: string[];
  } = {}
): { valid: File[]; invalid: Array<{ file: File; reason: string }> } {
  const {
    maxFiles = MAX_FILES_PER_UPLOAD,
    maxFileSize = MAX_FILE_SIZE,
    allowedTypes = ALLOWED_FILE_TYPES,
  } = options;

  const fileArray = Array.from(files);
  const valid: File[] = [];
  const invalid: Array<{ file: File; reason: string }> = [];

  if (fileArray.length > maxFiles) {
    fileArray.slice(maxFiles).forEach(file => {
      invalid.push({ file, reason: `Exceeds maximum number of files (${maxFiles})` });
    });
  }

  fileArray.slice(0, maxFiles).forEach(file => {
    if (!allowedTypes.includes(file.type as any)) {
      invalid.push({
        file,
        reason: `File type "${getFileTypeLabel(file.type as string)}" not supported`,
      });
    } else if (file.size > maxFileSize) {
      invalid.push({
        file,
        reason: `File size (${formatFileSize(file.size)}) exceeds limit (${formatFileSize(maxFileSize)})`,
      });
    } else {
      valid.push(file);
    }
  });

  return { valid, invalid };
}