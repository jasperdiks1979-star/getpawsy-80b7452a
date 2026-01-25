import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Webhook, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface CJWebhooksWidgetProps {
  onNavigate?: () => void;
}

export const CJWebhooksWidget = ({ onNavigate }: CJWebhooksWidgetProps) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["cj-webhook-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cj_webhook_logs")
        .select("id, webhook_type, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const logs = data || [];
      const total = logs.length;
      const errors = logs.filter(l => l.error_message).length;
      const recent24h = logs.filter(l => {
        const created = new Date(l.created_at);
        const now = new Date();
        return (now.getTime() - created.getTime()) < 24 * 60 * 60 * 1000;
      }).length;

      return { total, errors, recent24h };
    },
    staleTime: 60000,
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

  const hasErrors = (stats?.errors || 0) > 0;

  return (
    <Card 
      className={`${hasErrors ? "border-destructive/50" : ""} ${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasErrors ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : (
              <Webhook className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">CJ Webhooks</p>
              {hasErrors ? (
                <p className="text-sm font-medium text-destructive">
                  {stats?.errors} errors
                </p>
              ) : stats?.recent24h ? (
                <p className="text-sm font-medium text-green-600">
                  {stats.recent24h} events (24u)
                </p>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  Geen recente events
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(stats?.total || 0) > 0 && !hasErrors && (
                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {stats?.total}
                </Badge>
              )}
              {hasErrors && (
                <Badge variant="destructive">
                  {stats?.errors}
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

export default CJWebhooksWidget;
