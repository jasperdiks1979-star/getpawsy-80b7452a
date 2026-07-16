// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Warmup Regenerate
// ─────────────────────────────────────────────────────────────────────────────
// Replaces template-based warmup drafts with AI-generated pins from
// pinterest-creative-director. Processes a small batch of products per call
// (default 3) so the UI can loop and show progress without timing out.
//
// For each warmup30:* row in scope it:
//   1. Groups rows by product_id (preserving scheduled_at / idempotency_key
//      / board_name / meta.predicted_ctr_pct).
//   2. Calls pinterest-creative-director (run_full, count=group size).
//   3. Stamps the newly inserted CD rows with the original schedule slots
//      + a rotated idempotency_key (warmup30:<slug>:<n>:r<ts>) so the UI
//      keeps showing them and re-runs cannot collide.
//   4. Deletes the old template rows.
//
// Body:
//   { scope: "all" | "overused" | "ids", ids?: string[], batchSize?: number }
// Returns:
//   { ok, processed, remaining, regenerated, failed }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(b: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...b }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Slot = {
  id: string;
  scheduled_at: string | null;
  idempotency_key: string | null;
  board_name: string | null;
  predicted_ctr_pct: number | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method not allowed", 405);

  const t0 = Date.now();
  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const scope = (body?.scope as string) || "all";
  const idsArg: string[] = Array.isArray(body?.ids) ? body.ids : [];
  const batchSize = Math.max(1, Math.min(10, Number(body?.batchSize ?? 3)));

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const { assertIsolationAllows } = await import("../_shared/pinterest-wave-isolation.ts");
    const guard = await assertIsolationAllows(sb, body?.run_id ?? null, corsHeaders);
    if (guard) return guard;
  } catch (e) {
    console.warn("[warmup-regenerate] wave-isolation check failed (non-fatal):", e);
  }

  // 1. Load warmup30 rows in scope.
  let q = sb
    .from("pinterest_pin_queue")
    .select("id,product_id,product_slug,scheduled_at,idempotency_key,board_name,hook_group,meta")
    .like("idempotency_key", "warmup30:%")
    .in("status", ["draft", "rejected"]);
  if (scope === "ids" && idsArg.length) q = q.in("id", idsArg);
  const { data: rowsRaw, error: qErr } = await q.limit(2000);
  if (qErr) return fail(`load failed: ${qErr.message}`, 500);
  let rows = (rowsRaw || []) as any[];

  if (scope === "overused") {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const h = (r.hook_group || "").trim().toLowerCase();
      if (h) counts.set(h, (counts.get(h) || 0) + 1);
    }
    const overused = new Set(
      [...counts.entries()].filter(([, n]) => n > 3).map(([k]) => k),
    );
    rows = rows.filter((r) => overused.has((r.hook_group || "").trim().toLowerCase()));
  }

  // 2. Group by product, sort slots by scheduled_at.
  const byProduct = new Map<string, { slug: string; slots: Slot[] }>();
  for (const r of rows) {
    const ctr = r.meta && typeof r.meta === "object" && "predicted_ctr_pct" in r.meta
      ? Number((r.meta as any).predicted_ctr_pct) : null;
    const slot: Slot = {
      id: r.id,
      scheduled_at: r.scheduled_at,
      idempotency_key: r.idempotency_key,
      board_name: r.board_name,
      predicted_ctr_pct: Number.isFinite(ctr as number) ? ctr : null,
    };
    const existing = byProduct.get(r.product_id);
    if (existing) existing.slots.push(slot);
    else byProduct.set(r.product_id, { slug: r.product_slug, slots: [slot] });
  }
  for (const g of byProduct.values()) {
    g.slots.sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""));
  }

  const productEntries = [...byProduct.entries()].slice(0, batchSize);
  const remaining = Math.max(0, byProduct.size - productEntries.length);

  const regenerated: any[] = [];
  const failed: any[] = [];

  // 3. Process each product: call CD, stamp slots, delete old rows.
  for (const [productId, group] of productEntries) {
    try {
      const cdRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          action: "run_full",
          productId,
          count: group.slots.length,
        }),
      });
      const cdJson = await cdRes.json().catch(() => ({}));
      if (!cdRes.ok || !cdJson?.ok) {
        failed.push({ productId, slug: group.slug, reason: cdJson?.message || `HTTP ${cdRes.status}` });
        continue;
      }
      const newIds: string[] = (cdJson.drafts || [])
        .map((d: any) => d?.queueId)
        .filter(Boolean);
      if (!newIds.length) {
        failed.push({ productId, slug: group.slug, reason: "no drafts produced" });
        continue;
      }

      const ts = Date.now().toString(36);
      // Update each new draft with the corresponding slot's schedule.
      const pairs = newIds.slice(0, group.slots.length).map((newId, i) => ({
        newId,
        slot: group.slots[i],
        n: i,
      }));
      for (const p of pairs) {
        const meta: Record<string, unknown> = { regenerated_at: new Date().toISOString() };
        if (p.slot.predicted_ctr_pct != null) meta.predicted_ctr_pct = p.slot.predicted_ctr_pct;
        await sb
          .from("pinterest_pin_queue")
          .update({
            scheduled_at: p.slot.scheduled_at,
            board_name: p.slot.board_name,
            idempotency_key: `warmup30:${group.slug}:${p.n}:r${ts}`,
          })
          .eq("id", p.newId);
        // Merge predicted_ctr_pct into meta without dropping CD intelligence.
        const { data: existingRow } = await sb
          .from("pinterest_pin_queue")
          .select("meta")
          .eq("id", p.newId)
          .maybeSingle();
        const merged = { ...(existingRow?.meta as any || {}), ...meta };
        await sb.from("pinterest_pin_queue").update({ meta: merged }).eq("id", p.newId);
      }

      // Delete the old template rows we just replaced.
      const oldIds = group.slots.map((s) => s.id);
      await sb.from("pinterest_pin_queue").delete().in("id", oldIds);

      regenerated.push({
        productId,
        slug: group.slug,
        replaced: oldIds.length,
        new: newIds.length,
      });
    } catch (e) {
      failed.push({ productId, slug: group.slug, reason: (e as Error).message });
    }
  }

  return ok({
    scope,
    processed: productEntries.length,
    remainingProducts: remaining,
    totalCandidateProducts: byProduct.size,
    regenerated,
    failed,
    elapsedMs: Date.now() - t0,
  });
});