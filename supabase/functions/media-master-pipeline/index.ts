// Media Master Pipeline — single-click orchestrator.
//
// Chains:
//   1. media-integrity-scan  (loops until no new images scanned, or wall-clock budget reached)
//   2. cj-video-ingest-worker (loops until no new videos imported, or budget reached)
//   3. reconciles products.pinterest_eligible based on current media_audit state.
//
// Pinterest exclusion of BLOCKED/REVIEW images is enforced separately by
// _shared/pinterest-integrity-guard.ts at pin insert + publish time — no
// override. This orchestrator only drives detection + flag reconciliation.
//
// Auth: admin JWT, or x-internal-secret = INTERNAL_FUNCTION_SECRET.
// Body: { scan_limit?: number; scan_iterations?: number;
//         video_batch_size?: number; video_max_batches?: number;
//         video_iterations?: number; budget_ms?: number; trigger?: string }

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
  if (INTERNAL_SECRET && internal === INTERNAL_SECRET) return true;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: ures } = await user.auth.getUser();
  if (!ures?.user) return false;
  const { data: role } = await admin
    .from("user_roles").select("role")
    .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
  const email = (ures.user.email ?? "").toLowerCase();
  return !!role || ADMIN_FALLBACK_EMAILS.includes(email);
}

async function invokeFn(name: string, body: unknown) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({} as any));
  return { ok: resp.ok, status: resp.status, data: data as any };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await authorize(req, admin))) return json({ ok: false, message: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    scan_limit?: number;
    scan_iterations?: number;
    video_batch_size?: number;
    video_max_batches?: number;
    video_iterations?: number;
    budget_ms?: number;
    trigger?: string;
  };

  const scanLimit = Math.max(1, Math.min(500, body.scan_limit ?? 200));
  const scanIterations = Math.max(1, Math.min(50, body.scan_iterations ?? 12));
  const videoBatchSize = Math.max(1, Math.min(50, body.video_batch_size ?? 25));
  const videoMaxBatches = Math.max(1, Math.min(40, body.video_max_batches ?? 8));
  const videoIterations = Math.max(1, Math.min(20, body.video_iterations ?? 4));
  const budgetMs = Math.max(30_000, Math.min(540_000, body.budget_ms ?? 420_000));
  const trigger = body.trigger ?? "master_pipeline";

  const start = Date.now();
  const overBudget = () => Date.now() - start > budgetMs;

  const totals = {
    scan_iterations_run: 0,
    images_scanned: 0,
    clean_count: 0,
    review_count: 0,
    blocked_count: 0,
    products_excluded: 0,
    video_iterations_run: 0,
    products_video_scanned: 0,
    videos_found: 0,
    videos_imported: 0,
    cj_fetch_failed: 0,
    pinterest_eligible: 0,
    pinterest_excluded: 0,
    products_with_video: 0,
    products_without_video: 0,
    cj_linked_active: 0,
    errors: [] as string[],
  };

  // ---------- STEP 1: Media scan loop ----------
  for (let i = 0; i < scanIterations; i++) {
    if (overBudget()) break;
    const r = await invokeFn("media-integrity-scan", {
      trigger,
      limit: scanLimit,
    });
    totals.scan_iterations_run++;
    if (!r.ok) {
      totals.errors.push(`scan_${r.status}:${r.data?.error ?? r.data?.message ?? "unknown"}`);
      break;
    }
    const scanned = Number(r.data?.images_scanned ?? 0);
    totals.images_scanned += scanned;
    totals.clean_count += Number(r.data?.clean_count ?? 0);
    totals.review_count += Number(r.data?.review_count ?? 0);
    totals.blocked_count += Number(r.data?.blocked_count ?? 0);
    totals.products_excluded += Number(r.data?.products_excluded ?? 0);
    // Auto-continue: stop when nothing new scanned this pass
    if (scanned === 0) break;
  }

  // ---------- STEP 2: CJ video ingestion loop ----------
  for (let i = 0; i < videoIterations; i++) {
    if (overBudget()) break;
    const r = await invokeFn("cj-video-ingest-worker", {
      trigger,
      batch_size: videoBatchSize,
      max_batches: videoMaxBatches,
      only_missing: true,
    });
    totals.video_iterations_run++;
    if (!r.ok) {
      totals.errors.push(`video_${r.status}:${r.data?.error ?? r.data?.message ?? "unknown"}`);
      break;
    }
    const scanned = Number(r.data?.products_scanned ?? 0);
    const imported = Number(r.data?.videos_imported ?? 0);
    totals.products_video_scanned += scanned;
    totals.videos_found += Number(r.data?.videos_found ?? 0);
    totals.videos_imported += imported;
    totals.cj_fetch_failed += Number(r.data?.cj_fetch_failed ?? 0);
    // Auto-continue: stop when no more candidates processed
    if (scanned === 0 && imported === 0) break;
  }

  // ---------- STEP 3: Reconcile pinterest_eligible from current audit state ----------
  // Any product whose ALL audited images are BLOCKED → pinterest_eligible=false.
  // Any product with at least one CLEAN image → pinterest_eligible=true.
  try {
    const { data: audited } = await admin
      .from("media_audit")
      .select("product_id,status")
      .limit(20000);
    const map = new Map<string, { clean: number; review: number; blocked: number }>();
    for (const row of (audited ?? []) as Array<{ product_id: string; status: string }>) {
      const cur = map.get(row.product_id) ?? { clean: 0, review: 0, blocked: 0 };
      if (row.status === "CLEAN") cur.clean++;
      else if (row.status === "REVIEW") cur.review++;
      else if (row.status === "BLOCKED") cur.blocked++;
      map.set(row.product_id, cur);
    }
    const eligibleIds: string[] = [];
    const blockedIds: string[] = [];
    for (const [pid, c] of map) {
      if (c.clean > 0) eligibleIds.push(pid);
      else if (c.blocked > 0 && c.clean === 0 && c.review === 0) blockedIds.push(pid);
    }
    // Batched updates
    const chunk = <T,>(arr: T[], n: number) =>
      Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));
    for (const ids of chunk(eligibleIds, 500)) {
      if (ids.length) await admin.from("products").update({ pinterest_eligible: true }).in("id", ids);
    }
    for (const ids of chunk(blockedIds, 500)) {
      if (ids.length) await admin.from("products").update({ pinterest_eligible: false }).in("id", ids);
    }
    totals.pinterest_eligible = eligibleIds.length;
    totals.pinterest_excluded = blockedIds.length;
  } catch (e) {
    totals.errors.push(`reconcile:${(e as Error).message}`);
  }

  // ---------- STEP 4: Video coverage stats ----------
  try {
    const { data: vids } = await admin
      .from("product_media")
      .select("product_id")
      .eq("media_type", "video");
    const withVideo = new Set((vids ?? []).map((v: any) => v.product_id as string));
    totals.products_with_video = withVideo.size;
    const { count: cjLinked } = await admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("cj_product_id", "is", null);
    totals.cj_linked_active = cjLinked ?? 0;
    totals.products_without_video = Math.max(0, (cjLinked ?? 0) - withVideo.size);
  } catch (e) {
    totals.errors.push(`coverage:${(e as Error).message}`);
  }

  const elapsed_ms = Date.now() - start;
  const exhausted = !overBudget(); // budget not hit ⇒ likely fully drained

  return json({
    ok: true,
    trigger,
    elapsed_ms,
    over_budget: !exhausted,
    ...totals,
  });
});