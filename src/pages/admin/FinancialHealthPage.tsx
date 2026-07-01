import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, TrendingUp, AlertTriangle, CheckCircle2, FileText, Sparkles, Receipt, Building2 } from "lucide-react";

type Score = {
  score_key: string;
  score_name: string;
  score_value: number;
  score_grade: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  computed_at: string;
};

type Action = {
  id: string;
  title: string;
  detail: string | null;
  priority: string;
  category: string | null;
  status: string;
  action_type: string;
};

type Finding = {
  id: string;
  finding_type: string;
  severity: string;
  title: string;
  detail: string | null;
  status: string;
  detected_at: string;
};

const grade = (v: number) =>
  v >= 90 ? "A" : v >= 75 ? "B" : v >= 60 ? "C" : v >= 40 ? "D" : "F";

const gradeColor = (g: string) =>
  g === "A"
    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : g === "B"
    ? "bg-sky-500/15 text-sky-600 border-sky-500/30"
    : g === "C"
    ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
    : "bg-rose-500/15 text-rose-600 border-rose-500/30";

export default function FinancialHealthPage() {
  const [scores, setScores] = useState<Score[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: a }, { data: f }] = await Promise.all([
        supabase.from("finance_health_scores").select("*").order("score_key"),
        supabase.from("finance_actions").select("*").eq("status", "open").order("priority", { ascending: false }),
        supabase.from("finance_risk_findings").select("*").eq("status", "open").order("detected_at", { ascending: false }).limit(20),
      ]);
      setScores((s ?? []) as Score[]);
      setActions((a ?? []) as Action[]);
      setFindings((f ?? []) as Finding[]);
      setLoading(false);
    })();
  }, []);

  const overall = useMemo(() => scores.find((x) => x.score_key === "overall"), [scores]);
  const subs = useMemo(() => scores.filter((x) => x.score_key !== "overall"), [scores]);

  const markAction = async (id: string, status: string) => {
    await supabase.from("finance_actions").update({ status, resolved_at: status === "done" ? new Date().toISOString() : null }).eq("id", id);
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest">
            <Shield className="h-3.5 w-3.5" /> Genesis V12.1
          </div>
          <h1 className="text-3xl font-semibold mt-2">Financial Health & Compliance</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Continuous financial intelligence: accounting completeness, VAT readiness, cashflow, risk, and audit readiness — with per-score explanations.
          </p>
        </div>
        {overall && (
          <Card className="min-w-[240px]">
            <CardContent className="p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Overall Score</div>
              <div className="flex items-baseline gap-2 mt-1">
                <div className="text-5xl font-semibold">{overall.score_value}</div>
                <Badge variant="outline" className={gradeColor(grade(overall.score_value))}>
                  {grade(overall.score_value)}
                </Badge>
              </div>
              <Progress value={overall.score_value} className="mt-3" />
              <p className="text-xs text-muted-foreground mt-2">{overall.reason}</p>
            </CardContent>
          </Card>
        )}
      </header>

      <Tabs defaultValue="scores">
        <TabsList>
          <TabsTrigger value="scores"><Sparkles className="h-4 w-4 mr-2" />Health Scores</TabsTrigger>
          <TabsTrigger value="actions"><CheckCircle2 className="h-4 w-4 mr-2" />Action Center ({actions.length})</TabsTrigger>
          <TabsTrigger value="risk"><AlertTriangle className="h-4 w-4 mr-2" />Risk ({findings.length})</TabsTrigger>
          <TabsTrigger value="compliance"><FileText className="h-4 w-4 mr-2" />Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="scores" className="mt-6">
          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subs.map((s) => {
                const g = s.score_grade ?? grade(s.score_value);
                return (
                  <Card key={s.score_key}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{s.score_name}</CardTitle>
                        <Badge variant="outline" className={gradeColor(g)}>{g}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-baseline gap-2">
                        <div className="text-3xl font-semibold">{s.score_value}</div>
                        <div className="text-xs text-muted-foreground">/ 100</div>
                      </div>
                      <Progress value={s.score_value} className="mt-2" />
                      {s.reason && <p className="text-xs text-muted-foreground mt-3">{s.reason}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="actions" className="mt-6 space-y-3">
          {actions.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              All caught up. No open finance actions.
            </CardContent></Card>
          )}
          {actions.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={a.priority === "urgent" || a.priority === "high" ? "destructive" : "secondary"}>{a.priority}</Badge>
                    {a.category && <Badge variant="outline">{a.category}</Badge>}
                    <span className="font-medium">{a.title}</span>
                  </div>
                  {a.detail && <p className="text-sm text-muted-foreground mt-1">{a.detail}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => markAction(a.id, "done")}>Done</Button>
                  <Button size="sm" variant="ghost" onClick={() => markAction(a.id, "dismissed")}>Dismiss</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="risk" className="mt-6 space-y-3">
          {findings.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              No open risk findings.
            </CardContent></Card>
          )}
          {findings.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={f.severity === "critical" || f.severity === "high" ? "destructive" : "secondary"}>{f.severity}</Badge>
                  <Badge variant="outline">{f.finding_type}</Badge>
                  <span className="font-medium">{f.title}</span>
                </div>
                {f.detail && <p className="text-sm text-muted-foreground mt-1">{f.detail}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="compliance" className="mt-6">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" />Bookkeeper Mode</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>Read-only bookkeeping views are exposed via the Accountant Portal at <code>/admin/accountant</code>.</p>
                <Button variant="outline" size="sm" asChild><a href="/admin/accountant">Open portal</a></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />Belastingdienst Mode</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>Inspection package (invoices, receipts, VAT, audit trail, SHA-256 hashes) is compiled from the Evidence Vault.</p>
                <Button variant="outline" size="sm" asChild><a href="/admin/evidence-vault">Open Evidence Vault</a></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Executive Reports</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>Monthly / quarterly / annual reports are registered in <code>finance_reports</code> and pinned in the Intelligence Vault.</p>
                <Button variant="outline" size="sm" asChild><a href="/admin/vault">Open Vault</a></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />V12.1 Certification</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Certification PDF is generated and registered in the Vault as <em>GENESIS V12.1 — Financial Health Certification</em>.
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}