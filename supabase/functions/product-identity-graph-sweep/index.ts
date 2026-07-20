// Phase 20 — Product Identity Graph sweep orchestrator.
//
// Modes:
//   ?mode=ingest      Layer A. Enumerate products + assets from
//                     `products`, `product_gallery_images`, `product_media`,
//                     `cj_product_images`, `pinterest_pin_queue`,
//                     `pei_creative_dna`, `media_audit` and materialize them
//                     as pig_nodes + pig_edges. Deterministic. No AI credits.
//   ?mode=dna         Compute lite DNA + register duplicates by URL hash.
//   ?mode=certify     Layer B. Run Visual Truth certification on the oldest
//                     N uncertified (or expired) product+asset pairs.
//   ?mode=duplicates  Global duplicate registration only.
//   ?mode=full        ingest → dna → duplicates → certify (bounded).
//
// Extends: PRE, VPI, Master Creative Sync, Pinterest Integrity, PEI DNA.
// Duplicates NONE of them — this is the graph that binds them.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  upsertNode, upsertEdge, persistDnaLite, urlHash,
  registerDuplicateIfHashMatch, startRun, finishRun,
  certifyAssetForProduct, getPigSettings,
} from "../_shared/product-identity-graph.ts";

type Stats = Record<string, number>;

function bump(s: Stats, k: string, n = 1) { s[k] = (s[k] ?? 0) + n; }

async function safeSelect(supabase: any, table: string, cols: string, filters: Array<[string, string, unknown]> = [], limit = 5000): Promise<any[]> {
  try {
    let q: any = supabase.from(table).select(cols).limit(limit);
    for (const [op, col, val] of filters) q = (q as any)[op](col, val);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as any[];
  } catch { return []; }
}

async function ingest(supabase: any, stats: Stats, cap: number): Promise<void> {
  // 1) Products
  const products = await safeSelect(supabase, "products",
    "id,slug,name,image_url,is_active", [["eq", "is_active", true]], cap);
  const productNode: Record<string, string> = {};
  for (const p of products) {
    const id = await upsertNode(supabase, {
      kind: "product", product_id: p.id, source: "products",
      external_id: p.slug, metadata: { name: p.name, slug: p.slug, is_active: p.is_active },
    });
    if (id) { productNode[p.id] = id; bump(stats, "products"); }

    if (p.image_url) {
      const hero = await upsertNode(supabase, {
        kind: "hero_image", product_id: p.id, source: "products.image_url",
        url: p.image_url, metadata: { slug: p.slug },
      });
      if (hero && id) {
        await upsertEdge(supabase, hero, id, "hero_of", 100, { role: "hero" });
        await upsertEdge(supabase, hero, id, "belongs_to", 100);
        bump(stats, "hero_nodes");
      }
    }
  }

  // 2) Gallery
  const gallery = await safeSelect(supabase, "product_gallery_images",
    "product_id,image_url,sort_order", [], cap);
  for (const g of gallery) {
    if (!g.image_url) continue;
    const gid = await upsertNode(supabase, {
      kind: "gallery_image", product_id: g.product_id, source: "product_gallery_images",
      url: g.image_url, metadata: { sort_order: g.sort_order },
    });
    const pn = productNode[g.product_id];
    if (gid && pn) {
      await upsertEdge(supabase, gid, pn, "gallery_of", 100);
      await upsertEdge(supabase, gid, pn, "belongs_to", 100);
    }
    if (gid) bump(stats, "gallery_nodes");
  }

  // 3) CJ images (best-effort — table name variants)
  const cj = await safeSelect(supabase, "cj_product_images",
    "product_id,image_url", [], cap);
  for (const c of cj) {
    if (!c.image_url) continue;
    const cid = await upsertNode(supabase, {
      kind: "cj_image", product_id: c.product_id, source: "cj_product_images",
      url: c.image_url,
    });
    const pn = productNode[c.product_id];
    if (cid && pn) {
      await upsertEdge(supabase, cid, pn, "cj_original_of", 100);
      await upsertEdge(supabase, cid, pn, "belongs_to", 100);
    }
    if (cid) bump(stats, "cj_nodes");
  }

  // 4) Pinterest pin queue (image_url + product_id) — active only
  const pins = await safeSelect(supabase, "pinterest_pin_queue",
    "id,pinterest_pin_id,product_id,image_url,destination_url,status", [], cap);
  for (const pin of pins) {
    if (!pin.image_url || !pin.product_id) continue;
    const pid = await upsertNode(supabase, {
      kind: "pinterest_pin", product_id: pin.product_id, source: "pinterest_pin_queue",
      external_id: pin.pinterest_pin_id ?? pin.id, url: pin.image_url,
      metadata: { pin_queue_id: pin.id, destination: pin.destination_url, status: pin.status },
    });
    const pn = productNode[pin.product_id];
    if (pid && pn) {
      await upsertEdge(supabase, pid, pn, "pinterest_of", 100);
      await upsertEdge(supabase, pid, pn, "belongs_to", 100);
    }
    if (pid) bump(stats, "pinterest_nodes");
  }

  // 5) AI creatives via PEI Creative DNA (extends — no duplicate table)
  const dna = await safeSelect(supabase, "pei_creative_dna",
    "product_id,image_url,creative_id", [], cap);
  for (const d of dna) {
    if (!d.image_url) continue;
    const aid = await upsertNode(supabase, {
      kind: "ai_creative", product_id: d.product_id, source: "pei_creative_dna",
      external_id: d.creative_id ?? null, url: d.image_url,
    });
    const pn = productNode[d.product_id];
    if (aid && pn) {
      await upsertEdge(supabase, aid, pn, "ai_creative_of", 100);
      await upsertEdge(supabase, aid, pn, "belongs_to", 100);
    }
    if (aid) bump(stats, "ai_creative_nodes");
  }
}

async function computeDna(supabase: any, stats: Stats, cap: number): Promise<void> {
  // Backfill lite DNA for nodes without one.
  const { data: nodes } = await supabase
    .from("pig_nodes")
    .select("id,url,metadata")
    .not("url", "is", null)
    .limit(cap);
  for (const n of (nodes ?? []) as any[]) {
    const { data: existing } = await supabase
      .from("pig_visual_dna").select("id").eq("node_id", n.id).maybeSingle();
    if (existing) continue;
    await persistDnaLite(supabase, n.id, n.url, n.metadata ?? {});
    bump(stats, "dna_written");
  }
}

async function detectDuplicates(supabase: any, stats: Stats, cap: number): Promise<void> {
  const { data: nodes } = await supabase
    .from("pig_nodes")
    .select("id,content_hash")
    .not("content_hash", "is", null)
    .limit(cap);
  for (const n of (nodes ?? []) as any[]) {
    const r = await registerDuplicateIfHashMatch(supabase, n.id, n.content_hash);
    if (r.registered) bump(stats, "duplicates_registered");
  }
}

async function certifyBatch(supabase: any, stats: Stats, limit: number): Promise<void> {
  // Pinterest pins first (revenue-critical), then hero, then gallery, then AI.
  const roles: Array<{ kind: string; role: "pinterest_hero" | "hero" | "gallery" | "ai_creative" | "cj_original" }> = [
    { kind: "pinterest_pin", role: "pinterest_hero" },
    { kind: "hero_image",    role: "hero" },
    { kind: "gallery_image", role: "gallery" },
    { kind: "ai_creative",   role: "ai_creative" },
    { kind: "cj_image",      role: "cj_original" },
  ];
  let budget = limit;
  for (const { kind, role } of roles) {
    if (budget <= 0) break;
    const { data: candidates } = await supabase
      .from("pig_nodes")
      .select("id,url,product_id,metadata")
      .eq("kind", kind)
      .not("url", "is", null)
      .not("product_id", "is", null)
      .limit(budget);
    for (const c of (candidates ?? []) as any[]) {
      if (budget <= 0) break;
      // Skip if a fresh certification already exists
      const { data: cert } = await supabase
        .from("pig_certifications")
        .select("id,expires_at,passed")
        .eq("product_id", c.product_id).eq("node_id", c.id).eq("role", role)
        .maybeSingle();
      if (cert?.id && cert.expires_at && new Date(cert.expires_at).getTime() > Date.now() && cert.passed) {
        continue;
      }
      const { data: product } = await supabase
        .from("products").select("id,slug,name")
        .eq("id", c.product_id).maybeSingle();
      if (!product) continue;
      const res = await certifyAssetForProduct(supabase, {
        product_id: product.id, product_slug: product.slug, product_name: product.name,
        node_id: c.id, asset_url: c.url, role,
        pinterest_pin_id: role === "pinterest_hero" ? (c.metadata?.external_id ?? null) : null,
        source: "pig_sweep", useCache: true,
      });
      bump(stats, `certified_${role}`);
      if (res.passed) bump(stats, "cert_pass"); else bump(stats, "cert_fail");
      budget--;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "full").toLowerCase();
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") ?? 40)));
  const ingestCap = Math.max(1, Math.min(5000, Number(url.searchParams.get("ingest_cap") ?? 2000)));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const stats: Stats = {};
  const runId = await startRun(supabase, mode, "http");
  const errors: unknown[] = [];
  try {
    const settings = await getPigSettings(supabase);
    stats.settings_min_score = settings.minIdentityScore;

    if (mode === "ingest" || mode === "full") {
      await ingest(supabase, stats, ingestCap);
    }
    if (mode === "dna" || mode === "full") {
      await computeDna(supabase, stats, ingestCap);
    }
    if (mode === "duplicates" || mode === "full") {
      await detectDuplicates(supabase, stats, ingestCap);
    }
    if (mode === "certify" || mode === "full") {
      await certifyBatch(supabase, stats, limit);
    }

    await finishRun(supabase, runId, "completed", stats, errors);
    return new Response(JSON.stringify({ ok: true, run_id: runId, mode, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    errors.push({ message: (e as Error).message });
    await finishRun(supabase, runId, "failed", stats, errors);
    return new Response(JSON.stringify({ ok: false, run_id: runId, error: (e as Error).message, stats }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});