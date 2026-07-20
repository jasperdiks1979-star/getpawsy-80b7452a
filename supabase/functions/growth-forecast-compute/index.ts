import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// Phase 7b — Forecast compute
// Reads last 30 days of growth_decision_metrics joined to growth_decisions,
// aggregates daily reward + revenue per product and per angle, then computes:
//   - EWMA (alpha=0.35) baseline
//   - Simple linear regression slope on day-index
//   - 7-day and 30-day forecast = max(0, ewma + slope * horizon)
//   - confidence = clamp(min(samples/14, 1) * (1 - residualNoise), 0, 1)
//   - rising = slope > 0 AND confidence >= 0.3
// Upserts into growth_forecasts.

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ewma(values: number[], alpha = 0.35): number {
  if (!values.length) return 0;
  let v = values[0];
  for (let i = 1; i < values.length; i++) v = alpha * values[i] + (1 - alpha) * v;
  return v;
}

function regress(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += values[i]; sxx += i * i; sxy += i * values[i]; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: 0, intercept: sy / n, r2: 0 };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  let ssRes = 0, ssTot = 0;
  const mean = sy / n;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i;
    ssRes += (values[i] - pred) ** 2;
    ssTot += (values[i] - mean) ** 2;
  }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, r2 };
}

type Bucket = { byDay: Map<string, { reward: number; revenue: number }> };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    const { data: metrics, error: mErr } = await sb
      .from("growth_decision_metrics")
      .select("decision_id, snapshot_day, reward, meta")
      .gte("snapshot_day", since);
    if (mErr) throw mErr;

    const decisionIds = Array.from(new Set((metrics ?? []).map((r: any) => r.decision_id)));
    const { data: decisions } = await sb
      .from("growth_decisions")
      .select("id, product_id, payload")
      .in("id", decisionIds.length ? decisionIds : ["00000000-0000-0000-0000-000000000000"]);
    const decMap = new Map<string, any>();
    (decisions ?? []).forEach((d: any) => decMap.set(d.id, d));

    // Optional channel signals → revenue per product per day
    const { data: csig } = await sb
      .from("growth_channel_signals")
      .select("product_slug, day, revenue")
      .gte("day", since);
    const revBySlugDay = new Map<string, number>();
    (csig ?? []).forEach((r: any) => {
      const k = `${r.product_slug}|${r.day}`;
      revBySlugDay.set(k, (revBySlugDay.get(k) ?? 0) + Number(r.revenue ?? 0));
    });

    const products = new Map<string, Bucket>(); // key = product_id or slug
    const angles = new Map<string, Bucket>();

    for (const m of metrics ?? []) {
      const d = decMap.get((m as any).decision_id);
      if (!d) continue;
      const payload = d.payload ?? {};
      const productKey = String(d.product_id ?? payload.product_slug ?? "");
      const slug = String(payload.product_slug ?? "");
      const angleKey = String(payload.angle ?? payload.hook ?? "unknown");
      const day = String((m as any).snapshot_day);
      const reward = Number((m as any).reward ?? 0);
      const revenue = slug ? (revBySlugDay.get(`${slug}|${day}`) ?? 0) : 0;

      if (productKey) {
        const b = products.get(productKey) ?? { byDay: new Map() };
        const cur = b.byDay.get(day) ?? { reward: 0, revenue: 0 };
        cur.reward += reward;
        cur.revenue += revenue;
        b.byDay.set(day, cur);
        products.set(productKey, b);
      }
      if (angleKey) {
        const b = angles.get(angleKey) ?? { byDay: new Map() };
        const cur = b.byDay.get(day) ?? { reward: 0, revenue: 0 };
        cur.reward += reward;
        cur.revenue += revenue;
        b.byDay.set(day, cur);
        angles.set(angleKey, b);
      }
    }

    function dayKeys(): string[] {
      const out: string[] = [];
      for (let i = 29; i >= 0; i--) {
        out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
      }
      return out;
    }
    const days = dayKeys();

    function buildForecast(entity_type: "product" | "angle", entity_key: string, b: Bucket) {
      const rewardSeries = days.map((d) => b.byDay.get(d)?.reward ?? 0);
      const revenueSeries = days.map((d) => b.byDay.get(d)?.revenue ?? 0);
      const nonZero = rewardSeries.filter((v) => v > 0).length;
      if (nonZero < 2) return null;
      const baseR = ewma(rewardSeries);
      const baseRev = ewma(revenueSeries);
      const regR = regress(rewardSeries);
      const regRev = regress(revenueSeries);
      const confidence = Math.max(
        0,
        Math.min(1, (Math.min(nonZero / 14, 1)) * (0.4 + 0.6 * regR.r2))
      );
      const rising = regR.slope > 0 && confidence >= 0.3;
      const rows: any[] = [];
      for (const horizon of [7, 30]) {
        rows.push({
          entity_type,
          entity_key,
          horizon_days: horizon,
          forecast_reward: Math.max(0, +(baseR + regR.slope * horizon).toFixed(4)),
          forecast_revenue: Math.max(0, +(baseRev + regRev.slope * horizon).toFixed(2)),
          trend_slope: +regR.slope.toFixed(5),
          confidence: +confidence.toFixed(3),
          rising,
          sample_size: nonZero,
          meta: { r2_reward: +regR.r2.toFixed(3), r2_revenue: +regRev.r2.toFixed(3) },
          computed_at: new Date().toISOString(),
        });
      }
      return rows;
    }

    const allRows: any[] = [];
    for (const [k, b] of products) {
      const r = buildForecast("product", k, b);
      if (r) allRows.push(...r);
    }
    for (const [k, b] of angles) {
      const r = buildForecast("angle", k, b);
      if (r) allRows.push(...r);
    }

    let upserted = 0;
    if (allRows.length) {
      const { error } = await sb
        .from("growth_forecasts")
        .upsert(allRows, { onConflict: "entity_type,entity_key,horizon_days" });
      if (error) throw error;
      upserted = allRows.length;
    }

    const rising = allRows.filter((r) => r.rising && r.horizon_days === 7).length;
    await sb.from("growth_events").insert({
      event_type: "forecast_compute",
      payload: { trace_id: traceId, upserted, rising } as any,
    });

    return json({ ok: true, traceId, upserted, rising });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});