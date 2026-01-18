import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface UseVirtualizedListOptions<T> {
  items: T[];
  estimateSize?: number;
  overscan?: number;
}

export function useVirtualizedList<T>({
  items,
  estimateSize = 52,
  overscan = 5,
}: UseVirtualizedListOptions<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const totalHeight = virtualizer.getTotalSize();

  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalHeight - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  return {
    parentRef,
    virtualizer,
    virtualItems,
    totalHeight,
    paddingTop,
    paddingBottom,
  };
}
