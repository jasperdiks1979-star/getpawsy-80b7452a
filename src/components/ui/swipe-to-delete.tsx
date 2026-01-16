import { ReactNode } from "react";
import { useSwipeToDelete } from "@/hooks/useSwipeToDelete";
import { Trash2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface SwipeToDeleteProps {
  children: ReactNode;
  onDelete: () => void;
  disabled?: boolean;
  className?: string;
}

export function SwipeToDelete({
  children,
  onDelete,
  disabled = false,
  className = "",
}: SwipeToDeleteProps) {
  const {
    swipeDistance,
    isConfirming,
    progress,
    isMobile,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    confirmDelete,
    cancelDelete,
  } = useSwipeToDelete({ onDelete, disabled });

  // Only use swipe on mobile
  if (!isMobile) {
    return <>{children}</>;
  }

  if (isConfirming) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <div className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-lg animate-fade-in">
          <span className="text-sm font-medium text-destructive flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Verwijderen?
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelDelete}
              className="h-8 px-2"
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={confirmDelete}
              className="h-8 px-2"
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Delete indicator background */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex items-center justify-end px-4 transition-colors",
          progress >= 1 ? "bg-destructive" : "bg-destructive/50"
        )}
        style={{ width: Math.max(swipeDistance, 0) }}
      >
        <Trash2
          className={cn(
            "w-5 h-5 text-white transition-transform",
            progress >= 1 && "scale-110"
          )}
        />
      </div>

      {/* Swipeable content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative bg-background transition-transform duration-100"
        style={{
          transform: `translateX(-${swipeDistance}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
