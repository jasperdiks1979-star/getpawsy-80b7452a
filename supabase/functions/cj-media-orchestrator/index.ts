/**
 * cj-media-orchestrator
 *
 * Unified controller for the CJ Media Intelligence Platform.
 * Drives existing rehost + video-ingest + integrity-scan functions in batches
 * and records a single run row to cj_media_sync_runs.
 *
 * Body: { mode?: 'full'|'delta', batchSize?: number, maxBatches?: number }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type RunCounters = {
  products_scanned: number;
  products_processed: number;
  images_rehosted: number;
  videos_rehosted: number;
  derivatives_enqueued: number;
  failures: number;
  storage_bytes_added: number;
};

async function invoke(name: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const mode = (body.mode ?? "delta") as "full" | "delta";
  const batchSize = Math.min(Math.max(body.batchSize ?? 25, 5), 50);
  const maxBatches = Math.min(Math.max(body.maxBatches ?? (mode === "full" ? 20 : 4), 1), 40);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: runRow, error: runErr } = await supabase
    .from("cj_media_sync_runs")
    .insert({ mode, status: "running" })
    .select("id")
    .single();
  if (runErr) {
    return new Response(JSON.stringify({ ok: false, error: runErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id as string;

  const counters: RunCounters = {
    products_scanned: 0,
    products_processed: 0,
    images_rehosted: 0,
    videos_rehosted: 0,
    derivatives_enqueued: 0,
    failures: 0,
    storage_bytes_added: 0,
  };
  const notes: Record<string, unknown> = { batches: [] as unknown[] };

  try {
    for (let i = 0; i < maxBatches; i++) {
      // 1) Rehost CJ-hosted images (function picks its own queue based on CJ host scan)
      const rehost = await invoke("cj-rehost-product-images", { limit: batchSize });
      const remaining = Number(rehost.json?.remaining ?? 0);
      counters.products_scanned += Number(rehost.json?.scanned ?? 0);
      counters.products_processed += Number(rehost.json?.products_updated ?? 0);
      counters.images_rehosted += Number(rehost.json?.images_rehosted ?? 0);
      counters.failures += Number(rehost.json?.failures ?? 0);
      (notes.batches as unknown[]).push({ batch: i + 1, rehost: rehost.json });

      if (!rehost.ok) counters.failures += 1;
      // Stop when nothing remains to rehost (delta mode) or after maxBatches.
      if (remaining === 0) break;
    }

    // 2) Video ingest (one drain per run; the worker self-limits).
    const video = await invoke("cj-video-ingest-worker", { limit: 25 });
    counters.videos_rehosted += Number(video.json?.videos_rehosted ?? video.json?.processed ?? 0);
    if (!video.ok) counters.failures += 1;
    notes.video = video.json;

    // 3) Nightly integrity scan (cheap — function dedupes via products.updated_at)
    const scan = await invoke("media-integrity-scan", { limit: 50 });
    notes.integrity = scan.json;

    // 4) Drain derivative queue (best-effort)
    const deriv = await invoke("cj-media-derivative-worker", { limit: 50 });
    counters.derivatives_enqueued += Number(deriv.json?.processed ?? 0);
    notes.derivatives = deriv.json;

    await supabase.from("cj_media_sync_runs").update({
      status: "completed",
      ...counters,
      notes,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, runId, mode, ...counters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await supabase.from("cj_media_sync_runs").update({
      status: "failed",
      notes: { ...notes, error: (e as Error).message },
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, runId, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});