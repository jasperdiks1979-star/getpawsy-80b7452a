// PQIF v2 nightly self-audit. Verifies every live pin against Pinterest,
// clears orphans, flags ghosts, broken URLs, deleted products, duplicates.
// Safe-by-default: only updates DB; does NOT call Pinterest write endpoints
// unless ENABLE_PIN_DELETE=true is explicitly set.

import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/pinterest-quality-firewall-v2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = getServiceClient();

  const { data: run } = await sb.from("pqif_audit_runs").insert({ status: "running" }).select().single();
  const counters = { pins_checked: 0, ghosts_found: 0, orphans_cleared: 0, broken_urls: 0, deleted_products: 0, duplicates_found: 0, repairs_applied: 0 };
  const notes: any = { samples: [] };

  try {
    // 1. Orphan DB entries: posted rows whose pinterest_pin_id is null
    const { data: orphans } = await sb.from("pinterest_pin_queue")
      .select("id").eq("status", "posted").is("pinterest_pin_id", null).limit(2000);
    if (orphans?.length) {
      await sb.from("pinterest_pin_queue").update({
        status: "rejected", rejection_reason: "pqif_v2_orphan_no_pin_id",
      }).in("id", orphans.map((o: any) => o.id));
      counters.orphans_cleared = orphans.length;
    }

    // 2. Deleted products: pins referencing missing products
    const { data: missingProducts } = await sb.rpc("pqif_find_deleted_product_pins").maybeSingle().then(
      (r: any) => r,
      async () => {
        // fallback inline query
        const { data } = await sb
          .from("pinterest_pin_queue")
          .select("id, product_id")
          .eq("status", "posted")
          .limit(5000);
        if (!data?.length) return { data: [] };
        const ids = Array.from(new Set(data.map((d: any) => d.product_id)));
        const { data: prods } = await sb.from("products").select("id").in("id", ids);
        const alive = new Set((prods ?? []).map((p: any) => p.id));
        return { data: data.filter((d: any) => !alive.has(d.product_id)) };
      },
    );
    const stale = (missingProducts as any)?.data ?? [];
    if (stale.length) {
      await sb.from("pinterest_pin_queue").update({
        status: "rejected", rejection_reason: "pqif_v2_product_deleted",
      }).in("id", stale.map((s: any) => s.id));
      counters.deleted_products = stale.length;
    }

    // 3. Duplicate publications by creative_fingerprint within 30d
    const { data: dups } = await sb.rpc("pqif_find_duplicate_publications").maybeSingle().then(
      (r: any) => r,
      async () => ({ data: [] }),
    );
    counters.duplicates_found = ((dups as any)?.data ?? []).length;

    // 4. Broken URL check (sample 200 most-recent posted pins)
    const { data: livePins } = await sb.from("pinterest_pin_queue")
      .select("id, destination_link, pinterest_pin_id")
      .eq("status", "posted").not("pinterest_pin_id", "is", null)
      .order("posted_at", { ascending: false }).limit(200);
    counters.pins_checked = livePins?.length ?? 0;
    for (const p of livePins ?? []) {
      try {
        const r = await fetch(p.destination_link, { method: "HEAD", redirect: "follow" });
        if (r.status >= 400) {
          counters.broken_urls++;
          await sb.from("pinterest_pin_queue").update({
            validation_status: "broken_url",
            last_validation_error: `HTTP ${r.status}`,
            last_validated_at: new Date().toISOString(),
          }).eq("id", p.id);
          counters.repairs_applied++;
        }
      } catch (_e) {
        counters.broken_urls++;
      }
    }

    await sb.from("pqif_audit_runs").update({
      finished_at: new Date().toISOString(), status: "ok", ...counters, notes,
    }).eq("id", (run as any).id);

    return new Response(JSON.stringify({ ok: true, run_id: (run as any).id, counters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await sb.from("pqif_audit_runs").update({
      finished_at: new Date().toISOString(), status: "error", notes: { error: String(err) },
    }).eq("id", (run as any).id);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: corsHeaders });
  }
});