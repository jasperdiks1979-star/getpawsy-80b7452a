import { usePackagingInventory, getInventoryStatus } from "@/hooks/usePackagingInventory";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, AlertTriangle, ChevronRight, RefreshCw, CheckCircle2, XCircle, Settings } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PackagingInventoryWidgetProps {
  onNavigate?: () => void;
  onOpenCjConfig?: () => void;
}

export const PackagingInventoryWidget = ({ onNavigate, onOpenCjConfig }: PackagingInventoryWidgetProps) => {
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

  // Sync health tracking
  let itemsWithSync = 0;
  let itemsWithoutSync = 0;

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

    // Track sync configuration
    if (item.cj_product_id) {
      itemsWithSync++;
    } else {
      itemsWithoutSync++;
    }
  });

  const totalItems = inventory?.length || 0;
  const hasIssues = statusCounts.critical > 0 || statusCounts.low > 0;
  const syncPercentage = totalItems > 0 ? Math.round((itemsWithSync / totalItems) * 100) : 0;
  const allSynced = itemsWithoutSync === 0 && totalItems > 0;

  return (
    <TooltipProvider>
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

          {/* CJ Sync Health Indicator */}
          <div className="mt-3 pt-3 border-t border-border">
            <div 
              className={`flex items-center justify-between ${onOpenCjConfig ? "cursor-pointer hover:bg-muted/50 -mx-1 px-1 py-0.5 rounded transition-colors" : ""}`}
              onClick={(e) => {
                if (onOpenCjConfig) {
                  e.stopPropagation();
                  onOpenCjConfig();
                }
              }}
            >
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">CJ Sync</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    {allSynced ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : itemsWithSync > 0 ? (
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-12 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${syncPercentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{syncPercentage}%</span>
                      </div>
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {onOpenCjConfig && (
                      <Settings className="h-3 w-3 text-muted-foreground ml-1" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p className="text-xs">
                    {allSynced 
                      ? "Alle items zijn gekoppeld aan CJ" 
                      : `${itemsWithSync}/${totalItems} items gekoppeld aan CJ`}
                    {onOpenCjConfig && " • Klik om te configureren"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default PackagingInventoryWidget;
