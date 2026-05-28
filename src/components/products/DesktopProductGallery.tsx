import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fireImageInteraction } from "@/lib/funnelEvents";

interface DesktopProductGalleryProps {
  images: string[];
  productName: string;
  category?: string;
  discount?: number;
  onImageClick?: (index: number) => void;
  badge?: React.ReactNode;
  className?: string;
  /** Optional — when provided, gallery swipe/zoom/thumbnail events are recorded. */
  productId?: string | null;
}

export function DesktopProductGallery({
  images,
  productName,
  category,
  discount,
  onImageClick,
  badge,
  className,
  productId,
}: DesktopProductGalleryProps) {
  const keywordAlt = (idx: number) => {
    const base = productName;
    const suffix = category ? ` - ${category}` : '';
    return idx === 0 ? `${base}${suffix} | GetPawsy` : `${base}${suffix} - View ${idx + 1}`;
  };
  const [selectedImage, setSelectedImage] = React.useState(0);
  const [direction, setDirection] = React.useState(0);
  const [isHovering, setIsHovering] = React.useState(false);
  const [zoomPosition, setZoomPosition] = React.useState({ x: 50, y: 50 });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const imageContainerRef = React.useRef<HTMLDivElement>(null);
  const thumbnailRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Preload first 2 images on mount
  React.useEffect(() => {
    const preloadImages = images.slice(0, 2);
    preloadImages.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [images]);

  const handlePrevImage = React.useCallback(() => {
    setDirection(-1);
    setSelectedImage((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    if (productId) {
      try {
        fireImageInteraction({ product_id: productId, interaction: 'swipe' });
      } catch {
        /* ignore */
      }
    }
  }, [images.length, productId]);

  const handleNextImage = React.useCallback(() => {
    setDirection(1);
    setSelectedImage((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    if (productId) {
      try {
        fireImageInteraction({ product_id: productId, interaction: 'swipe' });
      } catch {
        /* ignore */
      }
    }
  }, [images.length, productId]);

  const handleThumbnailClick = (index: number) => {
    setDirection(index > selectedImage ? 1 : -1);
    setSelectedImage(index);
    if (productId) {
      try {
        fireImageInteraction({
          product_id: productId,
          interaction: 'thumbnail',
          image_index: index,
        });
      } catch {
        /* ignore */
      }
    }
  };

  // Hover zoom handlers - desktop only
  const handleMouseEnter = () => {
    // Only enable zoom on desktop (≥1024px) and non-touch devices
    if (window.innerWidth >= 1024 && !('ontouchstart' in window)) {
      setIsHovering(true);
      if (productId) {
        try {
          fireImageInteraction({
            product_id: productId,
            interaction: 'zoom',
            image_index: selectedImage,
          });
        } catch {
          /* ignore */
        }
      }
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setZoomPosition({ x: 50, y: 50 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHovering || !imageContainerRef.current) return;

    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    setZoomPosition({ x, y });
  };

  // Keyboard navigation (← → arrows)
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!container.contains(document.activeElement) && document.activeElement !== container) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevImage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextImage();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handlePrevImage, handleNextImage]);

  // Mouse wheel navigation
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || images.length <= 1) return;

    let wheelTimeout: NodeJS.Timeout;
    let lastWheelTime = 0;
    const WHEEL_DEBOUNCE = 150;

    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();
      if (now - lastWheelTime < WHEEL_DEBOUNCE) return;

      const isHorizontalScroll = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const delta = isHorizontalScroll ? e.deltaX : e.deltaY;

      if (Math.abs(delta) > 20) {
        e.preventDefault();
        lastWheelTime = now;

        clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
          if (delta > 0) {
            handleNextImage();
          } else {
            handlePrevImage();
          }
        }, 10);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      clearTimeout(wheelTimeout);
    };
  }, [handlePrevImage, handleNextImage, images.length]);

  // Auto-scroll thumbnail into view
  React.useEffect(() => {
    const thumbnail = thumbnailRefs.current[selectedImage];
    if (thumbnail) {
      thumbnail.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedImage]);

  const handleMainImageClick = () => {
    if (productId) {
      try {
        fireImageInteraction({
          product_id: productId,
          interaction: 'click',
          image_index: selectedImage,
        });
      } catch {
        /* ignore */
      }
    }
    if (onImageClick) {
      onImageClick(selectedImage);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("space-y-4 outline-none", className)}
      tabIndex={0}
      role="region"
      aria-label="Product image gallery"
    >
      {/* Main Image Container */}
      <div 
        ref={imageContainerRef}
        className="relative w-full aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-muted/50 to-muted shadow-soft group"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {/* Badge - top left */}
        {badge && (
          <div className="absolute top-4 left-4 z-20 pointer-events-none">
            {badge}
          </div>
        )}

        {/* Discount badge */}
        {discount && discount > 0 && !badge && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-4 left-4 z-20"
          >
            <Badge className="bg-accent text-accent-foreground font-semibold px-3 py-1.5 text-sm shadow-soft">
              -{discount}%
            </Badge>
          </motion.div>
        )}

        {/* Zoom indicator - top right */}
        <motion.div
          className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm text-foreground p-2.5 rounded-full shadow-soft z-20 flex cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          transition={{ delay: 0.3 }}
          onClick={handleMainImageClick}
        >
          <ZoomIn className="w-5 h-5" />
        </motion.div>

        {/* Main Image with Animation and Hover Zoom */}
        <div
          className={cn(
            "absolute inset-0",
            isHovering ? "cursor-crosshair" : "cursor-zoom-in"
          )}
          onClick={!isHovering ? handleMainImageClick : undefined}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selectedImage}
              className="absolute inset-0"
              initial={{ opacity: 0, x: direction > 0 ? 100 : -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -100 : 100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Normal image - hidden when zooming */}
              <div className={cn(
                "absolute inset-0 transition-opacity duration-200",
                isHovering ? "opacity-0" : "opacity-100"
              )}>
                <OptimizedImage
                  src={images[selectedImage]}
                  alt={keywordAlt(selectedImage)}
                  className="object-contain pointer-events-none"
                  containerClassName="w-full h-full"
                  priority={selectedImage < 2}
                />
              </div>

              {/* Zoomed image - visible on hover, pan follows cursor */}
              {isHovering && (
                <div 
                  className="absolute inset-0 overflow-hidden"
                  onClick={handleMainImageClick}
                >
                  <img
                    src={images[selectedImage]}
                    alt={`${productName}${category ? ` ${category}` : ''} - Zoomed view`}
                    className="absolute w-[200%] h-[200%] max-w-none pointer-events-none object-contain"
                    style={{
                      left: `${50 - zoomPosition.x}%`,
                      top: `${50 - zoomPosition.y}%`,
                      transform: 'translate(-25%, -25%)',
                    }}
                    draggable={false}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Arrows - visible on hover */}
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full shadow-lg bg-background/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-background active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                handlePrevImage();
              }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full shadow-lg bg-background/95 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-background active:scale-95"
              onClick={(e) => {
                e.stopPropagation();
                handleNextImage();
              }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Clickable Image Counter - Opens Lightbox */}
        {images.length > 1 && (
          <button
            type="button"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm text-foreground text-sm px-4 py-1.5 rounded-full shadow-soft font-medium z-20 flex items-center gap-2 hover:bg-background transition-colors cursor-pointer"
            aria-label="Open fullscreen image viewer"
            onClick={(e) => {
              e.stopPropagation();
              if (onImageClick) {
                onImageClick(selectedImage);
              }
            }}
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>{selectedImage + 1} / {images.length}</span>
          </button>
        )}
      </div>

      {/* Thumbnail Strip */}
      {images.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative flex items-center gap-3"
        >
          <Button
            variant="outline"
            size="icon"
            className="flex-shrink-0 h-10 w-10 rounded-full border-2"
            onClick={handlePrevImage}
            aria-label="Previous image"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 overflow-hidden relative">
            {/* Gradient overlays */}
            <div className="absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

            <div
              className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory px-2"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {images.map((img, idx) => (
                <motion.button
                  key={idx}
                  ref={(el) => {
                    thumbnailRefs.current[idx] = el;
                  }}
                  onClick={() => handleThumbnailClick(idx)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden transition-all duration-200 snap-start",
                    selectedImage === idx
                      ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-soft"
                      : "opacity-60 hover:opacity-100"
                  )}
                  aria-label={`View image ${idx + 1}`}
                  aria-pressed={selectedImage === idx}
                >
                  {/* Priority load first 2 thumbnails, lazy load rest */}
                  <OptimizedImage
                    src={img}
                    alt={`${productName}${category ? ` ${category}` : ''} thumbnail ${idx + 1}`}
                    aspectRatio="square"
                    className="object-cover"
                    priority={idx < 2}
                  />
                </motion.button>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="flex-shrink-0 h-10 w-10 rounded-full border-2"
            onClick={handleNextImage}
            aria-label="Next image"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
