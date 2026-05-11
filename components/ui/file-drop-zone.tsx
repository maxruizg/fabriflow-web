import * as React from "react";
import { cn } from "~/lib/utils";
import { Dropzone } from "~/components/ui/dropzone";
import { Icon, type IconName } from "~/components/ui/icon";

export interface FileDropZoneProps {
  /** Label shown above the dropzone */
  label: string;
  /** Name attribute for the file input (required for form submission) */
  name: string;
  /** File types accepted (e.g., ".pdf", ".xml") */
  accept: string;
  /** Maximum file size in bytes */
  maxSize: number;
  /** Whether the file is required */
  required?: boolean;
  /** Icon to display */
  icon?: IconName;
  /** Hint text */
  hint?: string;
  /** Currently selected file */
  file: File | null;
  /** Callback when file is selected */
  onFileSelect: (file: File | null) => void;
  /** Validation error message */
  error?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /**
   * How to render the selected file. Defaults to the generic file row.
   * Use `"image"` for an inline thumbnail (PNG / JPEG logos).
   */
  previewKind?: "file" | "image";
}

/**
 * File drop zone component for single file upload with validation.
 * Extends the Dropzone component with file handling capabilities.
 */
export function FileDropZone({
  label,
  name,
  accept,
  maxSize,
  required = false,
  icon = "file",
  hint,
  file,
  onFileSelect,
  error,
  disabled = false,
  previewKind = "file",
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Object URL for image previews — revoked when the file changes or the
  // component unmounts to avoid leaking blobs in memory.
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (previewKind !== "image" || !file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, previewKind]);

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle file selection
  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) {
      onFileSelect(null);
      return;
    }

    // Validate file type
    const fileExtension = `.${selectedFile.name.split(".").pop()}`;
    const acceptedTypes = accept.split(",").map((t) => t.trim());
    if (!acceptedTypes.includes(fileExtension)) {
      onFileSelect(null);
      return;
    }

    // Validate file size
    if (selectedFile.size > maxSize) {
      onFileSelect(null);
      return;
    }

    onFileSelect(selectedFile);
  };

  // Handle file input change
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    handleFileChange(selectedFile);
  };

  // Handle drag events
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const droppedFile = e.dataTransfer.files?.[0] || null;
    handleFileChange(droppedFile);
  };

  // Handle click to open file picker
  const onClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  // Remove file
  const onRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {/* Label */}
      <label className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Dropzone or File Preview */}
      <div
        className={cn(
          "relative",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClick}
      >
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={accept}
          onChange={onInputChange}
          className="sr-only"
          disabled={disabled}
          required={required}
        />

        {!file ? (
          /* Empty dropzone */
          <Dropzone
            title={hint || `Arrastra un archivo ${accept} o haz clic`}
            hint={`Máximo ${formatFileSize(maxSize)}`}
            icon={icon}
            active={isDragging}
            as="button"
            className={cn(
              "w-full cursor-pointer hover:border-clay-hover transition-colors",
              error && "border-red-500",
              disabled && "cursor-not-allowed"
            )}
          />
        ) : (
          /* File preview — generic row or inline image thumbnail */
          <div
            className={cn(
              "ff-dropzone flex items-center justify-between gap-3 p-4",
              "border-2 border-dashed rounded-lg transition-colors",
              isDragging && "border-clay",
              error && "border-red-500",
              !error && "border-ink-4"
            )}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {previewKind === "image" && previewUrl ? (
                <span className="flex-shrink-0 grid h-14 w-14 place-items-center rounded-md border border-line bg-paper">
                  <img
                    src={previewUrl}
                    alt={`Vista previa de ${file.name}`}
                    className="max-h-12 max-w-12 object-contain"
                  />
                </span>
              ) : (
                <Icon name="file" size={20} className="text-ink-3 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">
                  {file.name}
                </div>
                <div className="text-xs text-ink-3">
                  {formatFileSize(file.size)}
                </div>
              </div>
            </div>
            {!disabled && (
              <button
                onClick={onRemove}
                type="button"
                className="flex-shrink-0 p-1 hover:bg-ink-5 rounded transition-colors"
                aria-label="Remover archivo"
              >
                <Icon name="x" size={16} className="text-ink-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-600">
          <Icon name="warn" size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
