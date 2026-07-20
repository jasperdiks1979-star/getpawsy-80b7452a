// Pinterest Category Diversity Governor — orchestrator
// ---------------------------------------------------------------------------
// Single entrypoint with three actions:
//   • action: "metrics"       → returns dashboard metrics + bucket plan
//   • action: "run_batch"     → selects N products per the governor rules,
//                               invokes pinterest-creative-director per
//                               product, returns summary + first 10 picks.
//   • action: "migrate_queue" → rejects queued/draft pins whose bucket is
//                               already over the 20% cap (so the engine
//                               does not double-down on cat-heavy backlog),
//                               then triggers run_batch(50).
//
// Pure orchestration: it never inserts into pinterest_pin_queue directly.
// All drafts go through the creative-director's premium gate (creative_source
// = creative_director_v2, quality threshold 85).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import {
  categoryToBucket,
  computeMetrics,
  forecastNext24h,
  GOVERNOR_TARGETS,
  HARD_CATEGORY_CAP,
  loadRecentPins,
  selectProducts,
  type GovernorBucket,
} from "../_shared/pinterest-category-governor.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
function fail(msg: string, status = 400, extra: Record<string, unknown> = {}) {
  return ok({ ok: false, message: msg, ...extra }, status);
}

async function invokeDirector(slug: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify({ action: "run_full", productSlug: slug, count: 1 }),
    });
    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: resp.ok, data, error: resp.ok ? undefined : `HTTP ${resp.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function fireDirector(slug: string): void {
  // Fire-and-forget: each invocation runs in its own request, the governor
  // returns immediately. Results are observable in pinterest_pin_queue.
  fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ action: "run_full", productSlug: slug, count: 1 }),
  }).catch((e) => console.warn("[governor] fire director failed", slug, (e as Error).message));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method not allowed", 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const action = String(body?.action ?? "metrics");
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    if (action === "metrics") {
      const recent = await loadRecentPins(sb, 100);
      const metrics = computeMetrics(recent);
      const rt = await sb.from("pinterest_runtime_settings").select("daily_publish_cap").eq("id", 1).maybeSingle();
      const cap = Number((rt.data as any)?.daily_publish_cap ?? 20);
      return ok({
        ok: true,
        metrics,
        targets: GOVERNOR_TARGETS,
        hard_cap: HARD_CATEGORY_CAP,
        forecast_24h: forecastNext24h(metrics, cap),
      });
    }

    if (action === "migrate_queue") {
      const recent = await loadRecentPins(sb, 100);
      const metrics = computeMetrics(recent);
      // Reject queued/draft pins whose bucket is currently at/above the cap.
      const overCap = metrics.distribution
        .filter((d) => d.pct >= HARD_CATEGORY_CAP)
        .map((d) => d.bucket);
      let rejected = 0;
      if (overCap.length) {
        const { data: rows } = await sb
          .from("pinterest_pin_queue")
          .select("id, category_key, product_slug, pin_title, status")
          .in("status", ["queued", "draft"])
          .limit(5000);
        const ids: string[] = [];
        for (const r of rows ?? []) {
          const b = categoryToBucket(null, (r as any).category_key, (r as any).product_slug ?? (r as any).pin_title);
          if (overCap.includes(b)) ids.push((r as any).id);
        }
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { error } = await sb
            .from("pinterest_pin_queue")
            .update({
              status: "rejected",
              error_message: "rejected_diversity_governor_over_cap",
              updated_at: new Date().toISOString(),
            })
            .in("id", chunk);
          if (!error) rejected += chunk.length;
        }
      }
      return ok({ ok: true, over_cap_buckets: overCap, rejected_queue_rows: rejected });
    }

    if (action === "run_batch") {
      const requested = Math.max(1, Math.min(50, Number(body?.count ?? 10)));
      const awaitAll = !!body?.await;
      const recent = await loadRecentPins(sb, 100);
      const metrics = computeMetrics(recent);
      const plan = await selectProducts(sb, requested, metrics);

      const results: Array<{ slug: string; bucket: GovernorBucket; ok: boolean; error?: string }> = [];
      if (awaitAll) {
        for (const p of plan.selected) {
          const r = await invokeDirector(p.slug);
          results.push({ slug: p.slug, bucket: p.bucket, ok: r.ok, error: r.error });
        }
      } else {
        // Fire-and-forget: don't block on AI render latency (each can take 30s+).
        for (const p of plan.selected) fireDirector(p.slug);
      }

      const { data: rt } = await sb.from("pinterest_runtime_settings")
        .select("daily_publish_cap").eq("id", 1).maybeSingle();
      const cap = Number((rt as any)?.daily_publish_cap ?? 20);
      return ok({
        ok: true,
        requested,
        mode: awaitAll ? "sync" : "async_dispatched",
        selected_count: plan.selected.length,
        first_10: plan.selected.slice(0, 10).map((c) => ({
          slug: c.slug, name: c.name, bucket: c.bucket,
          priority_tier: c.priority_tier, last_published_at: c.last_published_at,
        })),
        bucket_plan: plan.bucket_plan,
        reasons: plan.reasons,
        results: awaitAll ? results : undefined,
        success_count: awaitAll ? results.filter((r) => r.ok).length : undefined,
        forecast_24h: forecastNext24h(metrics, cap),
      });
    }

    return fail(`unknown action: ${action}`);
  } catch (e) {
    return fail((e as Error).message, 500);
  }
});