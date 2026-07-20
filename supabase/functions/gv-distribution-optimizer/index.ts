// First Sale Sprint — Distribution Optimizer.
// Ranks draft pins in pinterest_pin_queue against rolling novelty, board
// diversity, CTR-intent, save-intent and landing-page match, then promotes
// the top N to status='queued' so the existing publisher picks them up.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { getFirstSaleStatus } from "../_shared/first-sale-mode.ts";

type Draft = {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  pin_title: string | null;
  pin_description: string | null;
  board_id: string | null;
  board_name: string | null;
  hashtags: string[] | null;
  overlay_text: string | null;
  pin_image_phash: string | null;
  category_key: string | null;
  hook_group: string | null;
  created_at: string;
};

const STRONG_VERBS = ["shop","get","try","discover","see","explore","find","grab"];
const SAVE_CUES = ["inspiration","ideas","aesthetic","cozy","dreamy","tips","guide","how to","before","after","minimal","luxury"];
const CURIOSITY = ["why","secret","trick","hack","never","always","mistake","truth"];

function tokenize(s: string | null | undefined): string[] {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3);
}
function jaccardArr(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const u = A.size + B.size - inter;
  return u ? inter / u : 0;
}
function scoreCtrIntent(title: string): number {
  const lower = title.toLowerCase();
  let s = 50;
  for (const c of CURIOSITY) if (lower.includes(c)) s += 8;
  if (/\b\d+\b/.test(lower)) s += 6; // specific numbers
  if (/before|after/.test(lower)) s += 6;
  if (lower.length > 60) s -= 8;
  return Math.max(0, Math.min(100, s));
}
function scoreSaveIntent(desc: string): number {
  const lower = desc.toLowerCase();
  let s = 50;
  for (const c of SAVE_CUES) if (lower.includes(c)) s += 5;
  return Math.max(0, Math.min(100, s));
}
function scoreOutboundIntent(title: string, desc: string): number {
  const t = `${title} ${desc}`.toLowerCase();
  let s = 50;
  for (const v of STRONG_VERBS) if (t.includes(v)) { s += 8; break; }
  if (/shop|buy|order/.test(t)) s += 10;
  return Math.max(0, Math.min(100, s));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit ?? 6), 1), 50);
    const dryRun = !!body?.dry_run;

    // First Sale Mode — exploratory floors only while FSM is active. Visibility,
    // landing-match, brand-safety and Pinterest-safety floors stay untouched.
    const fsm = await getFirstSaleStatus(supabase);
    // Baselines (production). Exploratory floors scale by the FSM composite ratio
    // (active: 55/92 ≈ 0.60; inactive: 1.0 → unchanged production behaviour).
    const BASE_CTR_FLOOR = 60;
    const BASE_SAVE_FLOOR = 55;
    const PROD_COMPOSITE = 92;
    const compositeRatio = fsm.ppe.composite_floor / PROD_COMPOSITE; // 1.0 prod, ~0.60 FSM
    const ctrFloor = Math.max(0, Math.round(BASE_CTR_FLOOR * compositeRatio));
    const saveFloor = Math.max(0, Math.round(BASE_SAVE_FLOOR * compositeRatio));
    // Publish gate translated to distScore (heuristic max ≈ 100).
    const distFloor = fsm.ppe.publish_gate_threshold * 0.55; // ~48 FSM, ~52 prod

    // 1) Load up to 200 draft pins.
    const { data: draftsRaw, error: dErr } = await supabase
      .from("pinterest_pin_queue")
      .select("id,product_id,product_slug,pin_title,pin_description,board_id,board_name,hashtags,overlay_text,pin_image_phash,category_key,hook_group,created_at")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(200);
    if (dErr) throw dErr;
    const drafts = (draftsRaw ?? []) as Draft[];
    if (!drafts.length) {
      return new Response(JSON.stringify({ ok: true, scored: 0, promoted: 0, reason: "no_drafts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Build novelty/diversity context from the last 50 queued/posted pins.
    const { data: recent } = await supabase
      .from("pinterest_pin_queue")
      .select("pin_title,pin_description,board_id,hashtags,pin_image_phash")
      .in("status", ["queued","posted"])
      .order("created_at", { ascending: false })
      .limit(50);
    const recentRows = recent ?? [];
    const recentTitleTokens = recentRows.flatMap((r: Record<string, unknown>) => tokenize(r.pin_title as string));
    const recentDescTokens = recentRows.flatMap((r: Record<string, unknown>) => tokenize(r.pin_description as string));
    const recentHashtags = recentRows.flatMap((r: Record<string, unknown>) => (r.hashtags as string[] | null) ?? []);
    const boardPublishCount = new Map<string, number>();
    for (const r of recentRows) {
      const b = (r as Record<string, unknown>).board_id as string | null;
      if (b) boardPublishCount.set(b, (boardPublishCount.get(b) ?? 0) + 1);
    }
    const recentPhashes = recentRows
      .map((r: Record<string, unknown>) => r.pin_image_phash as string | null)
      .filter(Boolean) as string[];

    // Consecutive-world cap: scan last 2 queued/posted pins; if both share the
    // same category_key, that key is rate-limited in this batch.
    const lastTwoCats = recentRows.slice(0, 2).map((r) => (r as Record<string, unknown>).category_key as string | null);
    const blockedCategory = lastTwoCats[0] && lastTwoCats[0] === lastTwoCats[1] ? lastTwoCats[0] : null;

    // Purchase intent window (expanded): UTC 11:00–06:00 covers 7am–1am ET
    // (6am–midnight CT / 4am–10pm PT). FSM widens to 24/7 exploratory publishing.
    const hourUtc = new Date().getUTCHours();
    const inIntentWindow = fsm.active ? true : (hourUtc >= 11 || hourUtc <= 6);

    // 3) Landing validations (last successful per product_id).
    const productIds = Array.from(new Set(drafts.map((d) => d.product_id).filter(Boolean))) as string[];
    const landingOk = new Set<string>();
    if (productIds.length) {
      const { data: lv } = await supabase
        .from("pin_landing_validations")
        .select("product_id,passed,checked_at")
        .in("product_id", productIds)
        .order("checked_at", { ascending: false })
        .limit(500);
      const seen = new Set<string>();
      for (const r of lv ?? []) {
        const pid = (r as Record<string, unknown>).product_id as string;
        if (seen.has(pid)) continue;
        seen.add(pid);
        if ((r as Record<string, unknown>).passed) landingOk.add(pid);
      }
    }

    // 4) Score each draft.
    const scored = drafts.map((d) => {
      const titleTokens = tokenize(d.pin_title);
      const descTokens = tokenize(d.pin_description);
      const titleNovelty = 1 - jaccardArr(titleTokens, recentTitleTokens);
      const descNovelty = 1 - jaccardArr(descTokens, recentDescTokens);
      const kwNovelty = 1 - jaccardArr(d.hashtags ?? [], recentHashtags);
      const boardUses = d.board_id ? boardPublishCount.get(d.board_id) ?? 0 : 0;
      const boardDiversity = Math.max(0, 1 - boardUses / 8); // 8 = soft cap per 50
      const visualDup = d.pin_image_phash && recentPhashes.includes(d.pin_image_phash) ? 1 : 0;
      const freshnessHours = (Date.now() - new Date(d.created_at).getTime()) / 36e5;
      const freshness = Math.max(0, 1 - freshnessHours / 168); // 7d decay
      const ctrI = scoreCtrIntent(d.pin_title ?? "");
      const saveI = scoreSaveIntent(d.pin_description ?? "");
      const outI = scoreOutboundIntent(d.pin_title ?? "", d.pin_description ?? "");
      const landingMatch = d.product_id && !landingOk.has(d.product_id) ? 0 : 1;

      const distScore =
        20 * titleNovelty +
        15 * descNovelty +
        10 * kwNovelty +
        15 * boardDiversity +
        10 * freshness +
        15 * (ctrI / 100) +
        10 * (saveI / 100) +
        5 * (outI / 100);

      const hardReject =
        visualDup === 1 ||
        landingMatch === 0 ||
        ctrI < ctrFloor ||
        saveI < saveFloor ||
        distScore < distFloor ||
        (blockedCategory != null && d.category_key === blockedCategory);

      return {
        id: d.id,
        product_id: d.product_id,
        board_id: d.board_id,
        score: Math.round(distScore * 100) / 100,
        breakdown: { titleNovelty, descNovelty, kwNovelty, boardDiversity, freshness, ctrI, saveI, outI, landingMatch, visualDup },
        hardReject,
      };
    });

    const eligible = scored.filter((s) => !s.hardReject).sort((a, b) => b.score - a.score);

    // 5) Enforce per-product cap of 1 in a single batch (variety).
    const picked: typeof eligible = [];
    const seenProducts = new Set<string>();
    for (const s of eligible) {
      if (picked.length >= limit) break;
      if (s.product_id && seenProducts.has(s.product_id)) continue;
      picked.push(s);
      if (s.product_id) seenProducts.add(s.product_id);
    }

    // 6) Promote to queued (unless dry-run). Skip promotion outside intent window.
    let promoted = 0;
    if (!dryRun && inIntentWindow && picked.length) {
      const ids = picked.map((p) => p.id);
      const { error: uErr } = await supabase
        .from("pinterest_pin_queue")
        .update({ status: "queued", scheduled_at: new Date().toISOString() })
        .in("id", ids);
      if (uErr) throw uErr;
      promoted = ids.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scored: scored.length,
        eligible: eligible.length,
        promoted,
        dry_run: dryRun,
        intent_window: inIntentWindow,
        blocked_category: blockedCategory,
        first_sale_mode: {
          active: fsm.active,
          reasons: fsm.reasons,
          counters: fsm.counters,
          triggers: fsm.triggers,
          floors: { ctr: ctrFloor, save: saveFloor, dist: Math.round(distFloor) },
        },
        top: picked.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});