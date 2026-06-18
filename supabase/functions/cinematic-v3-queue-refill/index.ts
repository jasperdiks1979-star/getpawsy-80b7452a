// Cinematic V3 Queue Refill
// Selects eligible products (bestsellers → high traffic → no Pinterest → new)
// and enqueues them into cinematic_v3_dispatch_queue up to the configured
// min_queue_size. Skips products that already have an approved v3 job, are
// already queued, are discontinued, or are blocklisted.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Candidate = { product_id: string; product_slug: string; reason: string; score: number };

async function authorize(req: Request, admin: any): Promise<{ ok: boolean; status?: number; message?: string }> {
  const internal = req.headers.get("x-internal-secret") ?? "";
  if (INTERNAL_FUNCTION_SECRET && internal === INTERNAL_FUNCTION_SECRET) return { ok: true };
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, message: "unauthorized" };
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error } = await userClient.auth.getUser();
  if (error || !userRes?.user) return { ok: false, status: 401, message: "unauthorized" };
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
  if (!isAdmin) return { ok: false, status: 403, message: "admin required" };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const auth = await authorize(req, admin);
    if (!auth.ok) return json({ ok: false, traceId, message: auth.message }, auth.status ?? 401);

    const { data: configRow } = await admin
      .from("cinematic_v3_dispatch_config").select("min_queue_size").eq("id", true).maybeSingle();
    const minQueueSize: number = configRow?.min_queue_size ?? 10;

    // Current pending count.
    const { count: pendingCount } = await admin
      .from("cinematic_v3_dispatch_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    const need = Math.max(0, minQueueSize - (pendingCount ?? 0));
    if (need === 0) {
      return json({ ok: true, traceId, pending: pendingCount, added: 0, reason: "queue_full" });
    }

    // Exclusion sets.
    const [approvedRes, queuedRes, discRes, blockedRes] = await Promise.all([
      admin.from("cinematic_v3_jobs").select("product_id").eq("status", "approved"),
      admin.from("cinematic_v3_dispatch_queue").select("product_id").in("status", ["pending", "dispatched"]),
      admin.from("discontinued_products").select("sku"),
      admin.from("blocked_cj_products").select("sku"),
    ]);
    const excludeIds = new Set<string>();
    (approvedRes.data ?? []).forEach((r: any) => r.product_id && excludeIds.add(r.product_id));
    (queuedRes.data ?? []).forEach((r: any) => r.product_id && excludeIds.add(r.product_id));
    const discontinuedSkus = new Set<string>((discRes.data ?? []).map((r: any) => r.sku).filter(Boolean));
    const blockedSkus = new Set<string>((blockedRes.data ?? []).map((r: any) => r.sku).filter(Boolean));

    const candidates: Candidate[] = [];
    const seen = new Set<string>();
    function push(c: Candidate) {
      if (excludeIds.has(c.product_id) || seen.has(c.product_id)) return;
      seen.add(c.product_id);
      candidates.push(c);
    }

    // 1. Bestsellers — highest priority (score 1000 - rank).
    const { data: bestsellers } = await admin
      .from("bestsellers")
      .select("product_id, slug, rank")
      .eq("is_active", true)
      .order("rank", { ascending: true })
      .limit(60);
    (bestsellers ?? []).forEach((b: any) => {
      if (!b.product_id || !b.slug) return;
      push({ product_id: b.product_id, product_slug: b.slug, reason: "bestseller", score: 1000 - (b.rank ?? 999) });
    });

    // 2. High traffic — sessions in last 7 days.
    if (candidates.length < need * 3) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: traffic } = await admin
        .from("gi_product_performance_daily")
        .select("product_id, product_slug, sessions_us")
        .gte("date", since)
        .order("sessions_us", { ascending: false })
        .limit(200);
      const agg = new Map<string, { slug: string; sessions: number }>();
      (traffic ?? []).forEach((t: any) => {
        if (!t.product_id || !t.product_slug) return;
        const cur = agg.get(t.product_id) ?? { slug: t.product_slug, sessions: 0 };
        cur.sessions += t.sessions_us ?? 0;
        agg.set(t.product_id, cur);
      });
      [...agg.entries()].sort((a, b) => b[1].sessions - a[1].sessions).forEach(([pid, v]) => {
        push({ product_id: pid, product_slug: v.slug, reason: "traffic", score: 500 + Math.min(v.sessions, 499) });
      });
    }

    // 3. Products without Pinterest content.
    if (candidates.length < need * 3) {
      const { data: products } = await admin
        .from("products")
        .select("id, slug, image_url, images, is_active, created_at, supplier_sku")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(500);
      const pids = (products ?? []).map((p: any) => p.id);
      const slugs = (products ?? []).map((p: any) => p.slug).filter(Boolean);
      const { data: pinned } = await admin
        .from("pinterest_pin_queue")
        .select("product_id, product_slug")
        .or(`product_id.in.(${pids.join(",")}),product_slug.in.(${slugs.map((s: string) => `"${s}"`).join(",")})`);
      const pinnedIds = new Set<string>();
      (pinned ?? []).forEach((p: any) => p.product_id && pinnedIds.add(p.product_id));
      const pinnedSlugs = new Set<string>();
      (pinned ?? []).forEach((p: any) => p.product_slug && pinnedSlugs.add(p.product_slug));
      (products ?? []).forEach((p: any) => {
        if (!p.slug) return;
        if (pinnedIds.has(p.id) || pinnedSlugs.has(p.slug)) return;
        if (discontinuedSkus.has(p.supplier_sku) || blockedSkus.has(p.supplier_sku)) return;
        const imgs = Array.isArray(p.images) ? p.images : (p.image_url ? [p.image_url] : []);
        if (imgs.filter((u: any) => typeof u === "string" && /^https?:/.test(u)).length < 2) return;
        push({ product_id: p.id, product_slug: p.slug, reason: "no_pinterest", score: 250 });
      });
    }

    // 4. New products — created in last 30 days.
    if (candidates.length < need * 3) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: fresh } = await admin
        .from("products")
        .select("id, slug, image_url, images, supplier_sku, created_at")
        .eq("is_active", true)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100);
      (fresh ?? []).forEach((p: any) => {
        if (!p.slug) return;
        if (discontinuedSkus.has(p.supplier_sku) || blockedSkus.has(p.supplier_sku)) return;
        const imgs = Array.isArray(p.images) ? p.images : (p.image_url ? [p.image_url] : []);
        if (imgs.filter((u: any) => typeof u === "string" && /^https?:/.test(u)).length < 2) return;
        push({ product_id: p.id, product_slug: p.slug, reason: "new", score: 100 });
      });
    }

    // Cap and insert.
    const toInsert = candidates.slice(0, need).map((c) => ({
      product_id: c.product_id,
      product_slug: c.product_slug,
      priority_reason: c.reason,
      priority_score: c.score,
      status: "pending",
    }));
    let added = 0;
    if (toInsert.length > 0) {
      // ON CONFLICT (product_id) DO NOTHING — unique constraint on product_id.
      const { data: ins, error: insErr } = await admin
        .from("cinematic_v3_dispatch_queue")
        .upsert(toInsert, { onConflict: "product_id", ignoreDuplicates: true })
        .select("id");
      if (insErr) throw new Error(insErr.message);
      added = ins?.length ?? 0;
    }
    await admin.from("cinematic_v3_dispatch_config")
      .update({ last_refill_at: new Date().toISOString() })
      .eq("id", true);
    await admin.from("cinematic_v3_dispatch_log").insert({
      event_type: "refill",
      outcome: "ok",
      details: { pending_before: pendingCount, added, candidates: candidates.length, need, traceId },
    });
    return json({ ok: true, traceId, pending_before: pendingCount, added, candidates: candidates.length, need });
  } catch (err: any) {
    return json({ ok: false, traceId, message: String(err?.message ?? err) }, 500);
  }
});