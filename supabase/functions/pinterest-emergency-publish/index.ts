// pinterest-emergency-publish — ONE-TIME emergency proof-of-life publisher.
//
// Picks varied premium product candidates (dog / cat / feeding-grooming-travel,
// excluding cat litter & cat trees unless no alternative), runs the Creative
// Director in `emergency: true` mode (skips product-fidelity audit and
// diversity guard, keeps QA threshold), and publishes up to 3 successful
// drafts to Pinterest with 60s spacing.
//
// Does NOT modify any persistent runtime settings. Caller-supplied relaxed
// QA thresholds are advisory only (the underlying QA threshold remains at the
// runtime default of 70, which is below the requested 75 cap).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function categoryBucket(cat?: string | null): "dog" | "cat" | "feed_groom_travel" | "other" {
  const c = (cat || "").toLowerCase();
  if (/(feed|bowl|fountain|groom|travel|carrier|stroller)/.test(c)) return "feed_groom_travel";
  if (/dog/.test(c)) return "dog";
  if (/cat/.test(c)) return "cat";
  return "other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // One-time emergency proof-of-life token (per user instruction).
  // After this run completes the function is deleted.
  const POL_TOKEN = "POL-2026-06-13-EMERGENCY-AUTONOMOUS";
  let bodyJson: any = {};
  try { bodyJson = await req.json(); } catch { /* allow empty */ }
  const bypass = bodyJson?.proof_token === POL_TOKEN;

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

  const startedAt = Date.now();
  const log: any[] = [];

  // ── 1. Load varied candidate products (exclude cat litter / cat trees) ──
  const { data: prods, error: pErr } = await sb
    .from("products")
    .select("id, slug, name, category, image_url")
    .eq("is_active", true)
    .not("image_url", "is", null)
    .not("category", "ilike", "%litter%")
    .not("category", "ilike", "%tree%")
    .limit(120);
  if (pErr) return json({ ok: false, stage: "load_products", error: pErr.message }, 500);

  const pool = (prods || []).filter((p) => p.slug && p.image_url);
  // Shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Order: dog → cat → feed_groom_travel → other, interleaved.
  const buckets: Record<string, any[]> = { dog: [], cat: [], feed_groom_travel: [], other: [] };
  for (const p of pool) buckets[categoryBucket(p.category)].push(p);
  const ordered: any[] = [];
  while (ordered.length < 20 && (buckets.dog.length + buckets.cat.length + buckets.feed_groom_travel.length + buckets.other.length) > 0) {
    for (const k of ["dog", "cat", "feed_groom_travel", "other"] as const) {
      const x = buckets[k].shift();
      if (x) ordered.push(x);
      if (ordered.length >= 20) break;
    }
  }

  // ── 2. Load 3 distinct production-verified boards ──
  const { data: boards } = await sb
    .from("pinterest_boards")
    .select("id, name")
    .eq("is_blacklisted", false)
    .eq("is_sandbox", false)
    .eq("production_verified", true)
    .order("priority", { ascending: true });
  if (!boards || boards.length < 3) {
    return json({ ok: false, stage: "boards", message: "<3 production boards", count: boards?.length ?? 0 }, 200);
  }

  // ── 3. Generate drafts via Creative Director (emergency) until 3 succeed ──
  const winners: any[] = [];
  const seenBuckets = new Set<string>();
  let attempts = 0;

  for (const p of ordered) {
    if (winners.length >= 3) break;
    if (attempts >= 20) break;
    attempts++;
    const bucket = categoryBucket(p.category);
    // Prefer 1 per bucket; allow duplicates if no other choice remains.
    if (seenBuckets.has(bucket) && (3 - winners.length) <= (ordered.length - attempts)) continue;

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
      stage: "generate",
      slug: p.slug,
      bucket,
      http: r.status,
      drafts: drafts.length,
      rejected: ((r.body as any)?.rejected ?? []).length,
      ms: Date.now() - t0,
      err: (r.body as any)?.error || (r.body as any)?.message || null,
    });
    if (drafts.length > 0) {
      winners.push({ product: p, bucket, draft: drafts[0] });
      seenBuckets.add(bucket);
    }
  }

  if (winners.length < 3) {
    return json({
      ok: false,
      stage: "insufficient_drafts",
      message: `Only generated ${winners.length}/3 emergency drafts after ${attempts} attempts.`,
      log,
      runtime_ms: Date.now() - startedAt,
    }, 200);
  }

  // ── 4. Publish each with 60s spacing, distinct boards, UTM appended ──
  const used = new Set<string>();
  const pins: any[] = [];
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const board = boards.find((b: any) => !used.has(b.id))!;
    used.add(board.id);

    // Append UTM to destination_link.
    const draftId = w.draft.id || w.draft.queue_id || w.draft.pin_queue_id;
    if (!draftId) {
      pins.push({ bucket: w.bucket, slug: w.product.slug, published: false, error: "no_draft_id" });
      continue;
    }
    const { data: row } = await sb.from("pinterest_pin_queue")
      .select("id, destination_link, pin_image_url, pin_title")
      .eq("id", draftId).maybeSingle();
    let dest = row?.destination_link || `https://getpawsy.pet/products/${w.product.slug}`;
    try {
      const u = new URL(dest);
      u.searchParams.set("utm_source", "pinterest");
      u.searchParams.set("utm_medium", "organic");
      u.searchParams.set("utm_campaign", "proof_of_life");
      u.searchParams.set("utm_content", w.bucket);
      dest = u.toString();
    } catch { /* keep original */ }

    await sb.from("pinterest_pin_queue").update({
      status: "queued",
      board_id: board.id,
      destination_link: dest,
      scheduled_at: new Date().toISOString(),
    }).eq("id", draftId);

    if (i > 0) await new Promise((r) => setTimeout(r, 60_000));

    const t0 = Date.now();
    const pub = await callFn("pinterest-publish-now", { mode: "pin", pinId: draftId });
    const ok = (pub.body as any)?.ok === true;
    const pinId = (pub.body as any)?.pinterest_pin_id ?? (pub.body as any)?.pin?.id ?? null;
    const liveUrl = pinId ? `https://www.pinterest.com/pin/${pinId}/` : null;
    pins.push({
      bucket: w.bucket,
      product_slug: w.product.slug,
      product_name: w.product.name,
      board_id: board.id,
      board_name: board.name,
      queue_id: draftId,
      destination_link: dest,
      qa_score: w.draft?.scores?.total ?? w.draft?.scores ?? null,
      published: ok,
      pinterest_pin_id: pinId,
      live_url: liveUrl,
      publish_ms: Date.now() - t0,
      http_status: pub.status,
      error: ok ? null : ((pub.body as any)?.message ?? (pub.body as any)?.stage ?? null),
    });
  }

  // ── 5. Verification ──
  const successCount = pins.filter((p) => p.published).length;
  const verification: any[] = [];
  for (const p of pins.filter((x) => x.queue_id)) {
    const { data: row } = await sb.from("pinterest_pin_queue")
      .select("status, pinterest_pin_id, destination_link")
      .eq("id", p.queue_id).maybeSingle();
    verification.push({
      queue_id: p.queue_id,
      status: row?.status,
      pinterest_pin_id: row?.pinterest_pin_id,
      utm_present: typeof row?.destination_link === "string" && row.destination_link.includes("utm_campaign=proof_of_life"),
    });
  }

  return json({
    ok: successCount === 3,
    success_count: successCount,
    total_attempted: pins.length,
    runtime_ms: Date.now() - startedAt,
    pins,
    verification,
    generation_log: log,
    notes: "Emergency override applied to creative-director only (in-memory flag). No persistent settings changed; normal cadence/QA/governor remain active.",
  });
});