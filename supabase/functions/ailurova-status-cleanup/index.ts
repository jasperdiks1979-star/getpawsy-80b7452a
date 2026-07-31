// AILUROVA_ONE_PRODUCT_STATUS_CLEANUP
// Sole permitted mutation: productChangeStatus(..., status: DRAFT) on NON-target ACTIVE products.
// No deletes, no inventory/price/media/title/handle/metafield/SKU changes, no publishing.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const REQUIRED_DOMAIN = "ukz3v8-0n.myshopify.com";
const TARGET_GID = "gid://shopify/Product/15889810194764";
const TARGET_TITLE = "Ailurova XL Stainless Steel Enclosed Cat Litter Box";
const TARGET_SKU = "CJFT268927601AZ";
const CONFIRM_PHRASE = "CONFIRM_AILUROVA_ONE_PRODUCT_STATUS_CLEANUP";

const CATALOG_PAGE_QUERY = `
  query Catalog($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        totalInventory
        resourcePublicationsV2(first: 15) { nodes { isPublished publication { id name } } }
      }
    }
  }
`;

const TARGET_QUERY = `
  query Target($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      totalInventory
      variants(first: 25) { nodes { id sku price inventoryQuantity } }
      resourcePublicationsV2(first: 15) { nodes { isPublished publication { id name } } }
    }
  }
`;

const STATUS_MUTATION = `
  mutation Draft($productId: ID!) {
    productChangeStatus(productId: $productId, status: DRAFT) {
      product { id title status }
      userErrors { field message }
    }
  }
`;

type Pub = { isPublished: boolean; publication: { id: string; name: string } };
type Item = {
  id: string; title: string; handle: string; status: string; totalInventory: number | null;
  resourcePublicationsV2: { nodes: Pub[] };
};

async function enumerateCatalog(): Promise<{ items: Item[]; pages: number; completed: boolean; error?: unknown }> {
  const items: Item[] = [];
  let cursor: string | null = null;
  let pages = 0;
  while (true) {
    pages++;
    const r = await shopifyAdminFetch<{ products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Item[] } }>(
      CATALOG_PAGE_QUERY, { cursor },
    );
    if (r.status !== 200 || !r.data?.products) {
      return { items, pages, completed: false, error: (r as any).errors ?? r.status };
    }
    items.push(...r.data.products.nodes);
    if (!r.data.products.pageInfo.hasNextPage) return { items, pages, completed: true };
    cursor = r.data.products.pageInfo.endCursor;
    if (pages > 200) return { items, pages, completed: false, error: "PAGE_LIMIT" };
  }
}

function pubNames(i: Item) {
  return (i.resourcePublicationsV2?.nodes ?? []).filter((p) => p.isPublished).map((p) => p.publication?.name);
}

async function readTarget() {
  const r = await shopifyAdminFetch<{ product: any }>(TARGET_QUERY, { id: TARGET_GID });
  const p = r.data?.product;
  if (!p) return null;
  const v = (p.variants?.nodes ?? []).find((x: any) => x.sku === TARGET_SKU) ?? p.variants?.nodes?.[0] ?? null;
  return {
    id: p.id, title: p.title, handle: p.handle, status: p.status,
    totalInventory: p.totalInventory,
    variantSku: v?.sku ?? null,
    variantPrice: v?.price ?? null,
    variantInventory: v?.inventoryQuantity ?? null,
    skus: (p.variants?.nodes ?? []).map((x: any) => x.sku),
    publications: (p.resourcePublicationsV2?.nodes ?? []).filter((x: any) => x.isPublished).map((x: any) => x.publication?.name),
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ledger = { productChangeStatus: 0, productUpdate: 0, productDelete: 0, inventoryMutations: 0, priceMutations: 0, mediaMutations: 0, publishMutations: 0 };
  try {
    const body = await req.json().catch(() => ({}));
    const mode: "preflight" | "execute" = body?.mode === "execute" ? "execute" : "preflight";
    const confirm = body?.confirm === CONFIRM_PHRASE;
    const batchLimit = Math.max(1, Math.min(250, Number(body?.batchLimit ?? 100)));

    const cfg = getShopifyConfig();
    if (cfg.domain.toLowerCase() !== REQUIRED_DOMAIN) {
      return json({ verdict: "AILUROVA_ONE_PRODUCT_STATUS_CLEANUP_FAIL", reason: "STORE_DOMAIN_MISMATCH", got: cfg.domain, ledger });
    }

    const before = await enumerateCatalog();
    if (!before.completed) {
      return json({ verdict: "AILUROVA_ONE_PRODUCT_STATUS_CLEANUP_FAIL", reason: "CATALOG_PAGINATION_INCOMPLETE", pages: before.pages, gathered: before.items.length, error: before.error, ledger });
    }

    const targetBefore = await readTarget();
    const failures: string[] = [];
    if (!targetBefore) failures.push("TARGET_NOT_FOUND");
    else {
      if (targetBefore.id !== TARGET_GID) failures.push("TARGET_ID_MISMATCH");
      if (targetBefore.title !== TARGET_TITLE) failures.push(`TARGET_TITLE_MISMATCH:${targetBefore.title}`);
      if (!targetBefore.skus.includes(TARGET_SKU)) failures.push(`TARGET_SKU_MISSING:${JSON.stringify(targetBefore.skus)}`);
      if (targetBefore.status !== "ACTIVE") failures.push(`TARGET_STATUS_NOT_ACTIVE:${targetBefore.status}`);
    }
    if (before.items.filter((i) => i.id === TARGET_GID).length !== 1) failures.push("TARGET_NOT_UNIQUE_IN_CATALOG");

    const activeBefore = before.items.filter((i) => i.status === "ACTIVE");
    const targets = activeBefore.filter((i) => i.id !== TARGET_GID);
    if (targets.some((t) => t.id === TARGET_GID)) failures.push("TARGET_IN_MUTATION_SET");

    const publishedNonTarget = before.items
      .filter((i) => i.id !== TARGET_GID && pubNames(i).length > 0)
      .map((i) => ({ id: i.id, title: i.title, status: i.status, publications: pubNames(i) }));

    const preflight = {
      storeDomain: cfg.domain,
      catalogue: { totalProducts: before.items.length, pagesRead: before.pages, activeCount: activeBefore.length, draftCount: before.items.filter((i) => i.status === "DRAFT").length, archivedCount: before.items.filter((i) => i.status === "ARCHIVED").length },
      target: targetBefore,
      mutationTargetCount: targets.length,
      mutationTargets: targets.map((t) => ({ id: t.id, title: t.title, handle: t.handle, status: t.status, totalInventory: t.totalInventory, publications: pubNames(t) })),
      nonTargetPublishedProducts: publishedNonTarget,
    };

    if (failures.length > 0) {
      return json({ verdict: "AILUROVA_ONE_PRODUCT_STATUS_CLEANUP_FAIL", reason: "PRECHECK_FAILED", failures, preflight, ledger });
    }
    if (mode === "preflight" || !confirm) {
      return json({ verdict: "PREFLIGHT_OK_AWAITING_CONFIRMATION", confirmPhrase: CONFIRM_PHRASE, preflight, ledger });
    }

    const results: { id: string; title: string; statusBefore: string; statusAfter: string | null; mutated: boolean; outcome: string; userErrors?: unknown }[] = [];
    let processed = 0, failedCount = 0;
    for (const t of targets) {
      if (t.id === TARGET_GID) { results.push({ id: t.id, title: t.title, statusBefore: t.status, statusAfter: null, mutated: false, outcome: "REFUSED_TARGET_PROTECTED" }); failedCount++; break; }
      if (processed >= batchLimit) break;
      const r = await shopifyAdminFetch<{ productChangeStatus: { product: { id: string; title: string; status: string } | null; userErrors: { field: string[]; message: string }[] } }>(
        STATUS_MUTATION, { productId: t.id },
      );
      ledger.productChangeStatus++;
      processed++;
      const errs = r.data?.productChangeStatus?.userErrors ?? [];
      const p = r.data?.productChangeStatus?.product;
      if (r.status !== 200 || errs.length > 0 || !p || p.id !== t.id || p.status !== "DRAFT") {
        failedCount++;
        results.push({ id: t.id, title: t.title, statusBefore: t.status, statusAfter: p?.status ?? null, mutated: false, outcome: "FAILED", userErrors: errs.length ? errs : { httpStatus: r.status } });
        break;
      }
      results.push({ id: t.id, title: t.title, statusBefore: t.status, statusAfter: p.status, mutated: true, outcome: "SET_TO_DRAFT" });
    }

    const after = await enumerateCatalog();
    if (!after.completed) {
      return json({ verdict: "AILUROVA_ONE_PRODUCT_STATUS_CLEANUP_FAIL", reason: "POST_CATALOG_PAGINATION_INCOMPLETE", results, ledger });
    }
    const targetAfter = await readTarget();
    const activeAfter = after.items.filter((i) => i.status === "ACTIVE");
    const otherActive = activeAfter.filter((i) => i.id !== TARGET_GID).map((i) => ({ id: i.id, title: i.title }));
    const publishedNonTargetAfter = after.items
      .filter((i) => i.id !== TARGET_GID && pubNames(i).length > 0)
      .map((i) => ({ id: i.id, title: i.title, status: i.status, publications: pubNames(i) }));

    const targetIntact = !!targetAfter && targetAfter.status === "ACTIVE" && targetAfter.title === TARGET_TITLE
      && targetAfter.variantSku === TARGET_SKU
      && targetAfter.totalInventory === targetBefore!.totalInventory
      && targetAfter.variantPrice === targetBefore!.variantPrice;
    const noDeletes = after.items.length === before.items.length;
    const pass = failedCount === 0 && activeAfter.length === 1 && activeAfter[0]?.id === TARGET_GID && targetIntact && noDeletes;

    return json({
      verdict: pass ? "AILUROVA_ONE_PRODUCT_STATUS_CLEANUP_PASS" : "AILUROVA_ONE_PRODUCT_STATUS_CLEANUP_FAIL",
      storeDomain: cfg.domain,
      table: results,
      summary: {
        ACTIVE_COUNT_BEFORE: activeBefore.length,
        ACTIVE_COUNT_AFTER: activeAfter.length,
        TARGET_PRODUCT_ACTIVE: targetAfter?.status === "ACTIVE",
        OTHER_ACTIVE_PRODUCTS_REMAINING: otherActive,
        TARGET_INVENTORY_BEFORE: targetBefore!.totalInventory,
        TARGET_INVENTORY_AFTER: targetAfter?.totalInventory ?? null,
        TARGET_PRICE_BEFORE: targetBefore!.variantPrice,
        TARGET_PRICE_AFTER: targetAfter?.variantPrice ?? null,
        PRODUCTS_TOTAL_BEFORE: before.items.length,
        PRODUCTS_TOTAL_AFTER: after.items.length,
        PRODUCTS_DELETED: 0,
        MUTATIONS_TOTAL: ledger.productChangeStatus,
        REMAINING_UNPROCESSED_TARGETS: Math.max(0, targets.length - processed),
      },
      publicationAudit: { nonTargetPublishedBefore: publishedNonTarget, nonTargetPublishedAfter: publishedNonTargetAfter, targetPublications: targetAfter?.publications ?? [] },
      targetBefore, targetAfter,
      ledger,
    });
  } catch (e) {
    return json({ verdict: "AILUROVA_ONE_PRODUCT_STATUS_CLEANUP_FAIL", error: String((e as any)?.message ?? e), ledger }, 500);
  }
});