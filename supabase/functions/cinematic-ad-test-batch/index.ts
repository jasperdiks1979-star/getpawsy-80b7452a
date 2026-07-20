// cinematic-ad-test-batch
//
// Admin-only. Seeds a fresh cinematic test batch (V4 video-first):
//   - 2 cinematic_product_demo
//   - 2 multi_product_compilation
//   - 2 ugc_pov
//   - 2 lifestyle_scene
// across up to 5 distinct random products.
//
// Inserts pending cinematic_ad_jobs rows with content_type stamped.
// The existing pipeline (prepare → render → autopublish) takes them from there.
//
// Returns a validation table with job_id, content_type, product_slug, status,
// output_mp4_url (null until rendered), voiceover, render duration, and
// publish status — so the operator can poll it post-batch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type ContentType =
  | "cinematic_product_demo"
  | "multi_product_compilation"
  | "ugc_pov"
  | "lifestyle_scene";

const BATCH_PLAN: Array<{ content_type: ContentType; hook_variant: string }> = [
  { content_type: "cinematic_product_demo", hook_variant: "your cat needs this" },
  { content_type: "cinematic_product_demo", hook_variant: "viral but actually worth it" },
  { content_type: "multi_product_compilation", hook_variant: "5 picks you'll save" },
  { content_type: "multi_product_compilation", hook_variant: "ranked: cat parent favorites" },
  { content_type: "ugc_pov", hook_variant: "i wish i bought this sooner" },
  { content_type: "ugc_pov", hook_variant: "pov: you finally bought this" },
  { content_type: "lifestyle_scene", hook_variant: "the cozy era" },
  { content_type: "lifestyle_scene", hook_variant: "home tour: cat edition" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST only" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json(401, { ok: false, traceId, message: "unauthorized" });

  const body: any = await req.json().catch(() => ({}));

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Auth: admin role required
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json(401, { ok: false, traceId, message: "unauthorized" });
  const { data: roleRow } = await admin.from("user_roles").select("role")
    .eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin only" });

  // Pull 5 random eligible products with hero image
  const { data: products, error: pErr } = await admin
    .from("products_public")
    .select("id, slug, name, image_url, price, category")
    .not("image_url", "is", null)
    .eq("is_active", true)
    .limit(200);
  if (pErr || !products?.length) return json(500, { ok: false, traceId, message: pErr?.message ?? "no products" });

  // Shuffle and take 5
  const shuffled = products.slice().sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, Math.min(5, shuffled.length));
  if (chosen.length === 0) return json(500, { ok: false, traceId, message: "no eligible products" });

  const rows: any[] = [];
  for (let i = 0; i < BATCH_PLAN.length; i++) {
    const plan = BATCH_PLAN[i];
    const product = chosen[i % chosen.length];
    const productIds = plan.content_type === "multi_product_compilation"
      ? chosen.slice(0, Math.min(4, chosen.length)).map((p) => p.id)
      : [product.id];
    rows.push({
      product_slug: product.slug,
      product_id: product.id,
      product_name: product.name,
      product_price: product.price != null ? String(product.price) : null,
      hook_variant: plan.hook_variant,
      content_type: plan.content_type,
      media_type: "video",
      status: "pending",
      status_message: `test_batch ${traceId}`,
      created_by: uid,
      approved_for_render: false,
      product_ids: productIds,
      pin_destination_url: `https://getpawsy.pet/products/${product.slug}?utm_source=pinterest&utm_medium=video_pin&utm_campaign=cinematic_v4_test`,
      product_lock: {
        product_id: product.id,
        product_slug: product.slug,
        product_name: product.name,
        category: product.category ?? null,
        image_url: product.image_url,
      },
    });
  }

  const { data: inserted, error: iErr } = await admin
    .from("cinematic_ad_jobs")
    .insert(rows)
    .select("id, product_slug, content_type, hook_variant, status");
  if (iErr) return json(500, { ok: false, traceId, message: iErr.message });

  // Mark all seeded rows for publish-window bypass so they publish immediately.
  if (inserted?.length) {
    await admin.from("cinematic_ad_jobs")
      .update({ publish_window_bypass: true })
      .in("id", inserted.map((r: any) => r.id));
  }

  // Optional auto-kick: chain through prepare → approve → render_queued.
  const autoKick = Boolean(body?.auto_kick ?? true);
  let kickResult: any = null;
  if (autoKick && inserted?.length) {
    try {
      const workerSecret = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
      const kickRes = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-kick-pending`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          "x-internal-token": workerSecret,
        },
        body: JSON.stringify({ job_ids: inserted.map((r: any) => r.id) }),
      });
      kickResult = await kickRes.json().catch(() => ({}));
    } catch (e) {
      kickResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Audit
  await admin.from("cinematic_ad_audit_events").insert(
    (inserted ?? []).map((j: any) => ({
      job_id: j.id,
      action: "test_batch_create",
      actor: uid,
      reason: "v4_cinematic_test_batch",
      after_json: { content_type: j.content_type, hook_variant: j.hook_variant },
    })),
  ).then(() => {}, () => {});

  return json(200, {
    ok: true,
    traceId,
    message: `seeded ${inserted?.length ?? 0} jobs across ${chosen.length} products`,
    products: chosen.map((p) => ({ slug: p.slug, name: p.name })),
    auto_kick: autoKick,
    kick_result: kickResult,
    jobs: (inserted ?? []).map((j: any) => ({
      job_id: j.id,
      content_type: j.content_type,
      product_slug: j.product_slug,
      hook_variant: j.hook_variant,
      status: j.status,
      output_mp4_url: null,
      voiceover_url: null,
      render_duration_s: null,
      publish_status: "pending_prepare",
    })),
    next_step: "Run cinematic-ad-prepare or cinematic-ad-autopilot for each job_id to advance through scene/VO/render/autopublish.",
  });
});