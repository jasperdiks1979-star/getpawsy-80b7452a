// One-shot driver: loops cj-backfill-media-variants in batches using the
// INTERNAL_FUNCTION_SECRET so it can run without an admin browser session.
// POST { offset?: number, batch_size?: number, max_batches?: number,
//        rehost?: boolean, dry_run?: boolean }
// Returns aggregate stats + next_offset (null when done).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  let offset = Number((body as { offset?: number }).offset ?? 0);
  const batchSize = Number((body as { batch_size?: number }).batch_size ?? 15);
  const maxBatches = Math.min(Number((body as { max_batches?: number }).max_batches ?? 6), 20);
  const rehost = Boolean((body as { rehost?: boolean }).rehost ?? false);
  const dryRun = Boolean((body as { dry_run?: boolean }).dry_run ?? false);

  const agg: Record<string, number> = {};
  let runId = "";
  let total = 0;
  let batches = 0;
  let lastError: string | null = null;

  for (let i = 0; i < maxBatches; i++) {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/cj-backfill-media-variants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        offset, batch_size: batchSize, only_missing: true, dry_run: dryRun,
        rehost, run_id: runId || undefined,
      }),
    });
    if (!r.ok) {
      lastError = `batch_${i}_http_${r.status}: ${(await r.text()).slice(0, 200)}`;
      break;
    }
    const j = await r.json() as {
      ok: boolean; run_id: string; total: number;
      next_offset: number | null; stats: Record<string, number>;
    };
    if (!j.ok) { lastError = `batch_${i}_not_ok`; break; }
    runId = j.run_id;
    total = j.total;
    for (const [k, v] of Object.entries(j.stats || {})) agg[k] = (agg[k] ?? 0) + Number(v);
    batches++;
    if (j.next_offset == null) { offset = total; break; }
    offset = j.next_offset;
  }

  return new Response(JSON.stringify({
    ok: true, run_id: runId, total, batches_completed: batches,
    next_offset: offset >= total ? null : offset,
    stats: agg, error: lastError,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
});