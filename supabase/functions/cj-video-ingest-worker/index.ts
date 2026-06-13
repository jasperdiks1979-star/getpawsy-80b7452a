// CJ Video Ingest Worker
// Batched orchestrator that pulls active CJ-linked products in chunks of 25
// and resolves their videos via cj-video-resolve. Logs to cj_video_ingestion_runs.
//
// Auth: x-internal-secret = INTERNAL_FUNCTION_SECRET, OR admin JWT.
// Body: { batch_size?: number; max_batches?: number; only_missing?: boolean;
//         trigger?: string }
//   only_missing (default true) — skip products that already have a video row
//   in product_media.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const ADMIN_FALLBACK_EMAILS = ["jasperdiks@hotmail.com"];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authorize(req: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const internal = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL_SECRET.length > 0 && internal === INTERNAL_SECRET) return true;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ures } = await user.auth.getUser();
  if (!ures?.user) return false;
  const { data: role } = await admin
    .from("user_roles").select("role").eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
  const email = (ures.user.email ?? "").toLowerCase();
  return !!role || ADMIN_FALLBACK_EMAILS.includes(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await authorize(req, admin))) return json({ ok: false, message: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as {
    batch_size?: number;
    max_batches?: number;
    only_missing?: boolean;
    trigger?: string;
  };
  const batchSize = Math.max(1, Math.min(50, body.batch_size ?? 25));
  const maxBatches = Math.max(1, Math.min(40, body.max_batches ?? 4));
  const onlyMissing = body.only_missing !== false;

  // Create run row
  const { data: runRow, error: runErr } = await admin
    .from("cj_video_ingestion_runs")
    .insert({ trigger: body.trigger ?? "manual", status: "running" })
    .select("id").single();
  if (runErr || !runRow) return json({ ok: false, message: `run_insert_failed: ${runErr?.message}` }, 500);
  const runId = runRow.id as string;

  const totals = {
    products_scanned: 0,
    cj_fetch_success: 0,
    cj_fetch_failed: 0,
    videos_found: 0,
    videos_resolved: 0,
    videos_imported: 0,
    videos_rejected: 0,
  };
  const rejection: Record<string, number> = {};

  try {
    // Pre-load product ids that already have a video, so we can skip
    let skipIds = new Set<string>();
    if (onlyMissing) {
      const { data: hav } = await admin
        .from("product_media").select("product_id").eq("media_type", "video");
      skipIds = new Set((hav ?? []).map((r: any) => r.product_id as string));
    }

    // Pull all candidate active CJ-linked products once, then chunk
    const { data: prods, error: prodErr } = await admin
      .from("products")
      .select("id, cj_product_id")
      .eq("is_active", true)
      .not("cj_product_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (prodErr) throw new Error(`product_query_failed: ${prodErr.message}`);
    const candidates = (prods ?? [])
      .filter((p: any) => !skipIds.has(p.id))
      .map((p: any) => ({ id: p.id as string, cj_product_id: p.cj_product_id as string }));

    for (let b = 0; b < maxBatches; b++) {
      const slice = candidates.slice(b * batchSize, (b + 1) * batchSize);
      if (slice.length === 0) break;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/cj-video-resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          product_ids: slice.map((s) => s.id),
          limit: slice.length,
        }),
      });
      const data = await resp.json().catch(() => ({} as any));
      if (!resp.ok) {
        totals.cj_fetch_failed += slice.length;
        rejection[`http_${resp.status}`] = (rejection[`http_${resp.status}`] ?? 0) + slice.length;
        continue;
      }

      totals.products_scanned += data.products_scanned ?? slice.length;
      totals.cj_fetch_success += (data.products_scanned ?? slice.length) - (data.errors?.length ?? 0);
      totals.cj_fetch_failed += data.errors?.length ?? 0;
      totals.videos_found += data.videos_resolved ?? 0;
      totals.videos_resolved += data.videos_resolved ?? 0;
      totals.videos_imported += data.videos_inserted ?? 0;

      for (const e of (data.errors ?? []) as Array<{ code?: number; message?: string }>) {
        const k = e.code ? `cj_${e.code}` : (e.message?.slice(0, 40) ?? "unknown");
        rejection[k] = (rejection[k] ?? 0) + 1;
      }
      // Tiny gap between batches to keep CJ QPS happy
      await new Promise((r) => setTimeout(r, 500));
    }

    await admin
      .from("cj_video_ingestion_runs")
      .update({
        ...totals,
        rejection_reasons: rejection,
        status: "completed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return json({ ok: true, run_id: runId, ...totals, rejection_reasons: rejection });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("cj_video_ingestion_runs").update({
      ...totals,
      rejection_reasons: rejection,
      status: "failed",
      error: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return json({ ok: false, run_id: runId, error: msg }, 500);
  }
});