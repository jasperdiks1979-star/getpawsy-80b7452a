// Resurrection → PCIE2 Bridge (Mission A resume)
// Renders proposed_image_brief via Lovable AI Gateway, uploads to Supabase
// Storage (product-images/resurrection/), and inserts a held row into
// pcie2_publish_queue. Fully idempotent — skips candidates that already
// have rendered_image_url + pcie2_queue_id + ci_passed_at.
//
// Publishing is NOT performed here. Rows are inserted with status='ready'
// (held by the CI gate + downstream cadence gate).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CI_VERSION = "ci-v1.1-zero-bypass";
const RENDER_MODEL = "google/gemini-3-pro-image";
const STORAGE_BUCKET = "product-images";

function md5(input: string): Promise<string> {
  // 24-char truncated hex fingerprint (matches exemplar row shape)
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)).then((buf) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24)
  );
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function renderImage(brief: any, title: string): Promise<Uint8Array> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const scene = brief?.scene ?? "modern US apartment, soft daylight";
  const style = brief?.style ?? "clean lifestyle product, photorealistic, Pinterest-friendly";
  const subject = brief?.subject ?? title;
  const negative = brief?.negative ?? "no text collage, no supplier watermark, no cluttered background";
  const prompt =
    `Pinterest-ready 2:3 vertical lifestyle image.\n` +
    `Subject: ${subject}\n` +
    `Scene: ${scene}\n` +
    `Style: ${style}\n` +
    `Avoid: ${negative}\n` +
    `No text overlays. Real product staged naturally in a US home.`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: RENDER_MODEL,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      stream: false,
    }),
  });
  if (!r.ok) throw new Error(`render_failed_${r.status}:${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`render_no_b64:${JSON.stringify(j).slice(0, 200)}`);
  return b64ToBytes(b64);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(30, Number(body.limit ?? 5)));

    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, svc, { auth: { persistSession: false } });

    // Prefilter: only consider active products so we don't burn selection slots.
    const { data: activeProds, error: apErr } = await sb
      .from("products").select("id").eq("is_active", true);
    if (apErr) throw new Error(`active_products_query_failed:${apErr.message}`);
    const activeSet = new Set((activeProds ?? []).map((p: any) => String(p.id)));

    // Select unbridged drafts, top confidence first. Diversity cap: max 2 per product per invocation.
    const { data: poolRaw, error: poolErr } = await sb
      .from("pinterest_resurrection_candidates")
      .select("id, product_id, product_slug, bucket, proposed_title, proposed_description, proposed_image_brief, proposed_board_id, proposed_board_name, us_audience_score, duplicate_risk, confidence_score, banned_phrase_hit")
      .eq("status", "draft")
      .is("pcie2_queue_id", null)
      .or("bridge_status.is.null,bridge_status.eq.failed")
      .order("confidence_score", { ascending: false, nullsFirst: false })
      .limit(Math.min(400, limit * 12));
    if (poolErr) throw new Error(`pool_query_failed:${poolErr.message}`);
    const pool = (poolRaw ?? []).filter((c: any) => activeSet.has(String(c.product_id)));

    // Tightened selection: cap max 1 candidate per (product_id, proposed_board_id)
    // per wave to prevent pcie2_pq_idempotency_uidx collisions.
    const perPair = new Set<string>();
    const perBoard = new Map<string, number>();
    const chosen: any[] = [];
    for (const c of pool ?? []) {
      const p = String(c.product_id);
      const b = String(c.proposed_board_id ?? "");
      const pair = `${p}::${b}`;
      if (perPair.has(pair)) continue;
      if ((perBoard.get(b) ?? 0) >= 6) continue;
      chosen.push(c);
      perPair.add(pair);
      perBoard.set(b, (perBoard.get(b) ?? 0) + 1);
      if (chosen.length >= limit) break;
    }

    // Pre-check pcie2_publish_queue for active rows on the same (product_id, board_id)
    // — the unique idempotency index is (product_id, board_id, md5(image_url)) filtered to
    // status in (ready|queued|pending|publishing). If any active row exists for the pair,
    // skip the candidate up front so we don't burn a render call on a guaranteed collision.
    const collisionSkips: any[] = [];
    const filtered: any[] = [];
    for (const c of chosen) {
      const boardId = String(c.proposed_board_id ?? "");
      const { data: existing, error: exErr } = await sb
        .from("pcie2_publish_queue")
        .select("id, image_url, status")
        .eq("product_id", c.product_id)
        .eq("board_id", boardId)
        .in("status", ["ready", "queued", "pending", "publishing"])
        .limit(1);
      if (exErr) throw new Error(`precheck_failed:${exErr.message}`);
      if ((existing ?? []).length > 0) {
        collisionSkips.push({ cid: c.id, status: "skipped_collision", queue_id: existing![0].id });
        continue;
      }
      filtered.push(c);
    }

    const results: any[] = [];
    let bridged = 0, failed = 0, rendered = 0, reused = 0;

    let skipped_collision = collisionSkips.length;
    for (const c of filtered) {
      const cid = c.id as string;
      try {
        // Verify product still active + confirm board is whitelisted
        const { data: prod } = await sb.from("products").select("id, slug, is_active, image_url").eq("id", c.product_id).maybeSingle();
        if (!prod || prod.is_active === false) throw new Error("product_inactive");
        const boardId = String(c.proposed_board_id ?? "");
        if (!boardId) throw new Error("no_board_mapped");

        // Image: reuse for banned_phrase_rewrite (existing certified product image),
        // render fresh for all other buckets.
        let imageUrl: string;
        let imageMode: "reused" | "rendered";
        if (c.bucket === "banned_phrase_rewrite" && prod.image_url) {
          imageUrl = prod.image_url;
          imageMode = "reused";
          reused++;
        } else {
          const bytes = await renderImage(c.proposed_image_brief ?? {}, c.proposed_title ?? "");
          const key = `resurrection/${cid}.png`;
          const { error: upErr } = await sb.storage.from(STORAGE_BUCKET).upload(key, bytes, {
            contentType: "image/png",
            upsert: true,
          });
          if (upErr) throw new Error(`upload_failed:${upErr.message}`);
          const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(key);
          imageUrl = pub.publicUrl;
          imageMode = "rendered";
          rendered++;
        }

        // Fingerprints
        const headline = c.proposed_title as string;
        const hook = c.proposed_description as string | null;
        const q_fp = await md5(`${prod.slug}|${headline}|${imageUrl}`);
        const s_fp = await md5(`${prod.slug}|${headline}|${hook ?? ""}`);
        const r_fp = q_fp;
        const i_fp = await md5(imageUrl);
        const h_fp = await md5(headline);

        // CI score: derived from stored signals — DO NOT introduce new scoring axes.
        const conf = Number(c.confidence_score ?? 0);
        const us = Number(c.us_audience_score ?? 0);
        const dup = Number(c.duplicate_risk ?? 0);
        const ci_score = Math.round(Math.max(0, Math.min(100, (conf * 60 + us * 30 + (1 - dup) * 10))));
        if (ci_score < 60) throw new Error(`ci_score_below_gate:${ci_score}`);

        const destination = `https://getpawsy.pet/products/${prod.slug}?utm_source=pinterest&utm_medium=organic&utm_campaign=resurrection`;
        const now = new Date().toISOString();

        const { data: inserted, error: insErr } = await sb
          .from("pcie2_publish_queue")
          .insert({
            product_id: c.product_id,
            product_slug: prod.slug,
            headline,
            hook,
            image_url: imageUrl,
            board_id: boardId,
            destination_url: destination,
            status: "ready",
            quality_score: Math.min(0.99, conf),
            classifier_confidence: conf,
            ci_version: CI_VERSION,
            ci_passed_at: now,
            ci_score,
            quality_fingerprint: q_fp,
            semantic_fingerprint: s_fp,
            rewrite_fingerprint: r_fp,
            image_fingerprint: i_fp,
            headline_fingerprint: h_fp,
            meta: {
              source: "resurrection-to-pcie2-bridge",
              bucket: c.bucket,
              image_mode: imageMode,
              ci_score,
              ci_version: CI_VERSION,
              ci_passed_at: now,
              duplicate_risk: dup,
              us_audience_score: us,
              board_mapping_reason: "product_routing_v3",
              resurrection_candidate_id: cid,
            },
          })
          .select("id")
          .single();
        if (insErr) throw new Error(`queue_insert_failed:${insErr.message}`);

        await sb.from("pinterest_resurrection_candidates").update({
          rendered_image_url: imageUrl,
          pcie2_queue_id: inserted!.id,
          ci_passed_at: now,
          bridge_status: "bridged",
          bridge_error: null,
        }).eq("id", cid);

        bridged++;
        results.push({ cid, status: "bridged", queue_id: inserted!.id, image_mode: imageMode });
      } catch (e) {
        failed++;
        const msg = String((e as Error).message ?? e).slice(0, 400);
        await sb.from("pinterest_resurrection_candidates").update({
          bridge_status: "failed",
          bridge_error: msg,
        }).eq("id", cid);
        results.push({ cid, status: "failed", error: msg });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      selected: chosen.length,
      bridged, failed, rendered, reused,
      elapsed_ms: Date.now() - started,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
