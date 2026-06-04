// CJ media + variant backfill orchestrator.
//
// Iterates ALL products with cj_product_id (active OR inactive) in batches,
// and for each product:
//   1. Fetches CJ payload via cj-dropshipping/getProductDetails
//   2. Imports any missing videos into product_media (idempotent via
//      (product_id, supplier_url) unique index)
//   3. Repairs variants if products.variants is empty
//
// Designed to be called repeatedly from the admin UI with a cursor so we
// stay well under the edge-function execution window per invocation.
//
// POST body:
//   { offset?: number, batch_size?: number, only_missing?: boolean,
//     product_ids?: string[], dry_run?: boolean, run_id?: string }
//
// Returns:
//   { ok, run_id, processed, total, next_offset|null, stats: { ... } }
//
// Auth: admin user OR x-internal-secret.

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

const CJ_VIDEO_HOSTS = [
  "cf.cjdropshipping.com",
  "oss-cf.cjdropshipping.com",
  "cjvideopublic",
  "cjvideo",
  "video.cjdropshipping.com",
  "oss-eu.cjdropshipping.com",
  "oss-us.cjdropshipping.com",
];

const VIDEO_FIELDS_TOP = [
  "productVideo",
  "productVideoUrl",
  "video",
  "videoUrl",
  "videoUrls",
  "videoGallery",
  "detailVideos",
  "media",
  "productMedia",
];
const VIDEO_FIELDS_VARIANT = [
  "variantVideo",
  "variantVideoUrl",
  "variantVideoUrls",
  "video",
];

type Candidate = {
  url: string;
  source: string;
  status: "accepted" | "rejected_unknown_shape";
  variantKey?: string | null;
  variantId?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function classifyVideoUrl(u: string): Candidate["status"] {
  if (!u || typeof u !== "string") return "rejected_unknown_shape";
  if (!/^https?:\/\//.test(u)) return "rejected_unknown_shape";
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)) return "accepted";
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (CJ_VIDEO_HOSTS.some((h) => host.includes(h))) return "accepted";
  } catch { /* ignore */ }
  return "rejected_unknown_shape";
}

function pushUrl(out: Candidate[], seen: Set<string>, raw: unknown, source: string, variantKey?: string | null, variantId?: string | null) {
  if (raw == null) return;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    let u: string | null = null;
    if (typeof item === "string") u = item;
    else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (typeof obj.url === "string") u = obj.url;
      else if (typeof obj.videoUrl === "string") u = obj.videoUrl;
      else if (typeof obj.src === "string") u = obj.src;
    }
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ url: u, source, status: classifyVideoUrl(u), variantKey: variantKey ?? null, variantId: variantId ?? null });
  }
}

function extractVideoCandidates(p: Record<string, unknown>): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const f of VIDEO_FIELDS_TOP) pushUrl(out, seen, p[f], f);
  const variants = (p as { variants?: unknown[] }).variants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (!v || typeof v !== "object") continue;
      const vr = v as Record<string, unknown>;
      const vk = (typeof vr.variantKey === "string" ? vr.variantKey : null)
        ?? (typeof vr.variantNameEn === "string" ? vr.variantNameEn : null);
      const vid = typeof vr.vid === "string" ? vr.vid : null;
      for (const f of VIDEO_FIELDS_VARIANT) pushUrl(out, seen, vr[f], `variant.${f}`, vk, vid);
    }
  }
  return out;
}

type CjInventory = { countryCode?: string; totalInventory?: number };
type CjVariant = {
  vid?: string;
  variantSku?: string;
  variantNameEn?: string;
  variantName?: string;
  variantImage?: string;
  variantSellPrice?: number | string;
  variantWeight?: number | string;
  variantKey?: string;
  variantSpecs?: Array<{ specName?: string; specValue?: string }>;
  inventories?: CjInventory[];
};

function extractColorSize(v: CjVariant) {
  const out: { color: string | null; size: string | null } = { color: null, size: null };
  if (Array.isArray(v.variantSpecs)) {
    for (const s of v.variantSpecs) {
      const name = (s?.specName ?? "").toLowerCase();
      const val = s?.specValue ?? "";
      if (!val) continue;
      if (name.includes("color") || name.includes("colour")) out.color = val;
      if (name.includes("size")) out.size = val;
    }
  }
  if (!out.color || !out.size) {
    const label = v.variantNameEn ?? v.variantName ?? "";
    const parts = String(label).split(/[\-|·,/]+/).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (!out.size && /^(xs|s|m|l|xl|xxl|xxxl)$/i.test(part)) out.size = part;
      else if (!out.size && /\d/.test(part) && /(cm|mm|ml|l|kg|g|in|"|inch)$/i.test(part)) out.size = part;
      else if (!out.color && /^[a-zA-Z\s]{3,20}$/.test(part)) out.color = part;
    }
  }
  return out;
}

function totalStock(v: CjVariant): number {
  if (!Array.isArray(v.inventories)) return 0;
  let us = 0, other = 0;
  for (const inv of v.inventories) {
    const qty = Number(inv?.totalInventory ?? 0);
    if ((inv?.countryCode ?? "").toUpperCase() === "US") us += qty;
    else other += qty;
  }
  return us > 0 ? us : other;
}

async function fetchCjDetails(cjProductId: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/cj-dropshipping`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "get-product-details", productId: cjProductId, countryCode: "US" }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    // get-product-details returns the raw CJ response: { result, data: {...} }
    if (j?.data && typeof j.data === "object") return j.data as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function isAdminClaims(c: Record<string, unknown> | null): boolean {
  if (!c) return false;
  if (c.role === "admin" || c.role === "director") return true;
  const email = typeof c.email === "string" ? c.email.toLowerCase().trim() : "";
  return ADMIN_FALLBACK_EMAILS.includes(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  // ---- Auth ----
  let authed = false;
  if (INTERNAL_SECRET && req.headers.get("x-internal-secret") === INTERNAL_SECRET) {
    authed = true;
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const user = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: ures } = await user.auth.getUser();
      if (ures?.user) {
        const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);
        const { data: role } = await adminSb
          .from("user_roles").select("role")
          .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
        const email = ures.user.email ?? "";
        if (role || ADMIN_FALLBACK_EMAILS.includes(email.toLowerCase())) authed = true;
        else {
          const { data: claims } = await user.auth.getClaims(authHeader.replace("Bearer ", ""));
          if (isAdminClaims(claims?.claims ?? null)) authed = true;
        }
      }
    }
  }
  if (!authed) return json({ ok: false, traceId, message: "admin required" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const offset: number = Math.max(0, Number(body?.offset ?? 0));
  const batchSize: number = Math.min(Math.max(Number(body?.batch_size ?? 10), 1), 25);
  const dryRun: boolean = !!body?.dry_run;
  const onlyMissing: boolean = body?.only_missing !== false; // default true
  const productIds: string[] | undefined = Array.isArray(body?.product_ids) ? body.product_ids : undefined;
  let runId: string = body?.run_id ?? "";

  // Create run row on first invocation
  if (!runId) {
    const { data: runRow } = await admin
      .from("cj_sync_runs")
      .insert({ mode: dryRun ? "dry_run" : "backfill_media_variants", triggered_by: "admin", status: "running" })
      .select("id")
      .single();
    runId = runRow?.id as string;
  }

  // Count total candidates
  const countQuery = admin.from("products").select("id", { count: "exact", head: true }).not("cj_product_id", "is", null);
  if (productIds?.length) countQuery.in("id", productIds);
  const { count: totalCount } = await countQuery;
  const total = totalCount ?? 0;

  // Fetch this batch
  let q = admin
    .from("products")
    .select("id, name, cj_product_id, variants, images, cj_media_synced_at")
    .not("cj_product_id", "is", null)
    .order("id", { ascending: true })
    .range(offset, offset + batchSize - 1);
  if (productIds?.length) q = q.in("id", productIds);

  const { data: rows, error: rowsErr } = await q;
  if (rowsErr) return json({ ok: false, traceId, run_id: runId, message: rowsErr.message }, 500);

  const stats = {
    processed: 0,
    videos_imported: 0,
    videos_skipped_existing: 0,
    videos_failed: 0,
    videos_none_found: 0,
    videos_unknown_shape: 0,
    variants_recovered: 0,
    variants_failed: 0,
    variants_none_found: 0,
    cj_fetch_failed: 0,
  };

  for (const row of (rows ?? [])) {
    stats.processed++;
    const productId = row.id as string;
    const cjId = row.cj_product_id as string;
    const productName = (row.name as string) ?? "";

    try {
      const detail = await fetchCjDetails(cjId);
      if (!detail) {
        stats.cj_fetch_failed++;
        await admin.from("cj_sync_items").insert({
          run_id: runId, product_id: productId, product_name: productName,
          action: "cj_fetch_failed", error: "no_payload",
        });
        continue;
      }

      // ===== Videos =====
      const candidates = extractVideoCandidates(detail);
      const accepted = candidates.filter((c) => c.status === "accepted");
      const rejected = candidates.filter((c) => c.status === "rejected_unknown_shape");
      stats.videos_unknown_shape += rejected.length;

      if (candidates.length === 0) {
        stats.videos_none_found++;
        await admin.from("cj_sync_items").insert({
          run_id: runId, product_id: productId, product_name: productName,
          action: "video_none_found",
        });
      }
      for (const r of rejected) {
        await admin.from("cj_sync_items").insert({
          run_id: runId, product_id: productId, product_name: productName,
          action: "video_unknown_url_shape",
          after: { supplier_url: r.url, source: r.source },
        });
      }

      // Existing supplier_urls already imported for this product
      const { data: existingMedia } = await admin
        .from("product_media")
        .select("supplier_url")
        .eq("product_id", productId)
        .eq("media_type", "video");
      const existingUrls = new Set<string>(
        (existingMedia ?? []).map((m: { supplier_url: string | null }) => m.supplier_url ?? "").filter(Boolean),
      );

      for (const cand of accepted) {
        if (existingUrls.has(cand.url)) { stats.videos_skipped_existing++; continue; }
        try {
          if (dryRun) {
            await admin.from("cj_sync_items").insert({
              run_id: runId, product_id: productId, product_name: productName,
              action: "video_would_import",
              after: { supplier_url: cand.url, source: cand.source, variant_key: cand.variantKey },
            });
            stats.videos_imported++;
            continue;
          }
          // Insert pointing directly at the CJ CDN URL (no re-host). Idempotent
          // because (product_id, supplier_url) is unique.
          const { error: insErr } = await admin.from("product_media").insert({
            product_id: productId,
            cj_product_id: cjId,
            variant_key: cand.variantKey,
            variant_id: cand.variantId,
            media_type: "video",
            storage_url: cand.url,
            supplier_url: cand.url,
            source: "cj",
            sort_order: 50,
            metadata: { source_field: cand.source },
          });
          if (insErr) {
            if (/duplicate key/i.test(insErr.message)) { stats.videos_skipped_existing++; continue; }
            throw insErr;
          }
          stats.videos_imported++;
          await admin.from("cj_sync_items").insert({
            run_id: runId, product_id: productId, product_name: productName,
            action: "video_imported",
            after: { storage_url: cand.url, source: cand.source, variant_key: cand.variantKey },
          });
        } catch (e) {
          stats.videos_failed++;
          await admin.from("cj_sync_items").insert({
            run_id: runId, product_id: productId, product_name: productName,
            action: "video_import_failed",
            error: (e as Error).message,
            after: { supplier_url: cand.url, source: cand.source },
          });
        }
      }

      // ===== Variants =====
      const existingVariants = Array.isArray(row.variants) ? (row.variants as unknown[]) : [];
      const needsVariantRepair = existingVariants.length === 0;
      if (needsVariantRepair) {
        const cjVariants = (detail as { variants?: CjVariant[] }).variants;
        if (!Array.isArray(cjVariants) || cjVariants.length === 0) {
          stats.variants_none_found++;
          await admin.from("cj_sync_items").insert({
            run_id: runId, product_id: productId, product_name: productName,
            action: "variant_none_found",
          });
        } else {
          try {
            const normalized = cjVariants.map((v) => {
              const { color, size } = extractColorSize(v);
              const stock = totalStock(v);
              return {
                cj_vid: v.vid ?? null,
                variantKey: v.variantKey ?? null,
                sku: v.variantSku ?? null,
                name: v.variantNameEn ?? v.variantName ?? null,
                image: v.variantImage ?? null,
                price: v.variantSellPrice ?? null,
                weight: v.variantWeight ?? null,
                color, size, stock,
                active: stock > 0,
              };
            });
            const variantStock: Record<string, number> = {};
            for (const n of normalized) {
              const key = n.sku ?? (n.cj_vid ? String(n.cj_vid) : null);
              if (key) variantStock[key] = n.stock;
            }
            const aggStock = normalized.reduce((acc, n) => acc + (Number(n.stock) || 0), 0);
            if (!dryRun) {
              const { error: upErr } = await admin.from("products").update({
                variants: normalized,
                variant_stock: variantStock,
                stock: aggStock,
                last_inventory_sync_at: new Date().toISOString(),
                last_inventory_sync_status: "variant_repair_ok",
              }).eq("id", productId);
              if (upErr) throw upErr;
            }
            stats.variants_recovered++;
            await admin.from("cj_sync_items").insert({
              run_id: runId, product_id: productId, product_name: productName,
              action: "variants_recovered",
              after: { count: normalized.length, total_stock: aggStock },
            });
          } catch (e) {
            stats.variants_failed++;
            await admin.from("cj_sync_items").insert({
              run_id: runId, product_id: productId, product_name: productName,
              action: "variant_repair_failed",
              error: (e as Error).message,
            });
          }
        }
      }

      // Stamp last sync
      if (!dryRun) {
        await admin.from("products").update({
          cj_media_synced_at: new Date().toISOString(),
        }).eq("id", productId);
      }
    } catch (e) {
      await admin.from("cj_sync_items").insert({
        run_id: runId, product_id: productId, product_name: productName,
        action: "failed", error: (e as Error).message,
      });
    }
  }

  const nextOffset = offset + (rows?.length ?? 0);
  const isDone = !rows || rows.length < batchSize || nextOffset >= total;

  // Update run totals (merge with existing)
  const { data: runCurrent } = await admin
    .from("cj_sync_runs").select("totals").eq("id", runId).maybeSingle();
  const merged: Record<string, number> = { ...(runCurrent?.totals ?? {}) };
  for (const [k, v] of Object.entries(stats)) {
    merged[k] = (Number(merged[k]) || 0) + v;
  }
  merged.total = total;
  merged.completed = nextOffset;

  await admin.from("cj_sync_runs").update({
    totals: merged,
    status: isDone ? "ok" : "running",
    ...(isDone ? { finished_at: new Date().toISOString() } : {}),
  }).eq("id", runId);

  return json({
    ok: true,
    traceId,
    run_id: runId,
    processed: rows?.length ?? 0,
    total,
    next_offset: isDone ? null : nextOffset,
    done: isDone,
    stats,
    totals: merged,
  });
});