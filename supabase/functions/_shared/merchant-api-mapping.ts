// Pure mapping between Content API v2.1 product payload and Merchant API v1
// ProductInput. Import-safe (no Deno globals, no side effects).

import type { ProductInput, Money, ProductInputAttributes } from "./merchant-api.ts";

export type LegacyProduct = Record<string, unknown> & {
  offerId?: string;
  contentLanguage?: string;
  targetCountry?: string;
  channel?: string;
  title?: string;
  description?: string;
  link?: string;
  imageLink?: string;
  additionalImageLinks?: string[];
  availability?: string;
  condition?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  identifierExists?: boolean;
  googleProductCategory?: string | number;
  productType?: string;
  productTypes?: string[];
  price?: { value?: string | number; currency?: string } | Money;
  salePrice?: { value?: string | number; currency?: string } | Money;
  shipping?: Array<Record<string, unknown>>;
  shippingWeight?: { value?: number; unit?: string };
  customLabel0?: string;
  customLabel1?: string;
  customLabel2?: string;
  customLabel3?: string;
  customLabel4?: string;
  adult?: boolean;
  multipack?: number;
  isBundle?: boolean;
  itemGroupId?: string;
};

export type MappingResult = { input: ProductInput; warnings: string[] };

const KNOWN_LEGACY_KEYS = new Set([
  "offerId","contentLanguage","targetCountry","channel","title","description","link",
  "imageLink","additionalImageLinks","availability","condition","brand","gtin","mpn",
  "identifierExists","googleProductCategory","productType","productTypes","price","salePrice",
  "shipping","shippingWeight","shippingLength","shippingWidth","shippingHeight",
  "customLabel0","customLabel1","customLabel2","customLabel3","customLabel4",
  "adult","multipack","isBundle","itemGroupId","ageGroup","color","gender","material",
  "pattern","size","sizeSystem","sizeType","expirationDate","tax","includedDestinations",
  "excludedDestinations",
]);

export function toMoney(v: { value?: string | number; currency?: string } | Money | undefined | null): Money | undefined {
  if (!v) return undefined;
  if ("amountMicros" in v && v.amountMicros !== undefined) {
    return { amountMicros: String(v.amountMicros), currencyCode: (v as Money).currencyCode ?? "USD" };
  }
  const raw = (v as { value?: string | number }).value;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const num = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(num)) return undefined;
  const micros = Math.round(num * 1_000_000);
  return { amountMicros: String(micros), currencyCode: (v as { currency?: string }).currency ?? "USD" };
}

function normProductTypes(p: LegacyProduct): string[] | undefined {
  if (Array.isArray(p.productTypes) && p.productTypes.length) return p.productTypes.map((s) => String(s).trim()).filter(Boolean);
  if (typeof p.productType === "string" && p.productType.trim()) {
    return p.productType.split(">").map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

function normShipping(rows: Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> | undefined {
  if (!rows || !rows.length) return undefined;
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    const price = row.price as { value?: string | number; currency?: string } | Money | undefined;
    if (price) {
      const money = toMoney(price);
      if (money) out.price = money;
    }
    return out;
  });
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v === "") continue;
    out[k] = v;
  }
  return out as T;
}

export function contentV21ToProductInput(p: LegacyProduct): MappingResult {
  const warnings: string[] = [];
  const offerId = p.offerId?.trim();
  const contentLanguage = (p.contentLanguage ?? "en").toLowerCase();
  const feedLabel = (p.targetCountry ?? "US").toUpperCase();

  if (!offerId) throw new Error("mapping_missing_offerId");
  if (!/^[a-zA-Z0-9._~-]{1,50}$/.test(offerId)) warnings.push(`offerId_shape_nonstandard:${offerId.slice(0, 20)}`);
  if (!contentLanguage.match(/^[a-z]{2}(-[a-z]{2,3})?$/)) warnings.push(`contentLanguage_unusual:${contentLanguage}`);
  if (!/^[A-Z]{2,20}$/.test(feedLabel)) warnings.push(`feedLabel_unusual:${feedLabel}`);

  for (const key of Object.keys(p)) {
    if (!KNOWN_LEGACY_KEYS.has(key)) warnings.push(`unknown_legacy_field:${key}`);
  }

  const attributes: ProductInputAttributes = stripUndefined({
    title: p.title,
    description: p.description,
    link: p.link,
    imageLink: p.imageLink,
    additionalImageLinks: Array.isArray(p.additionalImageLinks) && p.additionalImageLinks.length ? p.additionalImageLinks : undefined,
    availability: p.availability,
    condition: p.condition,
    brand: p.brand,
    gtin: p.gtin,
    mpn: p.mpn,
    identifierExists: p.identifierExists,
    googleProductCategory: p.googleProductCategory === undefined ? undefined : String(p.googleProductCategory),
    productTypes: normProductTypes(p),
    price: toMoney(p.price),
    salePrice: toMoney(p.salePrice),
    shipping: normShipping(p.shipping),
    shippingWeight: p.shippingWeight,
    customLabel0: p.customLabel0,
    customLabel1: p.customLabel1,
    customLabel2: p.customLabel2,
    customLabel3: p.customLabel3,
    customLabel4: p.customLabel4,
    adult: p.adult,
    multipack: p.multipack,
    isBundle: p.isBundle,
    itemGroupId: p.itemGroupId,
  });

  return { input: { offerId, contentLanguage, feedLabel, attributes }, warnings };
}

export function productInputToDiffShape(pi: {
  offerId?: string; contentLanguage?: string; feedLabel?: string; attributes?: ProductInputAttributes;
}): Record<string, unknown> {
  const a = pi.attributes ?? {};
  return stripUndefined({
    offerId: pi.offerId,
    contentLanguage: pi.contentLanguage,
    targetCountry: pi.feedLabel,
    title: a.title,
    link: a.link,
    imageLink: a.imageLink,
    availability: a.availability,
    price: a.price,
    salePrice: a.salePrice,
  });
}