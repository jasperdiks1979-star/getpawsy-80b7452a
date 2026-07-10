// Wave 3 orchestrator — Media, Metafields, Collections & Catalog Certification.
//
// CONTRACT
// - client_credentials auth ONLY (via _shared/shopify-token-provider.ts).
// - Every migrated product stays status = DRAFT. No publishing. No Online Store publications.
// - Idempotent: media/metafield/collection maps upsert by unique keys; re-runs skip completed rows.
// - Every mutation is recorded to shopify_migration_audit_log(wave='W3').
// - Read-only source data: products, product_media, categories, seo_collections.
// - Bounded concurrency = sequential with 120ms pacing.
// - Phases invoked by ?phase=... Chunked with ?limit=N.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const WAVE = "W3";
const PACE_MS = 120;
const OLD_BASE = "https://getpawsy.pet";
const NEW_BASE_PLACEHOLDER = "https://SHOPIFY_STORE"; // storefront host confirmed at cutover

function j(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sb(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function audit(s: SupabaseClient, action: string, entity_type: string, entity_id: string, ok: boolean, req: unknown, resp: unknown, err: string | null, http = 0, dur = 0) {
  await s.from("shopify_migration_audit_log").insert({
    wave: WAVE, action, entity_type, entity_id, actor: "shopify-wave3",
    dry_run: false, request_payload: req, response_payload: resp,
    http_status: http, duration_ms: dur, ok, error: err,
  });
}

// ---------- PHASE 1+2: RECONCILE + REDIRECT PLAN ----------

const PRODUCT_QUERY = /* GraphQL */ `
  query W3Products($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id handle title status vendor productType tags
        descriptionHtml
        seo { title description }
        variants(first: 100) { nodes { id sku price compareAtPrice inventoryPolicy inventoryItem { id tracked measurement { weight { value unit } } } selectedOptions { name value } } }
        media(first: 250) { nodes { ... on MediaImage { id image { url altText } } } }
      }
    }
  }
`;

async function phaseReconcile(s: SupabaseClient, limit: number) {
  // Skip already-reconciled products for idempotent chunked runs.
  const { data: done } = await s.from("shopify_reconciliation").select("source_product_id");
  const doneSet = new Set((done ?? []).map((r) => r.source_product_id));
  const { data: mapped } = await s.from("shopify_id_map")
    .select("source_id, source_handle, shopify_gid")
    .eq("source_type", "product").eq("status", "created")
    .order("last_synced_at", { ascending: true });
  const pending = (mapped ?? []).filter((r) => !doneSet.has(r.source_id));
  const rows = pending.slice(0, limit);
  if (rows.length === 0) return { reconciled: 0, mismatches: 0, remaining: 0 };

  const ids = rows.map((r) => r.shopify_gid);
  const gidBySrc = new Map(rows.map((r) => [r.source_id as string, r.shopify_gid as string]));
  const slugBySrc = new Map(rows.map((r) => [r.source_id as string, r.source_handle as string | null]));

  // Batches of 50 for nodes()
  const shopifyByGid = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await shopifyAdminFetch<{ nodes: any[] }>(PRODUCT_QUERY, { ids: chunk });
    for (const n of res.data?.nodes ?? []) if (n?.id) shopifyByGid.set(n.id, n);
    await sleep(PACE_MS);
  }

  // Load source products in chunks (avoid oversized IN() lists)
  const srcIds = rows.map((r) => r.source_id);
  const srcProducts: any[] = [];
  for (let i = 0; i < srcIds.length; i += 100) {
    const chunk = srcIds.slice(i, i + 100);
    const { data } = await s.from("products")
      .select("id,name,slug,description,brand,product_type,cj_product_id,sku,price,compare_at_price,weight,variants,images,seo_title,seo_meta_description,meta_title,meta_description")
      .in("id", chunk);
    if (data) srcProducts.push(...data);
  }

  let reconciled = 0, mismatchesTotal = 0;
  for (const src of srcProducts) {
    const gid = gidBySrc.get(src.id)!;
    const shop = shopifyByGid.get(gid);
    const mism: Array<{ field: string; source: unknown; shopify: unknown }> = [];
    if (!shop) {
      mism.push({ field: "existence", source: "present", shopify: "missing" });
    } else {
      const cmp = (f: string, a: unknown, b: unknown) => { if ((a ?? "") !== (b ?? "")) mism.push({ field: f, source: a ?? null, shopify: b ?? null }); };
      cmp("title", src.name, shop.title);
      cmp("vendor", src.brand ?? "GetPawsy", shop.vendor);
      cmp("productType", src.product_type ?? "General", shop.productType);
      cmp("status", "DRAFT", shop.status);
      const srcHandle = src.slug;
      if (srcHandle && shop.handle && srcHandle !== shop.handle) mism.push({ field: "handle", source: srcHandle, shopify: shop.handle });
      const srcSeoTitle = src.seo_title ?? src.meta_title ?? null;
      const srcSeoDesc = src.seo_meta_description ?? src.meta_description ?? null;
      if (srcSeoTitle && shop.seo?.title && srcSeoTitle !== shop.seo.title) mism.push({ field: "seo_title", source: srcSeoTitle, shopify: shop.seo.title });
      if (srcSeoDesc && shop.seo?.description && srcSeoDesc !== shop.seo.description) mism.push({ field: "seo_description", source: srcSeoDesc, shopify: shop.seo.description });
      const srcVarCount = Array.isArray(src.variants) && (src.variants as unknown[]).length > 0 ? (src.variants as unknown[]).length : 1;
      const shopVarCount = shop.variants?.nodes?.length ?? 0;
      if (srcVarCount !== shopVarCount) mism.push({ field: "variant_count", source: srcVarCount, shopify: shopVarCount });
    }

    const slug = slugBySrc.get(src.id) ?? src.slug ?? null;
    const actualHandle = shop?.handle ?? null;
    const exact = slug != null && actualHandle != null && slug === actualHandle;
    await s.from("shopify_reconciliation").upsert({
      source_product_id: src.id, shopify_gid: gid, shopify_handle: actualHandle, source_slug: slug,
      status: mism.length === 0 ? "clean" : "mismatch",
      mismatches: mism,
      reconciled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_product_id" });

    await s.from("shopify_redirect_plan").upsert({
      source_product_id: src.id, source_slug: slug,
      intended_handle: slug, actual_handle: actualHandle,
      old_url: slug ? `${OLD_BASE}/products/${slug}` : null,
      new_url: actualHandle ? `${NEW_BASE_PLACEHOLDER}/products/${actualHandle}` : null,
      exact_match: exact, redirect_required: !exact && !!slug && !!actualHandle,
      pinterest_reference_count: 0, // populated separately if pinterest tables available
      updated_at: new Date().toISOString(),
    }, { onConflict: "source_product_id" });

    reconciled++;
    mismatchesTotal += mism.length;
  }
  return { reconciled, mismatches: mismatchesTotal, remaining: pending.length - rows.length };
}

// ---------- PHASE 3: MEDIA PLAN + RUN ----------

async function phasePlanMedia(s: SupabaseClient) {
  const { data: mapped } = await s.from("shopify_id_map")
    .select("source_id, shopify_gid").eq("source_type","product").eq("status","created");
  const rows = mapped ?? [];
  // Skip products that already have any planned media (idempotent chunking).
  const doneSet = new Set<string>();
  for (let off = 0; ; off += 1000) {
    const { data: existing } = await s.from("shopify_media_map").select("source_product_id").range(off, off + 999);
    if (!existing || existing.length === 0) break;
    for (const r of existing) doneSet.add(r.source_product_id as string);
    if (existing.length < 1000) break;
  }
  const pending = rows.filter((r) => !doneSet.has(r.source_id));
  const CHUNK = 100;
  const batch = pending.slice(0, CHUNK);
  const srcIds = batch.map((r) => r.source_id);
  const gidBySrc = new Map(batch.map((r) => [r.source_id as string, r.shopify_gid as string]));
  if (srcIds.length === 0) return { planned: 0, remaining_products: 0 };
  const prods: any[] = [];
  for (let i = 0; i < srcIds.length; i += 100) {
    const { data } = await s.from("products").select("id,name,images,image_alt_text").in("id", srcIds.slice(i, i + 100));
    if (data) prods.push(...data);
  }

  let planned = 0;
  const bulk: any[] = [];
  for (const p of prods) {
    const gid = gidBySrc.get(p.id);
    if (!gid) continue;
    const urls = Array.isArray(p.images) ? (p.images as string[]).filter((u) => typeof u === "string" && /^https:\/\//.test(u)) : [];
    // Dedupe preserving order
    const seen = new Set<string>();
    const dedup: string[] = [];
    for (const u of urls) { if (!seen.has(u)) { seen.add(u); dedup.push(u); } }
    for (let i = 0; i < dedup.length; i++) {
      const url = dedup[i];
      const alt = (p.image_alt_text || `${p.name ?? "Product"} — image ${i + 1}`).slice(0, 512);
      bulk.push({
        source_product_id: p.id, shopify_product_gid: gid,
        source_url: url, sort_order: i, alt_text: alt, status: "pending",
        updated_at: new Date().toISOString(),
      });
      planned++;
    }
  }
  // Bulk upsert in 500-row chunks
  for (let i = 0; i < bulk.length; i += 500) {
    await s.from("shopify_media_map").upsert(bulk.slice(i, i + 500), { onConflict: "source_product_id,source_url" });
  }
  return { planned, remaining_products: Math.max(0, pending.length - batch.length) };
}

const CREATE_MEDIA = /* GraphQL */ `
  mutation W3CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { ... on MediaImage { id status alt image { url } } }
      mediaUserErrors { field message code }
      product { id }
    }
  }
`;

async function phaseRunMedia(s: SupabaseClient, limit: number) {
  const { data: pending } = await s.from("shopify_media_map")
    .select("id, source_product_id, shopify_product_gid, source_url, alt_text, sort_order")
    .eq("status","pending").order("shopify_product_gid").order("sort_order").limit(limit);
  const rows = pending ?? [];
  // Group by product to batch
  const byProduct = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byProduct.get(r.shopify_product_gid) ?? [];
    arr.push(r); byProduct.set(r.shopify_product_gid, arr);
  }

  let uploaded = 0, failed = 0;
  for (const [gid, group] of byProduct) {
    const t0 = Date.now();
    const media = group.map((g) => ({ originalSource: g.source_url, alt: g.alt_text ?? undefined, mediaContentType: "IMAGE" as const }));
    const res = await shopifyAdminFetch<any>(CREATE_MEDIA, { productId: gid, media });
    const errs = res.data?.productCreateMedia?.mediaUserErrors ?? [];
    const created = res.data?.productCreateMedia?.media ?? [];
    if (res.status >= 200 && res.status < 300 && errs.length === 0) {
      // Best-effort match created[] back to input by order (Shopify preserves input order).
      for (let i = 0; i < group.length; i++) {
        const g = group[i]; const m = created[i];
        await s.from("shopify_media_map").update({
          shopify_media_id: m?.id ?? null, status: "created",
          attempts: 1, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null,
        }).eq("id", g.id);
        uploaded++;
      }
      await audit(s, "productCreateMedia", "product", gid, true, { count: media.length }, { created: created.length }, null, res.status, Date.now() - t0);
    } else {
      const errText = JSON.stringify({ status: res.status, errs, gql: (res as any).errors }).slice(0, 3900);
      for (const g of group) {
        await s.from("shopify_media_map").update({
          status: "failed", error: errText, attempts: 1, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", g.id);
        failed++;
      }
      await audit(s, "productCreateMedia", "product", gid, false, { count: media.length }, null, errText, res.status, Date.now() - t0);
    }
    await sleep(PACE_MS);
  }
  return { uploaded, failed, groups: byProduct.size };
}

// ---------- PHASE 4: METAFIELDS ----------

async function phasePlanMetafields(s: SupabaseClient) {
  const { data: mapped } = await s.from("shopify_id_map")
    .select("source_id, source_handle, shopify_gid").eq("source_type","product").eq("status","created");
  const rows = mapped ?? [];
  const srcIds = rows.map((r) => r.source_id);
  const gidBySrc = new Map(rows.map((r) => [r.source_id as string, r.shopify_gid as string]));
  const slugBySrc = new Map(rows.map((r) => [r.source_id as string, r.source_handle as string | null]));

  const prods: any[] = [];
  for (let i = 0; i < srcIds.length; i += 100) {
    const { data } = await s.from("products").select("id,cj_product_id,slug").in("id", srcIds.slice(i, i + 100));
    if (data) prods.push(...data);
  }
  let planned = 0;
  for (const p of prods) {
    const gid = gidBySrc.get(p.id); if (!gid) continue;
    const slug = slugBySrc.get(p.id) ?? p.slug;
    const fields = [
      { ns: "custom", key: "source_product_id", type: "single_line_text_field", value: p.id },
      { ns: "custom", key: "source_slug", type: "single_line_text_field", value: slug ?? "" },
      { ns: "custom", key: "migration_wave", type: "single_line_text_field", value: "W2" },
      slug ? { ns: "custom", key: "original_product_url", type: "url", value: `${OLD_BASE}/products/${slug}` } : null,
      p.cj_product_id ? { ns: "custom", key: "cj_product_id", type: "single_line_text_field", value: p.cj_product_id } : null,
    ].filter(Boolean) as Array<{ ns: string; key: string; type: string; value: string }>;
    for (const f of fields) {
      if (!f.value) continue;
      await s.from("shopify_metafield_map").upsert({
        source_product_id: p.id, shopify_product_gid: gid,
        namespace: f.ns, key: f.key, value_type: f.type, value: f.value, status: "pending",
        updated_at: new Date().toISOString(),
      }, { onConflict: "source_product_id,namespace,key" });
      planned++;
    }
  }
  return { planned };
}

const METAFIELDS_SET = /* GraphQL */ `
  mutation W3Metafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key ownerType }
      userErrors { field message code }
    }
  }
`;

async function phaseRunMetafields(s: SupabaseClient, limit: number) {
  const { data: pending } = await s.from("shopify_metafield_map")
    .select("id, source_product_id, shopify_product_gid, namespace, key, value_type, value")
    .eq("status","pending").limit(limit);
  const rows = pending ?? [];
  let set = 0, failed = 0;
  // Batch up to 25 per call
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const inputs = batch.map((r) => ({
      ownerId: r.shopify_product_gid, namespace: r.namespace, key: r.key, type: r.value_type, value: r.value,
    }));
    const t0 = Date.now();
    const res = await shopifyAdminFetch<any>(METAFIELDS_SET, { metafields: inputs });
    const errs = res.data?.metafieldsSet?.userErrors ?? [];
    const created = res.data?.metafieldsSet?.metafields ?? [];
    if (res.status >= 200 && res.status < 300 && errs.length === 0) {
      for (let k = 0; k < batch.length; k++) {
        const r = batch[k]; const m = created[k];
        await s.from("shopify_metafield_map").update({
          shopify_metafield_id: m?.id ?? null, status: "created", error: null,
          last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", r.id);
        set++;
      }
      await audit(s, "metafieldsSet", "product", batch[0].shopify_product_gid, true, { count: inputs.length }, { created: created.length }, null, res.status, Date.now() - t0);
    } else {
      const errText = JSON.stringify({ status: res.status, errs }).slice(0, 3900);
      for (const r of batch) {
        await s.from("shopify_metafield_map").update({
          status: "failed", error: errText,
          last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", r.id);
        failed++;
      }
      await audit(s, "metafieldsSet", "product", batch[0].shopify_product_gid, false, { count: inputs.length }, null, errText, res.status, Date.now() - t0);
    }
    await sleep(PACE_MS);
  }
  return { set, failed };
}

// ---------- PHASE 5: COLLECTIONS ----------

function handleize(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 255);
}

async function phasePlanCollections(s: SupabaseClient) {
  // From seo_collections + distinct product categories
  const { data: seo } = await s.from("seo_collections").select("*").eq("is_active", true);
  const { data: cats } = await s.from("products").select("category").eq("is_active", true).not("category","is",null);
  const catCounts = new Map<string, number>();
  for (const c of cats ?? []) { if (c.category) catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1); }

  const { data: mapped } = await s.from("shopify_id_map").select("source_id, shopify_gid").eq("source_type","product").eq("status","created");
  const gidBySrc = new Map((mapped ?? []).map((r) => [r.source_id, r.shopify_gid]));

  const { data: prodCats } = await s.from("products").select("id, category").eq("is_active",true);
  const productsByCat = new Map<string, string[]>();
  for (const p of prodCats ?? []) {
    if (!p.category || !gidBySrc.has(p.id)) continue;
    const arr = productsByCat.get(p.category) ?? [];
    arr.push(p.id); productsByCat.set(p.category, arr);
  }

  let planned = 0;
  // seo_collections take priority (curated SEO metadata)
  for (const c of seo ?? []) {
    const filterCat = c.product_category_filter as string | null;
    const members = filterCat ? (productsByCat.get(filterCat) ?? []) : [];
    await s.from("shopify_collection_map").upsert({
      source_type: "seo_collection", source_id: c.id, source_name: c.name,
      handle: c.slug ?? handleize(c.name),
      title: c.name, collection_type: "manual",
      seo_title: c.meta_title, seo_description: c.meta_description,
      membership_count: members.length, member_product_ids: members,
      status: "proposed", updated_at: new Date().toISOString(),
    }, { onConflict: "source_type,source_id" });
    planned++;
  }
  // Category collections not already covered
  const covered = new Set((seo ?? []).map((c) => (c.product_category_filter as string) ?? ""));
  for (const [cat, count] of catCounts) {
    if (covered.has(cat)) continue;
    const members = productsByCat.get(cat) ?? [];
    if (members.length === 0) continue;
    await s.from("shopify_collection_map").upsert({
      source_type: "category", source_id: cat, source_name: cat,
      handle: handleize(cat), title: cat, collection_type: "manual",
      seo_title: `${cat} | GetPawsy`,
      seo_description: `Shop ${cat} at GetPawsy.`.slice(0, 320),
      membership_count: members.length, member_product_ids: members,
      status: "proposed", updated_at: new Date().toISOString(),
    }, { onConflict: "source_type,source_id" });
    planned++;
  }
  return { planned, totalProducts: gidBySrc.size };
}

const COLLECTION_CREATE = /* GraphQL */ `
  mutation W3CollectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id handle title }
      userErrors { field message }
    }
  }
`;

const COLLECTION_ADD_PRODUCTS = /* GraphQL */ `
  mutation W3AddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProductsV2(id: $id, productIds: $productIds) {
      userErrors { field message }
    }
  }
`;

async function phaseRunCollections(s: SupabaseClient, limit: number) {
  const { data: pending } = await s.from("shopify_collection_map")
    .select("id, handle, title, seo_title, seo_description, member_product_ids, source_type, source_id")
    .in("status",["proposed","failed"]).limit(limit);
  const rows = pending ?? [];
  let created = 0, failed = 0;
  for (const r of rows) {
    const gidMap = await s.from("shopify_id_map")
      .select("source_id, shopify_gid").in("source_id", r.member_product_ids ?? []).eq("status","created");
    const productGids = (gidMap.data ?? []).map((x) => x.shopify_gid);
    const t0 = Date.now();
    const input = {
      title: r.title, handle: r.handle,
      seo: { title: r.seo_title ?? r.title, description: r.seo_description ?? r.title },
    };
    const res = await shopifyAdminFetch<any>(COLLECTION_CREATE, { input });
    const errs = res.data?.collectionCreate?.userErrors ?? [];
    if (res.status >= 200 && res.status < 300 && errs.length === 0 && res.data?.collectionCreate?.collection) {
      const cid = res.data.collectionCreate.collection.id;
      // Attach products via v2 mutation in batches of 250
      for (let i = 0; i < productGids.length; i += 250) {
        await shopifyAdminFetch<any>(COLLECTION_ADD_PRODUCTS, { id: cid, productIds: productGids.slice(i, i + 250) });
        await sleep(PACE_MS);
      }
      await s.from("shopify_collection_map").update({
        shopify_collection_gid: cid,
        status: "created", error: null, updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      created++;
      await audit(s, "collectionCreate", "collection", r.handle, true, { title: r.title, members: productGids.length }, { id: cid }, null, res.status, Date.now() - t0);
    } else {
      const errText = JSON.stringify({ status: res.status, errs, gql: (res as any).errors, data: res.data }).slice(0, 3900);
      await s.from("shopify_collection_map").update({
        status: "failed", error: errText, updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      failed++;
      await audit(s, "collectionCreate", "collection", r.handle, false, { title: r.title }, null, errText, res.status, Date.now() - t0);
    }
    await sleep(PACE_MS);
  }
  return { created, failed };
}

// ---------- PHASE 8: CERTIFY DRAFT-ONLY ----------

const CERTIFY_QUERY = /* GraphQL */ `
  query W3Certify($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id status publishedAt }
    }
  }
`;
async function phaseCertify(s: SupabaseClient) {
  let cursor: string | null = null;
  let total = 0, active = 0, published = 0;
  while (true) {
    const res = await shopifyAdminFetch<any>(CERTIFY_QUERY, { first: 250, after: cursor });
    for (const p of res.data?.products?.nodes ?? []) {
      total++;
      if (p.status === "ACTIVE") active++;
      if (p.publishedAt) published++;
    }
    if (!res.data?.products?.pageInfo?.hasNextPage) break;
    cursor = res.data.products.pageInfo.endCursor;
    await sleep(PACE_MS);
  }
  return { total, active, published, draft_only: active === 0 && published === 0 };
}

// ---------- REPORT ----------

async function phaseReport(s: SupabaseClient) {
  const [recon, redirect, media, meta, coll, changed] = await Promise.all([
    s.from("shopify_reconciliation").select("status", { count: "exact" }),
    s.from("shopify_redirect_plan").select("redirect_required", { count: "exact" }),
    s.from("shopify_media_map").select("status", { count: "exact" }),
    s.from("shopify_metafield_map").select("status", { count: "exact" }),
    s.from("shopify_collection_map").select("status", { count: "exact" }),
    s.from("shopify_redirect_plan").select("*").eq("redirect_required", true),
  ]);
  const agg = async (t: string, col: string) => {
    const { data } = await s.from(t).select(col);
    const c = new Map<string, number>();
    for (const r of (data ?? []) as any[]) c.set(r[col], (c.get(r[col]) ?? 0) + 1);
    return Object.fromEntries(c);
  };
  return {
    reconciliation: { total: recon.count, by_status: await agg("shopify_reconciliation","status") },
    redirects: { total: redirect.count, required: (changed.data ?? []).length, changed_handles: changed.data },
    media: { total: media.count, by_status: await agg("shopify_media_map","status") },
    metafields: { total: meta.count, by_status: await agg("shopify_metafield_map","status") },
    collections: { total: coll.count, by_status: await agg("shopify_collection_map","status") },
  };
}

// ---------- HTTP ROUTER ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const phase = url.searchParams.get("phase") ?? "report";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10), 1), 500);
  const s = sb();
  const t0 = Date.now();
  try {
    let out: unknown;
    switch (phase) {
      case "reconcile": out = await phaseReconcile(s, limit); break;
      case "plan_media": out = await phasePlanMedia(s); break;
      case "run_media": out = await phaseRunMedia(s, limit); break;
      case "plan_metafields": out = await phasePlanMetafields(s); break;
      case "run_metafields": out = await phaseRunMetafields(s, limit); break;
      case "plan_collections": out = await phasePlanCollections(s); break;
      case "run_collections": out = await phaseRunCollections(s, limit); break;
      case "certify": out = await phaseCertify(s); break;
      case "report": out = await phaseReport(s); break;
      default: return j(400, { ok: false, error: `unknown phase: ${phase}` });
    }
    return j(200, { ok: true, phase, duration_ms: Date.now() - t0, result: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return j(500, { ok: false, phase, error: msg, duration_ms: Date.now() - t0 });
  }
});