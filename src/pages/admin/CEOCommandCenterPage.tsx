import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { AlertTriangle, TrendingUp, Sparkles, ShieldCheck, Activity, DollarSign, Users, ShoppingCart, Package, Brain, Landmark, Radio, Target, ListChecks, FileText, MapPin, Search } from "lucide-react";

type Health = {
  id: string;
  score_key: string;
  score_name: string;
  score_value: number;
  score_grade: string | null;
  reason: string | null;
  source_module: string | null;
};
type Alert = { id: string; title: string; detail: string | null; severity: string; source_module: string | null; status: string; detected_at: string };
type Goal = { id: string; goal_key: string; goal_name: string; goal_category: string; target_value: number; current_value: number; unit: string };
type Priority = { id: string; title: string; problem: string | null; evidence: string | null; recommended_action: string | null; confidence: number; impact: string; difficulty: string; estimated_roi: string | null; source_module: string | null; rank: number };

function gradeColor(v: number) {
  if (v >= 85) return "text-emerald-500";
  if (v >= 70) return "text-lime-500";
  if (v >= 55) return "text-amber-500";
  if (v >= 40) return "text-orange-500";
  return "text-red-500";
}
function severityBadge(sev: string) {
  const map: Record<string, string> = {
    critical: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    info: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  };
  return map[sev] ?? map.info;
}

export default function CEOCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [revenue, setRevenue] = useState({ today: 0, yday: 0, week: 0, month: 0, year: 0, orders: 0, all: 0, all_orders: 0 });
  const [visitors, setVisitors] = useState({ today: 0, week: 0, month: 0 });

  useEffect(() => {
    (async () => {
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setUTCHours(0,0,0,0);
      const yStart = new Date(startOfDay); yStart.setUTCDate(yStart.getUTCDate()-1);
      const weekStart = new Date(startOfDay); weekStart.setUTCDate(weekStart.getUTCDate()-7);
      const monthStart = new Date(startOfDay); monthStart.setUTCDate(1);
      const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

      const [h, a, g, p, ordAll, ordDay, ordY, ordW, ordM, ordYr, sesDay, sesW, sesM] = await Promise.all([
        supabase.from("ceo_business_health").select("*").order("score_value", { ascending: false }),
        supabase.from("ceo_alerts").select("*").eq("status","open").order("detected_at",{ ascending:false }).limit(25),
        supabase.from("ceo_goals").select("*").order("goal_category"),
        supabase.from("ceo_priorities").select("*").eq("status","open").order("rank").limit(20),
        supabase.from("orders").select("total_amount", { count: "exact" }).eq("status","paid"),
        supabase.from("orders").select("total_amount").eq("status","paid").gte("created_at", startOfDay.toISOString()),
        supabase.from("orders").select("total_amount").eq("status","paid").gte("created_at", yStart.toISOString()).lt("created_at", startOfDay.toISOString()),
        supabase.from("orders").select("total_amount").eq("status","paid").gte("created_at", weekStart.toISOString()),
        supabase.from("orders").select("total_amount").eq("status","paid").gte("created_at", monthStart.toISOString()),
        supabase.from("orders").select("total_amount").eq("status","paid").gte("created_at", yearStart.toISOString()),
        supabase.from("canonical_sessions").select("id", { count:"exact", head:true }).gte("started_at", startOfDay.toISOString()),
        supabase.from("canonical_sessions").select("id", { count:"exact", head:true }).gte("started_at", weekStart.toISOString()),
        supabase.from("canonical_sessions").select("id", { count:"exact", head:true }).gte("started_at", monthStart.toISOString()),
      ]);

      const sum = (rows: any[] | null) => (rows ?? []).reduce((s,r)=> s + Number(r.total_amount || 0), 0);
      setRevenue({
        today: sum(ordDay.data),
        yday: sum(ordY.data),
        week: sum(ordW.data),
        month: sum(ordM.data),
        year: sum(ordYr.data),
        orders: ordDay.data?.length ?? 0,
        all: sum(ordAll.data),
        all_orders: ordAll.count ?? 0,
      });
      setVisitors({ today: sesDay.count ?? 0, week: sesW.count ?? 0, month: sesM.count ?? 0 });
      setHealth((h.data ?? []) as Health[]);
      setAlerts((a.data ?? []) as Alert[]);
      setGoals((g.data ?? []) as Goal[]);
      setPriorities((p.data ?? []) as Priority[]);
      setLoading(false);
    })();
  }, []);

  const overall = health.find(x => x.score_key === "overall");
  const conversion = visitors.today > 0 ? ((revenue.orders / visitors.today) * 100) : 0;
  const aov = revenue.orders > 0 ? revenue.today / revenue.orders : 0;

  const kpis = useMemo(() => ([
    { label: "Today Revenue", value: `$${revenue.today.toFixed(2)}`, sub: `${revenue.orders} orders`, icon: DollarSign, to: "/admin/executive-revenue" },
    { label: "Yesterday", value: `$${revenue.yday.toFixed(2)}`, sub: "", icon: DollarSign },
    { label: "This Week", value: `$${revenue.week.toFixed(2)}`, sub: "", icon: TrendingUp },
    { label: "This Month", value: `$${revenue.month.toFixed(2)}`, sub: "", icon: TrendingUp },
    { label: "This Year", value: `$${revenue.year.toFixed(2)}`, sub: "", icon: TrendingUp },
    { label: "All-time", value: `$${revenue.all.toFixed(2)}`, sub: `${revenue.all_orders} orders`, icon: ShoppingCart },
    { label: "Visitors Today", value: visitors.today.toLocaleString(), sub: `${visitors.week} / 7d`, icon: Users, to: "/admin/live-map" },
    { label: "Conversion", value: `${conversion.toFixed(2)}%`, sub: "today", icon: Activity, to: "/admin/pdp-atc-drilldown" },
    { label: "AOV", value: `$${aov.toFixed(2)}`, sub: "today", icon: Package },
  ]), [revenue, visitors, conversion, aov]);

  const moduleLinks: Array<{name:string; to:string; icon: any}> = [
    { name: "Revenue Intelligence", to: "/admin/executive-revenue", icon: DollarSign },
    { name: "Conversion War Room", to: "/admin/pdp-atc-drilldown", icon: Activity },
    { name: "Pinterest Health", to: "/admin/pinterest-health", icon: Radio },
    { name: "Finance Command", to: "/admin/finance", icon: Landmark },
    { name: "Financial Health", to: "/admin/financial-health", icon: ShieldCheck },
    { name: "Evidence Vault", to: "/admin/evidence-vault", icon: FileText },
    { name: "Intelligence Vault", to: "/admin/vault", icon: FileText },
    { name: "Growth Command", to: "/admin/growth-command-center", icon: Brain },
    { name: "Live Visitor Map", to: "/admin/live-map", icon: MapPin },
    { name: "Accountant Portal", to: "/admin/accountant", icon: ShieldCheck },
  ];

  if (loading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-24 w-full"/><Skeleton className="h-96 w-full"/></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-primary" /> CEO Command Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">GENESIS V13 · Central operating system · Evidence-backed KPIs from every Genesis module</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-lg px-4 py-2 ${gradeColor(overall?.score_value ?? 0)}`}>
            Overall {overall?.score_value ?? 0}/100 · {overall?.score_grade ?? "—"}
          </Badge>
          <Button variant="outline" size="sm" asChild><Link to="/admin/vault"><FileText className="w-4 h-4 mr-1"/> Reports</Link></Button>
        </div>
      </header>

      {/* KPI GRID */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => {
          const Icon = k.icon;
          const Inner = (
            <Card className="hover:border-primary/50 transition h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{k.label}</span><Icon className="w-4 h-4"/>
                </div>
                <div className="text-2xl font-bold mt-1">{k.value}</div>
                {k.sub && <div className="text-xs text-muted-foreground mt-1">{k.sub}</div>}
              </CardContent>
            </Card>
          );
          return k.to ? <Link key={k.label} to={k.to}>{Inner}</Link> : <div key={k.label}>{Inner}</div>;
        })}
      </section>

      <Tabs defaultValue="health" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="health"><ShieldCheck className="w-4 h-4 mr-1"/>Business Health</TabsTrigger>
          <TabsTrigger value="alerts"><AlertTriangle className="w-4 h-4 mr-1"/>Alerts</TabsTrigger>
          <TabsTrigger value="priorities"><ListChecks className="w-4 h-4 mr-1"/>What Should I Do</TabsTrigger>
          <TabsTrigger value="goals"><Target className="w-4 h-4 mr-1"/>Goals</TabsTrigger>
          <TabsTrigger value="modules"><Brain className="w-4 h-4 mr-1"/>Genesis Modules</TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <Card>
            <CardHeader>
              <CardTitle>Business Health Scorecard</CardTitle>
              <CardDescription>15 subscores from live Genesis modules. Each score explains its source.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {health.filter(h=>h.score_key!=="overall").map(h => (
                <div key={h.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="text-sm font-medium">{h.score_name}</div>
                    <Badge variant="outline" className={gradeColor(h.score_value)}>{h.score_value} · {h.score_grade}</Badge>
                  </div>
                  <Progress value={h.score_value} />
                  {h.reason && <div className="text-xs text-muted-foreground">{h.reason}</div>}
                  {h.source_module && <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Source: {h.source_module}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Executive Alerts</CardTitle>
              <CardDescription>Only actionable, evidence-backed events.</CardDescription>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">No open alerts. All Genesis systems within tolerance.</div>
              ) : (
                <ScrollArea className="h-[500px]"><div className="space-y-2">
                  {alerts.map(a => (
                    <div key={a.id} className="border rounded p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{a.title}</div>
                        <Badge variant="outline" className={severityBadge(a.severity)}>{a.severity}</Badge>
                      </div>
                      {a.detail && <div className="text-xs text-muted-foreground mt-1">{a.detail}</div>}
                      <div className="text-[10px] uppercase text-muted-foreground/60 mt-2">{a.source_module} · {new Date(a.detected_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div></ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="priorities">
          <Card>
            <CardHeader>
              <CardTitle>What Should I Do Today</CardTitle>
              <CardDescription>Ranked by impact × confidence. Every item includes evidence and estimated ROI.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {priorities.map(p => (
                <div key={p.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="font-semibold">{p.title}</div>
                      {p.problem && <div className="text-sm text-muted-foreground mt-1"><strong>Problem:</strong> {p.problem}</div>}
                      {p.evidence && <div className="text-sm text-muted-foreground mt-1"><strong>Evidence:</strong> {p.evidence}</div>}
                      {p.recommended_action && <div className="text-sm mt-1"><strong>Action:</strong> {p.recommended_action}</div>}
                      {p.estimated_roi && <div className="text-xs text-emerald-500 mt-1">ROI: {p.estimated_roi}</div>}
                    </div>
                    <div className="text-right space-y-1 shrink-0">
                      <Badge className={severityBadge(p.impact === "critical" ? "critical" : p.impact === "high" ? "high" : "warn")}>{p.impact}</Badge>
                      <div className="text-xs text-muted-foreground">confidence {p.confidence}%</div>
                      <div className="text-xs text-muted-foreground">difficulty {p.difficulty}</div>
                    </div>
                  </div>
                  {p.source_module && <div className="text-[10px] uppercase text-muted-foreground/60 mt-2">Source: {p.source_module}</div>}
                </div>
              ))}
              {priorities.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">All priorities cleared.</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals">
          <Card>
            <CardHeader><CardTitle>Goal Center</CardTitle><CardDescription>First-sales, traffic, revenue and profit milestones.</CardDescription></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              {goals.map(g => {
                const pct = Math.min(100, (Number(g.current_value)/Number(g.target_value))*100);
                return (
                  <div key={g.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{g.goal_name}</span>
                      <span className="text-muted-foreground">{g.current_value} / {g.target_value} {g.unit}</span>
                    </div>
                    <Progress value={pct} />
                    <div className="text-xs text-muted-foreground">{pct.toFixed(1)}% complete · {g.goal_category}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle>Connected Genesis Modules</CardTitle>
              <CardDescription>Every module feeds the CEO Command Center. Click to drill down.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {moduleLinks.map(m => {
                const Icon = m.icon;
                return (
                  <Link key={m.to} to={m.to} className="border rounded-lg p-4 hover:border-primary transition flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.to}</div>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <footer className="text-xs text-muted-foreground text-center pt-4 border-t">
        GENESIS V13 · Evidence-first CEO cockpit · Data sources: orders · canonical_sessions · ceo_business_health · ceo_alerts · ceo_priorities · ceo_goals
      </footer>
    </div>
  );
}