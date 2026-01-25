import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ChevronRight, CheckCircle2, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface DisputesWidgetProps {
  onNavigate?: () => void;
}

export const DisputesWidget = ({ onNavigate }: DisputesWidgetProps) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["disputes-widget-stats"],
    queryFn: async () => {
      // Get open disputes (pending, under_review)
      const { data: openDisputes, error: openError } = await supabase
        .from("disputes")
        .select("id, status, created_at")
        .in("status", ["pending", "under_review"]);

      if (openError) throw openError;

      // Count by status
      const pending = openDisputes?.filter(d => d.status === "pending").length || 0;
      const underReview = openDisputes?.filter(d => d.status === "under_review").length || 0;
      const total = openDisputes?.length || 0;

      return { pending, underReview, total };
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

  const hasOpen = (stats?.total || 0) > 0;

  return (
    <Card 
      className={`${hasOpen ? "border-orange-500/50" : ""} ${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasOpen ? (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Claims</p>
              {hasOpen ? (
                <p className="text-sm font-medium text-orange-600">
                  {stats?.total} openstaand
                </p>
              ) : (
                <p className="text-sm font-medium text-green-600">
                  Geen openstaand
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(stats?.pending || 0) > 0 && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                  <Clock className="h-3 w-3 mr-1" />
                  {stats?.pending}
                </Badge>
              )}
              {(stats?.underReview || 0) > 0 && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                  {stats?.underReview} review
                </Badge>
              )}
              {!hasOpen && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  OK
                </Badge>
              )}
            </div>
            {onNavigate && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DisputesWidget;
