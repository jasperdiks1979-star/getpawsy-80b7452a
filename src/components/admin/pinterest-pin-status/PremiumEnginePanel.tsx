import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";

type Counts = Record<string, number>;

export default function PremiumEnginePanel() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pinterest-premium-engine"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [{ data: rows }, { data: rt }] = await Promise.all([
        supabase
          .from("pinterest_pin_queue")
          .select("status,meta,error_message,created_at")
          .gte("created_at", since)
          .limit(5000),
        supabase
          .from("pinterest_runtime_settings")
          .select(
            "premium_engine_paused, allow_legacy_product_feed, premium_quality_threshold, non_dropshipping_min, pinterest_fit_min, lifestyle_min, pin_type_target_ratio",
          )
          .eq("id", 1)
          .maybeSingle(),
      ]);
      const counts: Counts = { premium_draft: 0, premium_queued: 0, premium_posted: 0, qa_failed: 0, legacy_blocked: 0 };
      const pinTypes: Counts = { lifestyle: 0, problem_solution: 0, listicle: 0, product_showcase: 0 };
      const failureReasons: Counts = {};
      for (const r of rows ?? []) {
        const isPremium = (r as any)?.meta?.creative_source === "creative_director_v2";
        if (r.status === "rejected" && r.error_message === "rejected_low_quality_supplier_style") {
          counts.legacy_blocked++;
          continue;
        }
        if (!isPremium) continue;
        if (r.status === "draft") counts.premium_draft++;
        else if (r.status === "queued") counts.premium_queued++;
        else if (r.status === "posted" || r.status === "published") {
          counts.premium_posted++;
          const pt = (r as any)?.meta?.pin_type ?? "lifestyle";
          if (pinTypes[pt] !== undefined) pinTypes[pt]++;
        } else if (r.status === "rejected" || r.status === "failed") {
          counts.qa_failed++;
          const reason = r.error_message ?? "unknown";
          failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
        }
      }
      const totalPosted = Object.values(pinTypes).reduce((a, b) => a + b, 0) || 1;
      const ratios = Object.fromEntries(
        Object.entries(pinTypes).map(([k, v]) => [k, v / totalPosted]),
      );
      const topReasons = Object.entries(failureReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      return { counts, ratios, topReasons, rt: rt as any };
    },
    refetchInterval: 60_000,
  });

  async function runDirector() {
    const { data, error } = await supabase.functions.invoke("pinterest-creative-director", {
      body: { action: "run_full", count: 10 },
    });
    if (error) toast({ title: "Director failed", description: error.message, variant: "destructive" });
    else toast({ title: "Director run", description: `Generated ${(data as any)?.generated ?? "?"} drafts` });
    refetch();
  }

  async function togglePause(next: boolean) {
    const { error } = await supabase
      .from("pinterest_runtime_settings")
      .update({ premium_engine_paused: next })
      .eq("id", 1);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else toast({ title: next ? "Engine paused" : "Engine resumed" });
    refetch();
  }

  const rt = data?.rt;
  const target = (rt?.pin_type_target_ratio ?? {}) as Record<string, number>;
  const paused = !!rt?.premium_engine_paused;
  const legacyBypass = !!rt?.allow_legacy_product_feed;

  return (
    <Card className="mb-4 border-2 border-primary/30">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Premium Creative Engine
          {paused ? (
            <Badge variant="destructive">PAUSED</Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
              ACTIVE
            </Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runDirector}>
            Generate 10 premium drafts
          </Button>
          <Button size="sm" variant={paused ? "default" : "destructive"} onClick={() => togglePause(!paused)}>
            {paused ? "Resume engine" : "Emergency stop"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "…" : "refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Raw product-feed pins are blocked by default.</div>
            <div className="text-xs opacity-80">
              Only premium Pinterest creatives (creative_director_v2) may publish.{" "}
              {legacyBypass ? "⚠ Legacy bypass is currently enabled." : "Legacy bypass: off."}
            </div>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {Object.entries(data.counts).map(([k, v]) => (
                <div key={k} className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">{k.replace(/_/g, " ")}</div>
                  <div className="text-lg font-semibold">{v}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Pin-type ratio (last 30d posted) vs target
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(data.ratios).map(([k, v]) => {
                  const t = target[k] ?? 0;
                  const pct = (v * 100).toFixed(0);
                  const tgt = (t * 100).toFixed(0);
                  const ok = Math.abs(v - t) <= 0.1;
                  return (
                    <div key={k} className="rounded border p-2">
                      <div className="text-xs">{k}</div>
                      <div className={"text-sm font-mono " + (ok ? "text-emerald-700" : "text-amber-700")}>
                        {pct}% / {tgt}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {data.topReasons.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Top QA failure reasons</div>
                <div className="flex flex-wrap gap-1">
                  {data.topReasons.map(([reason, n]) => (
                    <Badge key={reason} variant="outline" className="text-xs">
                      {reason} ({n})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              Thresholds — total ≥{rt?.premium_quality_threshold ?? 85}, non-dropshipping ≥
              {rt?.non_dropshipping_min ?? 90}, pinterest-fit ≥{rt?.pinterest_fit_min ?? 85},
              lifestyle ≥{rt?.lifestyle_min ?? 80}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}