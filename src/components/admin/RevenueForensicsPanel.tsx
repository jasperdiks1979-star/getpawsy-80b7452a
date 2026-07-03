import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";

type Finding = {
  id: string;
  rank: number;
  finding_type: string;
  dimension_value: string;
  exit_reason: string | null;
  sessions: number;
  pct_of_total: number;
  est_revenue_loss_cents: number;
  confidence: number;
  suggested_repair: string | null;
  auto_fixable: boolean;
  evidence: any;
};
type Run = {
  run_id: string;
  generated_at: string;
  window_hours: number;
  total_sessions: number;
  total_purchases: number;
  baseline_aov_cents: number;
  baseline_cvr: number;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const TYPE_LABEL: Record<string, string> = {
  exit_reason: "Exit Reasons",
  landing_page: "Landing Pages",
  product: "Products",
  device: "Devices",
  country: "Countries",
  utm_source: "Traffic Sources",
  browser: "Browsers",
};

function Leaderboard({ title, rows }: { title: string; rows: Finding[] }) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{r.rank}
                    </span>
                    <span className="font-medium truncate">{r.dimension_value}</span>
                    {r.exit_reason && (
                      <Badge variant="outline" className="text-[10px]">
                        {r.exit_reason}
                      </Badge>
                    )}
                  </div>
                  {r.suggested_repair && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.suggested_repair}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{r.sessions}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.pct_of_total.toFixed(1)}% · conf {r.confidence}
                  </div>
                  <div className="text-xs text-red-600 mt-1">
                    -{money(r.est_revenue_loss_cents)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RevenueForensicsPanel() {
  const qc = useQueryClient();
  const [hours, setHours] = useState(24);

  const latestRun = useQuery({
    queryKey: ["rcc-run"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Run | null> => {
      const { data, error } = await supabase
        .from("revenue_root_cause_runs")
        .select("run_id,generated_at,window_hours,total_sessions,total_purchases,baseline_aov_cents,baseline_cvr")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Run | null;
    },
  });

  const findings = useQuery({
    queryKey: ["rcc-findings", latestRun.data?.run_id],
    enabled: !!latestRun.data?.run_id,
    queryFn: async (): Promise<Finding[]> => {
      const { data, error } = await supabase
        .from("revenue_root_cause_findings")
        .select("id,rank,finding_type,dimension_value,exit_reason,sessions,pct_of_total,est_revenue_loss_cents,confidence,suggested_repair,auto_fixable,evidence")
        .eq("run_id", latestRun.data!.run_id)
        .order("finding_type")
        .order("rank");
      if (error) throw error;
      return (data ?? []) as Finding[];
    },
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("revenue-root-cause", {
        body: {},
        // pass hours as query
        headers: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rcc-run"] });
      qc.invalidateQueries({ queryKey: ["rcc-findings"] });
    },
  });

  const run = latestRun.data;
  const rows = findings.data ?? [];
  const grouped: Record<string, Finding[]> = {};
  rows.forEach((r) => {
    (grouped[r.finding_type] ??= []).push(r);
  });

  const totalLoss = (grouped.exit_reason ?? []).reduce(
    (a, r) => a + Number(r.est_revenue_loss_cents),
    0,
  );
  const estMonthly = run ? totalLoss * Math.round((30 * 24) / run.window_hours) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>AI Conversion Forensics</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {run
                ? `Run ${new Date(run.generated_at).toLocaleString()} · window ${run.window_hours}h · ${run.total_sessions} human sessions · ${run.total_purchases} purchases · baseline AOV ${money(run.baseline_aov_cents)} · CVR ${(run.baseline_cvr * 100).toFixed(2)}%`
                : "No run yet — click Run Now."}
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
          >
            {runNow.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Run Now
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">Est. lost revenue (window)</div>
            <div className="text-lg font-semibold text-red-600">{money(totalLoss)}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">
              Est. monthly recoverable
            </div>
            <div className="text-lg font-semibold text-emerald-700">
              {money(estMonthly)}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">Findings</div>
            <div className="text-lg font-semibold">{rows.length}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">Auto-fixable</div>
            <div className="text-lg font-semibold flex items-center gap-1">
              <Zap className="w-4 h-4 text-amber-500" />
              {rows.filter((r) => r.auto_fixable).length}
            </div>
          </div>
        </CardContent>
      </Card>

      {findings.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading findings…
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(grouped).map(([type, rows]) => (
          <Leaderboard key={type} title={TYPE_LABEL[type] ?? type} rows={rows} />
        ))}
      </div>
    </div>
  );
}