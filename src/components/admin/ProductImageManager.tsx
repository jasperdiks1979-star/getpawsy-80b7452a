import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, GripVertical, Image as ImageIcon, Upload, Loader2 } from "lucide-react";
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Product Images ({images.length})</label>
      </div>

      {/* Add new image */}
      <div className="flex gap-2">
        <Input
          placeholder="Enter image URL..."
          value={newImageUrl}
          onChange={(e) => setNewImageUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddImage())}
        />
        <Button type="button" variant="outline" onClick={handleAddImage}>
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
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
        Drag images to reorder. The main image is used as the primary product image.
      </p>
    </div>
  );
};
