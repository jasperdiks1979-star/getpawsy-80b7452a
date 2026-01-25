import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronRight, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface NewsletterSubscribersWidgetProps {
  onNavigate?: () => void;
}

export const NewsletterSubscribersWidget = ({ onNavigate }: NewsletterSubscribersWidgetProps) => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["newsletter-subscribers-widget-stats"],
    queryFn: async () => {
      // Get active subscribers count
      const { count: activeCount, error: activeError } = await supabase
        .from("newsletter_subscribers")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      if (activeError) throw activeError;

      // Get new subscribers from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { count: newCount, error: newError } = await supabase
        .from("newsletter_subscribers")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .gte("subscribed_at", sevenDaysAgo.toISOString());

      if (newError) throw newError;

      return { 
        activeCount: activeCount || 0, 
        newThisWeek: newCount || 0 
      };
    },
    staleTime: 60000,
    refetchInterval: 120000,
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

  return (
    <Card 
      className={`${onNavigate ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
      onClick={onNavigate}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Nieuwsbrief</p>
              <p className="text-sm font-medium">
                {stats?.activeCount} abonnees
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(stats?.newThisWeek || 0) > 0 && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                <TrendingUp className="h-3 w-3 mr-1" />
                +{stats?.newThisWeek} deze week
              </Badge>
            )}
            {onNavigate && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NewsletterSubscribersWidget;
