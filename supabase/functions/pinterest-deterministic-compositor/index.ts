// pinterest-deterministic-compositor
// Zero-AI, deterministic Pinterest creative compositor.
//
// STATIC INVARIANT: this function must not import Lovable AI Gateway,
// Gemini, OpenAI, image-generation SDKs, or the Pinterest API. Its
// companion test suite greps this directory tree to prove it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { corsHeaders } from "../_shared/cors.ts";
import {
  plan,
  sha256Hex,
  parsePngDimensions,
  type ComposeRequest,
} from "./compositor.ts";
import { CANVAS, type LayoutVariant } from "./layouts.ts";

const BUCKET = "pinterest-ads";

interface Body {
  run_id: string;
  product_id: string;
  source_image_url: string;
  expected_source_hash: string;
  headline: string;
  benefit: string;
  cta: string;
  layout_variant: LayoutVariant;
  publication_allowed: boolean;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const required: (keyof Body)[] = [
    "run_id","product_id","source_image_url","expected_source_hash",
    "headline","benefit","cta","layout_variant",
  ];
  for (const k of required) {
    if (!body[k] || typeof (body as Record<string, unknown>)[k] !== (k === "publication_allowed" ? "boolean" : "string")) {
      return json({ ok: false, error: `missing_or_bad_field:${k}` }, 400);
    }
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Fetch source and verify hash.
  let sourceBytes: Uint8Array;
  try { sourceBytes = await fetchBytes(body.source_image_url); }
  catch (e) { return json({ ok: false, error: "source_fetch_failed", detail: String(e) }, 502); }
  const actualSourceHash = await sha256Hex(sourceBytes);
  if (body.expected_source_hash && actualSourceHash !== body.expected_source_hash) {
    return json({ ok: false, error: "source_hash_mismatch",
                  expected: body.expected_source_hash, actual: actualSourceHash }, 409);
  }

  // 2. Build plan.
  const cReq: ComposeRequest = {
    runId: body.run_id,
    productId: body.product_id,
    sourceUrl: body.source_image_url,
    expectedSourceHash: body.expected_source_hash,
    actualSourceHash,
    headline: body.headline,
    benefit: body.benefit,
    cta: body.cta,
    layout: body.layout_variant,
  };
  const p = plan(cReq);
  if (!p.ok || !p.cloudinaryUrl || !p.storagePath) {
    return json({ ok: false, error: "plan_failed", reason: p.reason, layoutAudit: p.layoutAudit, urlAudit: p.urlAudit }, 400);
  }

  // 3. Render via Cloudinary (server-side GET).
  let renderedBytes: Uint8Array;
  try { renderedBytes = await fetchBytes(p.cloudinaryUrl); }
  catch (e) { return json({ ok: false, error: "cloudinary_render_failed", detail: String(e), url: p.cloudinaryUrl }, 502); }

  // 4. Verify dimensions.
  let dims: { w: number; h: number };
  try { dims = parsePngDimensions(renderedBytes); }
  catch (e) { return json({ ok: false, error: "output_not_png", detail: String(e) }, 500); }
  if (dims.w !== CANVAS.w || dims.h !== CANVAS.h) {
    return json({ ok: false, error: "wrong_output_dimensions", got: dims, want: CANVAS }, 500);
  }

  // 5. Output hash.
  const outputHash = await sha256Hex(renderedBytes);

  // 6. Upload (idempotent — upsert). service_role bypasses RLS.
  const { error: upErr } = await sb.storage.from(BUCKET).upload(
    p.storagePath,
    renderedBytes,
    { contentType: "image/png", upsert: true, cacheControl: "3600" },
  );
  if (upErr) return json({ ok: false, error: "storage_upload_failed", detail: upErr.message }, 500);

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${p.storagePath}`;

  // 7. HEAD verify.
  let publicOk = false, publicContentType: string | null = null;
  try {
    const h = await fetch(publicUrl, { method: "HEAD" });
    publicOk = h.status === 200;
    publicContentType = h.headers.get("content-type");
  } catch { publicOk = false; }

  // NOTE: publication_allowed=false means: do NOT insert into
  // pinterest_pin_queue and do NOT call Pinterest. This function never does
  // either on its own; publication is handled by the cron-worker path.
  const queueRowsCreated = 0;
  const pinterestCalls = 0;

  return json({
    ok: true,
    asset: {
      public_url: publicUrl,
      content_type: publicContentType,
      http_ok: publicOk,
      output_hash: outputHash,
      output_dimensions: dims,
    },
    integrity: {
      ...p.integrity,
      output_hash: outputHash,
      output_dimensions: dims,
      cloudinary_url: p.cloudinaryUrl,
      storage_path: p.storagePath,
      text_fits: p.textFits,
      url_audit: p.urlAudit,
      layout_audit: p.layoutAudit,
    },
    side_effects: {
      queue_rows_created: queueRowsCreated,
      pinterest_calls: pinterestCalls,
      board_mutations: 0,
      product_mutations: 0,
      provider_calls: 0,
      credits_spent: 0,
    },
    publication_allowed: body.publication_allowed,
  }, 200);
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}