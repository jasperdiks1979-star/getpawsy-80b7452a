import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, ChevronRight, Clock, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface RecentOrdersWidgetProps {
  onNavigate?: () => void;
}

export const RecentOrdersWidget = ({ onNavigate }: RecentOrdersWidgetProps) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["recent-orders-widget"],
    queryFn: async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Get orders from today
      const { data: todayOrders, error: todayError } = await supabase
        .from("orders")
        .select("id, status, created_at")
        .gte("created_at", today.toISOString())
        .order("created_at", { ascending: false });

      if (todayError) throw todayError;

      // Get most recent order
      const { data: recentOrder, error: recentError } = await supabase
        .from("orders")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentError) throw recentError;

      // Count pending orders
      const { count: pendingCount, error: pendingError } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (pendingError) throw pendingError;

      return {
        todayCount: todayOrders?.length || 0,
        pendingCount: pendingCount || 0,
        lastOrderTime: recentOrder?.created_at || null,
      };
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

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

  const hasPending = (stats?.pendingCount || 0) > 0;

  return (
    <Card 
      className={`${hasPending ? "border-orange-500/50" : ""} ${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Orders</p>
              {stats?.todayCount ? (
                <p className="text-sm font-medium text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {stats.todayCount} vandaag
                </p>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  Geen vandaag
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {hasPending && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                  {stats?.pendingCount} pending
                </Badge>
              )}
              {stats?.todayCount && stats.todayCount > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                  {stats.todayCount}
                </Badge>
              )}
            </div>
            {onNavigate && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        
        {stats?.lastOrderTime && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Laatste: {formatDistanceToNow(new Date(stats.lastOrderTime), { 
              addSuffix: true, 
              locale: nl 
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentOrdersWidget;
