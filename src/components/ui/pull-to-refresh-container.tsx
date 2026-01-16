import { ReactNode } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "./pull-to-refresh";

interface PullToRefreshContainerProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function PullToRefreshContainer({
  children,
  onRefresh,
  disabled = false,
  className = "",
}: PullToRefreshContainerProps) {
  const {
    containerRef,
    pullDistance,
    progress,
    isRefreshing,
    isMobile,
  } = usePullToRefresh({ onRefresh, disabled });

  // Only use the pull-to-refresh container on mobile
  if (!isMobile) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        progress={progress}
        isRefreshing={isRefreshing}
      />
      {children}
    </div>
  );
}
