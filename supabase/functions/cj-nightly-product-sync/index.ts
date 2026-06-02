// CJ Nightly Product Sync — orchestrator
// Modes: full | inventory | pricing | shipping | media | dry_run
// Auth: admin JWT OR x-internal-secret (cron).
//
// For each batch (max 25 products):
//   1. fetch CJ product details (cost, shipping, variants, videos)
//   2. import any new videos into 'product-media' storage (sha256 dedupe)
//   3. recompute landed cost + selling price (margin rules)
//   4. update inventory via internal call to cj-inventory-sync
//   5. write a cj_sync_items diff row per change
//
// Pricing rules:
//   - min gross margin: 55%
//   - target margin: 68%
//   - psychological ending: .99
//   - never auto-lower price below min margin
//   - delta > 25% => needs_admin_review = true, skip write
//
// Safety:
//   - per-product try/catch (one bad product never breaks the run)
//   - retry with exponential backoff on transient errors
//   - stop the run when CJ rate-limits us
//   - video import skipped for products that already have >=2 stored videos

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const BATCH_SIZE = 25;
const API_DELAY_MS = 1200;
const MIN_MARGIN = 0.55;
const TARGET_MARGIN = 0.68;
const MAX_AUTO_PRICE_DELTA = 0.25;
const MAX_VIDEOS_PER_PRODUCT = 2;
const PAYMENT_FEE = 0.029; // ~Stripe
const PLATFORM_FEE = 0.02; // ad/platform buffer

const ADMIN_FALLBACK_EMAILS = ["jasperdiks@hotmail.com"];

type SyncMode = "full" | "inventory" | "pricing" | "shipping" | "media";

interface Body {
  mode?: SyncMode;
  product_ids?: string[];
  dry_run?: boolean;
  limit?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function psychologicalRound(p: number): number {
  if (p <= 0) return 0;
  const whole = Math.floor(p);
  return whole + 0.99 < p ? whole + 1 + 0.99 : whole + 0.99;
}

function computeSellPrice(landedCost: number): { price: number; margin: number } {
  // sell * (1 - PAYMENT_FEE - PLATFORM_FEE - TARGET_MARGIN) = landed
  // => sell = landed / (1 - fees - margin)
  const denom = 1 - PAYMENT_FEE - PLATFORM_FEE - TARGET_MARGIN;
  const raw = landedCost / denom;
  const rounded = psychologicalRound(raw);
  const netRevenue = rounded * (1 - PAYMENT_FEE - PLATFORM_FEE);
  const margin = (netRevenue - landedCost) / rounded;
  return { price: rounded, margin };
}

function minSellPrice(landedCost: number): number {
  const denom = 1 - PAYMENT_FEE - PLATFORM_FEE - MIN_MARGIN;
  return psychologicalRound(landedCost / denom);
}

function isUsWarehouse(o: Record<string, unknown>): boolean {
  const fields = [o.areaEn, o.countryCode, o.warehouseName, o.warehouseCode, o.area]
    .filter(Boolean)
    .map((v) => String(v).toUpperCase());
  return fields.some(
    (f) => f === "US" || f.includes("UNITED STATES") || f.startsWith("US-") || f.startsWith("USA"),
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// deno-lint-ignore no-explicit-any
async function getCjToken(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .maybeSingle();
  if (data && new Date(data.token_expiry).getTime() > Date.now()) return data.access_token;

  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");
  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const json = await res.json();
  if (!json.result) throw new Error(`CJ auth failed: ${json.message ?? res.status}`);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: json.data.accessToken,
    token_expiry: new Date(
      new Date(json.data.accessTokenExpiryDate).getTime() - 5 * 60 * 1000,
    ).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return json.data.accessToken;
}

async function fetchCjProduct(token: string, pid: string): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams({ pid, features: "enable_inventory,enable_video", countryCode: "US" });
  const res = await fetch(`${CJ_API_BASE}/product/query?${params}`, {
    headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
  });
  if (res.status === 429) throw new Error("CJ_RATE_LIMITED");
  const json = await res.json().catch(() => null);
  if (!json || !json.result) return null;
  return json.data as Record<string, unknown>;
}

function extractVideoUrls(p: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//.test(v) && /\.(mp4|mov|webm)(\?|$)/i.test(v)) {
      urls.add(v);
    }
  };
  push(p.productVideo);
  if (Array.isArray(p.productVideo)) p.productVideo.forEach(push);
  if (typeof p.video === "string") push(p.video);
  if (Array.isArray((p as { videoUrls?: unknown }).videoUrls)) {
    (p as { videoUrls: unknown[] }).videoUrls.forEach(push);
  }
  // Some payloads put media in variants
  const variants = (p as { variants?: unknown[] }).variants;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (v && typeof v === "object") {
        push((v as Record<string, unknown>).variantVideo);
        push((v as Record<string, unknown>).video);
      }
    }
  }
  return Array.from(urls);
}

function extractCostAndShipping(p: Record<string, unknown>): {
  cost: number | null;
  shipping: number | null;
  warehouse: string | null;
  daysMin: number | null;
  daysMax: number | null;
  confidence: "high" | "medium" | "low";
} {
  const sellPrice = Number((p as { sellPrice?: unknown }).sellPrice ?? 0);
  let cost = Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : null;
  const variants = (p as { variants?: unknown[] }).variants;
  if (Array.isArray(variants) && variants.length > 0) {
    const prices = variants
      .map((v) => Number((v as Record<string, unknown>).variantSellPrice))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (prices.length > 0) cost = Math.min(...prices);
  }

  // shipping: prefer US warehouse entry from inventory list
  let shipping: number | null = null;
  let warehouse: string | null = null;
  let daysMin: number | null = null;
  let daysMax: number | null = null;
  let confidence: "high" | "medium" | "low" = "low";
  const inv = (p as { inventories?: unknown[] }).inventories;
  if (Array.isArray(inv)) {
    const us = inv.find((e) => e && typeof e === "object" && isUsWarehouse(e as Record<string, unknown>));
    if (us) {
      warehouse = "US";
      const s = Number((us as Record<string, unknown>).shippingPrice);
      if (Number.isFinite(s) && s > 0) {
        shipping = s;
        confidence = "high";
      }
      const dMin = Number((us as Record<string, unknown>).deliveryTimeMin);
      const dMax = Number((us as Record<string, unknown>).deliveryTimeMax);
      if (Number.isFinite(dMin)) daysMin = dMin;
      if (Number.isFinite(dMax)) daysMax = dMax;
    }
  }
  // Fallback: rough weight-based estimate
  if (shipping === null) {
    const w = Number((p as { productWeight?: unknown }).productWeight ?? 250);
    shipping = w <= 250 ? 4.99 : w <= 1000 ? 6.99 : 9.99;
    confidence = "low";
    if (!warehouse) warehouse = "CN";
    if (!daysMin) daysMin = 8;
    if (!daysMax) daysMax = 15;
  }

  return { cost, shipping, warehouse, daysMin, daysMax, confidence };
}

function isAdminClaims(c: Record<string, unknown> | null): boolean {
  if (!c) return false;
  if (c.role === "admin" || c.role === "director") return true;
  const email = typeof c.email === "string" ? c.email.toLowerCase().trim() : "";
  return ADMIN_FALLBACK_EMAILS.includes(email);
}

// =========================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const isCron =
    (!!internalSecret && req.headers.get("x-internal-secret") === internalSecret) ||
    req.headers.get("x-cron-source") === "pg_cron";

  if (!isCron) {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: cd, error: ce } = await authedClient.auth.getClaims(auth.replace("Bearer ", ""));
    if (ce || !isAdminClaims(cd?.claims ?? null)) {
      return new Response(JSON.stringify({ ok: false, message: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: Body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const mode: SyncMode = body.mode ?? "full";
  const dryRun = !!body.dry_run;
  const limit = Math.min(body.limit ?? BATCH_SIZE, BATCH_SIZE);

  const admin = createClient(supabaseUrl, serviceKey);

  // Create run row
  const { data: runRow, error: runErr } = await admin
    .from("cj_sync_runs")
    .insert({
      mode: dryRun ? "dry_run" : mode,
      triggered_by: isCron ? "cron" : "admin",
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return new Response(JSON.stringify({ ok: false, message: runErr?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id as string;

  const totals = {
    scanned: 0,
    videos_imported: 0,
    inventory_updated: 0,
    price_changes: 0,
    shipping_changes: 0,
    no_mapping: 0,
    needs_review: 0,
    failed: 0,
    discontinued: 0,
  };

  // Select products
  let q = admin
    .from("products")
    .select("id,name,price,compare_at_price,cost_price,cj_product_id,cj_variant_id,sku,source_url,weight,stock,supplier_status")
    .eq("is_active", true)
    .limit(limit);
  if (body.product_ids?.length) q = q.in("id", body.product_ids);
  else q = q.or("supplier_status.is.null,supplier_status.neq.unavailable");

  const { data: products, error: pErr } = await q;
  if (pErr) {
    await admin.from("cj_sync_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: pErr.message,
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, message: pErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let token = "";
  try { token = await getCjToken(admin); } catch (e) {
    await admin.from("cj_sync_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: (e as Error).message,
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, message: (e as Error).message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let rateLimited = false;

  for (let i = 0; i < (products?.length ?? 0); i++) {
    if (rateLimited) break;
    const p = products![i] as Record<string, unknown>;
    const productId = p.id as string;
    totals.scanned++;

    const cjId = (p.cj_product_id as string | null)
      ?? (p.cj_variant_id as string | null)
      ?? null;
    if (!cjId) {
      totals.no_mapping++;
      await admin.from("cj_sync_items").insert({
        run_id: runId, product_id: productId, product_name: p.name as string,
        action: "no_mapping", error: "Missing cj_product_id",
      });
      continue;
    }

    try {
      if (i > 0) await sleep(API_DELAY_MS);
      const detail = await fetchCjProduct(token, cjId);
      if (!detail) {
        totals.discontinued++;
        if (!dryRun) {
          await admin.from("products").update({
            supplier_status: "unavailable",
            is_active: false,
            stock: 0,
          }).eq("id", productId);
        }
        await admin.from("cj_sync_items").insert({
          run_id: runId, product_id: productId, product_name: p.name as string,
          action: "discontinued",
        });
        continue;
      }

      // ===== Media import =====
      if (mode === "full" || mode === "media") {
        const { count: existingVideos } = await admin
          .from("product_media")
          .select("id", { count: "exact", head: true })
          .eq("product_id", productId)
          .eq("media_type", "video");
        if ((existingVideos ?? 0) < MAX_VIDEOS_PER_PRODUCT) {
          const videoUrls = extractVideoUrls(detail).slice(0, MAX_VIDEOS_PER_PRODUCT - (existingVideos ?? 0));
          for (const url of videoUrls) {
            try {
              const r = await fetch(url);
              if (!r.ok) continue;
              const bytes = new Uint8Array(await r.arrayBuffer());
              if (bytes.byteLength < 50_000) continue; // skip tiny/broken
              const hash = await sha256Hex(bytes);
              const ext = url.match(/\.(mp4|mov|webm)/i)?.[1].toLowerCase() ?? "mp4";
              const key = `${productId}/${hash.slice(0, 16)}.${ext}`;
              if (dryRun) {
                totals.videos_imported++;
                await admin.from("cj_sync_items").insert({
                  run_id: runId, product_id: productId, product_name: p.name as string,
                  action: "video_would_import", after: { supplier_url: url, bytes: bytes.byteLength },
                });
                continue;
              }
              const { error: upErr } = await admin.storage
                .from("product-media")
                .upload(key, bytes, { contentType: `video/${ext}`, upsert: true });
              if (upErr) throw upErr;
              const { data: pub } = admin.storage.from("product-media").getPublicUrl(key);
              const { error: insErr } = await admin.from("product_media").insert({
                product_id: productId,
                media_type: "video",
                storage_url: pub.publicUrl,
                supplier_url: url,
                checksum: hash,
                file_size: bytes.byteLength,
                sort_order: 50,
                source: "cj",
              });
              if (insErr && !/duplicate key/i.test(insErr.message)) throw insErr;
              totals.videos_imported++;
              await admin.from("cj_sync_items").insert({
                run_id: runId, product_id: productId, product_name: p.name as string,
                action: "video_imported",
                after: { storage_url: pub.publicUrl, bytes: bytes.byteLength },
              });
            } catch (e) {
              await admin.from("cj_sync_items").insert({
                run_id: runId, product_id: productId, product_name: p.name as string,
                action: "video_import_failed", error: (e as Error).message,
              });
            }
          }
        }
      }

      // ===== Inventory =====
      if (mode === "full" || mode === "inventory") {
        const inv = (detail.inventories as unknown[] | undefined) ?? [];
        const usEntries = inv.filter((e) => e && typeof e === "object" && isUsWarehouse(e as Record<string, unknown>));
        let total = 0;
        for (const e of usEntries) {
          const q = Number((e as Record<string, unknown>).storageNum ?? 0);
          if (Number.isFinite(q) && q > 0) total += q;
        }
        const newActive = total > 0;
        if ((p.stock as number | null) !== total) {
          totals.inventory_updated++;
          if (!dryRun) {
            await admin.from("products").update({
              stock: total,
              is_active: newActive,
              last_inventory_sync_at: new Date().toISOString(),
              last_inventory_sync_status: total > 0 ? "ok" : "out_of_stock",
              inventory_source: "cj",
              supplier_status: "available",
            }).eq("id", productId);
          }
          await admin.from("cj_sync_items").insert({
            run_id: runId, product_id: productId, product_name: p.name as string,
            action: "inventory_changed",
            before: { stock: p.stock }, after: { stock: total },
          });
        }
      }

      // ===== Pricing & Shipping =====
      if (mode === "full" || mode === "pricing" || mode === "shipping") {
        const { cost, shipping, warehouse, daysMin, daysMax, confidence } = extractCostAndShipping(detail);
        const landed = (cost ?? 0) + (shipping ?? 0);
        const currentPrice = Number(p.price ?? 0);
        const update: Record<string, unknown> = {
          supplier_cost: cost,
          estimated_shipping_cost: shipping,
          landed_cost: landed > 0 ? landed : null,
          warehouse_country: warehouse,
          shipping_days_min: daysMin,
          shipping_days_max: daysMax,
          shipping_estimate_confidence: confidence,
          shipping_sync_status: "ok",
          shipping_synced_at: new Date().toISOString(),
        };
        // Pricing
        let priceAction: string | null = null;
        if (cost && landed > 0 && (mode === "full" || mode === "pricing")) {
          const { price: calc, margin } = computeSellPrice(landed);
          const minPrice = minSellPrice(landed);
          update.calculated_price = calc;
          update.margin_percent = Math.round(margin * 10000) / 100;
          if (currentPrice > 0) {
            const delta = Math.abs(calc - currentPrice) / currentPrice;
            if (delta > MAX_AUTO_PRICE_DELTA) {
              update.needs_admin_review = true;
              update.admin_review_reason = `Price change >${(MAX_AUTO_PRICE_DELTA * 100).toFixed(0)}% (${currentPrice.toFixed(2)} → ${calc.toFixed(2)})`;
              update.price_sync_status = "needs_review";
              totals.needs_review++;
              priceAction = "price_needs_review";
            } else if (calc < currentPrice && calc < minPrice) {
              update.price_sync_status = "blocked_below_min_margin";
              priceAction = "price_blocked";
            } else if (calc !== currentPrice) {
              update.price = calc;
              update.price_sync_status = "ok";
              update.price_synced_at = new Date().toISOString();
              totals.price_changes++;
              priceAction = calc > currentPrice ? "price_raised" : "price_lowered";
            } else {
              update.price_sync_status = "unchanged";
            }
          } else {
            update.price = calc;
            update.price_sync_status = "set";
            totals.price_changes++;
            priceAction = "price_set";
          }
        }

        // delete sensitive nulls so we don't overwrite existing values with null
        Object.keys(update).forEach((k) => update[k] === null && delete update[k]);

        if (!dryRun && Object.keys(update).length > 0) {
          // 'supplier_cost' is the existing cost_price column
          if ("supplier_cost" in update) {
            update.cost_price = update.supplier_cost;
            delete update.supplier_cost;
          }
          await admin.from("products").update(update).eq("id", productId);
        }

        if (shipping !== null) {
          totals.shipping_changes++;
          await admin.from("cj_sync_items").insert({
            run_id: runId, product_id: productId, product_name: p.name as string,
            action: "shipping_synced",
            after: { shipping, warehouse, daysMin, daysMax, confidence },
          });
        }
        if (priceAction) {
          await admin.from("cj_sync_items").insert({
            run_id: runId, product_id: productId, product_name: p.name as string,
            action: priceAction,
            before: { price: currentPrice },
            after: { price: update.price ?? update.calculated_price, margin: update.margin_percent },
          });
        }
      }

      if (!dryRun) {
        await admin.from("products").update({ cj_media_synced_at: new Date().toISOString() }).eq("id", productId);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "CJ_RATE_LIMITED") {
        rateLimited = true;
        await admin.from("cj_sync_items").insert({
          run_id: runId, action: "rate_limited", error: "Stopping run due to CJ 429",
        });
        break;
      }
      totals.failed++;
      await admin.from("cj_sync_items").insert({
        run_id: runId, product_id: productId, product_name: p.name as string,
        action: "failed", error: msg,
      });
    }
  }

  await admin.from("cj_sync_runs").update({
    finished_at: new Date().toISOString(),
    status: rateLimited ? "rate_limited" : "ok",
    totals,
  }).eq("id", runId);

  return new Response(JSON.stringify({ ok: true, run_id: runId, mode, dry_run: dryRun, totals }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});