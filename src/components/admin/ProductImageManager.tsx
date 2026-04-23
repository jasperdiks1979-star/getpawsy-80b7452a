import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, GripVertical, Image as ImageIcon, Upload, Loader2, FolderUp, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// -----------------------------------------------------------------------------
// File upload limits — kept in sync with the `product-images` storage bucket.
// The bucket itself enforces these as a hard ceiling (file_size_limit +
// allowed_mime_types), so even if a client bypasses the checks below the
// upload still fails server-side. We mirror them here to give the user fast,
// friendly feedback BEFORE a 20 MB upload starts.
// -----------------------------------------------------------------------------
export const PRODUCT_IMAGE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const PRODUCT_IMAGE_MAX_LABEL = "20 MB";
export const PRODUCT_IMAGE_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;
const ACCEPT_ATTR = PRODUCT_IMAGE_ALLOWED_MIME.join(",");

// A file selected by the user but NOT yet uploaded. We hold an object URL
// so we can render a real thumbnail in the preview tray; revoking it on
// removal/unmount prevents the browser from leaking blob memory.
interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
  status: "ok" | "rejected";
  reason?: string;
}

interface ProductImageManagerProps {
  images: string[];
  onChange: (images: string[]) => void;
  mainImage: string;
  onMainImageChange: (url: string) => void;
}

export const ProductImageManager = ({
  images,
  onChange,
  mainImage,
  onMainImageChange,
}: ProductImageManagerProps) => {
  const [newImageUrl, setNewImageUrl] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Bulk-upload progress: rendered into the upload buttons + drop zone so
  // the user can see "image 3 / 12 uploading" instead of an opaque spinner.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  // Visual highlight for the bulk drag-and-drop target. Tracked separately
  // from `draggedIndex` (which is for in-grid reordering) so dropping a
  // file onto the zone never accidentally triggers a reorder.
  const [isDropTarget, setIsDropTarget] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddImage = () => {
    if (!newImageUrl.trim()) {
      toast.error("Please enter an image URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(newImageUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    if (images.includes(newImageUrl)) {
      toast.error("This image is already added");
      return;
    }

    onChange([...images, newImageUrl]);
    setNewImageUrl("");
    toast.success("Image added");
  };

  const handleRemoveImage = (index: number) => {
    const imageToRemove = images[index];
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);

    // If we're removing the main image, set a new main image
    if (imageToRemove === mainImage && newImages.length > 0) {
      onMainImageChange(newImages[0]);
    }

    toast.success("Image removed");
  };

  const handleSetAsMain = (imageUrl: string) => {
    onMainImageChange(imageUrl);
    toast.success("Main image updated");
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newImages = [...images];
    const draggedImage = newImages[draggedIndex];
    newImages.splice(draggedIndex, 1);
    newImages.splice(index, 0, draggedImage);
    onChange(newImages);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // ---------------------------------------------------------------------------
  // File upload
  //
  // Validation order matches the storage bucket's contract so the user gets
  // the most helpful error first:
  //   1. MIME type — must be one of PRODUCT_IMAGE_ALLOWED_MIME
  //   2. Size     — must be ≤ PRODUCT_IMAGE_MAX_BYTES (20 MB)
  // The bucket enforces both server-side as a defense-in-depth layer.
  // ---------------------------------------------------------------------------
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const handleFilePick = () => {
    fileInputRef.current?.click();
  };

  const handleBulkPick = () => {
    bulkInputRef.current?.click();
  };

  // Shared upload pipeline used by:
  //   1. The single/few-file "Upload" button (file picker)
  //   2. The dedicated "Bulk upload" button (file picker, semantic alias)
  //   3. The drop zone (drag-and-drop, possibly dozens of files)
  // All three paths run the SAME pre-flight validation and the SAME
  // sequential per-file upload, so the 20 MB-per-file limit is enforced
  // identically regardless of how the files entered the component.
  const uploadFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;

    // Pre-flight: validate EVERY file first and collect *all* problems so
    // the user gets one consolidated report instead of N stop-the-world
    // toasts. Bulk uploads commonly include a stray screenshot or a HEIC
    // from a phone — we want to skip those and still upload the rest.
    const accepted: File[] = [];
    const rejected: { file: File; reason: string }[] = [];
    for (const file of rawFiles) {
      if (!PRODUCT_IMAGE_ALLOWED_MIME.includes(file.type as typeof PRODUCT_IMAGE_ALLOWED_MIME[number])) {
        rejected.push({
          file,
          reason: `unsupported format (${file.type || "unknown"})`,
        });
        continue;
      }
      if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        rejected.push({
          file,
          reason: `${formatBytes(file.size)} > ${PRODUCT_IMAGE_MAX_LABEL} per-file limit`,
        });
        continue;
      }
      accepted.push(file);
    }

    if (rejected.length > 0) {
      // Show up to 3 individual reasons, then a count of the rest, so a
      // user dragging in 30 mixed files isn't drowned in toasts.
      const preview = rejected.slice(0, 3)
        .map((r) => `"${r.file.name}" — ${r.reason}`)
        .join("; ");
      const overflow = rejected.length > 3 ? ` and ${rejected.length - 3} more` : "";
      toast.error(
        `Skipped ${rejected.length} file${rejected.length === 1 ? "" : "s"}: ${preview}${overflow}`,
      );
    }

    if (accepted.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ done: 0, total: accepted.length });
    try {
      const uploadedUrls: string[] = [];
      const failed: { name: string; reason: string }[] = [];
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        // Build a collision-resistant path: timestamp + random suffix + ext.
        const ext = file.name.includes(".")
          ? file.name.split(".").pop()!.toLowerCase()
          : "bin";
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(key, file, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          // Storage returns "Payload too large" (413) when bucket-level
          // file_size_limit kicks in — surface a friendlier message.
          const msg = /payload too large|exceeded the maximum/i.test(uploadError.message)
            ? `exceeds the ${PRODUCT_IMAGE_MAX_LABEL} server limit`
            : uploadError.message;
          failed.push({ name: file.name, reason: msg });
        } else {
          const { data: pub } = supabase.storage
            .from("product-images")
            .getPublicUrl(key);
          uploadedUrls.push(pub.publicUrl);
        }

        setUploadProgress({ done: i + 1, total: accepted.length });
      }

      if (uploadedUrls.length > 0) {
        // De-dupe against existing images so an accidental re-upload doesn't
        // create a duplicate tile in the gallery.
        const merged = [...images];
        for (const url of uploadedUrls) {
          if (!merged.includes(url)) merged.push(url);
        }
        onChange(merged);
        toast.success(
          `Uploaded ${uploadedUrls.length} image${uploadedUrls.length === 1 ? "" : "s"}` +
            (failed.length > 0 ? ` (${failed.length} failed)` : ""),
        );
      }

      if (failed.length > 0) {
        const preview = failed.slice(0, 3)
          .map((f) => `"${f.name}" — ${f.reason}`)
          .join("; ");
        const overflow = failed.length > 3 ? ` and ${failed.length - 3} more` : "";
        toast.error(`Failed to upload ${failed.length}: ${preview}${overflow}`);
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Always reset the input so picking the same file again re-fires onChange.
    e.target.value = "";
    await uploadFiles(files);
  };

  // Drag-and-drop on the bulk zone. We intentionally do NOT mix this with
  // the in-grid reordering DnD: the zone is a separate target so a user
  // dropping files never reorders existing images by accident, and a user
  // dragging an existing image never uploads it as a new file.
  const handleZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Only treat this as a file drag if the OS is actually carrying files;
    // otherwise we'd light up the zone whenever the user reorders a tile.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDropTarget) setIsDropTarget(true);
  };

  const handleZoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only clear when the cursor actually leaves the zone, not when it
    // crosses into a child element.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDropTarget(false);
  };

  const handleZoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setIsDropTarget(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    await uploadFiles(files);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Product Images ({images.length})</label>
        <span className="text-xs text-muted-foreground">
          Max {PRODUCT_IMAGE_MAX_LABEL} per file · JPEG, PNG, WebP, GIF, AVIF
        </span>
      </div>

      {/* Add new image — by URL or by file upload */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Enter image URL..."
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddImage())}
            disabled={isUploading}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddImage}
            disabled={isUploading}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleFilePick}
            disabled={isUploading}
            aria-label={`Upload image files, maximum ${PRODUCT_IMAGE_MAX_LABEL} each`}
            title={`Maximum file size: ${PRODUCT_IMAGE_MAX_LABEL}`}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1" />
            )}
            {isUploading && uploadProgress
              ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
              : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Bulk upload zone — drag a folder/multi-select onto this target,
            or click "Bulk upload" to open the OS picker pre-set to multi.
            Both paths run the same 20 MB-per-file pre-flight + sequential
            upload as the single-file button above. */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleBulkPick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleBulkPick();
            }
          }}
          onDragOver={handleZoneDragOver}
          onDragLeave={handleZoneDragLeave}
          onDrop={handleZoneDrop}
          aria-label={`Bulk upload product images, maximum ${PRODUCT_IMAGE_MAX_LABEL} each`}
          aria-disabled={isUploading}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isDropTarget
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
          } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
        >
          {isUploading && uploadProgress ? (
            <>
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-sm font-medium">
                Uploading {uploadProgress.done} of {uploadProgress.total}…
              </p>
              <p className="text-xs text-muted-foreground">
                Each file is checked against the {PRODUCT_IMAGE_MAX_LABEL} limit before upload.
              </p>
            </>
          ) : (
            <>
              <FolderUp className="w-6 h-6 text-muted-foreground" />
              <p className="text-sm font-medium">
                Bulk upload — drop images here or click to select multiple
              </p>
              <p className="text-xs text-muted-foreground">
                Up to {PRODUCT_IMAGE_MAX_LABEL} per file · JPEG, PNG, WebP, GIF, AVIF · oversized files are skipped automatically
              </p>
            </>
          )}
          <input
            ref={bulkInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Image grid */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((imageUrl, index) => {
            const isMain = imageUrl === mainImage;
            return (
              <div
                key={`${imageUrl}-${index}`}
                className={`relative group rounded-lg border-2 overflow-hidden ${
                  isMain ? "border-primary" : "border-border"
                } ${draggedIndex === index ? "opacity-50" : ""}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                <img
                  src={imageUrl}
                  alt={`Product image ${index + 1}`}
                  className="w-full aspect-square object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/placeholder.svg";
                  }}
                />

                {/* Overlay with actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRemoveImage(index)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Drag handle */}
                <div className="absolute top-1 left-1 bg-background/80 rounded p-1 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3 h-3 text-muted-foreground" />
                </div>

                {/* Main badge or set as main button */}
                {isMain ? (
                  <div className="absolute bottom-1 left-1 right-1 bg-primary text-primary-foreground text-xs text-center py-1 rounded">
                    Main Image
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetAsMain(imageUrl)}
                    className="absolute bottom-1 left-1 right-1 bg-background/90 text-foreground text-xs text-center py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                  >
                    Set as Main
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
          <ImageIcon className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No images yet. Add image URLs above.</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Drag images to reorder. The main image is used as the primary product
        image. Uploaded files must be {PRODUCT_IMAGE_MAX_LABEL} or smaller —
        oversized files are blocked before the upload starts.
      </p>
    </div>
  );
};
