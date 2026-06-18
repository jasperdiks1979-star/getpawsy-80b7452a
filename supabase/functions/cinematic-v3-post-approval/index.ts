// Cinematic V3 post-approval handoff: attach approved videos to PDP (product_media)
// and enqueue them into the Pinterest video pipeline (pinterest_video_assets +
// pinterest_video_queue). Idempotent — safe for trigger calls AND backfill runs.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://getpawsy.pet";

// Pinterest's publisher requires `/storage/v1/object/public/...` URLs, but the
// workspace policy forbids flipping the `cinematic-v3` bucket public. So we
// mirror each approved MP4 into the existing public `cinematic-ads` bucket and
// reference that copy from the Pinterest pipeline.
const PUBLIC_BUCKET = "cinematic-ads";

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

// Mirror a cinematic-v3 MP4 (private bucket) into the public cinematic-ads
// bucket so Pinterest can fetch it. Idempotent: skips upload if the copy
// already exists. Returns the public URL of the mirrored file.
async function mirrorToPublicBucket(
  supa: any,
  job: any,
): Promise<{ public_url: string; storage_path: string } | { error: string }> {
  const dest_path = `cinematic-v3/${job.id}.mp4`;
  const public_url = `${SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${dest_path}`;

  // HEAD-equivalent: list the parent prefix and look for the file.
  const { data: existing } = await supa
    .storage
    .from(PUBLIC_BUCKET)
    .list("cinematic-v3", { search: `${job.id}.mp4`, limit: 1 });
  if (existing && existing.length > 0 && existing.some((f: any) => f.name === `${job.id}.mp4`)) {
    return { public_url, storage_path: dest_path };
  }

  // Read the source MP4 from the private bucket. final_mp4_url is a signed
  // URL we can fetch directly; if that fails, fall back to a service-role
  // download from the storage API.
  let body: ArrayBuffer | null = null;
  if (job.final_mp4_url) {
    try {
      const r = await fetch(job.final_mp4_url);
      if (r.ok) body = await r.arrayBuffer();
    } catch {
      // fall through
    }
  }
  if (!body) {
    const src_path = `jobs/${job.id}/final.mp4`;
    const { data: dl, error: dlErr } = await supa.storage.from("cinematic-v3").download(src_path);
    if (dlErr || !dl) return { error: `source download failed: ${dlErr?.message ?? "no body"}` };
    body = await dl.arrayBuffer();
  }

  const { error: upErr } = await supa.storage
    .from(PUBLIC_BUCKET)
    .upload(dest_path, body, { contentType: "video/mp4", upsert: true });
  if (upErr) return { error: `public upload failed: ${upErr.message}` };

  return { public_url, storage_path: dest_path };
}

// Cap the queued pin title so the publisher's text-safe-area validator
// (max 2 lines at Pinterest's bold typeface) never trips.
function truncatePinTitle(raw: string, maxChars = 38): string {
  const clean = (raw || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
}

// Block numeric-suffix variant slugs (`-2`, `-3`, … `-9`) from entering the
// Pinterest queue. These are content duplicates of the parent slug and
// Pinterest's dedupe layer always rejects them as
// "this site doesn't allow you to save Pins".
const DUPLICATE_SLUG_RE = /-(?:[2-9]|\d{2,})$/;
export function isDuplicateVariantSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return DUPLICATE_SLUG_RE.test(String(slug).trim().toLowerCase());
}

// Block test/fixture slugs (`_e2e-test`, `_smoke`, anything starting with `_`)
// from ever entering the production Pinterest queue.
export function isTestFixtureSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const s = String(slug).trim().toLowerCase();
  return s.startsWith("_") || s.includes("e2e-test") || s.includes("smoke-test");
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
    .select("id, slug, name, description")
    .eq("id", job.product_id)
    .maybeSingle();
  if (pErr || !product) {
    res.error = `product lookup failed: ${pErr?.message ?? "not found"}`;
    return res;
  }

  const slug = product.slug || job.product_slug;
  if (isTestFixtureSlug(slug)) {
    res.skipped = `blocked_test_fixture_slug:${slug}`;
    console.warn(`[cv3-post-approval] blocked test fixture slug "${slug}" — never enqueue to production`);
    return res;
  }
  if (isDuplicateVariantSlug(slug)) {
    res.skipped = `blocked_duplicate_variant_slug:${slug}`;
    console.warn(
      `[cv3-post-approval] blocked duplicate variant slug "${slug}" for product ${job.product_id} — Pinterest dedupe always rejects these`,
    );
    return res;
  }
  const rawTitle = (product.name || slug || "Pet Product").toString();
  const title = truncatePinTitle(rawTitle, 38);
  const description = (product.description || `Discover ${title} at GetPawsy.`).toString().slice(0, 500);
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

  const mirror = await mirrorToPublicBucket(supa, job);
  if ("error" in mirror) {
    res.error = `mirror to public bucket failed: ${mirror.error}`;
    return res;
  }
  const { public_url, storage_path } = mirror;

  if (existingAsset) {
    asset_id = existingAsset.id;
    // Heal legacy rows that captured a /sign/ URL before this fix.
    await supa
      .from("pinterest_video_assets")
      .update({ public_url, storage_bucket: PUBLIC_BUCKET, storage_path })
      .eq("id", asset_id)
      .like("public_url", "%/storage/v1/object/sign/%");
  } else {
    const { data: assetIns, error: aErr } = await supa
      .from("pinterest_video_assets")
      .insert({
        filename: `cinematic-v3-${slug}-${job.id}.mp4`,
        storage_bucket: PUBLIC_BUCKET,
        storage_path,
        public_url,
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