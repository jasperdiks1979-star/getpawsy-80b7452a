import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bell, 
  BellOff,
  TrendingUp, 
  DollarSign, 
  Star,
  AlertTriangle,
  X,
  Check,
  ExternalLink
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";

interface CompetitorAlert {
  id: string;
  alert_type: string;
  competitor: string;
  product_name: string | null;
  title: string;
  description: string;
  severity: "info" | "warning" | "urgent";
  data: Record<string, unknown> | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

const ALERT_TYPE_ICONS: Record<string, React.ReactNode> = {
  price_drop: <DollarSign className="h-4 w-4" />,
  new_bestseller: <Star className="h-4 w-4" />,
  rising_product: <TrendingUp className="h-4 w-4" />,
  competitor_trend: <AlertTriangle className="h-4 w-4" />,
};

const SEVERITY_COLORS = {
  info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
  warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
  urgent: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30",
};

const SEVERITY_BADGE_COLORS = {
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const COMPETITOR_COLORS: Record<string, string> = {
  amazon: "bg-orange-500",
  chewy: "bg-blue-500",
  petco: "bg-red-500",
  petsmart: "bg-green-500",
  walmart: "bg-yellow-500",
};

export const CompetitorAlertsWidget = () => {
  const queryClient = useQueryClient();

  // Fetch unread/undismissed alerts
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["competitor-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_alerts")
        .select("*")
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as CompetitorAlert[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Mark alert as read
  const markAsReadMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("competitor_alerts")
        .update({ is_read: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor-alerts"] });
    },
  });

  // Dismiss alert
  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("competitor_alerts")
        .update({ is_dismissed: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor-alerts"] });
      toast.success("Alert verwijderd");
    },
  });

  // Dismiss all alerts
  const dismissAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("competitor_alerts")
        .update({ is_dismissed: true })
        .eq("is_dismissed", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["competitor-alerts"] });
      toast.success("Alle alerts verwijderd");
    },
  });

  const unreadCount = alerts?.filter(a => !a.is_read).length || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Competitor Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-500" />
              Competitor Alerts
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {unreadCount}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Meldingen over prijswijzigingen, nieuwe bestsellers en trends
            </CardDescription>
          </div>
          {alerts && alerts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismissAllMutation.mutate()}
              disabled={dismissAllMutation.isPending}
            >
              <BellOff className="h-4 w-4 mr-1" />
              Alles wissen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!alerts || alerts.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Geen alerts op dit moment</p>
            <p className="text-xs mt-1">
              Alerts worden gegenereerd tijdens de competitor analyse
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 border rounded-lg transition-all ${SEVERITY_COLORS[alert.severity]} ${
                    !alert.is_read ? "ring-1 ring-primary/20" : "opacity-80"
                  }`}
                  onClick={() => {
                    if (!alert.is_read) {
                      markAsReadMutation.mutate(alert.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <div className={`p-1.5 rounded ${SEVERITY_BADGE_COLORS[alert.severity]}`}>
                        {ALERT_TYPE_ICONS[alert.alert_type] || <Bell className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              COMPETITOR_COLORS[alert.competitor] || "bg-gray-500"
                            }`}
                          />
                          <span className="text-xs font-medium capitalize">
                            {alert.competitor}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.created_at), {
                              addSuffix: true,
                              locale: nl,
                            })}
                          </span>
                        </div>
                        <h5 className="font-medium text-sm line-clamp-1">
                          {alert.title}
                        </h5>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {alert.description}
                        </p>
                        {alert.product_name && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            {alert.product_name.substring(0, 40)}
                            {alert.product_name.length > 40 ? "..." : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissAlertMutation.mutate(alert.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
