/**
 * CRO Command Center — runs the forensic conversion audit, shows scores,
 * findings ranked by ROI, and the autonomous safe-fix log.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, ShieldCheck, Gauge, AlertTriangle, Zap } from "lucide-react";

type Run = {
  id: string;
  finished_at: string | null;
  status: string;
  conversion_probability_score: number | null;
  trust_score: number | null;
  friction_score: number | null;
  mobile_usability_score: number | null;
  expected_conversion_rate: number | null;
  revenue_impact_30d: number | null;
  findings_total: number | null;
  auto_fixes_applied: number | null;
};

type Finding = {
  id: string;
  surface: string;
  category: string;
  severity: string;
  title: string;
  description: string | null;
  expected_cr_lift_pct: number | null;
  revenue_impact_30d: number | null;
  roi_rank: number | null;
  auto_fixed: boolean | null;
  requires_approval: boolean | null;
  status: string;
};

const sev: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-muted text-foreground",
};

export default function CroCommandCenterPage() {
  const qc = useQueryClient();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const runs = useQuery({
    queryKey: ["cro-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cro_audit_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Run[];
    },
  });

  const latest = activeRunId
    ? runs.data?.find((r) => r.id === activeRunId)
    : runs.data?.[0];

  const findings = useQuery({
    queryKey: ["cro-findings", latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cro_findings")
        .select("*")
        .eq("run_id", latest!.id)
        .order("roi_rank", { ascending: true });
      if (error) throw error;
      return data as Finding[];
    },
  });

  const runAudit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("cro-audit-orchestrator", {
        body: {},
      });
      if (error) throw error;
      return data as { ok: boolean; run_id: string };
    },
    onSuccess: (d) => {
      toast.success("Audit complete");
      setActiveRunId(d.run_id);
      qc.invalidateQueries({ queryKey: ["cro-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Helmet><title>CRO Command Center | Admin</title></Helmet>
      <div className="container py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">CRO Command Center</h1>
            <p className="text-muted-foreground">
              Forensic conversion audit, scoring, and autonomous safe-fix log.
            </p>
          </div>
          <Button onClick={() => runAudit.mutate()} disabled={runAudit.isPending} size="lg">
            {runAudit.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run audit
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <ScoreCard icon={<Gauge />} label="Conversion Probability" value={latest?.conversion_probability_score} />
          <ScoreCard icon={<ShieldCheck />} label="Trust" value={latest?.trust_score} />
          <ScoreCard icon={<AlertTriangle />} label="Friction" value={latest?.friction_score} invert />
          <ScoreCard icon={<Zap />} label="Mobile UX" value={latest?.mobile_usability_score} />
          <ScoreCard icon={<Gauge />} label="Expected CR %" value={latest?.expected_conversion_rate} unit="%" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Findings ranked by ROI</CardTitle>
          </CardHeader>
          <CardContent>
            {findings.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : !findings.data?.length ? (
              <p className="text-sm text-muted-foreground">
                No audit run yet — click <strong>Run audit</strong> to start.
              </p>
            ) : (
              <div className="space-y-3">
                {findings.data.map((f) => (
                  <div key={f.id} className="border rounded-lg p-4 flex items-start gap-4">
                    <div className="text-xs font-mono w-8 text-muted-foreground">#{f.roi_rank}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={sev[f.severity] ?? sev.low}>{f.severity}</Badge>
                        <Badge variant="outline">{f.surface}</Badge>
                        <Badge variant="outline">{f.category}</Badge>
                        {f.auto_fixed && <Badge className="bg-emerald-600 text-white">auto-fixed</Badge>}
                        {f.requires_approval && <Badge variant="destructive">needs approval</Badge>}
                      </div>
                      <div className="font-medium mt-1">{f.title}</div>
                      {f.description && (
                        <div className="text-sm text-muted-foreground mt-1">{f.description}</div>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold">+{Number(f.expected_cr_lift_pct ?? 0).toFixed(1)}%</div>
                      <div className="text-muted-foreground">
                        ${Math.round(Number(f.revenue_impact_30d ?? 0)).toLocaleString()}/mo
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {(runs.data ?? []).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActiveRunId(r.id)}
                  className={`block w-full text-left px-3 py-2 rounded border hover:bg-muted ${
                    latest?.id === r.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="font-mono text-xs">{r.id.slice(0, 8)}</span>
                  <span className="ml-3">{r.status}</span>
                  <span className="ml-3 text-muted-foreground">
                    {r.finished_at ? new Date(r.finished_at).toLocaleString() : "running"}
                  </span>
                  <span className="ml-3">
                    {r.findings_total ?? 0} findings · {r.auto_fixes_applied ?? 0} auto-fixed
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ScoreCard({
  icon, label, value, unit, invert,
}: { icon: React.ReactNode; label: string; value: number | null | undefined; unit?: string; invert?: boolean }) {
  const v = value == null ? null : Number(value);
  const tone =
    v == null ? "text-muted-foreground"
      : invert
        ? v < 30 ? "text-emerald-600" : v < 60 ? "text-yellow-600" : "text-destructive"
        : v > 70 ? "text-emerald-600" : v > 40 ? "text-yellow-600" : "text-destructive";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon} {label}
        </div>
        <div className={`text-3xl font-bold mt-2 ${tone}`}>
          {v == null ? "—" : v.toFixed(unit === "%" ? 2 : 0)}{unit ?? ""}
        </div>
      </CardContent>
    </Card>
  );
}