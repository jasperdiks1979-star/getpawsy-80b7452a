// pinterest-autonomous-orchestrator
// -----------------------------------------------------------------------------
// PHASE 18 — Zero-downtime Pinterest publishing brain.
//
// This function is the single decision point that keeps the Pinterest engine
// publishing 24/7 regardless of AI Gateway state. It does NOT re-implement any
// pipeline stage — every action delegates to an existing production module:
//
//   • pinterest_credit_state         (mode detection, Layer 1 + 2)
//   • pinterest-approved-publish-sweep (deterministic staging, Layer 1 + 8)
//   • pinterest-cron-worker          (actual Pinterest API publish)
//   • pinterest-queue-cleanup-daily  (self-healing, Layer 4)
//   • pinterest-legacy-repair-sweep  (URL / hero repair, Layer 4 + 5)
//   • pinterest-refresh-failed-queue (retry failed rows, Layer 4)
//   • pinterest-integrity-audit      (destination validation, Layer 5)
//   • pinterest-credit-probe         (auto-resume AI mode, Layer 2)
//   • pcie2-publisher / creative-director (only when AI mode is ON, Layer 7)
//
// Actions (POST body { action }):
//   status  — read-only Command Center payload (Layer 10)
//   run     — one autonomous tick (mode-switch + score + stage + heal)
//   score   — scoring diagnostic (Layer 3)
//   heal    — invoke queue cleanup + legacy repair (Layer 4)
//
// Every run is journaled in pinterest_ops_snapshots.
// -----------------------------------------------------------------------------

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Default daily target — Layer 9
const DAILY_PIN_TARGET = 32;      // 25-40 pins/day
const DAILY_VIDEO_TARGET = 10;    // 8-15 videos/day
const MIN_INVENTORY_BEFORE_AI = 50; // Layer 8: only wake creative-director below this
const STAGE_BATCH_MAX = 20;       // approved-sweep hard-cap
const HOURLY_PIN_CEILING = 4;     // spread naturally over 24h

async function invokeFn(name: string, body: Record<string, unknown>): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE}`,
      "apikey": ANON_KEY || SERVICE_ROLE,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return { ok: r.ok, status: r.status, body: JSON.parse(text) }; }
  catch { return { ok: r.ok, status: r.status, body: text }; }
}

// ----- Layer 1 + 2: mode detection -----
interface ModeInfo {
  mode: "AI_MODE" | "DETERMINISTIC_MODE";
  ai_paused: boolean;
  publishing_paused: boolean;
  credit_state: string;
  estimated_credits_pct: number;
  last_success_at: string | null;
  last_402_at: string | null;
  next_probe_expected_within_seconds: number;
}
async function detectMode(sb: any): Promise<ModeInfo> {
  const { data } = await sb.from("pinterest_credit_state").select("*").eq("id", 1).maybeSingle();
  const s = data ?? {};
  const aiPaused = (s.ai_generation_paused ?? s.paused ?? false) || (s.manual_pause ?? false);
  const publishingPaused = s.publishing_paused === true; // NEVER auto-set by this fn
  const succ = s.recent_success_count_1h ?? 0;
  const fail = s.recent_402_count_1h ?? 0;
  const pct = aiPaused ? 0 : (fail === 0 ? 100 : Math.max(5, Math.round((succ / Math.max(1, succ + fail)) * 100)));
  return {
    mode: aiPaused ? "DETERMINISTIC_MODE" : "AI_MODE",
    ai_paused: !!aiPaused,
    publishing_paused: !!publishingPaused,
    credit_state: s.state ?? "green",
    estimated_credits_pct: pct,
    last_success_at: s.last_success_at ?? null,
    last_402_at: s.last_402_at ?? null,
    next_probe_expected_within_seconds: 600, // pinterest-credit-probe cron cadence
  };
}

// ----- Layer 3: intelligent priority scoring -----
interface ScoreBreakdown {
  bestseller: number;
  quality: number;
  pre: number;
  ctr: number;
  revenue: number;
  freshness: number;
  total: number;
}
function scoreCandidate(row: any, ctx: {
  bestsellerSlugs: Set<string>;
  qualityByProduct: Map<string, number>;
  preByPin: Map<string, { passed: boolean; score: number | null }>;
  perfByProduct: Map<string, { ctr: number; revenue: number }>;
}): ScoreBreakdown {
  const slug = row.product_slug ?? "";
  const pid = row.product_id ?? "";
  const bestseller = ctx.bestsellerSlugs.has(slug) ? 30 : 0;
  const quality = Math.min(20, Math.round((ctx.qualityByProduct.get(pid) ?? 0) * 0.2));
  const pre = (() => {
    const p = ctx.preByPin.get(row.id);
    if (!p) return row.approved_at ? 8 : 0;
    return p.passed ? Math.min(20, Math.round((p.score ?? 0) * 0.2)) : -50;
  })();
  const perf = ctx.perfByProduct.get(pid);
  const ctr = perf ? Math.min(15, Math.round((perf.ctr ?? 0) * 300)) : 0; // ctr 0.05 → 15
  const revenue = perf ? Math.min(20, Math.round(Math.log10(1 + (perf.revenue ?? 0)) * 6)) : 0;
  const ageDays = row.approved_at ? Math.max(0, (Date.now() - new Date(row.approved_at).getTime()) / 86_400_000) : 999;
  const freshness = ageDays < 3 ? 10 : ageDays < 7 ? 6 : ageDays < 30 ? 2 : 0;
  const total = bestseller + quality + pre + ctr + revenue + freshness;
  return { bestseller, quality, pre, ctr, revenue, freshness, total };
}

async function buildScoringContext(sb: any, productIds: string[]) {
  const bestsellerSlugs = new Set<string>();
  const qualityByProduct = new Map<string, number>();
  const preByPin = new Map<string, { passed: boolean; score: number | null }>();
  const perfByProduct = new Map<string, { ctr: number; revenue: number }>();

  if (productIds.length) {
    const { data: bs } = await sb.from("bestsellers").select("product_slug").limit(200);
    for (const b of bs ?? []) if ((b as any).product_slug) bestsellerSlugs.add((b as any).product_slug);

    const { data: q } = await sb.from("landing_quality_scores")
      .select("product_id,score").in("product_id", productIds);
    for (const r of q ?? []) qualityByProduct.set((r as any).product_id, Number((r as any).score) || 0);

    const { data: perf } = await sb.from("pinterest_pdp_conversion_stats")
      .select("product_id,ctr_28d,revenue_28d").in("product_id", productIds);
    for (const r of perf ?? []) perfByProduct.set((r as any).product_id, {
      ctr: Number((r as any).ctr_28d) || 0,
      revenue: Number((r as any).revenue_28d) || 0,
    });
  }
  return { bestsellerSlugs, qualityByProduct, preByPin, perfByProduct };
}

// ----- Layer 9: daily target check -----
async function pacingSnapshot(sb: any) {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const [pinsToday, pinsLastHour, videosToday, approvedInv, waitingAi] = await Promise.all([
    sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .eq("status", "posted").gte("updated_at", dayAgo),
    sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .eq("status", "posted").gte("updated_at", hourAgo),
    sb.from("pinterest_video_queue").select("id", { count: "exact", head: true })
      .eq("status", "posted").gte("updated_at", dayAgo),
    sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .in("status", ["approved", "queued"]).is("pinterest_pin_id", null),
    sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .eq("status", "draft").is("pinterest_pin_id", null),
  ]);
  return {
    pins_last_24h: pinsToday.count ?? 0,
    pins_last_hour: pinsLastHour.count ?? 0,
    videos_last_24h: videosToday.count ?? 0,
    approved_inventory: approvedInv.count ?? 0,
    waiting_ai_inventory: waitingAi.count ?? 0,
    daily_pin_target: DAILY_PIN_TARGET,
    daily_video_target: DAILY_VIDEO_TARGET,
    hourly_pin_ceiling: HOURLY_PIN_CEILING,
  };
}

// ----- Main handler -----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = performance.now();
  const runId = crypto.randomUUID();

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* GET or empty */ }
  const action: string = String(body?.action ?? new URL(req.url).searchParams.get("action") ?? "status");

  try {
    const mode = await detectMode(sb);

    // -------- STATUS (Layer 10) --------
    if (action === "status") {
      const pacing = await pacingSnapshot(sb);

      // health signals — read-only aggregates from existing tables
      const { data: recentSnap } = await sb.from("pinterest_ops_snapshots")
        .select("*").order("created_at", { ascending: false }).limit(5);
      const { data: recentIntegrity } = await sb.from("pinterest_integrity_reports")
        .select("run_id,report_type,summary,created_at")
        .order("created_at", { ascending: false }).limit(3);
      const { data: recentEvents } = await sb.from("pinterest_credit_events")
        .select("event_type,created_at,detail").order("created_at", { ascending: false }).limit(10);

      // Estimated days of publishing headroom = approved inventory / daily target
      const daysHeadroom = pacing.approved_inventory > 0
        ? +(pacing.approved_inventory / DAILY_PIN_TARGET).toFixed(1)
        : 0;

      return json({
        ok: true,
        run_id: runId,
        generated_at: new Date().toISOString(),
        mode,
        pacing,
        headroom: {
          approved_inventory: pacing.approved_inventory,
          waiting_ai_inventory: pacing.waiting_ai_inventory,
          estimated_days_publishing_headroom: daysHeadroom,
          next_ai_wake_trigger: `approved inventory < ${MIN_INVENTORY_BEFORE_AI}`,
          should_wake_ai_now: pacing.approved_inventory < MIN_INVENTORY_BEFORE_AI && !mode.ai_paused,
          publishing_can_continue: !mode.publishing_paused,
        },
        recent_ticks: recentSnap ?? [],
        recent_integrity_reports: recentIntegrity ?? [],
        recent_credit_events: recentEvents ?? [],
        modules_reused: [
          "pinterest-approved-publish-sweep",
          "pinterest-cron-worker",
          "pinterest-queue-cleanup-daily",
          "pinterest-legacy-repair-sweep",
          "pinterest-refresh-failed-queue",
          "pinterest-integrity-audit",
          "pinterest-credit-probe",
          "pcie2-publisher",
          "pinterest-creative-director",
          "pre-product-relevance",
          "pinterest-integrity-guard",
        ],
        duration_ms: Math.round(performance.now() - t0),
      });
    }

    // -------- SCORE (Layer 3) --------
    if (action === "score") {
      const { data: rows } = await sb.from("pinterest_pin_queue")
        .select("id,product_id,product_slug,pin_title,approved_at,status")
        .in("status", ["approved", "queued", "draft"])
        .is("pinterest_pin_id", null)
        .order("approved_at", { ascending: false, nullsFirst: false })
        .limit(200);
      const productIds = Array.from(new Set((rows ?? []).map((r: any) => r.product_id).filter(Boolean)));
      const ctx = await buildScoringContext(sb, productIds);
      const scored = (rows ?? []).map((r: any) => ({
        id: r.id, slug: r.product_slug, status: r.status,
        score: scoreCandidate(r, ctx),
      })).sort((a, b) => b.score.total - a.score.total);
      return json({ ok: true, run_id: runId, mode, count: scored.length, scored: scored.slice(0, 100) });
    }

    // -------- HEAL (Layer 4 + 5) --------
    if (action === "heal") {
      const cleanup = await invokeFn("pinterest-queue-cleanup-daily", { source: "autonomous-orchestrator" });
      const refresh = await invokeFn("pinterest-refresh-failed-queue", { source: "autonomous-orchestrator" });
      const legacy = await invokeFn("pinterest-legacy-repair-sweep", { source: "autonomous-orchestrator", layer_a_only: true });
      const snapshot = {
        run_id: runId, action, mode: mode.mode,
        cleanup: cleanup.body?.summary ?? cleanup.body,
        refresh: refresh.body?.summary ?? refresh.body,
        legacy: legacy.body?.summary ?? legacy.body,
      };
      await sb.from("pinterest_ops_snapshots").insert({ payload: snapshot });
      return json({ ok: true, run_id: runId, snapshot });
    }

    // -------- RUN — one autonomous tick (default write action) --------
    if (action === "run") {
      const pacing = await pacingSnapshot(sb);
      const actions: any[] = [];

      // Layer 11: never stop publishing. If pacing already at ceiling this hour,
      // still allow small top-ups but never burst beyond hourly_pin_ceiling.
      const remainingHourly = Math.max(0, HOURLY_PIN_CEILING - pacing.pins_last_hour);
      const remainingDaily = Math.max(0, DAILY_PIN_TARGET - pacing.pins_last_24h);
      const stageBudget = Math.min(STAGE_BATCH_MAX, remainingHourly, remainingDaily);

      // Layer 1: deterministic staging is ALWAYS safe (no AI calls).
      // We call approved-publish-sweep with execute=true. If AI mode is ON,
      // we still stage first — AI enrichment runs in its own lane.
      if (stageBudget > 0 && !mode.publishing_paused) {
        const stage = await invokeFn("pinterest-approved-publish-sweep", {
          execute: true,
          max_publish: stageBudget,
          interval_seconds: Math.max(120, Math.floor(3600 / Math.max(1, HOURLY_PIN_CEILING))),
        });
        actions.push({ step: "stage_deterministic", budget: stageBudget, result: stage.body?.counts ?? stage.body });
      } else {
        actions.push({ step: "stage_deterministic", skipped: true, reason: mode.publishing_paused ? "publishing_paused" : "hourly_or_daily_cap_reached" });
      }

      // Layer 8: only wake creative-director when the deterministic runway
      // is drying up AND AI credits are available.
      if (!mode.ai_paused && pacing.approved_inventory < MIN_INVENTORY_BEFORE_AI) {
        const cd = await invokeFn("pinterest-creative-director", {
          action: "run_full",
          triggered_by: "autonomous-orchestrator",
          count: Math.min(10, MIN_INVENTORY_BEFORE_AI - pacing.approved_inventory),
        });
        actions.push({ step: "wake_creative_director", result: cd.body?.summary ?? cd.body });
      } else {
        actions.push({
          step: "wake_creative_director",
          skipped: true,
          reason: mode.ai_paused ? "ai_paused_deterministic_mode" : "inventory_sufficient",
        });
      }

      // Layer 2: if AI is paused, ping the credit probe so the next successful
      // gateway call flips state back to green automatically.
      if (mode.ai_paused) {
        const probe = await invokeFn("pinterest-credit-probe", { source: "autonomous-orchestrator" });
        actions.push({ step: "credit_probe", result: probe.body });
      }

      // Layer 4: opportunistic light healing (throttled — only every ~1h tick).
      // We check the last cleanup snapshot; if older than 55min, run it.
      const { data: lastSnap } = await sb.from("pinterest_ops_snapshots")
        .select("created_at,payload").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const shouldHeal = !lastSnap || (Date.now() - new Date(lastSnap.created_at).getTime()) > 55 * 60_000;
      if (shouldHeal) {
        const cleanup = await invokeFn("pinterest-queue-cleanup-daily", { source: "autonomous-orchestrator" });
        actions.push({ step: "self_heal_cleanup", result: cleanup.body?.summary ?? cleanup.body });
      }

      const snapshot = {
        run_id: runId,
        tick_at: new Date().toISOString(),
        mode: mode.mode,
        ai_paused: mode.ai_paused,
        pacing,
        actions,
        duration_ms: Math.round(performance.now() - t0),
      };
      await sb.from("pinterest_ops_snapshots").insert({ payload: snapshot });
      return json({ ok: true, run_id: runId, snapshot });
    }

    return json({ ok: false, error: `unknown action: ${action}` }, 400);
  } catch (e: any) {
    console.error("[pinterest-autonomous-orchestrator]", e);
    return json({ ok: false, run_id: runId, error: String(e?.message ?? e) }, 200);
  }
});