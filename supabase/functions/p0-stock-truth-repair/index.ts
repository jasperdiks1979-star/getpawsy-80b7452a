// P0 STOCK TRUTH REPAIR — GetPawsy
// Repairs the canonical sellable `stock` column for the mismatch cohort
// (is_active = true AND stock <= 0 AND us_stock > 0) using a FRESH CJ probe.
// Historical us_stock is never trusted as authorization.
//
// Body: { mode: "probe" | "repair", offset?, batch_size?, product_ids?: string[] }
import { sbAdmin, jsonResponse, RECOVERY_CORS, cjToken, CJ_API_BASE } from "../_shared/recovery-engine.ts";

const DELAY_MS = 900;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Probe = {
  status: "ok" | "discontinued" | "not_found" | "error";
  us: number; eu: number; cn: number; other: number;
  message?: string;
};

const EU_CC = ["DE", "GB", "FR", "ES", "IT", "NL", "PL", "CZ", "BE"];

function qtyOf(e: Record<string, unknown>): number {
  const cands = [e.totalInventoryNum, e.cjInventoryNum, e.totalInventory, e.cjInventory, e.storageNum, e.quantity, e.stock];
  let best = 0;
  for (const c of cands) {
    const n = Number(c);
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best;
}

function ccOf(e: Record<string, unknown>): string {
  const cc = String(e.countryCode ?? e.country ?? "").toUpperCase();
  if (cc) return cc;
  const area = String(e.areaEn ?? e.area ?? "").toUpperCase();
  if (area.includes("UNITED STATES") || area.startsWith("US")) return "US";
  if (area.includes("CHINA")) return "CN";
  return "UNKNOWN";
}

async function probeCj(token: string, pid: string): Promise<Probe> {
  const empty = { us: 0, eu: 0, cn: 0, other: 0 };
  try {
    const res = await fetch(`${CJ_API_BASE}/product/stock/getInventoryByPid?pid=${pid}`, {
      headers: { "Content-Type": "application/json", "CJ-Access-Token": token },
    });
    const text = await res.text();
    let json: Record<string, unknown>;
    try { json = JSON.parse(text); } catch { return { ...empty, status: "error", message: `bad json (HTTP ${res.status})` }; }
    const ok = json.result === true || (json as Record<string, unknown>).success === true;
    if (!ok) {
      const msg = String(json.message ?? "");
      if (/removed from shelves|discontinued|off.?shelf/i.test(msg)) return { ...empty, status: "discontinued", message: msg };
      if (/not exist|not found|no data/i.test(msg)) return { ...empty, status: "not_found", message: msg };
      return { ...empty, status: "error", message: msg || `HTTP ${res.status}` };
    }
    const data = json.data as Record<string, unknown> | unknown[] | null;
    const list: Array<Record<string, unknown>> = Array.isArray(data)
      ? data as Array<Record<string, unknown>>
      : ((data as Record<string, unknown>)?.inventories as Array<Record<string, unknown>>) ?? [];
    if (!list.length) return { ...empty, status: "error", message: "empty inventory list" };
    let us = 0, eu = 0, cn = 0, other = 0;
    for (const e of list) {
      const q = qtyOf(e);
      const cc = ccOf(e);
      if (cc === "US") us += q;
      else if (EU_CC.includes(cc)) eu += q;
      else if (cc === "CN") cn += q;
      else other += q;
    }
    return { status: "ok", us, eu, cn, other };
  } catch (e) {
    return { ...empty, status: "error", message: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode === "repair" ? "repair" : "probe";
    const offset: number = Number(body.offset ?? 0);
    const batchSize: number = Number(body.batch_size ?? 10);

    const sb = sbAdmin();
    let q = sb
      .from("products")
      .select("id, name, slug, sku, cj_product_id, cj_variant_id, stock, us_stock, eu_stock, cn_stock, price, image_url, is_active, is_duplicate, canonical_product_id, inventory_manual_block")
      .eq("is_active", true)
      .lte("stock", 0)
      .gt("us_stock", 0)
      .order("us_stock", { ascending: false });
    if (Array.isArray(body.product_ids) && body.product_ids.length) {
      q = sb
        .from("products")
        .select("id, name, slug, sku, cj_product_id, cj_variant_id, stock, us_stock, eu_stock, cn_stock, price, image_url, is_active, is_duplicate, canonical_product_id, inventory_manual_block")
        .in("id", body.product_ids);
    }
    const { data: all, error } = await q;
    if (error) return jsonResponse({ ok: false, error: error.message }, 500);

    const cohort = (all ?? []);
    const batch = cohort.slice(offset, offset + batchSize);
    const token = await cjToken(sb);

    const results: Record<string, unknown>[] = [];
    for (let i = 0; i < batch.length; i++) {
      const p = batch[i] as Record<string, unknown>;
      const pid = p.cj_product_id as string | null;
      const base = {
        id: p.id, slug: p.slug, sku: p.sku, cj_product_id: pid,
        prev_stock: p.stock, prev_us_stock: p.us_stock,
      };

      if (!pid) { results.push({ ...base, classification: "SUPPLIER_UNVERIFIED", reason: "no cj_product_id" }); continue; }
      if (p.is_duplicate === true && p.canonical_product_id) {
        results.push({ ...base, classification: "DUPLICATE_BLOCKED", reason: "suppressed duplicate" }); continue;
      }

      const probe = await probeCj(token, pid);
      if (i < batch.length - 1) await sleep(DELAY_MS);

      if (probe.status === "not_found") { results.push({ ...base, classification: "SUPPLIER_NOT_FOUND", probe }); continue; }
      if (probe.status === "error") { results.push({ ...base, classification: "SUPPLIER_UNVERIFIED", probe }); continue; }
      if (probe.status === "discontinued" || probe.us <= 0) {
        // Fresh truth says no sellable US inventory — align us_stock down, never publish.
        if (mode === "repair") {
          await sb.from("products").update({
            us_stock: 0,
            eu_stock: probe.eu,
            cn_stock: probe.cn,
            stock: 0,
            stock_source: "CJ",
            supplier_status: probe.status === "discontinued" ? "discontinued" : "no_us_stock",
            stock_sync_status: probe.status === "discontinued" ? "discontinued" : "ok",
            stock_sync_error: null,
            last_stock_sync_at: new Date().toISOString(),
            last_inventory_sync_at: new Date().toISOString(),
            last_inventory_sync_status: "out_of_stock",
            inventory_source: "cj",
          }).eq("id", p.id);
        }
        results.push({ ...base, classification: "ZERO_US_STOCK_NOW", probe, applied: mode === "repair" });
        continue;
      }

      // LIVE US STOCK CONFIRMED — product safety check before restoring visibility.
      const unsafe: string[] = [];
      if (p.is_active !== true) unsafe.push("not_active");
      if (p.is_duplicate === true) unsafe.push("duplicate_flag");
      if (!p.price || Number(p.price) <= 0) unsafe.push("invalid_price");
      if (!p.image_url) unsafe.push("no_image");
      if (!p.slug) unsafe.push("no_slug");
      if (p.inventory_manual_block === true) unsafe.push("manual_block");
      if (unsafe.length) {
        results.push({ ...base, classification: "P0_REPAIR_BLOCKED_PRODUCT_STATE", reason: unsafe.join(","), probe });
        continue;
      }

      if (mode === "repair") {
        const { error: upErr } = await sb.from("products").update({
          stock: probe.us,
          us_stock: probe.us,
          eu_stock: probe.eu,
          cn_stock: probe.cn,
          stock_source: "CJ",
          supplier_warehouse: "US",
          supplier_status: "available",
          stock_sync_status: "ok",
          stock_sync_error: null,
          last_stock_sync_at: new Date().toISOString(),
          last_inventory_sync_at: new Date().toISOString(),
          last_inventory_sync_status: "in_stock",
          last_inventory_sync_error: null,
          inventory_source: "cj",
          updated_at: new Date().toISOString(),
        }).eq("id", p.id);
        if (upErr) { results.push({ ...base, classification: "REPAIR_FAILED", error: upErr.message, probe }); continue; }
      }

      results.push({
        ...base,
        classification: "LIVE_US_STOCK_CONFIRMED",
        fresh_us_stock: probe.us,
        final_stock: mode === "repair" ? probe.us : p.stock,
        applied: mode === "repair",
        probe,
      });
    }

    const nextOffset = offset + batch.length;
    const counts: Record<string, number> = {};
    for (const r of results) counts[String(r.classification)] = (counts[String(r.classification)] ?? 0) + 1;

    return jsonResponse({
      ok: true, mode, cohort_size: cohort.length, offset, processed: batch.length,
      next_offset: nextOffset < cohort.length ? nextOffset : null,
      done: nextOffset >= cohort.length, counts, results,
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
