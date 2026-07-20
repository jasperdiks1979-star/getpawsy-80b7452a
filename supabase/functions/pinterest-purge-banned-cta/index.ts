import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

// Wipes rejected pinterest_pin_queue rows whose rejection_reason is a
// generic_cta_phrase / banned_phrase / content_refresh_banned_overlay finding,
// and flags the (product_slug, board_name) pairs in ai_priority_queue so the
// next Creative Director cycle regenerates them. No AI calls.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find banned-CTA / banned-phrase rejections
    const { data: rows, error: selErr } = await sb
      .from("pinterest_pin_queue")
      .select("id, product_slug, product_name, board_id, board_name, rejection_reason")
      .eq("status", "rejected")
      .or(
        "rejection_reason.ilike.generic_cta_phrase%,rejection_reason.ilike.banned_phrase%,rejection_reason.eq.content_refresh_banned_overlay",
      );

    if (selErr) throw selErr;
    const targets = rows ?? [];

    // Dedupe (slug, board) for regen flags
    const pairs = new Map<string, { product_slug: string; board_name: string | null; product_name: string | null; reasons: Set<string> }>();
    for (const r of targets) {
      if (!r.product_slug) continue;
      const key = `${r.product_slug}::${r.board_name ?? ""}`;
      const prev = pairs.get(key) ?? {
        product_slug: r.product_slug,
        board_name: r.board_name,
        product_name: r.product_name,
        reasons: new Set<string>(),
      };
      if (r.rejection_reason) prev.reasons.add(r.rejection_reason);
      pairs.set(key, prev);
    }

    // Upsert regen flags into ai_priority_queue
    const flagRows = Array.from(pairs.values()).map((p) => ({
      source_kind: "pinterest_creative_regen",
      source_ref: p.product_slug,
      category: "creative",
      title: `Regenerate Pinterest creative: ${p.product_name ?? p.product_slug}`,
      summary: `Banned overlay/CTA detected on ${p.board_name ?? "board"}. Needs new creative scene.`,
      recommended_action: "creative_director",
      priority_score: 80,
      status: "open",
      evidence: { board_name: p.board_name, reasons: Array.from(p.reasons) },
      dedupe_key: `regen:${p.product_slug}:${p.board_name ?? ""}`,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    let flagged = 0;
    if (flagRows.length) {
      // No unique constraint on dedupe_key — emulate upsert by deleting
      // existing flag rows for the same dedupe_keys, then plain insert.
      const keys = flagRows.map((r) => r.dedupe_key);
      await sb.from("ai_priority_queue").delete().in("dedupe_key", keys);
      const { error: insErr, count } = await sb
        .from("ai_priority_queue")
        .insert(flagRows, { count: "exact" });
      if (insErr) throw insErr;
      flagged = count ?? flagRows.length;
    }

    // Delete the rejected rows
    let deleted = 0;
    if (targets.length) {
      const ids = targets.map((r) => r.id);
      const { error: delErr, count } = await sb
        .from("pinterest_pin_queue")
        .delete({ count: "exact" })
        .in("id", ids);
      if (delErr) throw delErr;
      deleted = count ?? ids.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: "Banned-CTA pins purged and flagged for regen",
        deleted,
        flagged,
        unique_pairs: pairs.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});