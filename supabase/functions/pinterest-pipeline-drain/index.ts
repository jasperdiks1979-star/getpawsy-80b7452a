// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Pipeline Drain
// ─────────────────────────────────────────────────────────────────────────────
// Executes the full draft→queued→published path in one call:
//   1. pinterest-draft-validator (onlyCleanup:false)
//   2. pinterest-draft-promoter
//   3. pinterest-publish-now (mode:pin) per queued row, up to `limit`
// Returns per-stage counts plus every Pinterest pin id + live URL produced.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

async function callFn(name: string, body: unknown) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body ?? {}),
  });
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = crypto.randomUUID().slice(0, 8);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const limit = Math.max(1, Math.min(50, Number(body?.limit ?? 20)));
  const runValidator = body?.runValidator !== false;
  const runPromoter = body?.runPromoter !== false;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Snapshot before.
  const beforeDraft = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "draft");
  const beforeQueued = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "queued").is("pinterest_pin_id", null);

  // 1. Validator
  const validator = runValidator
    ? await callFn("pinterest-draft-validator", { onlyCleanup: false })
    : { status: 0, json: { skipped: true } };

  // 2. Promoter
  const promoter = runPromoter
    ? await callFn("pinterest-draft-promoter", {})
    : { status: 0, json: { skipped: true } };

  // 3. Publish loop
  const { data: queued } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_slug, board_name")
    .eq("status", "queued")
    .is("pinterest_pin_id", null)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  const publishResults: Array<{
    pin_queue_id: string;
    slug: string;
    board: string | null;
    ok: boolean;
    pinterest_pin_id: string | null;
    live_url: string | null;
    stage?: string;
    message?: string;
  }> = [];

  for (const row of queued ?? []) {
    const r = await callFn("pinterest-publish-now", { mode: "pin", pinId: (row as any).id });
    const j = r.json ?? {};
    const pinId = j.pinterest_pin_id || j.pin_id || null;
    publishResults.push({
      pin_queue_id: (row as any).id,
      slug: (row as any).product_slug,
      board: (row as any).board_name ?? null,
      ok: !!j.ok,
      pinterest_pin_id: pinId,
      live_url: pinId ? `https://www.pinterest.com/pin/${pinId}/` : null,
      stage: j.stage,
      message: j.message,
    });
  }

  // Snapshot after.
  const afterDraft = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "draft");
  const afterQueued = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "queued").is("pinterest_pin_id", null);
  const posted = await sb.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "posted");

  const publishAttempts = publishResults.length;
  const pinIds = publishResults.filter((p) => p.pinterest_pin_id).map((p) => p.pinterest_pin_id!);
  const liveUrls = publishResults.filter((p) => p.live_url).map((p) => p.live_url!);

  return new Response(
    JSON.stringify({
      ok: true,
      traceId: trace,
      before: { draft: beforeDraft.count ?? 0, queued: beforeQueued.count ?? 0 },
      validator: validator.json,
      promoter: promoter.json,
      qa: {
        evaluated: validator.json?.evaluated ?? 0,
        passed: validator.json?.passed ?? 0,
        failed: validator.json?.failed ?? 0,
      },
      counts: {
        draft_after: afterDraft.count ?? 0,
        queued_after: afterQueued.count ?? 0,
        posted_total: posted.count ?? 0,
        publish_attempts: publishAttempts,
        pin_ids_created: pinIds.length,
      },
      pinterest_pin_ids: pinIds,
      live_pin_urls: liveUrls,
      publish_results: publishResults,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});