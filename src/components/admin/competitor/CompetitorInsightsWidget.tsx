import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ChevronRight,
  Target,
  Sparkles,
  Clock
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";

interface Insight {
  category: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface Recommendation {
  action: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  reasoning: string;
}

interface AnalysisReport {
  id: string;
  report_date: string;
  report_type: string;
  title: string;
  summary: string;
  insights: Insight[];
  pricing_analysis: {
    summary: string;
    recommendations: string[];
  } | null;
  product_trends: {
    rising_categories: string[];
    declining_categories: string[];
    opportunities: string[];
  } | null;
  recommendations: Recommendation[];
  competitors_analyzed: string[];
  products_analyzed: number;
  created_at: string;
}

const PRIORITY_COLORS = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  pricing: <DollarSign className="h-4 w-4" />,
  trends: <TrendingUp className="h-4 w-4" />,
  opportunities: <Target className="h-4 w-4" />,
  threats: <AlertTriangle className="h-4 w-4" />,
};

export const CompetitorInsightsWidget = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { invokeFunction } = useAuthenticatedFetch();
  const queryClient = useQueryClient();

  // Fetch latest report
  const { data: report, isLoading } = useQuery({
    queryKey: ["competitor-analysis-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitor_analysis_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      // Type-safe mapping from DB record
      return {
        id: data.id,
        report_date: data.report_date,
        report_type: data.report_type,
        title: data.title,
        summary: data.summary,
        insights: (data.insights || []) as unknown as Insight[],
        pricing_analysis: data.pricing_analysis as AnalysisReport["pricing_analysis"],
        product_trends: data.product_trends as AnalysisReport["product_trends"],
        recommendations: (data.recommendations || []) as unknown as Recommendation[],
        competitors_analyzed: data.competitors_analyzed || [],
        products_analyzed: data.products_analyzed,
        created_at: data.created_at,
      } as AnalysisReport;
    },
  });

  // Generate new analysis
  const handleGenerateAnalysis = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await invokeFunction("analyze-competitors", {
        body: {},
      });

      if (error) throw error;

      const responseData = data as { success?: boolean; error?: string } | null;
      if (responseData?.success) {
        toast.success("Nieuwe analyse gegenereerd!");
        queryClient.invalidateQueries({ queryKey: ["competitor-analysis-report"] });
        queryClient.invalidateQueries({ queryKey: ["competitor-alerts"] });
      } else {
        throw new Error(responseData?.error || "Analyse mislukt");
      }
    } catch (err) {
      console.error("Generate analysis error:", err);
      toast.error("Kon analyse niet genereren");
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Competitor Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
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
              <Brain className="h-5 w-5 text-purple-500" />
              AI Competitor Insights
            </CardTitle>
            <CardDescription>
              {report 
                ? `Laatste analyse: ${formatDistanceToNow(new Date(report.created_at), { addSuffix: true, locale: nl })}`
                : "Nog geen analyse beschikbaar"
              }
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateAnalysis}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">
              {isGenerating ? "Analyseren..." : "Nieuwe Analyse"}
            </span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!report ? (
          <div className="py-12 text-center">
            <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nog geen analyse</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Genereer een AI-analyse om inzichten te krijgen in competitor strategieën
            </p>
            <Button onClick={handleGenerateAnalysis} disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Eerste Analyse Starten
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="summary" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="summary">Overzicht</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="pricing">Prijzen</TabsTrigger>
              <TabsTrigger value="actions">Acties</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4">
              {/* Summary */}
              <div className="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border">
                <h4 className="font-medium mb-2">{report.title}</h4>
                <p className="text-sm text-muted-foreground">{report.summary}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {report.competitors_analyzed?.length || 0} competitors
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {report.products_analyzed} producten
                  </span>
                </div>
              </div>

              {/* Trends Overview */}
              {report.product_trends && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg">
                    <h5 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Stijgende Categorieën
                    </h5>
                    <div className="flex flex-wrap gap-1">
                      {(report.product_trends.rising_categories || []).map((cat, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {cat}
                        </Badge>
                      ))}
                      {(!report.product_trends.rising_categories || report.product_trends.rising_categories.length === 0) && (
                        <span className="text-xs text-muted-foreground">Geen data</span>
                      )}
                    </div>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <h5 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      Kansen
                    </h5>
                    <div className="space-y-1">
                      {(report.product_trends.opportunities || []).slice(0, 3).map((opp, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          • {opp}
                        </p>
                      ))}
                      {(!report.product_trends.opportunities || report.product_trends.opportunities.length === 0) && (
                        <span className="text-xs text-muted-foreground">Geen data</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="insights">
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {(report.insights || []).map((insight, index) => (
                    <div
                      key={index}
                      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded bg-muted">
                          {CATEGORY_ICONS[insight.category] || <Lightbulb className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h5 className="font-medium text-sm">{insight.title}</h5>
                            <Badge className={`text-xs ${PRIORITY_COLORS[insight.priority]}`}>
                              {insight.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{insight.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!report.insights || report.insights.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">
                      Geen insights beschikbaar
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="pricing">
              {report.pricing_analysis ? (
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <h5 className="font-medium mb-2 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      Prijsanalyse
                    </h5>
                    <p className="text-sm text-muted-foreground">
                      {report.pricing_analysis.summary}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h5 className="font-medium mb-2">Aanbevelingen</h5>
                    <ul className="space-y-2">
                      {(report.pricing_analysis.recommendations || []).map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <ChevronRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Geen prijsanalyse beschikbaar
                </p>
              )}
            </TabsContent>

            <TabsContent value="actions">
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {(report.recommendations || []).map((rec, index) => (
                    <div
                      key={index}
                      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h5 className="font-medium text-sm">{rec.action}</h5>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-xs">
                            Impact: {rec.impact}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Effort: {rec.effort}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{rec.reasoning}</p>
                    </div>
                  ))}
                  {(!report.recommendations || report.recommendations.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">
                      Geen acties beschikbaar
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
