import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OverviewTab } from "./tabs/OverviewTab";
import { ChannelTab } from "./tabs/ChannelTab";
import { ProductWinnersTab } from "./tabs/ProductWinnersTab";
import { AutopilotSettingsTab } from "./tabs/AutopilotSettingsTab";
import { ApiHealthTab } from "./tabs/ApiHealthTab";
import { ExcludedTrafficTab } from "./tabs/ExcludedTrafficTab";
import { CsvImportTab } from "./tabs/CsvImportTab";
import { PlaceholderTab } from "./tabs/PlaceholderTab";

type Counters = {
  total: number;
  us_included: number;
  non_us_excluded: number;
  internal_excluded: number;
  unknown_excluded: number;
};

export function GrowthIntelligenceEngine() {
  const [counters, setCounters] = useState<Counters | null>(null);
  const [autopilotMode, setAutopilotMode] = useState<string>("DRAFT_ONLY");
  const [minSessions, setMinSessions] = useState<number>(100);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadCounters();
    void loadSettings();
  }, []);

  async function loadSettings() {
    const { data } = await supabase
      .from("gi_settings")
      .select("autopilot_mode, min_us_sessions_for_decisions")
      .limit(1)
      .maybeSingle();
    if (data) {
      setAutopilotMode(data.autopilot_mode);
      setMinSessions(data.min_us_sessions_for_decisions ?? 100);
    }
  }

  async function loadCounters() {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("visitor_activity")
      .select("country, is_internal", { count: "exact", head: false })
      .gte("created_at", since)
      .limit(50000);
    if (error || !data) {
      setCounters({ total: 0, us_included: 0, non_us_excluded: 0, internal_excluded: 0, unknown_excluded: 0 });
      setLoading(false);
      return;
    }
    const c: Counters = { total: data.length, us_included: 0, non_us_excluded: 0, internal_excluded: 0, unknown_excluded: 0 };
    for (const r of data) {
      if (r.is_internal) { c.internal_excluded++; continue; }
      const country = (r.country || "").toLowerCase();
      if (!country) { c.unknown_excluded++; continue; }
      if (country === "us" || country === "united states") c.us_included++;
      else c.non_us_excluded++;
    }
    setCounters(c);
    setLoading(false);
  }

  const lowData = counters && counters.us_included < minSessions;

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-[1400px]">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Growth Intelligence Engine</h1>
          <p className="text-muted-foreground mt-1">
            US-only, compliance-first growth decisions across Pinterest, TikTok, Google &amp; the shop.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={autopilotMode === "DRAFT_ONLY" || autopilotMode === "OFF" ? "secondary" : "default"} className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Autopilot: {autopilotMode}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/growth-intelligence/seo-forecast">SEO Forecast (legacy)</Link>
          </Button>
        </div>
      </header>

      <CounterStrip counters={counters} loading={loading} />

      {lowData && (
        <Alert variant="default" className="border-amber-500/50">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Not enough US traffic yet for reliable decisions</AlertTitle>
          <AlertDescription>
            Only {counters?.us_included ?? 0} US sessions in the last 30 days (threshold: {minSessions}).
            Autopilot will stay conservative until volume grows.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="products">Product Winners</TabsTrigger>
          <TabsTrigger value="creatives">Creative Winners</TabsTrigger>
          <TabsTrigger value="pinterest">Pinterest</TabsTrigger>
          <TabsTrigger value="tiktok">TikTok</TabsTrigger>
          <TabsTrigger value="seo">Google/SEO</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="decisions">Decisions Log</TabsTrigger>
          <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
          <TabsTrigger value="health">API Health</TabsTrigger>
          <TabsTrigger value="excluded">Excluded Traffic</TabsTrigger>
          <TabsTrigger value="import">CSV Import</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab counters={counters} /></TabsContent>
        <TabsContent value="channels"><ChannelTab /></TabsContent>
        <TabsContent value="products"><ProductWinnersTab /></TabsContent>
        <TabsContent value="creatives"><PlaceholderTab phase={2} title="Creative Winners" description="Top performing pins/videos by US conversion. Activates after Phase 2 scoring engine." /></TabsContent>
        <TabsContent value="pinterest"><PlaceholderTab phase={2} title="Pinterest Intelligence" description="Pin metrics + per-board performance. Pinterest API sync arrives in Phase 2." /></TabsContent>
        <TabsContent value="tiktok"><PlaceholderTab phase={2} title="TikTok Intelligence" description="Video metrics via CSV upload + organic-only insights." /></TabsContent>
        <TabsContent value="seo"><PlaceholderTab phase={2} title="Google / SEO Intelligence" description="GSC + GA4 imports. Use the CSV Import tab to seed data now." /></TabsContent>
        <TabsContent value="queue"><PlaceholderTab phase={3} title="Creative Queue" description="Drafts pending compliance review &amp; scheduling." /></TabsContent>
        <TabsContent value="compliance"><PlaceholderTab phase={3} title="Compliance Review" description="Blocked / warned creatives with reasons and safer rewrites." /></TabsContent>
        <TabsContent value="decisions"><PlaceholderTab phase={2} title="Decisions Log" description="Every SCALE / REMIX / PAUSE decision with rationale." /></TabsContent>
        <TabsContent value="autopilot"><AutopilotSettingsTab onSaved={loadSettings} /></TabsContent>
        <TabsContent value="health"><ApiHealthTab /></TabsContent>
        <TabsContent value="excluded"><ExcludedTrafficTab counters={counters} /></TabsContent>
        <TabsContent value="import"><CsvImportTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function CounterStrip({ counters, loading }: { counters: Counters | null; loading: boolean }) {
  const items = [
    { label: "Total sessions (30d)", value: counters?.total, tone: "default" },
    { label: "US included", value: counters?.us_included, tone: "good" },
    { label: "Non-US excluded", value: counters?.non_us_excluded, tone: "muted" },
    { label: "Internal excluded", value: counters?.internal_excluded, tone: "muted" },
    { label: "Unknown excluded", value: counters?.unknown_excluded, tone: "muted" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{it.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${it.tone === "good" ? "text-primary" : it.tone === "muted" ? "text-muted-foreground" : ""}`}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (it.value ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}