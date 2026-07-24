// Dynamic full-catalog Online Store publication cleanup for Ailurova.
// Sole permitted mutation: publishableUnpublish against Online Store publication.
// Protected product must never be touched.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const ONLINE_STORE_PUB = "gid://shopify/Publication/355057631564";
const PROTECTED_GID = "gid://shopify/Product/15889810194764";
const PROTECTED_TITLE = "Ailurova XL Stainless Steel Enclosed Cat Litter Box";
const PROTECTED_SKU = "CJFT268927601AZ";
const CONFIRM_PHRASE = "CONFIRM_AILUROVA_PUBLICATION_CLEANUP";

const PUB_QUERY = `query Pub($id: ID!) { publication(id: $id) { id name } }`;

const CATALOG_PAGE_QUERY = `
  query Catalog($cursor: String, $pubId: ID!) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        publishedOnPublication(publicationId: $pubId)
      }
    }
  }
`;

const PROTECTED_QUERY = `
  query Protected($id: ID!, $pubId: ID!) {
    product(id: $id) {
      id
      title
      status
      totalInventory
      variants(first: 5) { nodes { id sku inventoryQuantity inventoryItem { id inventoryLevels(first: 20) { nodes { quantities(names: ["available","on_hand"]) { name quantity } } } } } }
      publishedOnPublication(publicationId: $pubId)
    }
  }
`;

const UNPUBLISH_MUTATION = `
  mutation UnpublishProductFromOnlineStore($productId: ID!, $publicationId: ID!) {
    publishableUnpublish(id: $productId, input: [{ publicationId: $publicationId }]) {
      publishable {
        ... on Product {
          id
          title
          status
          publishedOnPublication(publicationId: $publicationId)
        }
      }
      userErrors { field message }
    }
  }
`;

type CatalogItem = { id: string; title: string; handle: string; status: string; publishedOnPublication: boolean };

async function enumerateCatalog(): Promise<{ items: CatalogItem[]; pages: number; completed: boolean }> {
  const items: CatalogItem[] = [];
  let cursor: string | null = null;
  let pages = 0;
  while (true) {
    pages++;
    const r = await shopifyAdminFetch<{ products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: CatalogItem[] } }>(
      CATALOG_PAGE_QUERY,
      { cursor, pubId: ONLINE_STORE_PUB },
    );
    if (r.status !== 200 || !r.data?.products) {
      return { items, pages, completed: false };
    }
    items.push(...r.data.products.nodes);
    if (!r.data.products.pageInfo.hasNextPage) return { items, pages, completed: true };
    cursor = r.data.products.pageInfo.endCursor;
    if (pages > 200) return { items, pages, completed: false };
  }
}

async function readProtected() {
  const r = await shopifyAdminFetch<{ product: any }>(PROTECTED_QUERY, { id: PROTECTED_GID, pubId: ONLINE_STORE_PUB });
  const p = r.data?.product;
  if (!p) return null;
  const targetVariant = (p.variants?.nodes ?? []).find((v: any) => v.sku === PROTECTED_SKU) ?? p.variants?.nodes?.[0];
  let available = 0, onHand = 0;
  for (const lvl of (targetVariant?.inventoryItem?.inventoryLevels?.nodes ?? [])) {
    for (const q of (lvl.quantities ?? [])) {
      if (q.name === "available") available += q.quantity ?? 0;
      if (q.name === "on_hand") onHand += q.quantity ?? 0;
    }
  }
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    sku: targetVariant?.sku ?? null,
    available,
    onHand,
    publishedOnOnlineStore: !!p.publishedOnPublication,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ledger = {
    publishableUnpublish: 0,
    publishablePublish: 0,
    productUpdate: 0,
    productDelete: 0,
    inventoryMutations: 0,
    variantMutations: 0,
    priceMutations: 0,
    statusMutations: 0,
    collectionMutations: 0,
    metafieldMutations: 0,
    seoMutations: 0,
    mediaMutations: 0,
    themeMutations: 0,
    settingsMutations: 0,
    otherMutations: 0,
  };

  try {
    const body = await req.json().catch(() => ({}));
    const mode: "preflight" | "execute" = body?.mode === "execute" ? "execute" : "preflight";
    const confirm = body?.confirm === CONFIRM_PHRASE;
    const batchLimit: number = Math.max(1, Math.min(200, Number(body?.batchLimit ?? 40)));
    const skipFinalReenum: boolean = body?.skipFinalReenum === true;

    // Publication resolution
    const pubRes = await shopifyAdminFetch<{ publication: { id: string; name: string } | null }>(PUB_QUERY, { id: ONLINE_STORE_PUB });
    const pub = pubRes.data?.publication;
    if (!pub) return json({ verdict: "AILUROVA_PUBLICATION_CLEANUP_PRECHECK_FAILED", reason: "ONLINE_STORE_PUB_NOT_FOUND" });
    const pubNameOk = /online\s*store/i.test(pub.name);
    if (!pubNameOk) return json({ verdict: "AILUROVA_PUBLICATION_CLEANUP_PRECHECK_FAILED", reason: "ONLINE_STORE_PUB_NAME_MISMATCH", got: pub.name });

    // Phase 1: enumerate
    const catalog = await enumerateCatalog();
    if (!catalog.completed) {
      return json({ verdict: "AILUROVA_PUBLICATION_CLEANUP_PRECHECK_FAILED", reason: "CATALOG_PAGINATION_INCOMPLETE", pages: catalog.pages, gathered: catalog.items.length });
    }

    const totalProducts = catalog.items.length;
    const totalActive = catalog.items.filter((p) => p.status === "ACTIVE").length;
    const publishedItems = catalog.items.filter((p) => p.publishedOnPublication);
    const totalPublished = publishedItems.length;
    const protectedPublishedInCatalog = publishedItems.filter((p) => p.id === PROTECTED_GID);
    const nonProtectedPublished = publishedItems.filter((p) => p.id !== PROTECTED_GID);
    const nonProtectedAlreadyHidden = catalog.items.filter((p) => p.id !== PROTECTED_GID && !p.publishedOnPublication).length;

    // Phase 2: protected forensic preflight
    const protectedBefore = await readProtected();
    const precheckFailures: string[] = [];
    if (!protectedBefore) precheckFailures.push("PROTECTED_NOT_FOUND");
    else {
      if (protectedBefore.id !== PROTECTED_GID) precheckFailures.push("PROTECTED_ID_MISMATCH");
      if (protectedBefore.title !== PROTECTED_TITLE) precheckFailures.push(`PROTECTED_TITLE_MISMATCH:${protectedBefore.title}`);
      if (protectedBefore.sku !== PROTECTED_SKU) precheckFailures.push(`PROTECTED_SKU_MISMATCH:${protectedBefore.sku}`);
      if (protectedBefore.status !== "ACTIVE") precheckFailures.push(`PROTECTED_STATUS_NOT_ACTIVE:${protectedBefore.status}`);
      if (protectedBefore.available !== 60) precheckFailures.push(`PROTECTED_AVAILABLE_NOT_60:${protectedBefore.available}`);
      if (protectedBefore.onHand !== 60) precheckFailures.push(`PROTECTED_ONHAND_NOT_60:${protectedBefore.onHand}`);
      if (!protectedBefore.publishedOnOnlineStore) precheckFailures.push("PROTECTED_NOT_PUBLISHED_ON_ONLINE_STORE");
    }
    if (protectedPublishedInCatalog.length !== 1) precheckFailures.push(`PROTECTED_NOT_IN_PUBLISHED_LIST:${protectedPublishedInCatalog.length}`);

    // Target set
    const targets = nonProtectedPublished;
    const targetIds = targets.map((t) => t.id);
    const targetIdSet = new Set(targetIds);
    if (targetIdSet.size !== targetIds.length) precheckFailures.push("DUPLICATE_TARGET_IDS");
    if (targetIdSet.has(PROTECTED_GID)) precheckFailures.push("PROTECTED_IN_TARGET_SET");

    const preflightReport = {
      onlineStorePublication: { id: pub.id, name: pub.name, nameLooksCorrect: pubNameOk },
      catalogue: {
        totalProducts,
        totalActive,
        totalPublishedOnlineStore: totalPublished,
        protectedPublishedCount: protectedPublishedInCatalog.length,
        nonProtectedPublishedCount: nonProtectedPublished.length,
        nonProtectedAlreadyHidden,
        pagesRead: catalog.pages,
      },
      protected: protectedBefore,
      targetCount: targets.length,
      targets: targets.map((t) => ({ id: t.id, title: t.title, status: t.status, publishedOnOnlineStore: t.publishedOnPublication })),
    };

    if (precheckFailures.length > 0) {
      return json({ verdict: "AILUROVA_PUBLICATION_CLEANUP_PRECHECK_FAILED", failures: precheckFailures, preflight: preflightReport, ledger });
    }

    if (mode === "preflight" || !confirm) {
      return json({
        verdict: "PREFLIGHT_OK_AWAITING_CONFIRMATION",
        confirmPhrase: CONFIRM_PHRASE,
        preflight: preflightReport,
        ledger,
      });
    }

    // Phase 4: unpublish sequentially
    const results: { id: string; title: string; outcome: string; errors?: unknown }[] = [];
    let succeeded = 0, alreadyUnpub = 0, failed = 0;

    for (const t of targets) {
      if (t.id === PROTECTED_GID) { failed++; results.push({ id: t.id, title: t.title, outcome: "REFUSED_PROTECTED" }); break; }

      const r = await shopifyAdminFetch<{ publishableUnpublish: { publishable: any; userErrors: { field: string[]; message: string }[] } }>(
        UNPUBLISH_MUTATION,
        { productId: t.id, publicationId: ONLINE_STORE_PUB },
      );
      ledger.publishableUnpublish++;
      const errs = r.data?.publishableUnpublish?.userErrors ?? [];
      const pub2 = r.data?.publishableUnpublish?.publishable;
      if (r.status !== 200 || errs.length > 0 || !pub2 || pub2.id !== t.id || pub2.publishedOnPublication !== false) {
        failed++;
        results.push({ id: t.id, title: t.title, outcome: "FAILED", errors: errs.length ? errs : { status: r.status, publishable: pub2 } });
        break; // stop on first unexplained failure
      }
      succeeded++;
      results.push({ id: t.id, title: t.title, outcome: "UNPUBLISHED" });
      if (succeeded >= batchLimit) break;
    }

    // Phase 5: fresh full catalog read-back (unless deferred to a later call to avoid gateway timeout)
    if (skipFinalReenum) {
      return json({
        verdict: succeeded < targets.length ? "BATCH_PARTIAL_CONTINUE" : "AILUROVA_BATCH_COMPLETE_PENDING_VERIFY",
        onlineStorePublication: { id: pub.id, name: pub.name },
        batch: { batchLimit, processed: results.length, remaining: targets.length - succeeded },
        unpublishResults: {
          attempted: results.length,
          successfullyUnpublished: succeeded,
          failed,
          affected: results,
        },
        ledger,
      });
    }
    const catalog2 = await enumerateCatalog();
    if (!catalog2.completed) {
      return json({ verdict: "AILUROVA_PUBLICATION_CLEANUP_VERIFICATION_FAILED", reason: "POST_CATALOG_PAGINATION_INCOMPLETE", ledger, results });
    }
    const finalPublished = catalog2.items.filter((p) => p.publishedOnPublication);
    const protectedAfter = await readProtected();

    const protectedOk = !!protectedAfter
      && protectedAfter.id === PROTECTED_GID
      && protectedAfter.title === PROTECTED_TITLE
      && protectedAfter.status === "ACTIVE"
      && protectedAfter.sku === PROTECTED_SKU
      && protectedAfter.available === 60
      && protectedAfter.onHand === 60
      && protectedAfter.publishedOnOnlineStore === true;

    const exactlyOne = finalPublished.length === 1 && finalPublished[0].id === PROTECTED_GID;

    let verdict: string;
    if (failed > 0) verdict = "AILUROVA_PUBLICATION_CLEANUP_PARTIAL_FAILURE";
    else if (!exactlyOne || !protectedOk) verdict = "AILUROVA_PUBLICATION_CLEANUP_VERIFICATION_FAILED";
    else verdict = "AILUROVA_EXACTLY_ONE_ONLINE_STORE_PRODUCT";

    return json({
      verdict,
      onlineStorePublication: { id: pub.id, name: pub.name },
      preflight: preflightReport,
      unpublishResults: {
        attempted: targets.length,
        successfullyUnpublished: succeeded,
        alreadyUnpublishedBeforeProcessing: alreadyUnpub,
        failed,
        skipped: targets.length - succeeded - alreadyUnpub - failed,
        affected: results,
      },
      finalPublicationState: {
        totalPublishedOnlineStore: finalPublished.length,
        publishedProducts: finalPublished.map((p) => ({ id: p.id, title: p.title })),
        protectedIsSole: exactlyOne,
      },
      protectedAfter,
      ledger,
      scopeStatement: exactlyOne && protectedOk
        ? "Exactly one product is now published to the Ailurova Online Store: gid://shopify/Product/15889810194764 — Ailurova XL Stainless Steel Enclosed Cat Litter Box."
        : null,
    });
  } catch (e) {
    return json({ verdict: "AILUROVA_PUBLICATION_CLEANUP_PRECHECK_FAILED", error: String((e as any)?.message ?? e), ledger }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}