// pinterest-proof-of-life — one-time end-to-end test of the Pinterest pipeline.
// Generates 3 premium pins (dog / cat toy / feeding-grooming-travel) via the
// Creative Director, assigns each to a different board, then publishes them
// sequentially with 60s gaps via pinterest-publish-now. Restores the original
// active_board_id setting on exit so prod state is untouched.
//
// Auth: admin user JWT OR service role. POST { } returns a structured report.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CATEGORY_BUCKETS: Record<string, string[]> = {
  dog: ["Dog Toys", "Dog Beds", "Dog Collars & Leashes", "Dog Training", "Dog Grooming", "Dog Bowls & Feeders"],
  cat_toy: ["Cat Toys"],
  utility: ["Dog Bowls & Feeders", "Cat Bowls & Feeders", "Dog Grooming", "Cat Grooming", "Dog Travel", "Dog Carriers", "Cat Carriers"],
};

async function pickProduct(sb: any, bucket: keyof typeof CATEGORY_BUCKETS, excludeIds: string[]) {
  const { data } = await sb
    .from("products")
    .select("id, slug, name, category")
    .eq("is_active", true)
    .in("category", CATEGORY_BUCKETS[bucket])
    .not("id", "in", `(${excludeIds.length ? excludeIds.map((x) => `"${x}"`).join(",") : "NULL"})`)
    .limit(50);
  if (!data?.length) return null;
  // Filter: never published before.
  const slugs = data.map((p: any) => p.slug);
  const { data: published } = await sb
    .from("pinterest_pin_queue")
    .select("product_slug")
    .in("product_slug", slugs)
    .in("status", ["posted", "published", "publishing"]);
  const blocked = new Set((published ?? []).map((r: any) => r.product_slug));
  const eligible = data.filter((p: any) => !blocked.has(p.slug));
  if (!eligible.length) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

async function callDirector(productId: string, count = 3) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ action: "run_full", productId, count, force: true }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function callPublishNow(pinId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-publish-now`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ mode: "pin", pinId }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function pickLatestDraft(sb: any, productSlug: string) {
  const { data } = await sb
    .from("pinterest_pin_queue")
    .select("id, pin_title, pin_image_url, destination_link, status, meta, created_at")
    .eq("product_slug", productSlug)
    .eq("meta->>creative_source", "creative_director_v2")
    .in("status", ["draft", "queued"])
    .is("pinterest_pin_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── auth (admin or service role) ──
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, message: "unauthorized" }, 401);
  if (bearer !== SERVICE_ROLE) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    const uid = claims?.claims?.sub;
    if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
    const { data: role } = await sb.from("user_roles")
      .select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!role) return json({ ok: false, message: "admin only" }, 403);
  }

  const report: any = { started_at: new Date().toISOString(), steps: [], pins: [] };

  // ── capture original runtime settings ──
  const { data: rtBefore } = await sb.from("pinterest_runtime_settings")
    .select("active_board_id, premium_engine_paused, allow_legacy_product_feed").eq("id", 1).maybeSingle();
  report.snapshot_before = rtBefore;

  // ── pick 3 distinct boards ──
  const { data: boards } = await sb.from("pinterest_boards")
    .select("id, name").eq("is_blacklisted", false).eq("is_sandbox", false)
    .eq("production_verified", true).order("priority", { ascending: true })
    .order("name", { ascending: true }).limit(10);
  if (!boards || boards.length < 3) {
    return json({ ok: false, message: "need at least 3 production-verified boards", boards });
  }
  // Shuffle + take 3.
  const shuffled = [...boards].sort(() => Math.random() - 0.5).slice(0, 3);
  report.boards = shuffled;

  try {
    // Temporarily null out active_board_id so publish-now uses row.board_id.
    if (rtBefore?.active_board_id) {
      await sb.from("pinterest_runtime_settings").update({ active_board_id: null }).eq("id", 1);
    }

    // ── pick 3 products ──
    const excludeIds: string[] = [];
    const products: Array<{ bucket: string; product: any }> = [];
    for (const bucket of ["dog", "cat_toy", "utility"] as const) {
      const p = await pickProduct(sb, bucket, excludeIds);
      if (!p) {
        report.steps.push({ step: "pick_product", bucket, error: "no eligible product" });
        continue;
      }
      excludeIds.push(p.id);
      products.push({ bucket, product: p });
      report.steps.push({ step: "pick_product", bucket, product: p });
    }
    if (products.length < 3) {
      return json({ ok: false, message: "could not select 3 distinct products", report }, 200);
    }

    // ── for each product: generate → approve+assign-board → publish (60s gap) ──
    for (let i = 0; i < products.length; i++) {
      const { bucket, product } = products[i];
      const board = shuffled[i];

      // 1) generate drafts via creative director
      const gen = await callDirector(product.id, 3);
      report.steps.push({ step: "director", bucket, product_slug: product.slug, status: gen.status, summary: {
        generated: (gen.body as any)?.generated ?? (gen.body as any)?.drafts?.length ?? null,
        rejected: (gen.body as any)?.rejected?.length ?? null,
      }});

      // 2) find latest premium draft for this product
      const draft = await pickLatestDraft(sb, product.slug);
      if (!draft) {
        report.steps.push({ step: "approve", bucket, product_slug: product.slug, error: "no QA-passed draft" });
        report.pins.push({ bucket, product, error: "no_draft" });
        continue;
      }

      // 3) approve + assign board + schedule now
      await sb.from("pinterest_pin_queue").update({
        status: "queued",
        board_id: board.id,
        scheduled_at: new Date().toISOString(),
      }).eq("id", draft.id);
      report.steps.push({ step: "approve", bucket, draft_id: draft.id, board: board.name });

      // 4) publish immediately (pin mode bypasses scheduler/cron/warm-up)
      const pub = await callPublishNow(draft.id);
      const ok = (pub.body as any)?.ok === true;
      const pinterestPinId = (pub.body as any)?.pinterest_pin_id ?? (pub.body as any)?.pin?.id ?? null;
      const liveUrl = pinterestPinId ? `https://www.pinterest.com/pin/${pinterestPinId}/` : null;
      report.pins.push({
        bucket,
        product_name: product.name,
        product_slug: product.slug,
        board_name: board.name,
        board_id: board.id,
        queue_id: draft.id,
        pin_title: draft.pin_title,
        image_url: draft.pin_image_url,
        destination_link: draft.destination_link,
        published: ok,
        pinterest_pin_id: pinterestPinId,
        live_url: liveUrl,
        published_at: ok ? new Date().toISOString() : null,
        publish_response: pub.body,
      });
      report.steps.push({ step: "publish", bucket, ok, pinterest_pin_id: pinterestPinId, http_status: pub.status });

      // 60-second pacing gap between pins (except after last)
      if (i < products.length - 1) {
        await sleep(60_000);
      }
    }
  } finally {
    // ── restore original active_board_id ──
    if (rtBefore?.active_board_id) {
      await sb.from("pinterest_runtime_settings").update({ active_board_id: rtBefore.active_board_id }).eq("id", 1);
    }
    report.restored_at = new Date().toISOString();
    report.restored_settings = { active_board_id: rtBefore?.active_board_id ?? null };
  }

  const successCount = report.pins.filter((p: any) => p.published).length;
  return json({
    ok: successCount > 0,
    success_count: successCount,
    total_attempted: report.pins.length,
    report,
  });
});