import React, { useState } from 'react';
import { FileText, Image, Download, ExternalLink, X, Eye } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './dialog';

interface FilePreviewProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  className?: string;
  showPreview?: boolean;
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return Image;
  return FileText;
};

const getFileTypeBadge = (fileType: string) => {
  if (fileType.includes('pdf')) return { label: 'PDF', color: 'bg-red-100 text-red-800' };
  if (fileType.includes('xml')) return { label: 'XML', color: 'bg-green-100 text-green-800' };
  if (fileType.includes('sheet') || fileType.includes('excel')) return { label: 'Excel', color: 'bg-blue-100 text-blue-800' };
  if (fileType.startsWith('image/')) return { label: 'Image', color: 'bg-purple-100 text-purple-800' };
  return { label: 'File', color: 'bg-gray-100 text-gray-800' };
};

export function FilePreview({
  fileUrl,
  fileName,
  fileType,
  fileSize,
  className = '',
  showPreview = true,
}: FilePreviewProps) {
  const [previewError, setPreviewError] = useState(false);
  const FileIcon = getFileIcon(fileType);
  const fileTypeBadge = getFileTypeBadge(fileType);

  const canPreviewInline = fileType.startsWith('image/') || fileType.includes('pdf');

  const renderPreviewContent = () => {
    if (previewError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <FileText className="h-16 w-16 mb-4" />
          <p>Preview not available</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            asChild
          >
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in new tab
            </a>
          </Button>
        </div>
      );
    }

    if (fileType.startsWith('image/')) {
      return (
        <img
          src={fileUrl}
          alt={fileName}
          className="max-w-full max-h-96 object-contain rounded-lg"
          onError={() => setPreviewError(true)}
        />
      );
    }

    if (fileType.includes('pdf')) {
      return (
        <iframe
          src={fileUrl}
          className="w-full h-96 rounded-lg border"
          title={fileName}
          onError={() => setPreviewError(true)}
        />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <FileIcon className="h-16 w-16 mb-4" />
        <p>Preview not available for this file type</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          asChild
        >
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in new tab
          </a>
        </Button>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileIcon className="h-8 w-8 text-gray-500" />
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm font-medium truncate">{fileName}</CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                <Badge className={fileTypeBadge.color}>{fileTypeBadge.label}</Badge>
                {fileSize && (
                  <span className="text-xs text-gray-500">
                    {formatFileSize(fileSize)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {showPreview && canPreviewInline && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
                  <DialogHeader>
                    <DialogTitle className="truncate">{fileName}</DialogTitle>
                  </DialogHeader>
                  <div className="mt-4">
                    {renderPreviewContent()}
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="outline" size="sm" asChild>
              <a href={fileUrl} download={fileName}>
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {showPreview && canPreviewInline && (
        <CardContent className="pt-0">
          <div className="rounded-lg overflow-hidden bg-gray-50">
            {renderPreviewContent()}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface FilePreviewListProps {
  files: Array<{
    id: string;
    url: string;
    name: string;
    type: string;
    size?: number;
  }>;
  onRemove?: (fileId: string) => void;
  className?: string;
}

export function FilePreviewList({ files, onRemove, className = '' }: FilePreviewListProps) {
  if (files.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <FileText className="h-12 w-12 mx-auto mb-4" />
        <p>No files uploaded yet</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {files.map((file) => (
        <div key={file.id} className="relative">
          <FilePreview
            fileUrl={file.url}
            fileName={file.name}
            fileType={file.type}
            fileSize={file.size}
            showPreview={false}
          />
          {onRemove && (
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => onRemove(file.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}