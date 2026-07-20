// Pinterest Publishing Health Report + auto-recovery.
// Builds a single JSON report covering queue state, integrity counts, and
// (optionally) kicks the Creative Director to refill the queue.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function count(table: string, build: (q: any) => any) {
  const { count: c } = await build(supabase.from(table).select("*", { count: "exact", head: true }));
  return c ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const rebuild: boolean = body?.rebuild !== false; // default true
  const target: number = Number(body?.target ?? 25);

  const now = new Date();
  const since24 = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const since7 = new Date(now.getTime() - 7 * 86400 * 1000).toISOString();

  const [
    posted24, posted7, queued, drafts, rejected,
    cleanImgs, reviewImgs, blockedImgs,
    productsEligible, productsExcluded,
    productsWithClean, productsWithReviewOnly,
    videos,
  ] = await Promise.all([
    count("pinterest_pin_queue", (q) => q.eq("status", "posted").gte("posted_at", since24)),
    count("pinterest_pin_queue", (q) => q.eq("status", "posted").gte("posted_at", since7)),
    count("pinterest_pin_queue", (q) => q.eq("status", "queued")),
    count("pinterest_pin_queue", (q) => q.eq("status", "draft")),
    count("pinterest_pin_queue", (q) => q.eq("status", "rejected").gte("created_at", since7)),
    count("media_audit", (q) => q.eq("status", "CLEAN")),
    count("media_audit", (q) => q.eq("status", "REVIEW")),
    count("media_audit", (q) => q.eq("status", "BLOCKED")),
    count("products", (q) => q.eq("is_active", true).eq("pinterest_eligible", true)),
    count("products", (q) => q.eq("is_active", true).eq("pinterest_eligible", false)),
    Promise.resolve(0),
    Promise.resolve(0),
    count("product_media", (q) => q.eq("media_type", "video")),
  ]);

  // Products with CLEAN vs REVIEW-only
  const { data: cleanRows } = await supabase.from("media_audit").select("product_id").eq("status", "CLEAN");
  const { data: reviewRows } = await supabase.from("media_audit").select("product_id").eq("status", "REVIEW");
  const cleanSet = new Set((cleanRows ?? []).map((r: any) => r.product_id));
  const reviewSet = new Set((reviewRows ?? []).map((r: any) => r.product_id));
  const reviewOnly = [...reviewSet].filter((id) => !cleanSet.has(id));

  const queueEmpty = queued === 0;
  const publishingPaused = posted24 === 0 && queued === 0;

  const actions: string[] = [];

  // Self-heal: rebuild queue by calling Creative Director when queue is thin.
  let rebuildResults: any[] = [];
  if (rebuild && queued < Math.max(5, target)) {
    // Pick eligible products that have at least one CLEAN or REVIEW image,
    // prioritising CLEAN.
    const priorityIds = [
      ...[...cleanSet].slice(0, 20),
      ...reviewOnly.slice(0, 10),
    ];
    const { data: prods } = await supabase
      .from("products")
      .select("id, slug")
      .eq("is_active", true)
      .eq("pinterest_eligible", true)
      .in("id", priorityIds.length ? priorityIds : ["00000000-0000-0000-0000-000000000000"])
      .limit(15);

    actions.push(`creative_director.run_full x${(prods ?? []).length} (background)`);

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pinterest-creative-director`;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    for (const p of prods ?? []) {
      // Fire-and-forget — Creative Director is slow (AI render).
      const fp = fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anon}`, "apikey": anon },
        body: JSON.stringify({ action: "run_full", productSlug: (p as any).slug, count: 2 }),
      }).catch(() => null);
      // @ts-ignore EdgeRuntime is provided by supabase edge runtime
      try { (globalThis as any).EdgeRuntime?.waitUntil?.(fp); } catch (_) {}
      rebuildResults.push({ slug: (p as any).slug, ok: true, dispatched: true });
    }
  }

  const report = {
    ok: true,
    generated_at: now.toISOString(),
    publishing: {
      paused: publishingPaused,
      reason: publishingPaused
        ? (queueEmpty ? "queue_empty_no_drafts_approved" : "no_posts_24h")
        : null,
      posted_24h: posted24,
      posted_7d: posted7,
      daily_target: target,
    },
    queue: {
      queued,
      draft: drafts,
      rejected_7d: rejected,
      empty: queueEmpty,
    },
    media_integrity: {
      clean_images: cleanImgs,
      review_images: reviewImgs,
      blocked_images: blockedImgs,
      videos_available: videos,
    },
    products: {
      eligible: productsEligible,
      excluded: productsExcluded,
      with_clean_image: cleanSet.size,
      review_only: reviewOnly.length,
    },
    integrity_guard: {
      blocks_BLOCKED: true,
      blocks_REVIEW: false, // policy: CLEAN > REVIEW, never BLOCKED
      blocks_CLEAN: false,
    },
    actions_taken: actions,
    rebuild_results: rebuildResults,
  };

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});