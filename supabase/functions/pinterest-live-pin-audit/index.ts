import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const LITTER_TERMS = ["scoop", "scooping", "litter box", "litter-box", "clumping", "odor-free litter"];
const CAT_TREE_TERMS = ["cat tree", "tower", "climb", "perch", "vertical space", "scratch post"];
const CARRIER_TERMS = ["carrier", "travel", "trip", "car ride", "vet visit"];
const BED_TERMS = ["bed", "sleep", "nap", "orthopedic", "recovery", "comfort"];
const SCRATCHER_TERMS = ["scratcher", "scratching post", "scratch pad"];

function normalizeCategory(raw: string | null): string {
  if (!raw) return "unknown";
  const k = raw.toLowerCase().replace(/[-\s]+/g, "_");
  if (k.includes("litter")) return "litter";
  if (k.includes("tree")) return "cat_trees";
  if (k.includes("scratch")) return "scratchers";
  if (k.includes("carrier") || k.includes("travel") || k.includes("car_seat")) return "carriers";
  if (k.includes("bed")) return "beds";
  if (k.includes("enclosure") || k.includes("furniture") || k.includes("house")) return "cat_furniture";
  if (k.includes("bowl") || k.includes("feeder") || k.includes("fountain")) return "feeding";
  if (k.includes("toy")) return "toys";
  if (k.includes("essentials")) return "cat_essentials";
  if (k.includes("training")) return "dog_training";
  return k;
}

function hasAny(text: string, terms: string[]): boolean {
  const t = text.toLowerCase();
  return terms.some((w) => t.includes(w));
}

function detectViolations(pin: any) {
  const cat = normalizeCategory(pin.category_key);
  const blob = [pin.overlay_text, pin.pin_title, pin.pin_description, pin.hook_group]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
  const violations: string[] = [];

  // Litter messaging outside litter category
  if (cat !== "litter" && hasAny(blob, LITTER_TERMS)) violations.push("litter_messaging_off_category");
  // Cat-tree messaging outside cat_trees
  if (cat !== "cat_trees" && hasAny(blob, CAT_TREE_TERMS)) violations.push("cat_tree_messaging_off_category");
  // Carrier messaging outside carriers
  if (cat !== "carriers" && hasAny(blob, CARRIER_TERMS)) violations.push("carrier_messaging_off_category");
  // Bed messaging outside beds
  if (cat !== "beds" && hasAny(blob, BED_TERMS) && !blob.includes("bedding")) {
    // beds tokens are common; only flag when category clearly unrelated
    if (["litter", "cat_trees", "scratchers", "carriers"].includes(cat)) {
      violations.push("bed_messaging_off_category");
    }
  }
  // Scratcher messaging outside scratchers
  if (cat !== "scratchers" && hasAny(blob, SCRATCHER_TERMS)) violations.push("scratcher_messaging_off_category");

  return { violations, normalizedCategory: cat };
}

function recommend(action: string, violations: string[], dupKinds: string[]): "replace" | "archive" | "regenerate" {
  if (violations.some((v) => v.endsWith("_off_category"))) return "replace";
  if (dupKinds.length >= 2) return "regenerate";
  if (dupKinds.length === 1) return "regenerate";
  return "archive";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const auditRunId = crypto.randomUUID();

  // Fetch all live (posted) pins
  const { data: pins, error } = await supabase
    .from("pinterest_pin_queue")
    .select(
      "id, pinterest_pin_id, product_slug, category_key, board_name, overlay_text, pin_title, pin_description, hook_group, destination_link"
    )
    .eq("status", "posted")
    .limit(5000);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const livePins = pins ?? [];

  // Duplicate clusters
  const overlayCounts: Record<string, number> = {};
  const titleCounts: Record<string, number> = {};
  const hookCounts: Record<string, number> = {};
  for (const p of livePins) {
    if (p.overlay_text) overlayCounts[p.overlay_text] = (overlayCounts[p.overlay_text] || 0) + 1;
    if (p.pin_title) titleCounts[p.pin_title] = (titleCounts[p.pin_title] || 0) + 1;
    if (p.hook_group) hookCounts[p.hook_group] = (hookCounts[p.hook_group] || 0) + 1;
  }

  const DUP_THRESHOLD = 5;

  let categoryViolations = 0;
  let duplicatePins = 0;
  let replaceCount = 0;
  let archiveCount = 0;
  let regenerateCount = 0;
  const repairRows: any[] = [];

  for (const p of livePins) {
    const { violations, normalizedCategory } = detectViolations(p);
    const dupKinds: string[] = [];
    if (p.overlay_text && (overlayCounts[p.overlay_text] || 0) > DUP_THRESHOLD) dupKinds.push("overlay_cluster");
    if (p.pin_title && (titleCounts[p.pin_title] || 0) > DUP_THRESHOLD) dupKinds.push("headline_cluster");
    if (p.hook_group && (hookCounts[p.hook_group] || 0) > DUP_THRESHOLD) dupKinds.push("hook_cluster");

    const allViolations = [...violations, ...dupKinds];
    if (allViolations.length === 0) continue;

    if (violations.length > 0) categoryViolations++;
    if (dupKinds.length > 0) duplicatePins++;

    const action = recommend("", violations, dupKinds);
    if (action === "replace") replaceCount++;
    else if (action === "archive") archiveCount++;
    else regenerateCount++;

    const severity =
      violations.includes("litter_messaging_off_category") ? "critical" :
      violations.length > 0 ? "high" :
      dupKinds.length >= 2 ? "medium" : "low";

    repairRows.push({
      pin_queue_id: p.id,
      pinterest_pin_id: p.pinterest_pin_id,
      product_slug: p.product_slug,
      category_key: p.category_key,
      board_name: p.board_name,
      overlay_text: p.overlay_text,
      pin_title: p.pin_title,
      hook_group: p.hook_group,
      destination_link: p.destination_link,
      violation_types: allViolations,
      recommended_action: action,
      severity,
      audit_run_id: auditRunId,
      details: {
        normalized_category: normalizedCategory,
        overlay_cluster_size: p.overlay_text ? overlayCounts[p.overlay_text] : 0,
        headline_cluster_size: p.pin_title ? titleCounts[p.pin_title] : 0,
        hook_cluster_size: p.hook_group ? hookCounts[p.hook_group] : 0,
      },
    });
  }

  // Persist queue rows (idempotent per run id)
  let inserted = 0;
  if (!dryRun && repairRows.length > 0) {
    // chunk inserts
    for (let i = 0; i < repairRows.length; i += 500) {
      const slice = repairRows.slice(i, i + 500);
      const { error: insErr, count } = await supabase
        .from("pinterest_live_pin_repair_queue")
        .insert(slice, { count: "exact" });
      if (insErr) {
        return new Response(
          JSON.stringify({ ok: false, error: insErr.message, partial_inserted: inserted }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inserted += count ?? slice.length;
    }
  }

  const topOverlays = Object.entries(overlayCounts)
    .filter(([, c]) => c >= DUP_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([text, count]) => ({ text, count }));

  const topHeadlines = Object.entries(titleCounts)
    .filter(([, c]) => c >= DUP_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([text, count]) => ({ text, count }));

  const report = {
    ok: true,
    audit_run_id: auditRunId,
    publishing_paused: true,
    total_live_pins_audited: livePins.length,
    total_mismatched_pins: categoryViolations,
    total_duplicate_pins: duplicatePins,
    total_category_violations: categoryViolations,
    replacement_queue_size: replaceCount,
    archive_queue_size: archiveCount,
    regenerate_queue_size: regenerateCount,
    queue_rows_persisted: inserted,
    top_duplicate_overlays: topOverlays,
    top_duplicate_headlines: topHeadlines,
  };

  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});