// Pinterest Evolution Engine — closed learning loop.
// Consumes REAL Pinterest performance from certified sources
// (pinterest_pin_queue + pinterest_analytics_daily + pcie2_pin_performance +
// pinterest_creative_factory_jobs.metrics) and produces:
//   - append-only attribute-effect snapshots
//   - permanent winners memory
//   - active prompt-directive recommendations consumed by the factory
// It never modifies any certified guard (PRE, CI, Guardian, Success DNA,
// Organic Intelligence, Pinterest Native Intelligence, PCIE2 publisher).
// Organic performance is the only truth used to compute effects.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PinRow = {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  pinterest_pin_id: string;
  board_name: string | null;
  category_key: string | null;
  hook_group: string | null;
  posted_at: string | null;
  meta: Record<string, unknown> | null;
};

type AnalyticsAgg = {
  impressions: number;
  saves: number;
  outbound_clicks: number;
  pin_clicks: number;
  days: number;
};

type FactoryMetrics = {
  pinterest_native_intelligence?: {
    winner?: string;
    pinterest_native_score?: number;
    predicted_pre?: number;
    predicted_ci?: number;
    attempt_strategy?: string;
  };
  [k: string]: unknown;
};

type PerfRow = {
  organic_purchases: number;
  organic_revenue: number;
};

type PinContext = {
  pin: PinRow;
  analytics: AnalyticsAgg;
  perf: PerfRow;
  attributes: Record<string, string>;
};

const METRICS = [
  "organic_saves",
  "organic_clicks",
  "organic_impressions",
  "organic_purchases",
  "organic_revenue",
] as const;
type Metric = typeof METRICS[number];

function bandFromScore(s: number | undefined | null): string | null {
  if (typeof s !== "number" || !Number.isFinite(s)) return null;
  if (s >= 95) return "95-100";
  if (s >= 90) return "90-94";
  if (s >= 80) return "80-89";
  if (s >= 70) return "70-79";
  return "<70";
}

function extractAttributes(pin: PinRow, m: FactoryMetrics): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (pin.board_name) attrs.board = pin.board_name.slice(0, 80);
  if (pin.category_key) attrs.category = pin.category_key.slice(0, 80);
  if (pin.hook_group) attrs.hook = pin.hook_group.slice(0, 80);
  if (pin.product_slug) attrs.product = pin.product_slug.slice(0, 80);

  const meta = pin.meta ?? {};
  const intel = (meta as any)?.intelligence ?? {};
  if (typeof intel?.niche_key === "string") attrs.niche = intel.niche_key;
  if (typeof (meta as any)?.creative_style === "string") {
    attrs.creative_style = (meta as any).creative_style;
  }
  if (typeof (meta as any)?.content_type === "string") {
    attrs.content_type = (meta as any).content_type;
  }
  const ni = m?.pinterest_native_intelligence;
  if (ni?.winner) attrs.ni_winner_angle = String(ni.winner).slice(0, 60);
  const band = bandFromScore(ni?.pinterest_native_score);
  if (band) attrs.native_score_band = band;
  const preBand = bandFromScore(ni?.predicted_pre);
  if (preBand) attrs.predicted_pre_band = preBand;
  if (ni?.attempt_strategy) attrs.attempt_strategy = String(ni.attempt_strategy);

  // Season / holiday tagging from posted_at
  if (pin.posted_at) {
    const d = new Date(pin.posted_at);
    const m0 = d.getUTCMonth() + 1;
    const season = m0 <= 2 || m0 === 12 ? "winter" : m0 <= 5 ? "spring" : m0 <= 8 ? "summer" : "fall";
    attrs.season = season;
    const holiday = detectHoliday(d);
    if (holiday) attrs.holiday = holiday;
  }
  return attrs;
}

function detectHoliday(d: Date): string | null {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (m === 10 && day >= 15) return "halloween";
  if (m === 11 && day >= 20 && day <= 30) return "black_friday_week";
  if (m === 12 && day >= 1 && day <= 26) return "christmas";
  if (m === 5 && day >= 6 && day <= 14) return "mothers_day";
  if (m === 6 && day >= 12 && day <= 20) return "fathers_day";
  return null;
}

function metricValue(ctx: PinContext, metric: Metric): number {
  const a = ctx.analytics;
  switch (metric) {
    case "organic_impressions":
      return a.impressions;
    case "organic_saves":
      return a.saves;
    case "organic_clicks":
      return a.outbound_clicks + a.pin_clicks;
    case "organic_purchases":
      return ctx.perf.organic_purchases;
    case "organic_revenue":
      return ctx.perf.organic_revenue;
  }
}

function humanizeDirective(attribute: string, value: string, metric: Metric, effectPct: number): {
  directive: string;
  reason: string;
} {
  const dir = `Prefer ${attribute.replace(/_/g, " ")} = "${value}"`;
  const reason = `${effectPct > 0 ? "+" : ""}${effectPct.toFixed(1)}% ${metric.replace("organic_", "organic ")} vs cohort`;
  return { directive: dir, reason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, srv);

  const started = Date.now();
  const { data: runIns } = await sb
    .from("pinterest_evolution_runs")
    .insert({ status: "running" })
    .select("id")
    .maybeSingle();
  const runId = runIns?.id as string | undefined;

  try {
    // Read the last N days of posted pins.
    const lookbackDays = 90;
    const sinceIso = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();

    const { data: pinsRaw, error: pinsErr } = await sb
      .from("pinterest_pin_queue")
      .select(
        "id, product_id, product_slug, pinterest_pin_id, board_name, category_key, hook_group, posted_at, meta",
      )
      .eq("status", "posted")
      .not("pinterest_pin_id", "is", null)
      .gte("posted_at", sinceIso)
      .limit(2000);
    if (pinsErr) throw pinsErr;
    const pins = (pinsRaw ?? []) as PinRow[];

    if (pins.length === 0) {
      await sb.from("pinterest_evolution_runs").update({
        status: "empty",
        pins_analyzed: 0,
        duration_ms: Date.now() - started,
        finished_at: new Date().toISOString(),
      }).eq("id", runId!);
      return new Response(
        JSON.stringify({ ok: true, pins_analyzed: 0, reason: "no_posted_pins" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pinIds = pins.map((p) => p.pinterest_pin_id);
    const queueIds = pins.map((p) => p.id);

    // Analytics per pin (aggregate over lifetime)
    const { data: adRows } = await sb
      .from("pinterest_analytics_daily")
      .select("pin_id, impressions, saves, outbound_clicks, pin_clicks")
      .in("pin_id", pinIds);
    const analyticsMap = new Map<string, AnalyticsAgg>();
    for (const r of (adRows ?? []) as any[]) {
      const cur = analyticsMap.get(r.pin_id) ?? {
        impressions: 0, saves: 0, outbound_clicks: 0, pin_clicks: 0, days: 0,
      };
      cur.impressions += Number(r.impressions ?? 0);
      cur.saves += Number(r.saves ?? 0);
      cur.outbound_clicks += Number(r.outbound_clicks ?? 0);
      cur.pin_clicks += Number(r.pin_clicks ?? 0);
      cur.days += 1;
      analyticsMap.set(r.pin_id, cur);
    }

    // Revenue per pin (from pcie2_pin_performance latest row per pin)
    const { data: perfRows } = await sb
      .from("pcie2_pin_performance")
      .select("pin_id, conversion_value, measured_at, raw")
      .in("pin_id", pinIds)
      .order("measured_at", { ascending: false });
    const perfMap = new Map<string, PerfRow>();
    for (const r of (perfRows ?? []) as any[]) {
      if (perfMap.has(r.pin_id)) continue; // keep latest only
      const raw = (r.raw ?? {}) as any;
      perfMap.set(r.pin_id, {
        organic_purchases: Number(raw?.organic_purchases ?? raw?.purchases ?? 0),
        organic_revenue: Number(r.conversion_value ?? raw?.revenue ?? 0),
      });
    }

    // Factory metrics per pin (attributes)
    const { data: jobRows } = await sb
      .from("pinterest_creative_factory_jobs")
      .select("pin_queue_id, metrics, quality, prompt")
      .in("pin_queue_id", queueIds);
    const jobMap = new Map<string, FactoryMetrics>();
    for (const j of (jobRows ?? []) as any[]) {
      if (!j.pin_queue_id) continue;
      jobMap.set(j.pin_queue_id, (j.metrics ?? {}) as FactoryMetrics);
    }

    // Build contexts
    const contexts: PinContext[] = pins.map((pin) => {
      const a = analyticsMap.get(pin.pinterest_pin_id) ??
        { impressions: 0, saves: 0, outbound_clicks: 0, pin_clicks: 0, days: 0 };
      const perf = perfMap.get(pin.pinterest_pin_id) ??
        { organic_purchases: 0, organic_revenue: 0 };
      const jm = jobMap.get(pin.id) ?? {};
      return { pin, analytics: a, perf, attributes: extractAttributes(pin, jm) };
    });

    // Compute global baselines per metric
    const baselines: Record<Metric, number> = Object.fromEntries(
      METRICS.map((m) => {
        const values = contexts.map((c) => metricValue(c, m));
        const mean = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
        return [m, mean];
      }),
    ) as Record<Metric, number>;

    // For each (attribute, value), compute per-metric cohort mean and lift.
    const attrIndex = new Map<string, Map<string, PinContext[]>>();
    for (const c of contexts) {
      for (const [a, v] of Object.entries(c.attributes)) {
        if (!attrIndex.has(a)) attrIndex.set(a, new Map());
        const bucket = attrIndex.get(a)!;
        if (!bucket.has(v)) bucket.set(v, []);
        bucket.get(v)!.push(c);
      }
    }

    // Compute first-pass certification / recovery from the run window
    const firstPass = (jobRows ?? []).filter((j: any) =>
      Number(j?.quality?.scores?.total ?? 0) > 0 && Number(j?.metrics?.attempts ?? 1) === 1
    ).length;
    const firstPassRate = (jobRows?.length ?? 0) > 0 ? firstPass / (jobRows!.length) : null;
    const recoveryRate = (jobRows?.length ?? 0) > 0
      ? (jobRows ?? []).filter((j: any) => Number(j?.metrics?.attempts ?? 1) > 1 && j?.quality?.scores?.total).length /
        Math.max(1, (jobRows ?? []).filter((j: any) => Number(j?.metrics?.attempts ?? 1) > 1).length)
      : null;

    // Create the version row first so we can foreign-key everything to it.
    const { data: lastV } = await sb
      .from("pinterest_evolution_versions")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (lastV?.version ?? 0) + 1;

    const perPinAgg = {
      saves: contexts.reduce((s, c) => s + c.analytics.saves, 0) / contexts.length,
      clicks: contexts.reduce((s, c) => s + c.analytics.outbound_clicks + c.analytics.pin_clicks, 0) / contexts.length,
      purchases: contexts.reduce((s, c) => s + c.perf.organic_purchases, 0) / contexts.length,
      revenue: contexts.reduce((s, c) => s + c.perf.organic_revenue, 0) / contexts.length,
    };

    const { data: verIns, error: verErr } = await sb
      .from("pinterest_evolution_versions")
      .insert({
        version: nextVersion,
        notes: `auto-run ${new Date().toISOString().slice(0, 10)}`,
        pins_analyzed: contexts.length,
        attributes_learned: 0,
        first_pass_certification_rate: firstPassRate,
        recovery_success_rate: recoveryRate,
        organic_saves_per_pin: perPinAgg.saves,
        organic_clicks_per_pin: perPinAgg.clicks,
        organic_purchases_per_pin: perPinAgg.purchases,
        organic_revenue_per_pin: perPinAgg.revenue,
        summary: { lookback_days: lookbackDays, baselines },
      })
      .select("id, version")
      .maybeSingle();
    if (verErr) throw verErr;
    const versionId = verIns!.id as string;

    const effectRows: any[] = [];
    const recRows: any[] = [];
    const memoryUpserts: any[] = [];

    for (const [attribute, buckets] of attrIndex.entries()) {
      for (const [value, group] of buckets.entries()) {
        const n = group.length;
        if (n < 5) continue; // ignore low sample
        for (const metric of METRICS) {
          const mean = group.reduce((s, c) => s + metricValue(c, metric), 0) / n;
          const base = baselines[metric];
          if (!Number.isFinite(base) || base <= 0) continue;
          const effect = (mean - base) / base; // lift ratio
          if (Math.abs(effect) < 0.05) continue;
          const confidence = Math.min(1, n / 30) * Math.min(1, Math.abs(effect) / 0.5);
          effectRows.push({
            version_id: versionId,
            attribute,
            value,
            metric,
            effect: Number(effect.toFixed(4)),
            sample_size: n,
            cohort_size: contexts.length,
            baseline: Number(base.toFixed(4)),
            confidence: Number(confidence.toFixed(3)),
          });
        }

        // Memory kind mapping
        const kindMap: Record<string, string> = {
          board: "board",
          category: "category",
          hook: "hook",
          product: "product",
          niche: "category",
          creative_style: "style",
          content_type: "layout",
          ni_winner_angle: "layout",
          native_score_band: "signal",
          predicted_pre_band: "signal",
          attempt_strategy: "signal",
          season: "season",
          holiday: "holiday",
        };
        const kind = kindMap[attribute] ?? "attribute";
        const key = `${attribute}:${value}`;
        const saves = group.reduce((s, c) => s + c.analytics.saves, 0);
        const clicks = group.reduce((s, c) => s + c.analytics.outbound_clicks + c.analytics.pin_clicks, 0);
        const purchases = group.reduce((s, c) => s + c.perf.organic_purchases, 0);
        const revenue = group.reduce((s, c) => s + c.perf.organic_revenue, 0);
        const savesLift = baselines.organic_saves > 0
          ? (saves / n - baselines.organic_saves) / baselines.organic_saves : 0;
        const clicksLift = baselines.organic_clicks > 0
          ? (clicks / n - baselines.organic_clicks) / baselines.organic_clicks : 0;
        const composite = savesLift * 0.4 + clicksLift * 0.6;
        if (composite > 0) {
          memoryUpserts.push({
            kind,
            key,
            wins: 1,
            organic_saves: saves,
            organic_clicks: clicks,
            organic_purchases: purchases,
            organic_revenue: revenue,
            sample_size: n,
            confidence: Math.min(1, n / 30),
          });
        }
      }
    }

    if (effectRows.length > 0) {
      // Chunk to avoid payload limits
      for (let i = 0; i < effectRows.length; i += 500) {
        const chunk = effectRows.slice(i, i + 500);
        await sb.from("pinterest_evolution_attribute_effects").insert(chunk);
      }
    }

    let memoryUpdated = 0;
    for (const row of memoryUpserts) {
      // upsert by (kind, key)
      const { data: existing } = await sb
        .from("pinterest_evolution_memory")
        .select("id, wins, organic_saves, organic_clicks, organic_purchases, organic_revenue, sample_size")
        .eq("kind", row.kind)
        .eq("key", row.key)
        .maybeSingle();
      if (existing?.id) {
        await sb.from("pinterest_evolution_memory").update({
          wins: (existing.wins ?? 0) + 1,
          organic_saves: Number(existing.organic_saves ?? 0) + Number(row.organic_saves),
          organic_clicks: Number(existing.organic_clicks ?? 0) + Number(row.organic_clicks),
          organic_purchases: Number(existing.organic_purchases ?? 0) + Number(row.organic_purchases),
          organic_revenue: Number(existing.organic_revenue ?? 0) + Number(row.organic_revenue),
          sample_size: Number(existing.sample_size ?? 0) + Number(row.sample_size),
          confidence: row.confidence,
          last_updated: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await sb.from("pinterest_evolution_memory").insert(row);
      }
      memoryUpdated++;
    }

    // Recommendations: pick top effects by hierarchy
    // (organic_purchases > organic_clicks > organic_saves) with confidence >= 0.35.
    const priorityMetric: Record<Metric, number> = {
      organic_purchases: 1,
      organic_revenue: 2,
      organic_clicks: 3,
      organic_saves: 4,
      organic_impressions: 5,
    };
    const ranked = [...effectRows]
      .filter((r) => r.confidence >= 0.35 && r.effect > 0)
      .sort((a, b) => {
        const pa = priorityMetric[a.metric as Metric] ?? 9;
        const pb = priorityMetric[b.metric as Metric] ?? 9;
        if (pa !== pb) return pa - pb;
        return b.effect - a.effect;
      });

    // Deactivate previous recommendations
    await sb.from("pinterest_evolution_recommendations")
      .update({ active: false })
      .eq("active", true);

    const top = ranked.slice(0, 15);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      const { directive, reason } = humanizeDirective(
        r.attribute, r.value, r.metric as Metric, r.effect * 100,
      );
      recRows.push({
        version_id: versionId,
        directive,
        reason,
        metric: r.metric,
        effect: r.effect,
        confidence: r.confidence,
        sample_size: r.sample_size,
        priority: 100 + i,
        active: true,
      });
    }
    if (recRows.length > 0) {
      await sb.from("pinterest_evolution_recommendations").insert(recRows);
    }

    await sb.from("pinterest_evolution_versions").update({
      attributes_learned: effectRows.length,
    }).eq("id", versionId);

    const duration = Date.now() - started;
    await sb.from("pinterest_evolution_runs").update({
      status: "completed",
      version_id: versionId,
      pins_analyzed: contexts.length,
      attributes_learned: effectRows.length,
      recommendations_written: recRows.length,
      memory_updated: memoryUpdated,
      duration_ms: duration,
      finished_at: new Date().toISOString(),
      summary: {
        version: nextVersion,
        baselines,
        first_pass_certification_rate: firstPassRate,
        recovery_success_rate: recoveryRate,
      },
    }).eq("id", runId!);

    return new Response(
      JSON.stringify({
        ok: true,
        version: nextVersion,
        pins_analyzed: contexts.length,
        attributes_learned: effectRows.length,
        recommendations_written: recRows.length,
        memory_updated: memoryUpdated,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    await sb.from("pinterest_evolution_runs").update({
      status: "failed",
      error: msg.slice(0, 500),
      duration_ms: Date.now() - started,
      finished_at: new Date().toISOString(),
    }).eq("id", runId!);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});