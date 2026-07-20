/**
 * cj-media-derivative-worker
 *
 * Drains pending rows from cj_media_derivative_jobs. Generates lightweight
 * derivatives (webp + thumbnail) via the public ImageMagick-free pipeline:
 * we proxy through Supabase Storage's render endpoint (?width=...&format=webp)
 * to avoid pulling a wasm encoder into the edge runtime, then store the
 * resulting bytes under derivatives/{product_id}/{kind}/{name}.
 *
 * Body: { limit?: number }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "product-images";

type Derivative = { kind: string; width: number; height?: number; format: "webp" | "jpeg" };
const DERIVATIVES: Record<string, Derivative> = {
  webp:      { kind: "webp",      width: 1200, format: "webp" },
  thumb:     { kind: "thumb",     width: 400,  format: "webp" },
  pinterest: { kind: "pinterest", width: 1000, height: 1500, format: "jpeg" },
  og:        { kind: "og",        width: 1200, height: 630,  format: "jpeg" },
};

async function transform(src: string, d: Derivative): Promise<Uint8Array | null> {
  // Supabase Storage image transformation: /render/image/public/<bucket>/<path>?width=..&height=..&format=..&resize=cover
  // If the source is already in our bucket, leverage render endpoint; otherwise fall back to plain fetch.
  let url = src;
  if (src.includes("/storage/v1/object/public/")) {
    url = src.replace("/object/public/", "/render/image/public/")
      + `?width=${d.width}${d.height ? `&height=${d.height}&resize=cover` : ""}&format=${d.format}&quality=82`;
  }
  const r = await fetch(url, { headers: { "User-Agent": "GetPawsyDerivativeWorker/1.0" } });
  if (!r.ok) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength < 256) return null;
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: jobs, error } = await supabase
    .from("cj_media_derivative_jobs")
    .select("id, product_id, source_url, derivative_kind, attempts, max_attempts")
    .eq("status", "pending")
    .lt("attempts", 3)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0, failed = 0;
  for (const job of jobs ?? []) {
    const spec = DERIVATIVES[job.derivative_kind];
    if (!spec) {
      await supabase.from("cj_media_derivative_jobs").update({
        status: "failed", last_error: `unknown derivative ${job.derivative_kind}`, attempts: (job.attempts ?? 0) + 1,
      }).eq("id", job.id);
      failed++;
      continue;
    }
    try {
      const bytes = await transform(job.source_url, spec);
      if (!bytes) throw new Error("transform produced no bytes");
      const path = `derivatives/${job.product_id}/${spec.kind}/${job.id}.${spec.format === "jpeg" ? "jpg" : "webp"}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: spec.format === "jpeg" ? "image/jpeg" : "image/webp",
        upsert: true,
        cacheControl: "31536000, immutable",
      });
      if (upErr) throw upErr;
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      await supabase.from("cj_media_derivative_jobs").update({
        status: "completed",
        output_path: path,
        output_url: publicUrl,
        output_bytes: bytes.byteLength,
        completed_at: new Date().toISOString(),
        attempts: (job.attempts ?? 0) + 1,
      }).eq("id", job.id);
      processed++;
    } catch (e) {
      const attempts = (job.attempts ?? 0) + 1;
      const status = attempts >= (job.max_attempts ?? 3) ? "failed" : "pending";
      await supabase.from("cj_media_derivative_jobs").update({
        status, attempts, last_error: (e as Error).message,
      }).eq("id", job.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, failed, scanned: jobs?.length ?? 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});