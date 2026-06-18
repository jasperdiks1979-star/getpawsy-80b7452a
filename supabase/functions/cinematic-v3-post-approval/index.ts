// Cinematic V3 post-approval handoff: attach approved videos to PDP (product_media)
// and enqueue them into the Pinterest video pipeline (pinterest_video_assets +
// pinterest_video_queue). Idempotent — safe for trigger calls AND backfill runs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://getpawsy.pet";

type Result = {
  job_id: string;
  product_id: string | null;
  attached: boolean;
  queued: boolean;
  asset_id?: string;
  queue_id?: string;
  media_id?: string;
  skipped?: string;
  error?: string;
};

function stripQuery(u: string | null | undefined) {
  if (!u) return null;
  try {
    const url = new URL(u);
    return `${url.origin}${url.pathname}`;
  } catch {
    return u;
  }
}

async function processJob(supa: any, job: any): Promise<Result> {
  const res: Result = {
    job_id: job.id,
    product_id: job.product_id ?? null,
    attached: false,
    queued: false,
  };

  if (!job.product_id || !job.final_mp4_url) {
    res.skipped = "missing product_id or final_mp4_url";
    return res;
  }

  // Fetch product context
  const { data: product, error: pErr } = await supa
    .from("products")
    .select("id, slug, name, title, description, short_description")
    .eq("id", job.product_id)
    .maybeSingle();
  if (pErr || !product) {
    res.error = `product lookup failed: ${pErr?.message ?? "not found"}`;
    return res;
  }

  const slug = product.slug || job.product_slug;
  const title = (product.name || product.title || slug || "Pet Product").toString().slice(0, 100);
  const description = (product.short_description || product.description || `Discover ${title} at GetPawsy.`).toString().slice(0, 500);
  const destination_url = `${SITE_URL}/products/${slug}`;
  const checksum = `cinematic_v3:${job.id}`;

  // === 1. Attach to PDP via product_media ===
  // Dedup on (product_id, checksum) — checksum is unique-per-job marker.
  const { data: existingMedia } = await supa
    .from("product_media")
    .select("id")
    .eq("product_id", job.product_id)
    .eq("checksum", checksum)
    .maybeSingle();

  let media_id = existingMedia?.id as string | undefined;
  if (!media_id) {
    const { data: mediaIns, error: mErr } = await supa
      .from("product_media")
      .insert({
        product_id: job.product_id,
        media_type: "video",
        storage_url: job.final_mp4_url,
        supplier_url: job.final_mp4_url,
        sort_order: 0, // primary video
        source: "cinematic_v3",
        checksum,
        duration_sec: job.duration_seconds ?? null,
        alt_text: `${title} — cinematic product video`,
        metadata: { job_id: job.id, voiceover_url: job.voiceover_url ?? null, approved_at: job.approved_at },
      })
      .select("id")
      .single();
    if (mErr) {
      res.error = `product_media insert failed: ${mErr.message}`;
      return res;
    }
    media_id = mediaIns.id;
  }
  res.attached = true;
  res.media_id = media_id;

  // === 2. Create pinterest_video_assets row ===
  let asset_id: string | undefined;
  const { data: existingAsset } = await supa
    .from("pinterest_video_assets")
    .select("id")
    .eq("content_hash", checksum)
    .maybeSingle();

  if (existingAsset) {
    asset_id = existingAsset.id;
  } else {
    const storage_path = `jobs/${job.id}/final.mp4`;
    const { data: assetIns, error: aErr } = await supa
      .from("pinterest_video_assets")
      .insert({
        filename: `cinematic-v3-${slug}-${job.id}.mp4`,
        storage_bucket: "cinematic-v3",
        storage_path,
        public_url: stripQuery(job.final_mp4_url) ?? job.final_mp4_url,
        duration_seconds: job.duration_seconds ?? null,
        aspect_ratio: "9:16",
        hook_type: "cinematic_v3",
        product_slug: slug,
        content_hash: checksum,
        is_active: true,
        detected_platform: "cinematic_v3",
        country_target: "US",
        language_target: "en",
        mime_type: "video/mp4",
      })
      .select("id")
      .single();
    if (aErr) {
      res.error = `pinterest_video_assets insert failed: ${aErr.message}`;
      return res;
    }
    asset_id = assetIns.id;
  }
  res.asset_id = asset_id;

  // === 3. Enqueue into pinterest_video_queue ===
  // Dedup on variation_hash = job.id.
  let queue_id: string | undefined = job.pinterest_queue_id ?? undefined;
  if (!queue_id) {
    const { data: existingQ } = await supa
      .from("pinterest_video_queue")
      .select("id")
      .eq("variation_hash", job.id)
      .maybeSingle();
    queue_id = existingQ?.id;
  }

  if (!queue_id) {
    const { data: qIns, error: qErr } = await supa
      .from("pinterest_video_queue")
      .insert({
        asset_id,
        status: "pending",
        title,
        description,
        hashtags: [],
        destination_url,
        variation_hash: job.id,
        priority: 70,
      })
      .select("id")
      .single();
    if (qErr) {
      res.error = `pinterest_video_queue insert failed: ${qErr.message}`;
      return res;
    }
    queue_id = qIns.id;
  }
  res.queue_id = queue_id;
  res.queued = true;

  // === 4. Backlink job → queue row ===
  if (job.pinterest_queue_id !== queue_id) {
    await supa
      .from("cinematic_v3_jobs")
      .update({ pinterest_queue_id: queue_id })
      .eq("id", job.id);
  }

  // === 5. Log dispatch event ===
  await supa.from("cinematic_v3_dispatch_log").insert({
    event_type: "post_approval_handoff",
    product_id: job.product_id,
    product_slug: slug,
    job_id: job.id,
    outcome: "ok",
    details: { media_id, asset_id, queue_id },
  });

  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { job_id, backfill } = body ?? {};

  try {
    let jobs: any[] = [];
    if (job_id) {
      const { data } = await supa.from("cinematic_v3_jobs").select("*").eq("id", job_id).maybeSingle();
      if (data) jobs = [data];
    } else if (backfill) {
      const { data } = await supa
        .from("cinematic_v3_jobs")
        .select("*")
        .eq("status", "approved")
        .order("approved_at", { ascending: true });
      jobs = data ?? [];
    } else {
      return new Response(JSON.stringify({ ok: false, error: "job_id or backfill required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Result[] = [];
    for (const j of jobs) {
      try {
        results.push(await processJob(supa, j));
      } catch (e) {
        results.push({
          job_id: j.id,
          product_id: j.product_id ?? null,
          attached: false,
          queued: false,
          error: String((e as Error).message ?? e),
        });
      }
    }

    const attached = results.filter((r) => r.attached).length;
    const queued = results.filter((r) => r.queued).length;
    const failed = results.filter((r) => r.error).length;

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, attached, queued, failed, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});