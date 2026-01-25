import { usePackagingInventory, getInventoryStatus } from "@/hooks/usePackagingInventory";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PackagingInventoryWidgetProps {
  onNavigate?: () => void;
}

export const PackagingInventoryWidget = ({ onNavigate }: PackagingInventoryWidgetProps) => {
  const { data: inventory, isLoading } = usePackagingInventory();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>
    );
  }

  // Count items by status
  const statusCounts = {
    ok: 0,
    low: 0,
    critical: 0,
  };

  const criticalItems: string[] = [];
  const lowItems: string[] = [];

  inventory?.forEach((item) => {
    const { status } = getInventoryStatus(item.quantity, item.reorder_threshold);
    statusCounts[status]++;
    
    if (status === "critical") {
      criticalItems.push(item.item_name);
    } else if (status === "low") {
      lowItems.push(item.item_name);
    }
  });

  const totalItems = inventory?.length || 0;
  const hasIssues = statusCounts.critical > 0 || statusCounts.low > 0;

  return (
    <Card 
      className={`${hasIssues ? "border-destructive/50" : ""} ${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            ) : (
              <Package className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Packaging</p>
              {statusCounts.critical > 0 ? (
                <p className="text-sm font-medium text-destructive">
                  {statusCounts.critical} kritiek
                </p>
              ) : statusCounts.low > 0 ? (
                <p className="text-sm font-medium text-yellow-600">
                  {statusCounts.low} bijna op
                </p>
              ) : (
                <p className="text-sm font-medium text-green-600">
                  Alles op voorraad
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {statusCounts.ok > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                  {statusCounts.ok}
                </Badge>
              )}
              {statusCounts.low > 0 && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                  {statusCounts.low}
                </Badge>
              )}
              {statusCounts.critical > 0 && (
                <Badge variant="destructive">
                  {statusCounts.critical}
                </Badge>
              )}
            </div>
            {onNavigate && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        
        {/* Show critical item names if any */}
        {criticalItems.length > 0 && (
          <p className="text-xs text-destructive mt-2 truncate">
            ⚠️ {criticalItems.slice(0, 2).join(", ")}
            {criticalItems.length > 2 && ` +${criticalItems.length - 2}`}
          </p>
        )}
        {criticalItems.length === 0 && lowItems.length > 0 && (
          <p className="text-xs text-yellow-600 mt-2 truncate">
            Bijna op: {lowItems.slice(0, 2).join(", ")}
            {lowItems.length > 2 && ` +${lowItems.length - 2}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PackagingInventoryWidget;
