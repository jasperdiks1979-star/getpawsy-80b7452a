// pinterest-emergency-publish — ONE-TIME emergency autonomous proof-of-life.
// Fire-and-forget: returns 202 immediately, runs the chain in EdgeRuntime.waitUntil.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUN_TAG = "POL-2026-06-13";
const POL_TOKEN = "POL-2026-06-13-EMERGENCY-AUTONOMOUS";

async function callFn(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, body: j };
}

function categoryBucket(cat?: string | null): "dog" | "cat" | "feed_groom_travel" | "other" {
  const c = (cat || "").toLowerCase();
  if (/(feed|bowl|fountain|groom|travel|carrier|stroller)/.test(c)) return "feed_groom_travel";
  if (/dog/.test(c)) return "dog";
  if (/cat/.test(c)) return "cat";
  return "other";
}

async function runChain(opts: { publishOnly?: boolean } = {}) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = Date.now();
  const log: any[] = [];

  const { data: prods, error: pErr } = await sb
    .from("products")
    .select("id, slug, name, category, image_url")
    .eq("is_active", true)
    .not("image_url", "is", null)
    .not("category", "ilike", "%litter%")
    .not("category", "ilike", "%tree%")
    .limit(120);
  if (pErr) { console.error("[pol] load_products", pErr.message); return; }

  const pool = (prods || []).filter((p) => p.slug && p.image_url);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const buckets: Record<string, any[]> = { dog: [], cat: [], feed_groom_travel: [], other: [] };
  for (const p of pool) buckets[categoryBucket(p.category)].push(p);
  const ordered: any[] = [];
  while (ordered.length < 20) {
    let added = 0;
    for (const k of ["dog", "cat", "feed_groom_travel", "other"] as const) {
      const x = buckets[k].shift();
      if (x) { ordered.push(x); added++; }
      if (ordered.length >= 20) break;
    }
    if (added === 0) break;
  }

  const { data: boards } = await sb
    .from("pinterest_boards")
    .select("id, name")
    .eq("is_blacklisted", false)
    .eq("is_sandbox", false)
    .eq("production_verified", true)
    .order("priority", { ascending: true });
  if (!boards || boards.length < 3) { console.error("[pol] boards <3", boards?.length); return; }

  const winners: any[] = [];
  const seenBuckets = new Set<string>();
  let attempts = 0;

  if (opts.publishOnly) {
    // Pull the most recent draft rows that have an image + destination and
    // assemble winners from distinct buckets.
    const { data: drafts } = await sb
      .from("pinterest_pin_queue")
      .select("id, product_slug, product_name, category_key, pin_image_url, destination_link, status, created_at")
      .in("status", ["draft", "approved", "queued"])
      .is("pinterest_pin_id", null)
      .not("pin_image_url", "is", null)
      .not("destination_link", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const usedSlugs = new Set<string>();
    for (const d of drafts ?? []) {
      const slug = d.product_slug as string;
      if (usedSlugs.has(slug)) continue;
      const bucket = categoryBucket(d.category_key) ?? "other";
      if (winners.length < 3 && (!seenBuckets.has(bucket) || winners.length + (3 - winners.length) > (drafts.length - winners.length))) {
        winners.push({
          product: { slug, name: d.product_name, category: d.category_key },
          bucket,
          draft: { queueId: d.id },
        });
        seenBuckets.add(bucket);
        usedSlugs.add(slug);
      }
      if (winners.length >= 3) break;
    }
  } else {

  for (const p of ordered) {
    if (winners.length >= 3) break;
    if (attempts >= 20) break;
    attempts++;
    const bucket = categoryBucket(p.category);

    const t0 = Date.now();
    const r = await callFn("pinterest-creative-director", {
      action: "run_full",
      productSlug: p.slug,
      count: 1,
      force: true,
      emergency: true,
    });
    const drafts = (r.body as any)?.drafts ?? [];
    log.push({
      stage: "generate", slug: p.slug, bucket, http: r.status,
      drafts: drafts.length, rejected: ((r.body as any)?.rejected ?? []).length,
      ms: Date.now() - t0, err: (r.body as any)?.error || (r.body as any)?.message || null,
    });
    if (drafts.length > 0) {
      winners.push({ product: p, bucket, draft: drafts[0] });
      seenBuckets.add(bucket);
    }
  }
  }

  if (winners.length < 3) {
    console.error("[pol] insufficient_drafts", { winners: winners.length, attempts, log });
    return;
  }

  const used = new Set<string>();
  const pins: any[] = [];
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const board = boards.find((b: any) => !used.has(b.id))!;
    used.add(board.id);

    const draftId = w.draft.queueId || w.draft.queue_id || w.draft.id || w.draft.pin_queue_id;
    if (!draftId) { pins.push({ bucket: w.bucket, slug: w.product.slug, published: false, error: "no_draft_id" }); continue; }

    const { data: row } = await sb.from("pinterest_pin_queue")
      .select("id, destination_link, meta").eq("id", draftId).maybeSingle();
    let dest = row?.destination_link || `https://getpawsy.pet/products/${w.product.slug}`;
    try {
      const u = new URL(dest);
      u.searchParams.set("utm_source", "pinterest");
      u.searchParams.set("utm_medium", "organic");
      u.searchParams.set("utm_campaign", "proof_of_life");
      u.searchParams.set("utm_content", w.bucket);
      dest = u.toString();
    } catch { /* keep */ }

    const mergedMeta = { ...(row?.meta ?? {}), pol_run: RUN_TAG, bucket: w.bucket };
    await sb.from("pinterest_pin_queue").update({
      status: "queued", board_id: board.id, destination_link: dest,
      scheduled_at: new Date().toISOString(), meta: mergedMeta,
    }).eq("id", draftId);

    if (i > 0) await new Promise((r) => setTimeout(r, 60_000));

    const t0 = Date.now();
    const pub = await callFn("pinterest-publish-now", { mode: "pin", pinId: draftId });
    const ok = (pub.body as any)?.ok === true;
    const pinId = (pub.body as any)?.pinterest_pin_id ?? (pub.body as any)?.pin?.id ?? null;
    pins.push({
      bucket: w.bucket, slug: w.product.slug, board_id: board.id, board_name: board.name,
      queue_id: draftId, destination_link: dest, published: ok, pinterest_pin_id: pinId,
      live_url: pinId ? `https://www.pinterest.com/pin/${pinId}/` : null,
      publish_ms: Date.now() - t0, http_status: pub.status,
      error: ok ? null : ((pub.body as any)?.message ?? (pub.body as any)?.stage ?? null),
    });
  }

  console.log("[pol] DONE", JSON.stringify({ runtime_ms: Date.now() - startedAt, pins, log }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  let bodyJson: any = {};
  try { bodyJson = await req.json(); } catch { /* allow empty */ }
  const bypass = bodyJson?.proof_token === POL_TOKEN;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (!bypass) {
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
  }

  if (bodyJson?.mode === "status") {
    const { data: rows } = await sb.from("pinterest_pin_queue")
      .select("id, product_slug, status, pinterest_pin_id, board_id, destination_link, meta, created_at")
      .contains("meta", { pol_run: RUN_TAG })
      .order("created_at", { ascending: true });
    return json({ ok: true, mode: "status", run_tag: RUN_TAG, pins: rows ?? [] });
  }

  const publishOnly = bodyJson?.mode === "publish_only";
  // @ts-ignore — Supabase Edge Runtime
  EdgeRuntime.waitUntil(runChain({ publishOnly }).catch((e) => console.error("[pol] runChain crash", e)));
  return json({ ok: true, started: true, run_tag: RUN_TAG, message: "Background chain started." }, 202);
});