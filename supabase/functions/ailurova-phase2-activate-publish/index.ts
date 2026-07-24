// Phase 2 — Ailurova protected product activate + publish to Online Store only.
// Strict mutation scope: productUpdate(status:ACTIVE) and (conditionally) publishablePublish.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const PROTECTED_GID = "gid://shopify/Product/15889810194764";
const ONLINE_STORE_PUB = "gid://shopify/Publication/355057631564";
const EXPECTED_TITLE = "Ailurova XL Stainless Steel Enclosed Cat Litter Box";
const EXPECTED_SKU = "CJFT268927601AZ";
const EXPECTED_AVAILABLE = 60;
const EXPECTED_ON_HAND = 60;

const UNPUBLISHED_25 = [
  "15889802461516","15889802494284","15889802658124","15889802854732","15889803051340",
  "15889803182412","15889803444556","15889803968844","15889804230988","15889804460364",
  "15889804591436","15889804853580","15889805181260","15889805345100","15889805640012",
  "15889805738316","15889805869388","15889805902156","15889806033228","15889806164300",
  "15889806295372","15889806393676","15889806557516","15889806623052","15889806754124",
].map((n) => `gid://shopify/Product/${n}`);

const READ_PRODUCT = `
query ReadProtected($id: ID!, $pub: ID!) {
  product(id: $id) {
    id
    title
    status
    publishedOnPublication(publicationId: $pub)
    variants(first: 5) {
      nodes {
        id
        sku
        inventoryQuantity
        inventoryItem {
          id
          inventoryLevels(first: 20) {
            nodes {
              location { id name }
              quantities(names: ["available","on_hand"]) { name quantity }
            }
          }
        }
      }
    }
  }
  publication(id: $pub) { id name }
}`;

const READ_PUB_ONLY = `
query PubStatus($id: ID!, $pub: ID!) {
  product(id: $id) { id status publishedOnPublication(publicationId: $pub) }
}`;

const READ_25 = `
query Read25($ids: [ID!]!, $pub: ID!) {
  nodes(ids: $ids) {
    ... on Product { id publishedOnPublication(publicationId: $pub) }
  }
}`;

const PRODUCT_UPDATE = `
mutation ActivateProtected($input: ProductInput!) {
  productUpdate(input: $input) {
    product { id status }
    userErrors { field message }
  }
}`;

const PUBLISH = `
mutation PublishProtectedProduct($productId: ID!, $publicationId: ID!) {
  publishablePublish(id: $productId, input: [{ publicationId: $publicationId }]) {
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
}`;

type Ledger = {
  productUpdate: number;
  publishablePublish: number;
  publishableUnpublish: number;
  inventory_mutations: number;
  variant_mutations: number;
  price_mutations: number;
  product_deletions: number;
  archive_mutations: number;
  collection_mutations: number;
  metafield_mutations: number;
  seo_mutations: number;
  other_mutations: number;
};

function newLedger(): Ledger {
  return {
    productUpdate: 0, publishablePublish: 0, publishableUnpublish: 0,
    inventory_mutations: 0, variant_mutations: 0, price_mutations: 0,
    product_deletions: 0, archive_mutations: 0, collection_mutations: 0,
    metafield_mutations: 0, seo_mutations: 0, other_mutations: 0,
  };
}

function extractInventoryTotals(product: any) {
  const variants = product?.variants?.nodes ?? [];
  let available = 0;
  let on_hand = 0;
  let sku: string | null = null;
  for (const v of variants) {
    if (v.sku === EXPECTED_SKU) sku = v.sku;
    const levels = v?.inventoryItem?.inventoryLevels?.nodes ?? [];
    for (const l of levels) {
      for (const q of (l.quantities ?? [])) {
        if (q.name === "available") available += q.quantity ?? 0;
        if (q.name === "on_hand") on_hand += q.quantity ?? 0;
      }
    }
  }
  if (!sku && variants.length === 1) sku = variants[0].sku ?? null;
  return { available, on_hand, sku };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const mode: "preflight" | "execute" = body?.mode === "execute" ? "execute" : "preflight";
    const confirm = body?.confirm === "CONFIRM_AILUROVA_PHASE2_ACTIVATE_PUBLISH";

    const ledger = newLedger();
    const log: Record<string, unknown> = { mode };

    // STEP 1 — precheck
    const pre = await shopifyAdminFetch<any>(READ_PRODUCT, { id: PROTECTED_GID, pub: ONLINE_STORE_PUB });
    if (pre.status !== 200 || pre.errors) {
      return json({ verdict: "PHASE_2_PRECHECK_FAILED", reason: "read_error", pre, ledger }, 200);
    }
    const p = pre.data?.product;
    const pub = pre.data?.publication;
    const inv = p ? extractInventoryTotals(p) : { available: 0, on_hand: 0, sku: null };
    const precheck = {
      id_ok: p?.id === PROTECTED_GID,
      title_ok: p?.title === EXPECTED_TITLE,
      sku_ok: inv.sku === EXPECTED_SKU,
      status_draft: p?.status === "DRAFT",
      available_ok: inv.available === EXPECTED_AVAILABLE,
      on_hand_ok: inv.on_hand === EXPECTED_ON_HAND,
      published_false: p?.publishedOnPublication === false,
      pub_id_ok: pub?.id === ONLINE_STORE_PUB,
      pub_name_ok: pub?.name === "Online Store",
    };
    log.precheck = { ...precheck, observed: { id: p?.id, title: p?.title, status: p?.status, sku: inv.sku, available: inv.available, on_hand: inv.on_hand, publishedOnPublication: p?.publishedOnPublication, publication: pub } };

    const allOk = Object.values(precheck).every(Boolean);
    if (!allOk) {
      return json({ verdict: "PHASE_2_PRECHECK_FAILED", ledger, log }, 200);
    }

    if (mode !== "execute" || !confirm) {
      return json({ verdict: "PHASE_2_PRECHECK_OK_PREFLIGHT", ledger, log, hint: "POST { mode:'execute', confirm:'CONFIRM_AILUROVA_PHASE2_ACTIVATE_PUBLISH' }" }, 200);
    }

    // STEP 2 — activate
    const upd = await shopifyAdminFetch<any>(PRODUCT_UPDATE, {
      input: { id: PROTECTED_GID, status: "ACTIVE" },
    });
    ledger.productUpdate += 1;
    const uProd = upd.data?.productUpdate?.product;
    const uErrs = upd.data?.productUpdate?.userErrors ?? [];
    log.activation = { status: upd.status, userErrors: uErrs, product: uProd, gqlErrors: upd.errors ?? null };
    if (upd.errors || uErrs.length > 0 || uProd?.id !== PROTECTED_GID || uProd?.status !== "ACTIVE") {
      return json({ verdict: "PHASE_2_ACTIVATION_FAILED", ledger, log }, 200);
    }

    // STEP 3 — read after activation
    const midRead = await shopifyAdminFetch<any>(READ_PRODUCT, { id: PROTECTED_GID, pub: ONLINE_STORE_PUB });
    const midP = midRead.data?.product;
    const midInv = midP ? extractInventoryTotals(midP) : { available: 0, on_hand: 0, sku: null };
    const midOk = midP?.status === "ACTIVE" && midInv.sku === EXPECTED_SKU && midInv.available === EXPECTED_AVAILABLE && midInv.on_hand === EXPECTED_ON_HAND;
    log.post_activation_read = { ok: midOk, status: midP?.status, sku: midInv.sku, available: midInv.available, on_hand: midInv.on_hand, publishedOnPublication: midP?.publishedOnPublication };
    if (!midOk) {
      return json({ verdict: "PHASE_2_FINAL_VERIFICATION_FAILED", stage: "post_activation", ledger, log }, 200);
    }

    let autoPublished = false;
    if (midP?.publishedOnPublication === true) {
      autoPublished = true;
      log.auto_published_after_activation = true;
    } else {
      // STEP 4 — publish
      const pubRes = await shopifyAdminFetch<any>(PUBLISH, { productId: PROTECTED_GID, publicationId: ONLINE_STORE_PUB });
      ledger.publishablePublish += 1;
      const publishable = pubRes.data?.publishablePublish?.publishable;
      const pErrs = pubRes.data?.publishablePublish?.userErrors ?? [];
      log.publish = { status: pubRes.status, userErrors: pErrs, publishable, gqlErrors: pubRes.errors ?? null };
      if (pubRes.errors || pErrs.length > 0 || publishable?.id !== PROTECTED_GID || publishable?.status !== "ACTIVE" || publishable?.publishedOnPublication !== true) {
        return json({ verdict: "PHASE_2_PUBLICATION_FAILED", ledger, log }, 200);
      }
    }

    // STEP 5 — final read-back
    const finalRead = await shopifyAdminFetch<any>(READ_PRODUCT, { id: PROTECTED_GID, pub: ONLINE_STORE_PUB });
    const fP = finalRead.data?.product;
    const fInv = fP ? extractInventoryTotals(fP) : { available: 0, on_hand: 0, sku: null };
    const finalOk =
      fP?.id === PROTECTED_GID &&
      fP?.title === EXPECTED_TITLE &&
      fP?.status === "ACTIVE" &&
      fInv.sku === EXPECTED_SKU &&
      fInv.available === EXPECTED_AVAILABLE &&
      fInv.on_hand === EXPECTED_ON_HAND &&
      fP?.publishedOnPublication === true;
    log.final_read = { ok: finalOk, id: fP?.id, title: fP?.title, status: fP?.status, sku: fInv.sku, available: fInv.available, on_hand: fInv.on_hand, publishedOnPublication: fP?.publishedOnPublication };

    const twentyFive = await shopifyAdminFetch<any>(READ_25, { ids: UNPUBLISHED_25, pub: ONLINE_STORE_PUB });
    const nodes = (twentyFive.data?.nodes ?? []) as Array<{ id: string; publishedOnPublication: boolean } | null>;
    const allHidden = nodes.length === 25 && nodes.every((n) => n && n.publishedOnPublication === false);
    log.unpublished_25_check = { count: nodes.length, all_hidden: allHidden, offenders: nodes.filter((n) => !n || n.publishedOnPublication !== false).map((n) => n?.id) };

    if (!finalOk || !allHidden) {
      return json({ verdict: "PHASE_2_FINAL_VERIFICATION_FAILED", ledger, log }, 200);
    }

    const verdict = autoPublished
      ? "AILUROVA_LITTER_BOX_AUTO_PUBLISHED_AFTER_ACTIVATION"
      : "AILUROVA_LITTER_BOX_ACTIVATED_AND_PUBLISHED";
    return json({ verdict, ledger, log }, 200);
  } catch (e) {
    return json({ verdict: "PHASE_2_FINAL_VERIFICATION_FAILED", error: String(e) }, 200);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
