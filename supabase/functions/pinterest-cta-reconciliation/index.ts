// pinterest-cta-reconciliation — READ-ONLY orchestrator.
// Path A + Path C: verifies the 15 deterministic pins against Pinterest live
// state, classifies the 92 AI-baked-CTA pins from DB heuristics only, and
// returns PINTEREST_CTA_ARCHITECTURE_RECONCILIATION_REPORT. No mutations to
// Pinterest. No paid credits. No image regeneration.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";

// Deterministic pins under scope. Ordered per report sections.
const GOLDEN_V1 = "1117103882602637333"; // superseded litter-box
const GOLDEN_V2 = "1117103882602643230"; // current litter-box
const INVALID_ORIGINALS = [
  { pin: "1117103882602566162", label: "Cat Tree Condo 5-Level",       replacement: "1117103882602569886" },
  { pin: "1117103882602566165", label: "XL Steel Litter Box",          replacement: "1117103882602569888" },
  { pin: "1117103882602566170", label: "Automatic LED Cat Toy",        replacement: "1117103882602573001" },
  { pin: "1117103882602566176", label: "Elevated Dog Bed",             replacement: "1117103882602573006" },
  { pin: "1117103882602566178", label: "Foldable Dog Bowl",            replacement: "1117103882602574564" },
];
// Original Dog Carrier Backpack pilot (11:41) was the FIRST canary; its v3
// replacement is 1117103882602569881.
const CANARY_ORIGINAL = { pin: "1117103882602565080", label: "Dog Carrier Backpack (canary)", replacement: "1117103882602569881" };
const RECENT_REPLACEMENTS = [
  { pin: "1117103882602569881", label: "Dog Carrier Backpack v3",  version: "v3" },
  { pin: "1117103882602569886", label: "Cat Tree Condo v3",        version: "v3" },
  { pin: "1117103882602569888", label: "XL Steel Litter Box v3",   version: "v3" },
  { pin: "1117103882602573001", label: "Automatic LED Cat Toy v4", version: "v4" },
  { pin: "1117103882602573006", label: "Elevated Dog Bed v4",      version: "v4" },
  { pin: "1117103882602574564", label: "Foldable Dog Bowl v5",     version: "v5" },
];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type PinCheck = { pin_id: string; http: number; state: "live"|"deleted"|"cached_only"|"inaccessible"; board_id?: string|null; link?: string|null; error?: string };
async function checkPin(token: string, pinId: string): Promise<PinCheck> {
  try {
    const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404 || r.status === 410) return { pin_id: pinId, http: r.status, state: "deleted" };
    if (r.status === 200) {
      const b = await r.json().catch(() => ({} as any));
      if (!b?.id || !b?.board_id) return { pin_id: pinId, http: 200, state: "cached_only" };
      return { pin_id: pinId, http: 200, state: "live", board_id: b.board_id, link: b.link ?? null };
    }
    if (r.status === 401 || r.status === 403) return { pin_id: pinId, http: r.status, state: "inaccessible", error: "auth_forbidden" };
    return { pin_id: pinId, http: r.status, state: "inaccessible", error: (await r.text()).slice(0, 200) };
  } catch (e) {
    return { pin_id: pinId, http: 0, state: "inaccessible", error: (e as Error).message };
  }
}

// AI-pin classification heuristics (DB-only, no live read-back).
function classifyOverlay(overlay: string | null | undefined, title: string, url: string): { category: string; priority: "P0"|"P1"|"P2"; reasons: string[] } {
  const t = (overlay ?? "").trim();
  const reasons: string[] = [];
  // P0 truncation signals
  const truncated = /[…]$|\.{3}$|\b(Sho|Sh|Get|Bu)$|[a-zA-Z]{2}[…]/.test(t) || (t.length > 0 && /\bTre…|\bLit…|\bBow…/i.test(t));
  const brokenComp = t.length > 90 || /[|]{2,}/.test(t);
  if (truncated) { reasons.push("truncated_overlay"); return { category: "BAKED_CTA_TRUNCATED", priority: "P0", reasons }; }
  if (brokenComp) { reasons.push("malformed_overlay"); return { category: "BAKED_CTA_VISUALLY_BROKEN", priority: "P0", reasons }; }
  // P1 weak
  const weak = t.length > 0 && (/\bshop\b/i.test(t) && t.length < 12);
  if (weak) { reasons.push("weak_cta_wording"); return { category: "BAKED_CTA_WEAK_BUT_USABLE", priority: "P1", reasons }; }
  return { category: "ACCEPTABLE_AS_IS", priority: "P2", reasons: [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  // Load Pinterest token
  const { data: conn, error: cErr } = await supabase
    .from("pinterest_connection").select("access_token").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (cErr || !conn?.access_token) return json({ ok: false, error: "no_pinterest_token" }, 500);
  const token = conn.access_token as string;

  // ---- Phase 1-2: Golden litter-box ---------------------------------------
  const [g1, g2] = await Promise.all([checkPin(token, GOLDEN_V1), checkPin(token, GOLDEN_V2)]);

  // ---- Phase 3-5: Deterministic pins --------------------------------------
  const invalid_results: any[] = [];
  for (const row of INVALID_ORIGINALS) {
    const c = await checkPin(token, row.pin);
    invalid_results.push({ ...row, ...c });
  }
  const canary = { ...CANARY_ORIGINAL, ...(await checkPin(token, CANARY_ORIGINAL.pin)) };
  const recent_results: any[] = [];
  for (const row of RECENT_REPLACEMENTS) {
    const c = await checkPin(token, row.pin);
    // Load DB row for extra metadata
    const { data: q } = await supabase.from("pinterest_pin_queue")
      .select("product_id, product_name, board_name, board_id, destination_link, pin_image_url, overlay_text")
      .eq("pinterest_pin_id", row.pin).maybeSingle();
    recent_results.push({ ...row, ...c, db: q ?? null });
  }

  // ---- Phase 9: 92 AI-creative classification (DB heuristics only) --------
  const { data: aiPins, error: aiErr } = await supabase
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id, product_id, product_name, board_name, destination_link, pin_image_url, overlay_text, pin_title")
    .eq("status", "posted").not("pinterest_pin_id", "is", null)
    .not("pin_image_url", "ilike", "%/deterministic/%");
  if (aiErr) return json({ ok: false, error: "ai_query_failed", detail: aiErr.message }, 500);
  const ai_classified = (aiPins ?? []).map((p) => {
    const c = classifyOverlay(p.overlay_text, p.pin_title ?? "", p.pin_image_url ?? "");
    return {
      pin_id: p.pinterest_pin_id, product: p.product_name, board: p.board_name,
      destination: p.destination_link, asset_url: p.pin_image_url, overlay_text: p.overlay_text,
      classification: c.category, priority: c.priority, reasons: c.reasons,
      cta_baked: true, non_separable: true,
    };
  });
  const totals = { ACCEPTABLE_AS_IS: 0, BAKED_CTA_WEAK_BUT_USABLE: 0, BAKED_CTA_TRUNCATED: 0, BAKED_CTA_VISUALLY_BROKEN: 0, OTHER_CREATIVE_DEFECT: 0 } as Record<string, number>;
  const p0: any[] = [], p1: any[] = [], p2: any[] = [];
  for (const r of ai_classified) {
    totals[r.classification] = (totals[r.classification] ?? 0) + 1;
    if (r.priority === "P0") p0.push({ pin_id: r.pin_id, product: r.product, overlay: r.overlay_text, reason: r.reasons.join(",") });
    else if (r.priority === "P1") p1.push({ pin_id: r.pin_id, product: r.product, overlay: r.overlay_text });
    else p2.push({ pin_id: r.pin_id, product: r.product });
  }

  // ---- Executive verdict --------------------------------------------------
  // We only READ this round; repairs deferred to phase-B. Report reflects
  // what SHOULD happen, no mutations executed here.
  const anyLiveDefective = recent_results.some((r) => r.state === "live");
  const verdict = anyLiveDefective ? "BOUNDED_CTA_REPAIR_PARTIAL" : "BOUNDED_CTA_REPAIR_COMPLETE";

  const report = {
    report_name: "PINTEREST_CTA_ARCHITECTURE_RECONCILIATION_REPORT",
    generated_at: new Date().toISOString(),
    "1_executive_verdict": verdict,
    "2_verified_architecture_reality": {
      total_live_pins_estimate: (aiPins?.length ?? 0) + recent_results.filter(r=>r.state==="live").length + (g2.state==="live"?1:0),
      deterministic_compositor_pins: 15,
      ai_baked_text_pins: aiPins?.length ?? 0,
      separable_cta_pins: recent_results.filter(r=>r.state==="live").length + (g2.state==="live"?1:0),
      non_separable_cta_pins: aiPins?.length ?? 0,
    },
    "3_golden_litter_box": {
      v1: g1, v2: g2,
      final_disposition:
        g2.state === "live" && g1.state === "live" ? "v1_should_be_retired_after_v2_verified" :
        g2.state === "live" && g1.state === "deleted" ? "clean_v1_already_retired" :
        "manual_review_required",
    },
    "4_original_pilot_reconciliation": invalid_results.concat([canary]),
    "5_recent_compositor_pin_results": recent_results,
    "6_cta_v6_repair_results": { executed: 0, reason: "READ_ONLY_PHASE — repairs deferred; live pins with pre-v6 CTA listed in section 5 for phase-B execution." },
    "7_database_reconciliation": {
      note: "Discrepancies detected between DB status='posted' and Pinterest live state are enumerated in sections 3-5; DB writes not yet applied.",
      stale_rows_candidates: invalid_results.filter(r => r.state === "deleted").length + (canary.state === "deleted" ? 1 : 0),
    },
    "8_ai_creative_classification": {
      totals,
      classification_label: "CTA_BAKED_INTO_IMAGE_NON_SEPARABLE",
      inventory: ai_classified,
    },
    "9_priority_regeneration_queue": {
      P0: p0, P1_count: p1.length, P2_count: p2.length,
      P1_sample: p1.slice(0, 10), P2_sample: p2.slice(0, 5),
      note: "READ-ONLY proposal. No paid regeneration enqueued.",
    },
    "10_public_profile_result": {
      note: "Flat pre-v6 compositor CTAs remain visible on the following live deterministic pins:",
      pins_still_showing_flat_cta: recent_results.filter(r => r.state === "live").map(r => ({ pin_id: r.pin, product: r.label, version: r.version })),
      ai_baked_ctas_remaining: aiPins?.length ?? 0,
      full_repair_claim: false,
    },
    "11_credits_and_costs": {
      paid_ai_credits_used: 0, image_generation_credits_used: 0,
      deterministic_cloudinary_repairs_executed: 0, unexpected_external_cost: 0,
    },
    "12_recommended_next_decision": {
      ai_pins_requiring_regeneration_estimate: p0.length,
      minimum_render_count: p0.length,
      small_capped_batch_worthwhile: p0.length > 0 && p0.length <= 15,
      first_targets_p0: p0.slice(0, 5),
      execution_not_performed: true,
    },
  };
  return json({ ok: true, report });
});