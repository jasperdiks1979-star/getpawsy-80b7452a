import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  Loader2,
  Store
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";

interface ScrapeLog {
  id: string;
  competitor: string;
  scraped_at: string;
  success: boolean;
  products_found: number | null;
  error_message: string | null;
}

interface RetailerStats {
  name: string;
  lastScrape: Date | null;
  lastSuccess: boolean;
  totalProducts: number;
  successRate: number;
  scrapeCount: number;
}

const RETAILER_LABELS: Record<string, string> = {
  amazon: "Amazon",
  chewy: "Chewy",
  petco: "Petco",
  petsmart: "PetSmart",
  walmart: "Walmart Pet",
};

const RETAILER_COLORS: Record<string, string> = {
  amazon: "bg-orange-500",
  chewy: "bg-blue-500",
  petco: "bg-red-500",
  petsmart: "bg-green-500",
  walmart: "bg-yellow-500",
};

export const CompetitorScrapeLogsWidget = () => {
  const [isManualScraping, setIsManualScraping] = useState(false);
  const { invokeFunction } = useAuthenticatedFetch();

  // Fetch recent scrape logs
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["competitor-scrape-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_scrape_logs")
        .select("*")
        .order("scraped_at", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as ScrapeLog[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Calculate stats per retailer
  const retailerStats = (() => {
    if (!logs || logs.length === 0) return [];

    const statsMap: Record<string, RetailerStats> = {};

    logs.forEach((log) => {
      if (!statsMap[log.competitor]) {
        statsMap[log.competitor] = {
          name: log.competitor,
          lastScrape: null,
          lastSuccess: false,
          totalProducts: 0,
          successRate: 0,
          scrapeCount: 0,
        };
      }

      const stat = statsMap[log.competitor];
      stat.scrapeCount++;

      // Track last scrape
      const scrapeDate = new Date(log.scraped_at);
      if (!stat.lastScrape || scrapeDate > stat.lastScrape) {
        stat.lastScrape = scrapeDate;
        stat.lastSuccess = log.success;
      }

      // Sum products found
      if (log.success && log.products_found) {
        stat.totalProducts += log.products_found;
      }
    });

    // Calculate success rates
    Object.keys(statsMap).forEach((key) => {
      const successCount = logs.filter(
        (l) => l.competitor === key && l.success
      ).length;
      statsMap[key].successRate = Math.round(
        (successCount / statsMap[key].scrapeCount) * 100
      );
    });

    return Object.values(statsMap).sort((a, b) => {
      // Sort by last scrape time, most recent first
      if (!a.lastScrape) return 1;
      if (!b.lastScrape) return -1;
      return b.lastScrape.getTime() - a.lastScrape.getTime();
    });
  })();

  // Get recent logs (last 10)
  const recentLogs = logs?.slice(0, 10) || [];

  // Manual scrape trigger
  const handleManualScrape = async () => {
    setIsManualScraping(true);
    try {
      const { error } = await invokeFunction("scrape-competitor-products", {
        body: {},
      });

      if (error) throw error;

      toast.success("Scraping gestart! Dit kan enkele minuten duren.");
      
      // Refetch logs after a delay
      setTimeout(() => {
        refetch();
      }, 5000);
    } catch (err) {
      console.error("Manual scrape error:", err);
      toast.error("Kon scraping niet starten");
    } finally {
      setIsManualScraping(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Competitor Scraper
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
              <Store className="h-5 w-5" />
              Competitor Scraper
            </CardTitle>
            <CardDescription>
              Status van bestseller scraping per retailer
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualScrape}
            disabled={isManualScraping}
          >
            {isManualScraping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Handmatig draaien</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Retailer Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {retailerStats.map((stat) => (
            <div
              key={stat.name}
              className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      RETAILER_COLORS[stat.name] || "bg-gray-500"
                    }`}
                  />
                  <span className="font-medium text-sm">
                    {RETAILER_LABELS[stat.name] || stat.name}
                  </span>
                </div>
                {stat.lastSuccess ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Success rate:</span>
                  <Badge
                    variant={stat.successRate >= 80 ? "default" : stat.successRate >= 50 ? "secondary" : "destructive"}
                    className="text-xs px-1.5 py-0"
                  >
                    {stat.successRate}%
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Producten:</span>
                  <span className="font-medium">{stat.totalProducts}</span>
                </div>
                <div className="flex justify-between">
                  <span>Laatste:</span>
                  <span className="font-medium">
                    {stat.lastScrape
                      ? formatDistanceToNow(stat.lastScrape, {
                          addSuffix: true,
                          locale: nl,
                        })
                      : "Nooit"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent Logs Table */}
        {recentLogs.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recente activiteit
            </h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {log.success ? (
                      <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                    )}
                    <span className="font-medium">
                      {RETAILER_LABELS[log.competitor] || log.competitor}
                    </span>
                    {log.success && log.products_found !== null && (
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {log.products_found} producten
                      </Badge>
                    )}
                    {!log.success && log.error_message && (
                      <span className="text-red-500 truncate max-w-[150px]" title={log.error_message}>
                        {log.error_message.substring(0, 30)}...
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground flex-shrink-0">
                    {format(new Date(log.scraped_at), "dd MMM HH:mm", { locale: nl })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning for failing retailers */}
        {retailerStats.some((s) => s.successRate < 50) && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Sommige retailers falen vaak
              </p>
              <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                {retailerStats
                  .filter((s) => s.successRate < 50)
                  .map((s) => RETAILER_LABELS[s.name] || s.name)
                  .join(", ")}{" "}
                hebben een lage success rate. Dit kan komen door rate limiting of
                site-wijzigingen.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
