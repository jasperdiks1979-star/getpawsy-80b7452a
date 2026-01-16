import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  progress: number;
  isRefreshing: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  progress,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
      style={{ height: pullDistance }}
    >
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          progress >= 1 && "text-primary"
        )}
      >
        <RefreshCw
          className={cn(
            "h-5 w-5 transition-transform duration-200",
            isRefreshing && "animate-spin"
          )}
          style={{
            transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)`,
          }}
        />
        <span className="text-xs">
          {isRefreshing
            ? "Refreshing..."
            : progress >= 1
            ? "Release to refresh"
            : "Pull to refresh"}
        </span>
      </div>
    </div>
  );
}
