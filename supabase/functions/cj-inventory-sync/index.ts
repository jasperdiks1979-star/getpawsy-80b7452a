// CJ Dropshipping → GetPawsy inventory sync
// Admin-only (JWT) or cron-only (x-internal-secret).
// - Fetches CJ US-warehouse stock for each product.
// - Writes stock, variant_stock, is_active, last_inventory_sync_at,
//   last_inventory_sync_status, last_inventory_sync_error.
// - Honors inventory_manual_block (never auto-reactivate when true).
// - Dry-run mode reports intended changes without writing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const API_DELAY_MS = 15_000;
const MAX_PER_INVOCATION = 50;

const ADMIN_FALLBACK_EMAILS = ["jasperdiks@hotmail.com"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SyncRow {
  id: string;
  name: string;
  stock: number | null;
  is_active: boolean | null;
  cj_product_id: string | null;
  cj_variant_id: string | null;
  sku: string | null;
  source_url: string | null;
  variants: unknown;
  inventory_manual_block: boolean | null;
}

interface ResolvedChange {
  id: string;
  name: string;
  before: number | null;
  after: number | null;
  status: "ok" | "out_of_stock" | "no_mapping" | "discontinued" | "error";
  message?: string;
  variant_stock?: Record<string, number>;
}

// deno-lint-ignore no-explicit-any
async function getAccessToken(supabase: any): Promise<string> {
  const { data: cached } = await supabase
    .from("cj_token_cache")
    .select("access_token, token_expiry")
    .eq("id", "singleton")
    .maybeSingle();

  if (cached && new Date(cached.token_expiry).getTime() > Date.now()) {
    return cached.access_token;
  }

  const apiKey = Deno.env.get("CJ_API_KEY");
  if (!apiKey) throw new Error("CJ_API_KEY not configured");

  const res = await fetch(`${CJ_API_BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!data.result) throw new Error(`CJ auth failed: ${data.message ?? res.status}`);

  const expiry = new Date(data.data.accessTokenExpiryDate);
  await supabase.from("cj_token_cache").upsert({
    id: "singleton",
    access_token: data.data.accessToken,
    token_expiry: new Date(expiry.getTime() - 5 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return data.data.accessToken;
}

function resolveCjId(p: SyncRow): string | null {
  if (p.cj_product_id) return p.cj_product_id;
  if (p.cj_variant_id) return p.cj_variant_id;
  if (p.source_url) {
    const m = p.source_url.match(/\/product\/[^/]*-(\w{8,})\.html/i);
    if (m) return m[1];
  }
  return null;
}

function isUsWarehouse(entry: Record<string, unknown>): boolean {
  const fields = [
    entry.areaEn,
    entry.countryCode,
    entry.warehouseName,
    entry.warehouseCode,
    entry.area,
  ]
    .filter(Boolean)
    .map((v) => String(v).toUpperCase());
  return fields.some(
    (f) =>
      f === "US" ||
      f.includes("UNITED STATES") ||
      f.startsWith("US-") ||
      f.startsWith("USA"),
  );
}

export function computeUsStock(
  inventoryList: Array<Record<string, unknown>>,
): { total: number; perVariant: Record<string, number> } {
  let total = 0;
  const perVariant: Record<string, number> = {};
  for (const entry of inventoryList) {
    if (!isUsWarehouse(entry)) continue;
    const qty = Number(entry.storageNum ?? entry.quantity ?? entry.stock ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    total += qty;
    const variantId = String(entry.vid ?? entry.variantId ?? "default");
    perVariant[variantId] = (perVariant[variantId] ?? 0) + qty;
  }
  return { total, perVariant };
}

interface CjStockOutcome {
  status: ResolvedChange["status"];
  stock: number;
  perVariant: Record<string, number>;
  message?: string;
}

async function fetchCjStock(
  accessToken: string,
  pid: string,
): Promise<CjStockOutcome> {
  const res = await fetch(
    `${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${pid}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": accessToken,
      },
    },
  );
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "error", stock: 0, perVariant: {}, message: "Invalid JSON" };
  }

  if (res.status === 429) {
    return { status: "error", stock: 0, perVariant: {}, message: "Rate limited" };
  }
  const ok = json.result === true || json.success === true;
  if (!ok) {
    const msg = String(json.message ?? "");
    if (/removed from shelves|discontinued/i.test(msg)) {
      return { status: "discontinued", stock: 0, perVariant: {}, message: msg };
    }
    return { status: "error", stock: 0, perVariant: {}, message: msg || `HTTP ${res.status}` };
  }

  // deno-lint-ignore no-explicit-any
  const data = json.data as any;
  const list: Array<Record<string, unknown>> =
    data?.inventories ?? (Array.isArray(data) ? data : []);
  const { total, perVariant } = computeUsStock(list);
  return {
    status: total > 0 ? "ok" : "out_of_stock",
    stock: total,
    perVariant,
    message: total === 0 ? "No US-warehouse stock" : undefined,
  };
}

function isAdminClaims(claims: Record<string, unknown> | null): boolean {
  if (!claims) return false;
  if (claims.role === "admin" || claims.role === "director") return true;
  const email = typeof claims.email === "string" ? claims.email.toLowerCase().trim() : "";
  return ADMIN_FALLBACK_EMAILS.includes(email);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");

  const isCron = !!internalSecret && req.headers.get("x-internal-secret") === internalSecret;

  // Auth: admin JWT OR cron secret
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
    const { data: claimsData, error: claimsErr } = await authedClient.auth.getClaims(
      auth.replace("Bearer ", ""),
    );
    if (claimsErr || !isAdminClaims(claimsData?.claims ?? null)) {
      return new Response(JSON.stringify({ ok: false, message: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: { dry_run?: boolean; product_ids?: string[]; max_age_hours?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }
  const dryRun = body.dry_run !== false; // default true for safety
  const maxAgeHours = body.max_age_hours ?? 12;

  const admin = createClient(supabaseUrl, serviceKey);

  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  let query = admin
    .from("products")
    .select(
      "id,name,stock,is_active,cj_product_id,cj_variant_id,sku,source_url,variants,inventory_manual_block,last_inventory_sync_at",
    )
    .limit(MAX_PER_INVOCATION);

  if (body.product_ids?.length) {
    query = query.in("id", body.product_ids);
  } else {
    // stale or never-synced, oldest first
    query = query
      .or(`last_inventory_sync_at.is.null,last_inventory_sync_at.lt.${cutoff}`)
      .order("last_inventory_sync_at", { ascending: true, nullsFirst: true });
  }

  const { data: products, error: prodErr } = await query;
  if (prodErr) {
    return new Response(JSON.stringify({ ok: false, message: prodErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!products || products.length === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        scanned: 0,
        in_stock: 0,
        out_of_stock: 0,
        no_mapping: 0,
        errors: 0,
        sample: [],
        message: "No stale products to sync",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let accessToken = "";
  try {
    accessToken = await getAccessToken(admin);
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, message: (e as Error).message }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const changes: ResolvedChange[] = [];
  let inStock = 0;
  let outOfStock = 0;
  let noMapping = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i] as SyncRow;
    const cjId = resolveCjId(p);

    if (!cjId) {
      noMapping++;
      changes.push({
        id: p.id,
        name: p.name,
        before: p.stock,
        after: null,
        status: "no_mapping",
        message: "No CJ identifier (cj_product_id / cj_variant_id / source_url)",
      });
      if (!dryRun) {
        await admin
          .from("products")
          .update({
            last_inventory_sync_at: new Date().toISOString(),
            last_inventory_sync_status: "no_mapping",
            last_inventory_sync_error: "No CJ identifier",
            inventory_source: "none",
          })
          .eq("id", p.id);
      }
      continue;
    }

    if (i > 0) await sleep(API_DELAY_MS);

    let outcome: CjStockOutcome;
    try {
      outcome = await fetchCjStock(accessToken, cjId);
    } catch (e) {
      outcome = {
        status: "error",
        stock: 0,
        perVariant: {},
        message: (e as Error).message,
      };
    }

    if (outcome.status === "error") {
      errors++;
      changes.push({
        id: p.id,
        name: p.name,
        before: p.stock,
        after: null,
        status: "error",
        message: outcome.message,
      });
      if (!dryRun) {
        await admin
          .from("products")
          .update({
            last_inventory_sync_at: new Date().toISOString(),
            last_inventory_sync_status: "error",
            last_inventory_sync_error: outcome.message ?? "Unknown error",
            inventory_source: "cj",
          })
          .eq("id", p.id);
      }
      continue;
    }

    const newStock = outcome.stock;
    const blockReactivation = !!p.inventory_manual_block;
    const newActive = newStock > 0 ? !blockReactivation : false;

    if (newStock > 0) inStock++;
    else outOfStock++;

    changes.push({
      id: p.id,
      name: p.name,
      before: p.stock,
      after: newStock,
      status: outcome.status,
      message: outcome.message,
      variant_stock: outcome.perVariant,
    });

    if (!dryRun) {
      await admin
        .from("products")
        .update({
          stock: newStock,
          variant_stock: outcome.perVariant,
          is_active: newActive,
          last_inventory_sync_at: new Date().toISOString(),
          last_inventory_sync_status: outcome.status,
          last_inventory_sync_error: null,
          inventory_source: "cj",
        })
        .eq("id", p.id);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      dry_run: dryRun,
      scanned: products.length,
      in_stock: inStock,
      out_of_stock: outOfStock,
      no_mapping: noMapping,
      errors,
      sample: changes.slice(0, 5),
      changes,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});