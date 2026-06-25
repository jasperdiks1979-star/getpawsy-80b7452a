import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";

type Snap = {
  wave3bPct: number;
  wave3cPct: number;
  goldenTarget: number;
  goldenDone: number;
  goldenRemaining: number;
  goldenFailed: number;
  avgQuality: number;
  avgVisual: number;
  avgLanding: number;
  avgHook: number;
  avgHeadline: number;
  avgDiversity: number;
  avgConfidence: number;
  ctrPred: number;
  convPred: number;
  autoRegens: number;
  retryDistribution: Record<string, number>;
  failedProducts: Array<{ slug: string; reason: string }>;
  creditsUsed: number;
  creditsRemaining: number | null;
  estCostRemaining: number;
  estFinish: string | null;
  alerts: Array<{ metric: string; value: number; threshold: number }>;
  qualityGate: number;
  potentialMin: number;
};

const PUBLISH_THRESHOLD = 99;

function avg(arr: number[]): number {
  const f = arr.filter((n) => Number.isFinite(n));
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
}

async function loadSnap(): Promise<Snap> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [settingsRes, intelRes, headlinesRes, goldenRes, scoresRes, creditEventsRes, creditStateRes, scenesRes] = await Promise.all([
    supabase.from("pin_wave3_settings").select("key, value"),
    supabase.from("pin_product_intelligence").select("product_id, potential_score").gte("potential_score", 70),
    supabase.from("pin_headline_bank").select("product_id"),
    supabase.from("pin_golden_batch").select("product_slug, status, overall_score, ctr_prediction, conv_prediction, variants_generated, variants_passed, retries_used, meta, created_at"),
    supabase.from("pin_creative_scores").select("visual_realism, product_match, landing_score, hook_score, overall, ctr_prediction, conversion_prediction, passed_gate, rejection_reasons, created_at").gte("created_at", since).limit(3000),
    supabase.from("pinterest_credit_events").select("credits_used, created_at").gte("created_at", since).limit(5000),
    supabase.from("pinterest_credit_state").select("credits_remaining, daily_burn_rate").eq("id", 1).maybeSingle(),
    supabase.from("pin_scene_style_families").select("id"),
  ]);

  const settings: Record<string, any> = {};
  for (const r of settingsRes.data ?? []) settings[(r as any).key] = (r as any).value;
  const goldenTarget: number = Number(settings.golden_batch_size ?? 100);
  const qualityGate: number = Number(settings.quality_gate ?? 0.99) * 100;
  const potentialMin: number = Number(settings.potential_min ?? 70);

  const eligibleIds = new Set((intelRes.data ?? []).map((r: any) => r.product_id));
  const eligibleTotal = eligibleIds.size || 1;

  // Wave 3B: products with >=15 headlines (per execution log)
  const headlineCounts = new Map<string, number>();
  for (const r of headlinesRes.data ?? []) {
    const pid = (r as any).product_id;
    headlineCounts.set(pid, (headlineCounts.get(pid) ?? 0) + 1);
  }
  let wave3bDone = 0;
  for (const pid of eligibleIds) if ((headlineCounts.get(pid) ?? 0) >= 15) wave3bDone++;
  const wave3bPct = Math.min(100, Math.round((wave3bDone / eligibleTotal) * 100));

  const golden = (goldenRes.data ?? []) as any[];
  const goldenDone = golden.filter((g) => ["winner", "completed", "passed"].includes(g.status)).length;
  const goldenFailed = golden.filter((g) => g.status === "failed").length;
  const goldenRemaining = Math.max(0, goldenTarget - goldenDone);

  // Wave 3C readiness = share of golden products with a winning variant relative to target
  const wave3cPct = Math.min(100, Math.round((goldenDone / Math.max(1, goldenTarget)) * 100));

  const scores = (scoresRes.data ?? []) as any[];
  const avgQuality = Number(avg(scores.map((s) => Number(s.overall ?? 0))).toFixed(2));
  const avgVisual = Number(avg(scores.map((s) => Number(s.visual_realism ?? 0))).toFixed(2));
  const avgLanding = Number(avg(scores.map((s) => Number(s.landing_score ?? 0))).toFixed(2));
  const avgHook = Number(avg(scores.map((s) => Number(s.hook_score ?? 0))).toFixed(2));
  const ctrPred = Number(avg(scores.map((s) => Number(s.ctr_prediction ?? 0))).toFixed(2));
  const convPred = Number(avg(scores.map((s) => Number(s.conversion_prediction ?? 0))).toFixed(2));

  // Headline + scene diversity + confidence pulled from golden meta where present
  const headlineScores: number[] = [];
  const diversityScores: number[] = [];
  const confidenceScores: number[] = [];
  let autoRegens = 0;
  const retryDist: Record<string, number> = {};
  const failedProducts: Array<{ slug: string; reason: string }> = [];
  for (const g of golden) {
    const m = g.meta ?? {};
    if (Number.isFinite(Number(m.headline_score))) headlineScores.push(Number(m.headline_score));
    if (Number.isFinite(Number(m.diversity_score))) diversityScores.push(Number(m.diversity_score));
    if (Number.isFinite(Number(m.confidence))) confidenceScores.push(Number(m.confidence));
    autoRegens += Number(m.auto_regenerations ?? 0);
    const r = Number(g.retries_used ?? 0);
    const bucket = r >= 12 ? "12-15" : r >= 9 ? "9-11" : r >= 6 ? "6-8" : r >= 3 ? "3-5" : "0-2";
    retryDist[bucket] = (retryDist[bucket] ?? 0) + 1;
    if (g.status === "failed") failedProducts.push({ slug: g.product_slug, reason: String(m.failure_reason ?? "below_gate") });
  }
  const avgHeadline = Number(avg(headlineScores).toFixed(2));
  const avgDiversity = Number(avg(diversityScores).toFixed(2));
  const avgConfidence = Number(avg(confidenceScores).toFixed(2));

  const creditEvents = (creditEventsRes.data ?? []) as any[];
  const creditsUsed = Number(creditEvents.reduce((s, r) => s + Number(r.credits_used ?? 0), 0).toFixed(2));
  const creditsRemaining = creditStateRes.data ? (creditStateRes.data as any).credits_remaining : null;
  // Cost remaining estimate: avg cost per completed golden product * remaining
  const costPerProduct = goldenDone ? creditsUsed / Math.max(1, goldenDone) : 0;
  const estCostRemaining = Number((costPerProduct * goldenRemaining).toFixed(2));

  // ETA based on completion rate over last 24h
  let estFinish: string | null = null;
  if (golden.length > 0 && goldenRemaining > 0) {
    const recent = golden.filter((g) => new Date(g.created_at).getTime() > Date.now() - 3600_000 * 6);
    const ratePerHour = recent.length / 6;
    if (ratePerHour > 0) {
      const hoursLeft = goldenRemaining / ratePerHour;
      estFinish = new Date(Date.now() + hoursLeft * 3600_000).toLocaleString();
    }
  }

  const alerts: Array<{ metric: string; value: number; threshold: number }> = [];
  const pushAlert = (label: string, v: number) => {
    if (v > 0 && v < PUBLISH_THRESHOLD) alerts.push({ metric: label, value: v, threshold: PUBLISH_THRESHOLD });
  };
  pushAlert("Quality", avgQuality);
  pushAlert("Visual", avgVisual);
  pushAlert("Landing", avgLanding);
  pushAlert("Hook", avgHook);
  if (avgHeadline) pushAlert("Headline", avgHeadline);
  if (avgConfidence) pushAlert("Confidence", avgConfidence);

  return {
    wave3bPct,
    wave3cPct,
    goldenTarget,
    goldenDone,
    goldenRemaining,
    goldenFailed,
    avgQuality,
    avgVisual,
    avgLanding,
    avgHook,
    avgHeadline,
    avgDiversity,
    avgConfidence,
    ctrPred,
    convPred,
    autoRegens,
    retryDistribution: retryDist,
    failedProducts: failedProducts.slice(0, 10),
    creditsUsed,
    creditsRemaining,
    estCostRemaining,
    estFinish,
    alerts,
    qualityGate,
    potentialMin,
  };
}

function Stat({ label, value, sub, danger }: { label: string; value: string | number; sub?: string; danger?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${danger ? "border-destructive/40 bg-destructive/5" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${danger ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function GoldenBatchMonitorPanel() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await loadSnap();
        if (alive) { setSnap(s); setUpdated(new Date()); setErr(null); }
      } catch (e) { if (alive) setErr((e as Error).message); }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Golden Batch Monitor</span>
          <Badge variant="outline">{updated ? `updated ${updated.toLocaleTimeString()}` : "loading…"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {err && <div className="text-sm text-destructive">{err}</div>}
        {!snap && !err && <div className="text-sm text-muted-foreground">Loading live snapshot…</div>}
        {snap && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Wave 3B completion</span><span className="font-medium">{snap.wave3bPct}%</span></div>
                <Progress value={snap.wave3bPct} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Wave 3C readiness</span><span className="font-medium">{snap.wave3cPct}%</span></div>
                <Progress value={snap.wave3cPct} />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Golden completed" value={`${snap.goldenDone}/${snap.goldenTarget}`} sub={`${snap.goldenRemaining} remaining`} />
              <Stat label="Failed products" value={snap.goldenFailed} danger={snap.goldenFailed > 0} />
              <Stat label="Auto-regenerations" value={snap.autoRegens} />
              <Stat label="Est. finish" value={snap.estFinish ?? "—"} sub={snap.estFinish ? "based on 6h rate" : "no recent throughput"} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Avg quality" value={snap.avgQuality} danger={snap.avgQuality > 0 && snap.avgQuality < PUBLISH_THRESHOLD} />
              <Stat label="Avg visual" value={snap.avgVisual} danger={snap.avgVisual > 0 && snap.avgVisual < PUBLISH_THRESHOLD} />
              <Stat label="Avg landing" value={snap.avgLanding} danger={snap.avgLanding > 0 && snap.avgLanding < PUBLISH_THRESHOLD} />
              <Stat label="Avg hook" value={snap.avgHook} danger={snap.avgHook > 0 && snap.avgHook < PUBLISH_THRESHOLD} />
              <Stat label="Avg headline" value={snap.avgHeadline || "—"} />
              <Stat label="Avg scene diversity" value={snap.avgDiversity || "—"} />
              <Stat label="Avg confidence" value={snap.avgConfidence || "—"} />
              <Stat label="CTR / Conv pred" value={`${snap.ctrPred}% / ${snap.convPred}%`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Credits consumed (24h)" value={`$${snap.creditsUsed}`} />
              <Stat label="Credits remaining" value={snap.creditsRemaining ?? "—"} />
              <Stat label="Est. cost remaining" value={`$${snap.estCostRemaining}`} />
              <Stat label="Quality gate" value={`${snap.qualityGate}%`} sub={`potential ≥ ${snap.potentialMin}`} />
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Retry distribution</div>
              <div className="grid grid-cols-5 gap-2">
                {["0-2", "3-5", "6-8", "9-11", "12-15"].map((b) => (
                  <div key={b} className="rounded-md border p-2 text-center">
                    <div className="text-xs text-muted-foreground">{b}</div>
                    <div className="text-lg font-semibold">{snap.retryDistribution[b] ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>

            {snap.failedProducts.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Failed products</div>
                <ul className="space-y-1 text-sm">
                  {snap.failedProducts.map((p) => (
                    <li key={p.slug} className="flex justify-between border-b py-1">
                      <span className="font-mono text-xs">{p.slug}</span>
                      <span className="text-muted-foreground text-xs">{p.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {snap.alerts.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                  <AlertTriangle className="h-4 w-4" /> Quality metrics below publish threshold ({PUBLISH_THRESHOLD})
                </div>
                <ul className="text-sm space-y-1">
                  {snap.alerts.map((a) => (
                    <li key={a.metric} className="flex justify-between">
                      <span>{a.metric}</span>
                      <span className="font-mono">{a.value} &lt; {a.threshold}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}