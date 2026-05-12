import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, ShieldAlert, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TrendRadarTab } from "./tabs/TrendRadarTab";
import { CompetitorIntelTab } from "./tabs/CompetitorIntelTab";
import { HookLeaderboardTab } from "./tabs/HookLeaderboardTab";
import { WinningStylesTab } from "./tabs/WinningStylesTab";
import { ViralPatternLibraryTab } from "./tabs/ViralPatternLibraryTab";
import { OpportunityGapsTab } from "./tabs/OpportunityGapsTab";
import { SeasonalForecastsTab } from "./tabs/SeasonalForecastsTab";
import { RecommendedNextTab } from "./tabs/RecommendedNextTab";
import { RemixEngineTab } from "./tabs/RemixEngineTab";
import { FeedbackLoopTab } from "./tabs/FeedbackLoopTab";
import { OverviewDashboardTab } from "./tabs/OverviewDashboardTab";
import { PublishReadinessTab } from "./tabs/PublishReadinessTab";
import { ComplianceGateTab } from "./tabs/ComplianceGateTab";
import { AutoTuneTab } from "./tabs/AutoTuneTab";
import { ScalingLoopTab } from "./tabs/ScalingLoopTab";
import { ExperimentsTab } from "./tabs/ExperimentsTab";
import { CrossChannelTab } from "./tabs/CrossChannelTab";
import { GuardrailsTab } from "./tabs/GuardrailsTab";
import { RevenueAttributionTab } from "./tabs/RevenueAttributionTab";
import { BudgetShifterTab } from "./tabs/BudgetShifterTab";
import { FatigueDetectorTab } from "./tabs/FatigueDetectorTab";
import { AudienceClusterTab } from "./tabs/AudienceClusterTab";

type Counters = {
  trends: number;
  observations: number;
  recipes: number;
  opportunities: number;
  recommendations: number;
};

export function MarketIntelligenceEngine() {
  const [counters, setCounters] = useState<Counters>({
    trends: 0, observations: 0, recipes: 0, opportunities: 0, recommendations: 0,
  });
  const [autorun, setAutorun] = useState(false);

  useEffect(() => {
    void loadCounters();
  }, []);

  async function loadCounters() {
    const [t, o, r, opp, rec] = await Promise.all([
      supabase.from("mi_trends").select("id", { count: "exact", head: true }).eq("market", "US"),
      supabase.from("mi_competitor_observations").select("id", { count: "exact", head: true }),
      supabase.from("mi_creative_recipes").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("mi_opportunities").select("id", { count: "exact", head: true }).eq("market", "US").eq("status", "open"),
      supabase.from("mi_recommendations").select("id", { count: "exact", head: true }).eq("market", "US").eq("status", "new"),
    ]);
    setCounters({
      trends: t.count ?? 0,
      observations: o.count ?? 0,
      recipes: r.count ?? 0,
      opportunities: opp.count ?? 0,
      recommendations: rec.count ?? 0,
    });
  }

  async function runAutorun() {
    setAutorun(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-autorun", { body: {} });
      if (error) throw error;
      toast.success("Autorun complete");
      console.log("[mi-autorun]", data);
      await loadCounters();
    } catch (e: any) {
      toast.error(`Autorun failed: ${e?.message ?? e}`);
    } finally {
      setAutorun(false);
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-[1400px]">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">US Market Intelligence</h1>
          <p className="text-muted-foreground mt-1">
            Compliant trend, competitor &amp; creative-pattern intelligence — US-only, drafts only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Inspiration only · No clones
          </Badge>
          <Badge variant="outline" className="gap-1">Market: US</Badge>
          <Button size="sm" onClick={runAutorun} disabled={autorun} className="gap-1">
            {autorun ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {autorun ? "Running…" : "Run autorun"}
          </Button>
        </div>
      </header>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Compliance guardrails always on</AlertTitle>
        <AlertDescription>
          No copyrighted asset reuse, no 1:1 clones, no review copying, no robots.txt bypass.
          Trend insights generate <strong>drafts only</strong> — nothing auto-publishes.
        </AlertDescription>
      </Alert>

      <CounterStrip counters={counters} />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="radar">Trend Radar</TabsTrigger>
          <TabsTrigger value="competitors">Competitor Intel</TabsTrigger>
          <TabsTrigger value="hooks">Hook Leaderboard</TabsTrigger>
          <TabsTrigger value="styles">Winning Styles</TabsTrigger>
          <TabsTrigger value="patterns">Viral Pattern Library</TabsTrigger>
          <TabsTrigger value="remix">Remix Engine</TabsTrigger>
          <TabsTrigger value="gaps">Opportunity Gaps</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal Forecasts</TabsTrigger>
          <TabsTrigger value="next">Recommended Next</TabsTrigger>
          <TabsTrigger value="feedback">Feedback Loop</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Gate</TabsTrigger>
          <TabsTrigger value="readiness">Publish Readiness</TabsTrigger>
          <TabsTrigger value="autotune">Auto-Tune</TabsTrigger>
          <TabsTrigger value="scaling">Scaling Loop</TabsTrigger>
          <TabsTrigger value="experiments">Experiments</TabsTrigger>
          <TabsTrigger value="crosschannel">Cross-Channel</TabsTrigger>
          <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
          <TabsTrigger value="revenue">Revenue ROAS</TabsTrigger>
          <TabsTrigger value="budget">Budget Shifter</TabsTrigger>
          <TabsTrigger value="fatigue">Fatigue</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewDashboardTab /></TabsContent>
        <TabsContent value="radar"><TrendRadarTab onChange={loadCounters} /></TabsContent>
        <TabsContent value="competitors"><CompetitorIntelTab onChange={loadCounters} /></TabsContent>
        <TabsContent value="hooks"><HookLeaderboardTab /></TabsContent>
        <TabsContent value="styles"><WinningStylesTab /></TabsContent>
        <TabsContent value="patterns"><ViralPatternLibraryTab onChange={loadCounters} /></TabsContent>
        <TabsContent value="remix"><RemixEngineTab /></TabsContent>
        <TabsContent value="gaps"><OpportunityGapsTab onChange={loadCounters} /></TabsContent>
        <TabsContent value="seasonal"><SeasonalForecastsTab /></TabsContent>
        <TabsContent value="next"><RecommendedNextTab onChange={loadCounters} /></TabsContent>
        <TabsContent value="feedback"><FeedbackLoopTab /></TabsContent>
        <TabsContent value="compliance"><ComplianceGateTab /></TabsContent>
        <TabsContent value="readiness"><PublishReadinessTab /></TabsContent>
        <TabsContent value="autotune"><AutoTuneTab /></TabsContent>
        <TabsContent value="scaling"><ScalingLoopTab /></TabsContent>
        <TabsContent value="experiments"><ExperimentsTab /></TabsContent>
        <TabsContent value="crosschannel"><CrossChannelTab /></TabsContent>
        <TabsContent value="guardrails"><GuardrailsTab /></TabsContent>
        <TabsContent value="revenue"><RevenueAttributionTab /></TabsContent>
        <TabsContent value="budget"><BudgetShifterTab /></TabsContent>
        <TabsContent value="fatigue"><FatigueDetectorTab /></TabsContent>
        <TabsContent value="audience"><AudienceClusterTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function CounterStrip({ counters }: { counters: Counters }) {
  const items = [
    { label: "US trends tracked", value: counters.trends },
    { label: "Competitor observations", value: counters.observations },
    { label: "Active recipes", value: counters.recipes },
    { label: "Open opportunities", value: counters.opportunities },
    { label: "New recommendations", value: counters.recommendations },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{it.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{it.value.toLocaleString()}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}