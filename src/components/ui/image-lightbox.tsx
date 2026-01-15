import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  alt?: string;
}

export const ImageLightbox = ({ 
  images, 
  initialIndex, 
  isOpen, 
  onClose, 
  alt = 'Product image' 
}: ImageLightboxProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  const minSwipeDistance = 50;

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setIsZoomed(false);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, initialIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case ' ':
          e.preventDefault();
          setIsZoomed(z => !z);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1);
    setIsZoomed(false);
    setPosition({ x: 0, y: 0 });
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1);
    setIsZoomed(false);
    setPosition({ x: 0, y: 0 });
  }, [images.length]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isZoomed) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 100;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 100;
    setPosition({ x: -x, y: -y });
  };

  const toggleZoom = () => {
    setIsZoomed(z => !z);
    if (isZoomed) {
      setPosition({ x: 0, y: 0 });
    }
  };

  // Touch handlers for swipe navigation and close
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    const isLeftSwipe = distanceX > minSwipeDistance;
    const isRightSwipe = distanceX < -minSwipeDistance;
    const isDownSwipe = distanceY < -minSwipeDistance;

    // Prioritize vertical swipe for close
    if (isDownSwipe && Math.abs(distanceY) > Math.abs(distanceX)) {
      onClose();
      return;
    }

    // Horizontal swipe for navigation
    if (isLeftSwipe && !isZoomed) {
      handleNext();
    }
    if (isRightSwipe && !isZoomed) {
      handlePrev();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-fade-in"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 md:top-4 md:right-4 text-white hover:bg-white/20 z-50"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </Button>

      {/* Zoom toggle button - hidden on mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 text-white hover:bg-white/20 z-50 hidden md:flex"
        onClick={(e) => {
          e.stopPropagation();
          toggleZoom();
        }}
      >
        {isZoomed ? <ZoomOut className="w-6 h-6" /> : <ZoomIn className="w-6 h-6" />}
      </Button>

      {/* Image counter */}
      <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
        {currentIndex + 1} / {images.length}
      </div>

      {/* Previous button - hidden on mobile (use swipe) */}
      {images.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-50 w-12 h-12 hidden md:flex"
          onClick={(e) => {
            e.stopPropagation();
            handlePrev();
          }}
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>
      )}

      {/* Main image container - fullscreen on mobile */}
      <div 
        className={`relative w-full h-full md:max-w-[90vw] md:max-h-[85vh] flex items-center justify-center overflow-hidden ${isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
        onClick={(e) => {
          e.stopPropagation();
          // Only toggle zoom on desktop
          if (window.innerWidth >= 768) {
            toggleZoom();
          }
        }}
        onMouseMove={handleMouseMove}
      >
        <img
          src={images[currentIndex]}
          alt={`${alt} ${currentIndex + 1}`}
          className={`max-w-full max-h-full md:max-w-[90vw] md:max-h-[85vh] object-contain transition-transform duration-200 ${
            isZoomed ? 'scale-[2.5]' : 'scale-100'
          }`}
          style={isZoomed ? { 
            transform: `scale(2.5) translate(${position.x}%, ${position.y}%)` 
          } : undefined}
          draggable={false}
        />
      </div>

      {/* Next button - hidden on mobile (use swipe) */}
      {images.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-50 w-12 h-12 hidden md:flex"
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
        >
          <ChevronRight className="w-8 h-8" />
        </Button>
      )}

      {/* Thumbnail strip - smaller on mobile */}
      {images.length > 1 && (
        <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 flex gap-1 md:gap-2 bg-black/50 p-1 md:p-2 rounded-lg max-w-[95vw] md:max-w-[90vw] overflow-x-auto">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(idx);
                setIsZoomed(false);
                setPosition({ x: 0, y: 0 });
              }}
              className={`flex-shrink-0 w-10 h-10 md:w-16 md:h-16 rounded overflow-hidden border-2 transition-all ${
                currentIndex === idx 
                  ? 'border-white opacity-100' 
                  : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img 
                src={img} 
                alt={`Thumbnail ${idx + 1}`} 
                className="w-full h-full object-cover" 
              />
            </button>
          ))}
        </div>
      )}

      {/* Mobile swipe hint */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/60 text-xs md:hidden">
        <p>Swipe om te navigeren • Swipe omlaag om te sluiten</p>
      </div>

      {/* Instructions - desktop only */}
      <div className="absolute bottom-4 right-4 text-white/60 text-xs hidden md:block">
        <p>← → Navigate • Space: Zoom • Esc: Close</p>
      </div>
    </div>
  );
};