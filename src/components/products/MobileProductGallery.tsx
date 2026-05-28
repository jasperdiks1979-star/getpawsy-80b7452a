import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fireImageInteraction } from "@/lib/funnelEvents";
import { getConversionFlag } from "@/lib/conversionFlags";

interface MobileProductGalleryProps {
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

export function MobileProductGallery({
  images,
  productName,
  category,
  discount,
  onImageClick,
  badge,
  className,
  productId,
}: MobileProductGalleryProps) {
  const keywordAlt = (idx: number) => {
    const base = productName;
    const suffix = category ? ` - ${category}` : '';
    return idx === 0 ? `${base}${suffix} | GetPawsy` : `${base}${suffix} - View ${idx + 1}`;
  };
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    dragFree: false,
    containScroll: "trimSnaps",
  });
  
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const thumbnailContainerRef = React.useRef<HTMLDivElement>(null);

  // Preload first 2 images on mount for instant gallery feel
  React.useEffect(() => {
    // CI-9: preload first 3 so the first swipe is instant on mobile.
    const preloadImages = images.slice(0, 3);
    preloadImages.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [images]);

  // Update selected index when carousel scrolls
  React.useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setSelectedIndex(idx);
      // Fire only on real user-driven swipes (skip first sync), additive-only.
      if (productId) {
        try {
          fireImageInteraction({
            product_id: productId,
            interaction: 'swipe',
            image_index: idx,
          });
        } catch {
          /* analytics must never break UX */
        }
      }
    };
    
    emblaApi.on("select", onSelect);
    // Initial sync — sync state only, do NOT fire an analytics event.
    setSelectedIndex(emblaApi.selectedScrollSnap());
    
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, productId]);

  // Auto-scroll thumbnail into view
  React.useEffect(() => {
    const container = thumbnailContainerRef.current;
    if (!container) return;
    
    const thumbnail = container.children[selectedIndex] as HTMLElement;
    if (thumbnail) {
      thumbnail.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedIndex]);

  const handleThumbnailClick = (index: number) => {
    if (emblaApi) {
      emblaApi.scrollTo(index);
    }
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

  const handleMainImageClick = () => {
    if (productId) {
      try {
        fireImageInteraction({
          product_id: productId,
          interaction: 'zoom',
          image_index: selectedIndex,
        });
      } catch {
        /* ignore */
      }
    }
    if (onImageClick) {
      onImageClick(selectedIndex);
    }
  };

  return (
    <div className={cn("w-full space-y-3", className)}>
      {/* Main Carousel Container */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-muted/50 to-muted shadow-soft">
        {/* Badge - top left */}
        {badge && (
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            {badge}
          </div>
        )}
        
        {/* Discount badge */}
        {discount && discount > 0 && !badge && (
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <Badge className="bg-accent text-accent-foreground font-semibold px-3 py-1.5 text-sm shadow-soft">
              -{discount}%
            </Badge>
          </div>
        )}

        {/* Zoom hint — CI-9 calmer text pill (premiumPdpV2) or original icon. */}
        <div className="absolute top-3 right-3 z-20 pointer-events-none">
          {getConversionFlag('premiumPdpV2') ? (
            <div className="bg-background/85 backdrop-blur-sm text-foreground/80 text-[10px] uppercase tracking-wider font-medium px-2.5 py-1 rounded-full shadow-soft">
              Tap to zoom
            </div>
          ) : (
            <div className="bg-background/80 backdrop-blur-sm text-foreground p-2 rounded-full shadow-soft">
              <ZoomInIcon />
            </div>
          )}
        </div>

        {/* Embla Carousel - Main swipe area */}
        <div 
          ref={emblaRef} 
          className="h-full w-full overflow-hidden"
          style={{ 
            touchAction: "pan-y",
            userSelect: "none",
          }}
        >
          <div className="flex h-full">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="flex-[0_0_100%] min-w-0 h-full relative cursor-pointer"
                onClick={handleMainImageClick}
              >
                {/* First image: eager load with high priority for LCP */}
                {idx === 0 ? (
                  <img
                    src={img}
                    alt={keywordAlt(idx)}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="w-full h-full object-contain p-2 pointer-events-none"
                  />
                ) : (
                  <OptimizedImage
                    src={img}
                    alt={keywordAlt(idx)}
                    className="object-contain pointer-events-none"
                    containerClassName="w-full h-full p-2"
                    priority={false}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dot Indicators - inside container, pointer-events: none */}
        {images.length > 1 && (
          <div 
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          >
            <div className="flex gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1.5">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-full transition-all duration-200",
                    selectedIndex === idx 
                      ? "w-5 h-2 bg-white" 
                      : "w-2 h-2 bg-white/50"
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      {images.length > 1 && (
        <div 
          ref={thumbnailContainerRef}
          className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide"
          style={{ 
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x",
          }}
        >
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleThumbnailClick(idx)}
              className={cn(
                "flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all duration-200",
                selectedIndex === idx 
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-background opacity-100" 
                  : "opacity-50 hover:opacity-80"
              )}
              style={{ touchAction: "manipulation" }}
            >
              <OptimizedImage
                src={img}
                alt={`${productName}${category ? ` ${category}` : ''} thumbnail ${idx + 1}`}
                aspectRatio="square"
                className="object-cover"
                priority={idx < 2}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline so we don't keep the unused import when v2 is on.
function ZoomInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}
