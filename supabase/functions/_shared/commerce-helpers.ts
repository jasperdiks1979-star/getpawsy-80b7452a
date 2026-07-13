// Step C commerce helpers — inventory targeting + Shopify GraphQL wrappers.
// READ-ONLY on CJ. Writes to Shopify only via the caller (never in this module).

import { shopifyAdminFetch, getShopifyConfig } from "./shopify-token-provider.ts";
import { getCjAccessToken, resolveCjVariant, type CjBudget } from "./cj-resolver.ts";

export const CANONICAL_LOCATION_ID = "gid://shopify/Location/123641200972";
export const ONLINE_STORE_APP_HANDLE = "online_store";

export function targetFromUs(us: number, storedTarget: number): number {
  let cap = 0;
  if (us <= 5) cap = 0;
  else if (us <= 10) cap = Math.min(1, Math.max(0, Math.floor(us * 0.5) - 5));
  else if (us <= 20) cap = Math.min(5, Math.max(0, Math.floor(us * 0.5) - 5));
  else cap = Math.min(20, Math.max(0, Math.floor(us * 0.5) - 5));
  return Math.max(0, Math.min(storedTarget ?? 0, cap, 20));
}

export async function revalidateCj(sku: string, pid: string, vid: string): Promise<{ ok: boolean; usStock: number; status: string; requests: number; err?: string }> {
  try {
    const { token } = await getCjAccessToken();
    const budget: CjBudget = { reqs: 0, max: 4 };
    const res = await resolveCjVariant(sku, token, budget, { readStock: true, maxPids: 2 });
    if (res.classification === "UPSTREAM_ERROR") return { ok: false, usStock: 0, status: "error", requests: res.requests, err: "cj_upstream" };
    const m = res.exact.find(x => x.pid === pid && x.vid === vid) ?? res.exact[0];
    if (!m || m.pid !== pid || m.vid !== vid) return { ok: false, usStock: 0, status: String(m?.productStatus ?? "unknown"), requests: res.requests, err: "identity_drift" };
    return { ok: true, usStock: res.usStock, status: String(m.productStatus ?? ""), requests: res.requests };
  } catch (e) {
    return { ok: false, usStock: 0, status: "error", requests: 0, err: String((e as Error).message).slice(0, 200) };
  }
}

export async function readInventoryLevel(inventoryItemId: string, locationId: string): Promise<{ available: number | null; onHand: number | null; sku: string | null; tracked: boolean | null }> {
  const q = `query($id: ID!) {
    inventoryItem(id: $id) {
      id sku tracked
      inventoryLevel(locationId: "${locationId}") {
        quantities(names: ["available","on_hand"]) { name quantity }
      }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: inventoryItemId });
  const item = r.data?.inventoryItem;
  if (!item) return { available: null, onHand: null, sku: null, tracked: null };
  const qs: any[] = item.inventoryLevel?.quantities ?? [];
  const av = qs.find(x => x.name === "available")?.quantity ?? null;
  const oh = qs.find(x => x.name === "on_hand")?.quantity ?? null;
  return { available: av, onHand: oh, sku: item.sku ?? null, tracked: !!item.tracked };
}

export async function setOnHand(inventoryItemId: string, locationId: string, target: number, changeFrom: number, reference: string): Promise<{ ok: boolean; userErrors: any[]; errors?: unknown }> {
  const q = `mutation($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      userErrors { field message code }
      inventoryAdjustmentGroup { createdAt reason referenceDocumentUri }
    }
  }`;
  const input = {
    reason: "correction",
    name: "on_hand",
    referenceDocumentUri: reference,
    quantities: [{ inventoryItemId, locationId, quantity: target, changeFromQuantity: changeFrom }],
  };
  const r = await shopifyAdminFetch<any>(q, { input });
  const ue = r.data?.inventorySetQuantities?.userErrors ?? [];
  return { ok: r.status === 200 && ue.length === 0 && !r.errors, userErrors: ue, errors: r.errors };
}

export async function activateProduct(productId: string): Promise<{ ok: boolean; status?: string; userErrors?: any[]; errors?: unknown }> {
  const q = `mutation($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id status }
      userErrors { field message }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { input: { id: productId, status: "ACTIVE" } });
  const ue = r.data?.productUpdate?.userErrors ?? [];
  return { ok: ue.length === 0 && !r.errors, status: r.data?.productUpdate?.product?.status, userErrors: ue, errors: r.errors };
}

export async function getOnlineStorePublicationId(): Promise<string | null> {
  const q = `{ publications(first: 25) { nodes { id name app { handle } } } }`;
  const r = await shopifyAdminFetch<any>(q);
  const nodes: any[] = r.data?.publications?.nodes ?? [];
  const os = nodes.find(n => n.app?.handle === "online_store" || (n.name ?? "").toLowerCase().includes("online store"));
  return os?.id ?? null;
}

export async function publishToOnlineStore(productId: string, publicationId: string): Promise<{ ok: boolean; userErrors?: any[]; errors?: unknown }> {
  const q = `mutation($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: productId, input: [{ publicationId }] });
  const ue = r.data?.publishablePublish?.userErrors ?? [];
  return { ok: ue.length === 0 && !r.errors, userErrors: ue, errors: r.errors };
}

export async function fetchProductBasics(productId: string): Promise<any> {
  const q = `query($id: ID!) {
    product(id: $id) {
      id status handle title onlineStoreUrl
      featuredImage { url }
      variants(first: 50) {
        nodes {
          id sku price availableForSale
          inventoryItem { id tracked }
          inventoryQuantity
        }
      }
    }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: productId });
  return r.data?.product ?? null;
}

export async function storefrontProductCheck(handle: string): Promise<{ reachable: boolean; hasAddToCart: boolean; status: number }> {
  const bases = ["https://getpawsy.com", "https://getpawsy.pet"];
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/products/${handle}`, { redirect: "follow" });
      if (res.status === 200) {
        const html = await res.text();
        const hasCart = /add[-\s]?to[-\s]?cart|form[^>]+action=["'][^"']*\/cart\/add/i.test(html);
        return { reachable: true, hasAddToCart: hasCart, status: res.status };
      }
    } catch { /* try next */ }
  }
  return { reachable: false, hasAddToCart: false, status: 0 };
}

export function reconfigDomain() {
  return getShopifyConfig().domain;
}