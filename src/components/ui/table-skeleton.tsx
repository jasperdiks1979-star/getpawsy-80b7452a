import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  columns: number;
  rows?: number;
  showHeader?: boolean;
  headerWidths?: string[];
  cellWidths?: string[];
}

export const TableSkeleton = ({ 
  columns, 
  rows = 5, 
  showHeader = true,
  headerWidths,
  cellWidths 
}: TableSkeletonProps) => {
  const getWidth = (widths: string[] | undefined, index: number): string => {
    if (!widths) return "w-full";
    return widths[index % widths.length];
  };

  return (
    <div className="rounded-md border">
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className={`h-4 ${getWidth(headerWidths, i)}`} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton className={`h-4 ${getWidth(cellWidths, colIndex)}`} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

interface CardSkeletonProps {
  showHeader?: boolean;
  showActions?: boolean;
  lines?: number;
}

export const CardSkeleton = ({ 
  showHeader = true, 
  showActions = false,
  lines = 3 
}: CardSkeletonProps) => {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          {showActions && (
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-20" />
            </div>
          )}
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
};

interface MetricSkeletonProps {
  count?: number;
}

export const MetricCardsSkeleton = ({ count = 4 }: MetricSkeletonProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-12 w-12 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface DashboardSkeletonProps {
  showMetrics?: boolean;
  showChart?: boolean;
  showTable?: boolean;
  metricCount?: number;
  tableColumns?: number;
  tableRows?: number;
}

export const DashboardSkeleton = ({
  showMetrics = true,
  showChart = true,
  showTable = true,
  metricCount = 4,
  tableColumns = 5,
  tableRows = 5
}: DashboardSkeletonProps) => {
  return (
    <div className="space-y-6">
      {showMetrics && <MetricCardsSkeleton count={metricCount} />}
      
      {showChart && (
        <div className="rounded-lg border bg-card p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      )}
      
      {showTable && (
        <div className="rounded-lg border bg-card p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-48" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
            <TableSkeleton columns={tableColumns} rows={tableRows} />
          </div>
        </div>
      )}
    </div>
  );
};

export default TableSkeleton;
