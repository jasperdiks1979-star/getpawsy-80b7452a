import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Touch-friendly tooltip with long-press support
interface TouchTooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  delayDuration?: number;
  longPressDelay?: number;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

const TouchTooltip = React.forwardRef<
  HTMLDivElement,
  TouchTooltipProps
>(({ children, content, delayDuration = 300, longPressDelay = 500, side = "top", className }, ref) => {
  const [open, setOpen] = React.useState(false);
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    
    longPressTimer.current = setTimeout(() => {
      setOpen(true);
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    }, longPressDelay);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    
    const moveThreshold = 10;
    const deltaX = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
    const deltaY = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
    
    // Cancel long press if user moves finger
    if (deltaX > moveThreshold || deltaY > moveThreshold) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
    
    // Auto-hide tooltip after showing
    if (open) {
      setTimeout(() => setOpen(false), 1500);
    }
  };

  const handleTouchCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  React.useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  return (
    <TooltipPrimitive.Root 
      open={open} 
      onOpenChange={setOpen} 
      delayDuration={delayDuration}
    >
      <TooltipPrimitive.Trigger asChild>
        <div
          ref={ref}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          className={cn("touch-none select-none", className)}
        >
          {children}
        </div>
      </TooltipPrimitive.Trigger>
      <TooltipContent side={side}>
        {content}
      </TooltipContent>
    </TooltipPrimitive.Root>
  );
});
TouchTooltip.displayName = "TouchTooltip";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TouchTooltip };