// cinematic-ad-preflight
// Validates a job BEFORE any expensive render. No paid APIs.
// Writes preflight_status ('pass'|'fail') + preflight_reasons[] back to the job row.
// Admin-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `pre_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PET_CATEGORIES = [
  "cat","dog","pet","kitten","puppy","litter","cat tree","cat-tree","scratching",
  "bed","toy","training","harness","collar","leash","feeder","fountain","carrier",
  "grooming","enclosure","catio","habitat","small pet","rabbit","hamster",
];

const BANNED_COPY = [
  "vet-approved","vet approved","eco-friendly","eco friendly","dropship",
  "best price","cheapest","#1","number one","cure","heal","prevent disease",
];

async function urlReachable(u: string | null | undefined): Promise<boolean> {
  if (!u || typeof u !== "string") return false;
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    const r = await fetch(u, { method: "HEAD", redirect: "follow" });
    return r.ok;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  // Service-role bypass: queue-render / watchdog call this internally.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const isServiceRole = bearer === service && service.length > 0;
  if (!isServiceRole) {
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { ok: false, traceId, message: "unauthorized" });
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { ok: false, traceId, message: "admin role required" });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const jobIds: string[] = Array.isArray(body.job_ids) ? body.job_ids :
    (body.job_id ? [body.job_id] : []);
  if (jobIds.length === 0) return json(400, { ok: false, traceId, message: "job_id or job_ids required" });

  // Per-call override: when admin/service-role caller sets force_preflight_override=true,
  // skip inventory/stock-related rules. The job row's persisted flag is also honored
  // (so queue-render can write it once and any later preflight re-run inherits it).
  const forceOverrideFromBody: boolean = body.force_preflight_override === true;
  const forceOverrideReason: string | null =
    typeof body.force_preflight_override_reason === "string" && body.force_preflight_override_reason.trim().length > 0
      ? body.force_preflight_override_reason.trim()
      : null;

  const { data: jobs } = await admin
    .from("cinematic_ad_jobs")
    .select("id, product_slug, product_name, product_price, pin_title, pin_description, pin_destination_url, scene_assets, output_thumbnail_url, force_preflight_override, force_preflight_override_reason, force_preflight_override_by")
    .in("id", jobIds);

  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs ?? []) {
    const reasons: string[] = [];
    const bypassed: string[] = [];
    const forceOverride: boolean =
      forceOverrideFromBody || (job as any).force_preflight_override === true;

    // Product context lookup
    const { data: product } = await admin
      .from("products")
      .select("name, slug, image_url, price, category, is_active, stock, seo_keywords")
      .eq("slug", job.product_slug).maybeSingle();

    const title = product?.name ?? job.product_name ?? "";
    const imageUrl = product?.image_url ?? null;
    const price = product?.price ?? job.product_price ?? null;
    const productUrl = job.pin_destination_url
      ?? (product?.slug ? `https://getpawsy.pet/products/${product.slug}` : null);

    if (!product) reasons.push("product_not_found_in_catalog");
    if (!title || String(title).trim().length < 3) reasons.push("missing_or_short_title");
    if (!productUrl) reasons.push("missing_product_url");
    if (!imageUrl) reasons.push("missing_primary_image");
    if (!price) reasons.push("missing_price");
    if (product && product.is_active === false) {
      if (forceOverride) bypassed.push("product_inactive");
      else reasons.push("product_inactive");
    }
    if (product && typeof product.stock === "number" && product.stock <= 0) {
      if (forceOverride) bypassed.push("product_out_of_stock");
      else reasons.push("product_out_of_stock");
    }

    // Pet category
    const haystack = (
      (title + " " + (product?.category ?? "") + " " + (Array.isArray(product?.seo_keywords) ? product!.seo_keywords.join(" ") : ""))
    ).toLowerCase();
    if (!PET_CATEGORIES.some((k) => haystack.includes(k))) reasons.push("not_pet_category");

    // ≥2 usable media assets (scene_assets array OR product image + thumbnail)
    // Accept any of the field shapes the storyboard / renderer emit: image_url,
    // url, src, asset_url, or a plain string entry.
    const sceneAssets = Array.isArray(job.scene_assets)
      ? job.scene_assets.filter((a: any) =>
          a && (a.image_url || a.url || a.src || a.asset_url || typeof a === "string"),
        )
      : [];
    const mediaCount = sceneAssets.length + (imageUrl ? 1 : 0) + (job.output_thumbnail_url ? 1 : 0);
    if (mediaCount < 2) reasons.push("insufficient_media_assets");

    // Pinterest-safe copy
    const copy = ((job.pin_title ?? "") + " " + (job.pin_description ?? "")).toLowerCase();
    const banned = BANNED_COPY.filter((b) => copy.includes(b));
    if (banned.length) reasons.push(`banned_copy:${banned.join("|")}`);

    // Image URL reachable (cheap HEAD)
    if (imageUrl && !(await urlReachable(imageUrl))) reasons.push("primary_image_unreachable");

    const status: "pass" | "fail" = reasons.length === 0 ? "pass" : "fail";

    await admin.from("cinematic_ad_jobs").update({
      preflight_status: status,
      preflight_reasons: reasons,
      preflight_checked_at: new Date().toISOString(),
      blocked_reason: status === "fail"
        ? `Preflight failed: ${reasons.join(", ")}`
        : null,
    }).eq("id", job.id);

    // Audit log every bypass — product_slug, timestamp, user, reason, bypassed reasons.
    if (forceOverride && bypassed.length > 0) {
      const reasonText = forceOverrideReason
        ?? (job as any).force_preflight_override_reason
        ?? "admin_force_preflight_override";
      const userId = (job as any).force_preflight_override_by ?? null;
      await admin.from("cinematic_preflight_override_log").insert({
        job_id: job.id,
        product_slug: job.product_slug,
        user_id: userId,
        reason: reasonText,
        bypassed_reasons: bypassed,
      });
      console.log(`[preflight] ${traceId} override applied job=${job.id} slug=${job.product_slug} bypassed=${bypassed.join(",")} reason=${reasonText}`);
    }

    results.push({
      job_id: job.id,
      product_slug: job.product_slug,
      preflight_status: status,
      reasons,
      bypassed_reasons: bypassed,
      force_preflight_override: forceOverride,
    });
  }

  return json(200, { ok: true, traceId, count: results.length, results });
});