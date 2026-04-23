import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Plus,
  GripVertical,
  Image as ImageIcon,
  Upload,
  Loader2,
  FolderUp,
  Check,
  Trash2,
  AlertCircle,
  FileWarning,
  WifiOff,
  ServerCrash,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
//
// Errors are categorized so the tile can render the right icon + an
// actionable message that always names the FILE and the LIMIT it broke.
// "rejected" = failed pre-upload validation (size / mime).
// "failed"   = upload itself errored (network / storage / duplicate).
type PendingErrorKind =
  | "size"        // > 20 MB
  | "mime"        // not in PRODUCT_IMAGE_ALLOWED_MIME
  | "network"     // fetch failed / offline
  | "server"      // 5xx / unknown storage error
  | "duplicate"   // already exists in storage (upsert: false)
  | "size-server" // bucket-level 413 (defense-in-depth)
  | "unknown";

interface PendingError {
  kind: PendingErrorKind;
  /** Headline shown next to the icon (e.g. "Too large"). */
  title: string;
  /** One-sentence explanation including the filename and expected limit. */
  detail: string;
  /** Raw underlying error message, for the tooltip / "show details". */
  raw?: string;
}

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
  /** "ok" = uploadable, "rejected" = blocked pre-upload, "failed" = upload attempt errored. */
  status: "ok" | "rejected" | "failed";
  error?: PendingError;
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
  // Slot the dragged image will land in if dropped right now. Decoupled
  // from `draggedIndex` so we can render a "drop here" indicator without
  // mutating the array on every dragOver tick.
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
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
  // Files picked/dropped by the user that are waiting in the preview tray.
  // They are NOT uploaded until the user clicks "Upload N image(s)".
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  // Index of the image the user clicked "remove" on. The actual deletion
  // only runs after they confirm in the AlertDialog — so a single misclick
  // on a 12-image gallery can't silently destroy the wrong tile.
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  // Revoke object URLs on unmount so blob: URLs don't leak.
  useEffect(() => {
    return () => {
      pendingFiles.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Two-step delete: clicking the X opens the confirmation dialog. The
  // actual mutation happens in `confirmRemoveImage` once the user accepts.
  const requestRemoveImage = (index: number) => {
    setPendingDeleteIndex(index);
  };

  const confirmRemoveImage = () => {
    if (pendingDeleteIndex === null) return;
    const index = pendingDeleteIndex;
    const imageToRemove = images[index];
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);

    // If we're removing the main image, set a new main image
    if (imageToRemove === mainImage && newImages.length > 0) {
      onMainImageChange(newImages[0]);
    }

    setPendingDeleteIndex(null);
    toast.success("Image removed");
  };

  const handleSetAsMain = (imageUrl: string) => {
    onMainImageChange(imageUrl);
    toast.success("Main image updated");
  };

  // Tile drag-and-drop reordering.
  //
  // We commit the reorder ONCE, on `drop`, instead of mutating the array on
  // every `dragOver` tick. That keeps the gallery stable while the cursor
  // moves and avoids spamming the parent's `onChange` (which is what gets
  // persisted). A separate `dragOverIndex` state drives the visual
  // "insert here" indicator so the user can see exactly where the tile
  // will land before they let go.
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    // Required for Firefox to actually start the drag.
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", String(index));
    } catch {
      // Some browsers throw when setData is called outside a user gesture
      // chain — safe to ignore, the React state above is the source of truth.
    }
  };

  const handleTileDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    // Only react to in-grid tile drags, not file drags from the OS — those
    // belong to the bulk-upload zone.
    if (draggedIndex === null) return;
    if (e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleTileDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (draggedIndex === null) return;
    if (e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    if (draggedIndex !== index) {
      const newImages = [...images];
      const [moved] = newImages.splice(draggedIndex, 1);
      newImages.splice(index, 0, moved);
      onChange(newImages);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
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

  // Stage 1 of the upload pipeline. Files picked or dropped by the user are
  // validated against the same 20 MB-per-file + MIME contract used by the
  // storage bucket, then added to the preview tray with a real thumbnail
  // (object URL). NOTHING is uploaded until the user clicks "Upload" in
  // the tray. Rejected files are still shown — greyed out, with their
  // reason — so the user can SEE what was skipped instead of guessing.
  const queuePreview = (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;

    const next: PendingFile[] = [];
    let okCount = 0;
    let rejectedCount = 0;
    for (const file of rawFiles) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      let status: PendingFile["status"] = "ok";
      let reason: string | undefined;

      if (!PRODUCT_IMAGE_ALLOWED_MIME.includes(file.type as typeof PRODUCT_IMAGE_ALLOWED_MIME[number])) {
        status = "rejected";
        reason = `unsupported format (${file.type || "unknown"})`;
      } else if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        status = "rejected";
        reason = `${formatBytes(file.size)} > ${PRODUCT_IMAGE_MAX_LABEL} per-file limit`;
      }

      // Object URL is safe to create even for rejected files — it just lets
      // the user see what they tried to upload. We revoke on remove/upload.
      const previewUrl = URL.createObjectURL(file);
      next.push({ id, file, previewUrl, status, reason });
      if (status === "ok") okCount++;
      else rejectedCount++;
    }

    setPendingFiles((prev) => [...prev, ...next]);

    if (rejectedCount > 0) {
      toast.warning(
        `${rejectedCount} file${rejectedCount === 1 ? "" : "s"} can't be uploaded — see preview for details`,
      );
    }
    if (okCount > 0) {
      toast.success(
        `${okCount} image${okCount === 1 ? "" : "s"} ready — review thumbnails and click Upload`,
      );
    }
  };

  const removePending = (id: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearPending = () => {
    setPendingFiles((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
  };

  // Stage 2 of the upload pipeline. Uploads only the files that passed
  // validation in the preview tray; rejected files are dropped silently
  // (the user already saw their reason in the tray).
  const confirmUpload = async () => {
    const accepted = pendingFiles.filter((p) => p.status === "ok");
    if (accepted.length === 0) {
      toast.error("No valid files to upload");
      return;
    }

    setIsUploading(true);
    setUploadProgress({ done: 0, total: accepted.length });
    try {
      const uploadedUrls: string[] = [];
      const failed: { name: string; reason: string }[] = [];
      for (let i = 0; i < accepted.length; i++) {
        const { file } = accepted[i];
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

      // Clear the tray after a successful (or partially-successful) upload.
      // Rejected files leave the tray too — they were never going to upload.
      clearPending();
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Always reset the input so picking the same file again re-fires onChange.
    e.target.value = "";
    queuePreview(files);
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
    queuePreview(files);
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

      {/* Pre-upload preview tray. Renders thumbnails for every file the
          user picked (or dropped) so they can verify the SELECTION before
          anything hits storage. Rejected files are shown greyed-out with
          their reason instead of being silently dropped. */}
      {pendingFiles.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">
                {pendingFiles.length} file{pendingFiles.length === 1 ? "" : "s"} selected
              </span>
              {pendingFiles.some((p) => p.status === "rejected") && (
                <span className="ml-2 text-xs text-destructive">
                  · {pendingFiles.filter((p) => p.status === "rejected").length} will be skipped
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPending}
                disabled={isUploading}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={confirmUpload}
                disabled={isUploading || pendingFiles.every((p) => p.status === "rejected")}
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                {isUploading && uploadProgress
                  ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
                  : `Upload ${pendingFiles.filter((p) => p.status === "ok").length} image${
                      pendingFiles.filter((p) => p.status === "ok").length === 1 ? "" : "s"
                    }`}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {pendingFiles.map((p) => {
              const isRejected = p.status === "rejected";
              return (
                <div
                  key={p.id}
                  className={`relative group rounded-md border overflow-hidden bg-background ${
                    isRejected ? "border-destructive/60" : "border-border"
                  }`}
                  title={isRejected ? `${p.file.name} — ${p.reason}` : p.file.name}
                >
                  <img
                    src={p.previewUrl}
                    alt={`Preview of ${p.file.name}`}
                    className={`w-full aspect-square object-cover ${isRejected ? "opacity-40 grayscale" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => removePending(p.id)}
                    disabled={isUploading}
                    aria-label={`Remove ${p.file.name} from selection`}
                    className="absolute top-1 right-1 bg-background/90 hover:bg-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-0 inset-x-0 bg-background/95 px-1.5 py-1">
                    <p className="text-[10px] font-medium truncate" title={p.file.name}>
                      {p.file.name}
                    </p>
                    <p
                      className={`text-[10px] truncate ${
                        isRejected ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {isRejected ? p.reason : formatBytes(p.file.size)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((imageUrl, index) => {
            const isMain = imageUrl === mainImage;
            return (
              <div
                key={`${imageUrl}-${index}`}
                className={`relative group rounded-lg border-2 overflow-hidden transition-all ${
                  isMain ? "border-primary" : "border-border"
                } ${draggedIndex === index ? "opacity-40 scale-95" : ""} ${
                  dragOverIndex === index && draggedIndex !== null && draggedIndex !== index
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : ""
                }`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleTileDragOver(e, index)}
                onDrop={(e) => handleTileDrop(e, index)}
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
                    onClick={() => requestRemoveImage(index)}
                    aria-label={`Remove image ${index + 1}`}
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

      {/* Confirmation dialog for image removal. We render a thumbnail of
          the exact image being deleted (and call out when it's the main
          image) so the user can sanity-check what they're about to lose. */}
      <AlertDialog
        open={pendingDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this image?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the image from the product. The file itself stays in
              storage, but the product will no longer reference it.
              {pendingDeleteIndex !== null &&
                images[pendingDeleteIndex] === mainImage && (
                  <span className="mt-2 block font-medium text-destructive">
                    This is the current main image — the next image in the
                    gallery will become the new main.
                  </span>
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDeleteIndex !== null && images[pendingDeleteIndex] && (
            <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
              <img
                src={images[pendingDeleteIndex]}
                alt={`Image ${pendingDeleteIndex + 1} preview`}
                className="w-16 h-16 object-cover rounded"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
              <div className="min-w-0 text-sm">
                <p className="font-medium">Image {pendingDeleteIndex + 1} of {images.length}</p>
                <p className="text-xs text-muted-foreground truncate" title={images[pendingDeleteIndex]}>
                  {images[pendingDeleteIndex]}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveImage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove image
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
