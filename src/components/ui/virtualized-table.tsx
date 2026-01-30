import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

interface VirtualizedTableProps<T> {
  data: T[];
  columns: {
    header: React.ReactNode;
    accessor: keyof T | ((item: T) => React.ReactNode);
    className?: string;
    headerClassName?: string;
  }[];
  rowKey: keyof T | ((item: T) => string);
  estimateRowHeight?: number;
  overscan?: number;
  maxHeight?: number | string;
  emptyMessage?: React.ReactNode;
  onRowClick?: (item: T) => void;
  renderRow?: (item: T, index: number, virtualRow: { size: number; start: number }) => React.ReactNode;
}

export function VirtualizedTable<T>({
  data,
  columns,
  rowKey,
  estimateRowHeight = 52,
  overscan = 10,
  maxHeight = 600,
  emptyMessage = 'No data found',
  onRowClick,
  renderRow,
}: VirtualizedTableProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const getRowKey = (item: T): string => {
    if (typeof rowKey === 'function') {
      return rowKey(item);
    }
    return String(item[rowKey]);
  };

  const getCellValue = (
    item: T,
    accessor: keyof T | ((item: T) => React.ReactNode)
  ): React.ReactNode => {
    if (typeof accessor === 'function') {
      return accessor(item);
    }
    const value = item[accessor];
    if (value === null || value === undefined) return '-';
    return String(value);
  };

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      {/* Header */}
      <div className="border-b bg-muted/50">
        <div className="flex">
          {columns.map((col, i) => (
            <div
              key={i}
              className={cn(
                'h-10 px-4 text-left align-middle font-medium text-muted-foreground flex items-center text-sm flex-1',
                col.headerClassName
              )}
            >
              {col.header}
            </div>
          ))}
        </div>
      </div>

      {/* Virtualized Body */}
      <div
        ref={parentRef}
        style={{ maxHeight, overflow: 'auto' }}
        className="relative"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const item = data[virtualRow.index];
            const key = getRowKey(item);

            if (renderRow) {
              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderRow(item, virtualRow.index, virtualRow)}
                </div>
              );
            }

            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  'flex border-b transition-colors hover:bg-muted/50',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col, colIndex) => (
                  <div
                    key={colIndex}
                    className={cn(
                      'p-4 align-middle text-sm flex items-center flex-1',
                      col.className
                    )}
                  >
                    {getCellValue(item, col.accessor)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
