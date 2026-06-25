import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const TARGET_HEADLINES_PER_PRODUCT = 20;

type Wave3BSnapshot = {
  eligibleTotal: number;
  productsCompleted: number;
  productsRemaining: number;
  pctComplete: number;
  hooks: number;
  headlines: number;
  descriptions: number;
  scenes: number;
  scenesLibrary: number;
  creditsConsumed: number;
  creditsRemaining: number | null;
  estimatedCreditsPct: number | null;
  successfulBatches: number;
  failedBatches: number;
  retries: number;
  avgSecPerProduct: number | null;
  productsPerMin: number | null;
  etaIso: string | null;
  active: boolean;
  lastRunAt: string | null;
  paused: boolean;
  aiPaused: boolean;
  queueDepth: number;
  errors: Array<{ id: string; productId: string | null; error: string; at: string }>;
  stages: Array<{ name: string; status: "done" | "in_progress" | "pending"; detail: string }>;
};

async function loadWave3B(): Promise<Wave3BSnapshot> {
  const [runs, hooks, headlinesAgg, headlinesDistinct, intel, creditState, queue] = await Promise.all([
    supabase
      .from("pin_wave3_runs")
      .select("id, status, totals, error, started_at, completed_at")
      .eq("wave", "wave3b")
      .order("started_at", { ascending: false })
      .limit(200),
    supabase.from("pin_hook_library_v2").select("id", { count: "exact", head: true }),
    supabase.from("pin_headline_bank").select("id", { count: "exact", head: true }),
    supabase.from("pin_headline_bank").select("product_id"),
    supabase.from("pin_product_intelligence").select("potential_score"),
    supabase
      .from("pinterest_credit_state")
      .select("paused, ai_generation_paused, credits_remaining, estimated_credits_pct")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("pin_wave3_runs")
      .select("id")
      .eq("wave", "wave3b")
      .eq("status", "running"),
  ]);

  // Scene families library (15 expected); per-product scene prompts not yet generated in 3B.
  const scenesLibRes = await supabase.from("pin_scene_style_families").select("id", { count: "exact", head: true });

  const runRows = (runs.data ?? []) as any[];
  const distinctProducts = new Set(((headlinesDistinct.data ?? []) as any[]).map((r) => r.product_id));
  const productsCompleted = distinctProducts.size;

  const eligibleTotal = ((intel.data ?? []) as any[]).filter((r) => (r.potential_score ?? 0) >= 70).length;
  const productsRemaining = Math.max(0, eligibleTotal - productsCompleted);
  const pctComplete = eligibleTotal ? Math.min(100, (productsCompleted / eligibleTotal) * 100) : 0;

  // Batch counters (a "batch" = one pin_wave3_runs row in wave3b).
  let successfulBatches = 0;
  let failedBatches = 0;
  let totalProcessed = 0;
  let totalDurationSec = 0;
  const errors: Wave3BSnapshot["errors"] = [];
  for (const r of runRows) {
    const totals = r.totals ?? {};
    const processed = Number(totals.products_processed ?? 0);
    const failed = Number(totals.failed ?? 0);
    if (r.status === "completed" && failed === 0) successfulBatches++;
    else if (r.status === "failed" || failed > 0) failedBatches++;
    if (r.completed_at && r.started_at && processed > 0) {
      totalProcessed += processed;
      totalDurationSec += (new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000;
    }
    const sample = Array.isArray(totals.failures_sample) ? totals.failures_sample : [];
    for (const f of sample) {
      errors.push({
        id: `${r.id}-${errors.length}`,
        productId: f.product_id ?? f.productId ?? null,
        error: f.error ?? f.reason ?? "unknown",
        at: r.completed_at ?? r.started_at,
      });
    }
    if (r.error) errors.push({ id: r.id, productId: null, error: r.error, at: r.started_at });
  }

  const avgSecPerProduct = totalProcessed > 0 ? totalDurationSec / totalProcessed : null;
  const productsPerMin = avgSecPerProduct ? 60 / avgSecPerProduct : null;
  const etaIso = productsPerMin && productsRemaining > 0
    ? new Date(Date.now() + (productsRemaining / productsPerMin) * 60_000).toISOString()
    : null;

  // Credits consumed since first wave3b run.
  const firstRunIso = runRows.length ? runRows[runRows.length - 1].started_at : null;
  let creditsConsumed = 0;
  if (firstRunIso) {
    const credits = await supabase
      .from("pinterest_credit_events")
      .select("credits_used")
      .gte("created_at", firstRunIso)
      .limit(10000);
    creditsConsumed = ((credits.data ?? []) as any[]).reduce((s, r) => s + Number(r.credits_used ?? 0), 0);
  }

  const cs: any = creditState.data ?? {};
  const lastRunAt = runRows[0]?.completed_at ?? runRows[0]?.started_at ?? null;

  const stages: Wave3BSnapshot["stages"] = [
    {
      name: "Hooks v2 library",
      status: (hooks.count ?? 0) >= 50 ? "done" : (hooks.count ?? 0) > 0 ? "in_progress" : "pending",
      detail: `${hooks.count ?? 0} hooks`,
    },
    {
      name: "Headlines (20 / product)",
      status:
        productsCompleted >= eligibleTotal && eligibleTotal > 0
          ? "done"
          : productsCompleted > 0
          ? "in_progress"
          : "pending",
      detail: `${productsCompleted}/${eligibleTotal} products · ${headlinesAgg.count ?? 0} headlines`,
    },
    {
      name: "Scene style families",
      status: (scenesLibRes.count ?? 0) >= 15 ? "done" : "pending",
      detail: `${scenesLibRes.count ?? 0}/15 families`,
    },
    { name: "Per-product scene prompts", status: "pending", detail: "scheduled for Wave 3C" },
    { name: "Description bank", status: "pending", detail: "scheduled for Wave 3C" },
  ];

  return {
    eligibleTotal,
    productsCompleted,
    productsRemaining,
    pctComplete,
    hooks: hooks.count ?? 0,
    headlines: headlinesAgg.count ?? 0,
    descriptions: 0,
    scenes: 0,
    scenesLibrary: scenesLibRes.count ?? 0,
    creditsConsumed: Number(creditsConsumed.toFixed(2)),
    creditsRemaining: cs.credits_remaining ?? null,
    estimatedCreditsPct: cs.estimated_credits_pct ?? null,
    successfulBatches,
    failedBatches,
    retries: 0, // adaptive retries are internal; not yet wired to a table
    avgSecPerProduct,
    productsPerMin,
    etaIso,
    active: (queue.data ?? []).length > 0,
    lastRunAt,
    paused: !!cs.paused,
    aiPaused: !!cs.ai_generation_paused,
    queueDepth: (queue.data ?? []).length,
    errors: errors.slice(0, 25),
    stages,
  };
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function Wave3BProgressPanel() {
  const [snap, setSnap] = useState<Wave3BSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await loadWave3B();
        if (alive) {
          setSnap(s);
          setUpdated(new Date());
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (err) {
    return (
      <Card>
        <CardContent className="pt-6 text-destructive text-sm">Wave 3B panel error: {err}</CardContent>
      </Card>
    );
  }
  if (!snap) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Loading Wave 3B progress…</CardContent>
      </Card>
    );
  }

  const etaText = snap.etaIso ? new Date(snap.etaIso).toLocaleTimeString() : snap.productsRemaining === 0 ? "complete" : "—";
  const rateText = snap.productsPerMin ? `${snap.productsPerMin.toFixed(1)} products/min` : "—";
  const avgText = snap.avgSecPerProduct ? `${snap.avgSecPerProduct.toFixed(1)}s / product` : "—";

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Wave 3B — Creative Brain Progress</h2>
          <p className="text-xs text-muted-foreground">Live from database · attaches to running execution · auto-refresh 30s</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={snap.active ? "default" : "secondary"}>{snap.active ? "running" : "idle"}</Badge>
          {snap.paused && <Badge variant="destructive">credits paused</Badge>}
          {snap.aiPaused && <Badge variant="destructive">AI gen paused</Badge>}
          <Badge variant="outline">{updated ? `updated ${updated.toLocaleTimeString()}` : "loading…"}</Badge>
        </div>
      </header>

      <Card>
        <CardContent className="pt-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Overall progress</span>
            <span className="text-muted-foreground">
              {snap.productsCompleted}/{snap.eligibleTotal} products · {snap.pctComplete.toFixed(1)}%
            </span>
          </div>
          <Progress value={snap.pctComplete} />
          <div className="text-xs text-muted-foreground">
            {snap.productsRemaining} remaining · ETA {etaText} · {rateText} · last run {snap.lastRunAt ? new Date(snap.lastRunAt).toLocaleString() : "—"}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Hooks generated" value={snap.hooks} sub="pin_hook_library_v2" />
        <Stat
          label="Headlines generated"
          value={snap.headlines}
          sub={`target ${snap.eligibleTotal * TARGET_HEADLINES_PER_PRODUCT}`}
        />
        <Stat label="Scene families" value={`${snap.scenesLibrary}/15`} sub="style library seeded" />
        <Stat label="Descriptions" value={snap.descriptions} sub="Wave 3C" />
        <Stat label="Successful batches" value={snap.successfulBatches} />
        <Stat label="Failed batches" value={snap.failedBatches} />
        <Stat label="Auto retries" value={snap.retries} sub="adaptive 3–15" />
        <Stat label="Avg time / product" value={avgText} sub={rateText} />
        <Stat
          label="Credits consumed (run)"
          value={`$${snap.creditsConsumed}`}
          sub="since first wave3b batch"
        />
        <Stat
          label="Credits remaining"
          value={snap.creditsRemaining != null ? `${snap.creditsRemaining}` : "n/a"}
          sub={snap.estimatedCreditsPct != null ? `${snap.estimatedCreditsPct}% capacity` : undefined}
        />
        <Stat label="Queue depth" value={snap.queueDepth} sub="running wave3b jobs" />
        <Stat
          label="Worker status"
          value={snap.active ? "active" : "idle"}
          sub={snap.paused || snap.aiPaused ? "guardrail engaged" : "guardrails clear"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage completion</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {snap.stages.map((s) => (
              <li key={s.name} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{s.detail}</span>
                  <Badge
                    variant={
                      s.status === "done" ? "default" : s.status === "in_progress" ? "secondary" : "outline"
                    }
                  >
                    {s.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live error log</CardTitle>
        </CardHeader>
        <CardContent>
          {snap.errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No errors logged.</p>
          ) : (
            <ul className="space-y-2 text-sm max-h-72 overflow-auto">
              {snap.errors.map((e) => (
                <li key={e.id} className="flex items-start gap-3">
                  <Badge variant="destructive">error</Badge>
                  <div className="flex-1">
                    <div className="font-mono text-xs text-muted-foreground">{e.productId ?? "—"}</div>
                    <div>{e.error}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}