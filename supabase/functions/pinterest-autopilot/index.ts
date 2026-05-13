// Pinterest Auto-Pilot — product + hook + board selection engine.
// Read-mostly: scores active products, picks a hook family + board,
// and logs a decision row. Drafts are NOT created here unless ?draft=1
// AND settings.enabled=true. Reuses pinterest-creative-director for actual generation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Niche → hook families (compact mirror of pinterest-hooks affinity, kept local
// so this function has zero coupling beyond the DB).
const NICHE_HOOK_AFFINITY: Record<string, string[]> = {
  cat_litter: ["cleanliness", "time_saving", "pain", "luxury"],
  dog_car: ["anxiety_reduction", "transformation", "convenience"],
  cat_tree: ["luxury", "pet_happiness", "social_proof", "curiosity"],
  cat_bed: ["pet_happiness", "luxury", "anxiety_reduction"],
  calming_bed: ["anxiety_reduction", "transformation", "pet_happiness"],
  dog_bed: ["luxury", "pet_happiness", "transformation"],
  cat_fountain: ["cleanliness", "convenience", "pet_happiness"],
  grooming: ["cleanliness", "transformation", "social_proof"],
  feeder: ["time_saving", "convenience", "social_proof"],
  dog_carrier: ["luxury", "convenience", "transformation"],
  cat_carrier: ["anxiety_reduction", "luxury", "convenience"],
  interactive_toy: ["pet_happiness", "transformation"],
  generic_pet: ["pet_happiness", "luxury", "social_proof"],
};

function detectNiche(name: string, category: string | null): string {
  const t = `${name || ""} ${category || ""}`.toLowerCase();
  if (/litter/.test(t)) return "cat_litter";
  if (/car (seat|bed|harness)|booster/.test(t)) return "dog_car";
  if (/cat tree|condo|tower/.test(t)) return "cat_tree";
  if (/calming|anxiety/.test(t) && /bed/.test(t)) return "calming_bed";
  if (/cat bed|cat house|cat cave/.test(t)) return "cat_bed";
  if (/dog bed|orthopedic/.test(t)) return "dog_bed";
  if (/fountain|water dispenser/.test(t)) return "cat_fountain";
  if (/groom|brush|nail/.test(t)) return "grooming";
  if (/feeder|bowl/.test(t)) return "feeder";
  if (/carrier|backpack|stroller/.test(t) && /dog/.test(t)) return "dog_carrier";
  if (/carrier|backpack/.test(t) && /cat/.test(t)) return "cat_carrier";
  if (/toy|puzzle|interactive/.test(t)) return "interactive_toy";
  return "generic_pet";
}

interface Product {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  price: number;
  cost_price: number | null;
  image_url: string | null;
  images: string[] | null;
  stock: number | null;
  is_active: boolean;
  is_duplicate: boolean;
  primary_species: string | null;
}

interface Board {
  id: string;
  name: string;
  is_sandbox: boolean;
  is_blacklisted: boolean;
  production_verified: boolean;
  priority: number;
  style_affinity: string[] | null;
}

interface Override {
  product_id: string;
  action: "exclude" | "force_promote" | "paused";
  expires_at: string | null;
}

interface PerfRow {
  product_id: string;
  impressions: number;
  clicks: number;
  saves: number;
  ctr: number;
  performance_score: number;
}

const COLD_START_DAILY_CAP = 3;
const COLD_START_WEEKLY_CAP = 15;
const DEFAULT_DAILY_CAP = 8;

function thresholdForDecision(mode: string, coldStart: boolean, scaleCandidate: boolean): number {
  if (coldStart) return 50;
  if (mode === "aggressive") return 85;
  if (scaleCandidate) return 80;
  return 70;
}

function safeUrl(u: string | null | undefined): boolean {
  if (!u) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function imageQualityScore(p: Product): number {
  // 0..20 based on # of images + primary URL validity
  const images = (p.images ?? []).filter(safeUrl);
  if (!safeUrl(p.image_url) && images.length === 0) return 0;
  let s = 8;
  if (images.length >= 1) s += 4;
  if (images.length >= 3) s += 4;
  if (images.length >= 5) s += 4;
  return Math.min(20, s);
}

function marginScore(p: Product): number {
  // 0..15. Use price as proxy when no cost.
  if (p.cost_price && p.cost_price > 0) {
    const margin = (p.price - p.cost_price) / Math.max(p.price, 1);
    return Math.round(Math.max(0, Math.min(1, margin)) * 15);
  }
  if (p.price >= 150) return 12;
  if (p.price >= 80) return 9;
  if (p.price >= 40) return 6;
  return 3;
}

function categoryFitScore(p: Product, preferred: string | null): number {
  // 0..10
  const cat = (p.category ?? "").toLowerCase();
  if (preferred && cat.includes(preferred.toLowerCase())) return 10;
  // Cat trees, litter, dog beds, dog travel are GetPawsy money niches.
  if (/litter|cat tree|condo|dog bed|stroller|carrier/.test(cat)) return 8;
  if (cat) return 5;
  return 2;
}

function visualAppealScore(p: Product): number {
  // 0..10 — Pinterest loves cozy, lifestyle-friendly products.
  const t = `${p.name} ${p.category ?? ""}`.toLowerCase();
  if (/cat tree|condo|bed|stroller|fountain|cozy|tower/.test(t)) return 9;
  if (/litter|carrier|feeder/.test(t)) return 7;
  return 5;
}

function shippingScore(p: Product): number {
  // 0..10 — basic US-shipping suitability heuristic.
  // Active + has stock value (any) + has image → shippable.
  return p.is_active ? 8 : 0;
}

function performanceScore(perf: PerfRow | undefined): {
  score: number;
  signals: Record<string, number>;
} {
  if (!perf) return { score: 0, signals: { impressions: 0, clicks: 0, saves: 0, ctr: 0 } };
  // 0..25 composite
  const ctrPart = Math.min(10, perf.ctr * 1000); // 1% CTR = 10
  const savePart = Math.min(10, perf.saves * 0.5);
  const clickPart = Math.min(5, perf.clicks * 0.1);
  return {
    score: Math.round(ctrPart + savePart + clickPart),
    signals: {
      impressions: perf.impressions,
      clicks: perf.clicks,
      saves: perf.saves,
      ctr: Number(perf.ctr ?? 0),
    },
  };
}

function pickHookCategory(niche: string, history: PerfRow | undefined): string {
  const families = NICHE_HOOK_AFFINITY[niche] ?? NICHE_HOOK_AFFINITY.generic_pet;
  // If product has performance history, slightly prefer first family (exploit).
  // Otherwise rotate based on time so successive runs vary.
  if (history && history.saves > 5) return families[0];
  const idx = Math.floor(Date.now() / 3_600_000) % families.length;
  return families[idx];
}

function pickBoard(
  product: Product,
  niche: string,
  boards: Board[],
  weeklyBoardSaturation: Record<string, number>,
): Board | null {
  const eligible = boards.filter(
    (b) => !b.is_sandbox && !b.is_blacklisted && b.production_verified,
  );
  if (eligible.length === 0) return null;

  const scored = eligible.map((b) => {
    const aff = (b.style_affinity ?? []).map((s) => s.toLowerCase());
    const cat = (product.category ?? "").toLowerCase();
    let s = b.priority * 2; // 0..20
    if (aff.some((a) => cat.includes(a) || a.includes(niche))) s += 15;
    // saturation penalty
    const used = weeklyBoardSaturation[b.id] ?? 0;
    s -= used * 2;
    return { board: b, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0].board;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, traceId, message: "missing auth" }, 401);
    const { data: userData } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = userData.user?.id;
    if (!userId) return json({ ok: false, traceId, message: "invalid user" }, 401);
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ ok: false, traceId, message: "admin only" }, 403);

    const body = (await req.json().catch(() => ({}))) as {
      action?: "score" | "select";
      limit?: number;
    };
    const action = body.action ?? "score";
    const limit = Math.max(1, Math.min(50, body.limit ?? 10));

    // Settings
    const { data: settings } = await supabase
      .from("pinterest_autopilot_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    const mode = settings?.mode ?? "balanced";
    const minScore = settings?.min_quality_score ?? 70;
    const maxPerWeek = settings?.max_pins_per_product_per_week ?? 3;
    const preferred = settings?.preferred_category ?? null;
    const enabled = settings?.enabled ?? false;

    // Load data in parallel
    const [
      { data: products },
      { data: overrides },
      { data: boards },
      { data: perf },
      { data: recentQueue },
      { data: runtimeSettings },
    ] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id,slug,name,category,price,cost_price,image_url,images,stock,is_active,is_duplicate,primary_species",
        )
        .eq("is_active", true)
        .eq("is_duplicate", false)
        .limit(500),
      supabase.from("pinterest_autopilot_overrides").select("product_id,action,expires_at"),
      supabase
        .from("pinterest_boards")
        .select(
          "id,name,is_sandbox,is_blacklisted,production_verified,priority,style_affinity",
        ),
      supabase
        .from("pinterest_pin_performance")
        .select("product_id,impressions,clicks,saves,ctr,performance_score"),
      supabase
        .from("pinterest_pin_queue")
        .select("product_id,board_id,posted_at,pinterest_pin_id,pin_external_id,status")
        .eq("status", "posted")
        .gte(
          "posted_at",
          new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
        )
        .limit(1000),
      supabase.from("pinterest_runtime_settings").select("daily_pin_cap, domination_mode").eq("id", 1).maybeSingle(),
    ]);

    const overrideMap = new Map<string, Override>();
    for (const o of (overrides ?? []) as Override[]) {
      if (o.expires_at && new Date(o.expires_at).getTime() < Date.now()) continue;
      overrideMap.set(o.product_id, o);
    }

    // Aggregate perf by product_id (string)
    const perfMap = new Map<string, PerfRow>();
    for (const r of (perf ?? []) as PerfRow[]) {
      const ex = perfMap.get(r.product_id);
      if (!ex) {
        perfMap.set(r.product_id, { ...r });
      } else {
        ex.impressions += r.impressions;
        ex.clicks += r.clicks;
        ex.saves += r.saves;
        ex.ctr = Math.max(ex.ctr, r.ctr);
        ex.performance_score = Math.max(ex.performance_score, r.performance_score);
      }
    }

    // Weekly counts per product + per board
    const productWeekly: Record<string, number> = {};
    const boardWeekly: Record<string, number> = {};
    let dailyPublished = 0;
    let weeklyPublished = 0;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const seenPublishedPinIds = new Set<string>();
    for (const q of (recentQueue ?? []) as Array<{
      product_id: string;
      board_id: string | null;
      posted_at: string | null;
      pinterest_pin_id: string | null;
      pin_external_id: string | null;
    }>) {
      const externalId = q.pinterest_pin_id || q.pin_external_id;
      if (!externalId || seenPublishedPinIds.has(externalId)) continue;
      seenPublishedPinIds.add(externalId);
      productWeekly[q.product_id] = (productWeekly[q.product_id] ?? 0) + 1;
      if (q.board_id) boardWeekly[q.board_id] = (boardWeekly[q.board_id] ?? 0) + 1;
      weeklyPublished++;
      if (q.posted_at && new Date(q.posted_at).getTime() >= dayStart.getTime()) dailyPublished++;
    }
    const dailyCap = Math.max(1, Number((runtimeSettings as any)?.daily_pin_cap ?? DEFAULT_DAILY_CAP));
    const dominationMode = Boolean((runtimeSettings as any)?.domination_mode);

    // Score every eligible product
    const decisions: Array<{
      product: Product;
      total: number;
      breakdown: Record<string, number | string>;
      hook: string;
      board: Board | null;
      action: "normal" | "skip" | "scale" | "pause";
      reason: string;
      niche: string;
    }> = [];

    for (const p of (products ?? []) as Product[]) {
      const ov = overrideMap.get(p.id);
      if (ov?.action === "exclude") continue;
      if (ov?.action === "paused") {
        decisions.push({
          product: p,
          total: 0,
          breakdown: { override: "paused" },
          hook: "",
          board: null,
          action: "pause",
          reason: ov.reason ?? "manually paused",
          niche: detectNiche(p.name, p.category),
        });
        continue;
      }

      // Safety gates
      const img = imageQualityScore(p);
      if (img < 8) {
        continue; // bad image → silently skip
      }
      const niche = detectNiche(p.name, p.category);

      const margin = marginScore(p);
      const cat = categoryFitScore(p, preferred);
      const visual = visualAppealScore(p);
      const ship = shippingScore(p);
      const perfRes = performanceScore(perfMap.get(p.id));
      const forced = ov?.action === "force_promote" ? 20 : 0;

      const total = img + margin + cat + visual + ship + perfRes.score + forced;

      const weekly = productWeekly[p.id] ?? 0;
      let act: "normal" | "skip" | "scale" | "pause" = "normal";
      let reason = "";

      if (weekly >= maxPerWeek && !forced) {
        act = "skip";
        reason = `weekly cap reached (${weekly}/${maxPerWeek})`;
      } else if (perfRes.score >= 18 && perfRes.signals.saves >= 10) {
        act = "scale";
        reason = "winner pattern detected";
      } else if (
        perfRes.signals.impressions >= 500 &&
        perfRes.signals.saves <= 1 &&
        perfRes.signals.clicks <= 1
      ) {
        act = "pause";
        reason = "low engagement after exposure";
      } else if (total < minScore && !forced) {
        act = "skip";
        reason = `below quality threshold (${total}/${minScore})`;
      }

      const board = pickBoard(p, niche, (boards ?? []) as Board[], boardWeekly);
      const hook = pickHookCategory(niche, perfMap.get(p.id));

      decisions.push({
        product: p,
        total,
        breakdown: {
          image: img,
          margin,
          category_fit: cat,
          visual_appeal: visual,
          shipping: ship,
          performance: perfRes.score,
          forced,
          weekly_count: weekly,
          impressions: perfRes.signals.impressions,
          saves: perfRes.signals.saves,
          clicks: perfRes.signals.clicks,
          ctr: perfRes.signals.ctr,
        },
        hook,
        board,
        action: act,
        reason,
        niche,
      });
    }

    // Sort & cap
    decisions.sort((a, b) => {
      const sa = a.action === "skip" || a.action === "pause" ? -1 : 1;
      const sb = b.action === "skip" || b.action === "pause" ? -1 : 1;
      if (sa !== sb) return sb - sa;
      return b.total - a.total;
    });

    const top = decisions.slice(0, limit);

    // Persist log
    const runId = crypto.randomUUID();
    const rows = top.map((d) => ({
      run_id: runId,
      product_id: d.product.id,
      product_slug: d.product.slug,
      product_name: d.product.name,
      product_category: d.product.category,
      total_score: d.total,
      score_breakdown: { ...d.breakdown, niche: d.niche, hook: d.hook },
      selected_hook_category: d.hook || null,
      selected_board_id: d.board?.id ?? null,
      selected_board_name: d.board?.name ?? null,
      expected_fit: d.board ? Math.min(100, d.total) : null,
      status:
        d.action === "skip"
          ? "skipped"
          : d.action === "pause"
            ? "paused"
            : d.action === "scale"
              ? "scaled"
              : "selected",
      action: d.action,
      reason: d.reason || null,
    }));

    if (rows.length > 0) {
      await supabase.from("pinterest_autopilot_decisions").insert(rows);
    }

    return json({
      ok: true,
      traceId,
      run_id: runId,
      mode,
      enabled,
      action_requested: action,
      total_evaluated: decisions.length,
      total_returned: top.length,
      decisions: top.map((d) => ({
        product_id: d.product.id,
        product_slug: d.product.slug,
        product_name: d.product.name,
        category: d.product.category,
        niche: d.niche,
        score: d.total,
        breakdown: d.breakdown,
        hook_category: d.hook,
        board: d.board ? { id: d.board.id, name: d.board.name } : null,
        action: d.action,
        reason: d.reason,
      })),
    });
  } catch (e) {
    console.error("[autopilot] error", e);
    return json(
      { ok: false, traceId, message: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
}

Deno.serve(handler);