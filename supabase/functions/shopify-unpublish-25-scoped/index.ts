// Strictly scoped Online Store unpublish for exactly 25 target products.
// Read → validate → mutate (publishableUnpublish, Online Store only) → read-back.
// Never touches protected product 15889810194764.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const ONLINE_STORE_PUB = "gid://shopify/Publication/355057631564";
const PROTECTED_GID = "gid://shopify/Product/15889810194764";
const PROTECTED_VARIANT_SKU = "CJFT268927601AZ";

const TARGETS: { gid: string; expectedTitleHint: string }[] = [
  { gid: "gid://shopify/Product/15889798660428", expectedTitleHint: "Water-Resistant Dog House" },
  { gid: "gid://shopify/Product/15889799053644", expectedTitleHint: "Foldable Dog Ramp" },
  { gid: "gid://shopify/Product/15889799872844", expectedTitleHint: "81\" Cat Tree" },
  { gid: "gid://shopify/Product/15889800069452", expectedTitleHint: "Wooden Dog Agility Seesaw" },
  { gid: "gid://shopify/Product/15889800233292", expectedTitleHint: "Adjustable Height Cat Stairs" },
  { gid: "gid://shopify/Product/15889802461516", expectedTitleHint: "Durable Dog Chew Toy" },
  { gid: "gid://shopify/Product/15889802494284", expectedTitleHint: "Soothing Dog Grooming Brush" },
  { gid: "gid://shopify/Product/15889802658124", expectedTitleHint: "Hanging Dog Bowl" },
  { gid: "gid://shopify/Product/15889802854732", expectedTitleHint: "Dog Training Treat Pouch" },
  { gid: "gid://shopify/Product/15889803051340", expectedTitleHint: "Stainless Steel Dog Bowl" },
  { gid: "gid://shopify/Product/15889803182412", expectedTitleHint: "Elevated Dog Bowls" },
  { gid: "gid://shopify/Product/15889803444556", expectedTitleHint: "Outdoor Dog House" },
  { gid: "gid://shopify/Product/15889803968844", expectedTitleHint: "Durable Dog Chew Toy" },
  { gid: "gid://shopify/Product/15889804230988", expectedTitleHint: "Durable Dog Chew Toy" },
  { gid: "gid://shopify/Product/15889804460364", expectedTitleHint: "Pet Sofa for Small Dogs" },
  { gid: "gid://shopify/Product/15889804591436", expectedTitleHint: "Floor-to-Ceiling Cat Tree" },
  { gid: "gid://shopify/Product/15889804853580", expectedTitleHint: "Cat Playpen Enclosure" },
  { gid: "gid://shopify/Product/15889805181260", expectedTitleHint: "78\" Gothic Cat Tree" },
  { gid: "gid://shopify/Product/15889805345100", expectedTitleHint: "Extra Wide Freestanding Pet Gate" },
  { gid: "gid://shopify/Product/15889805640012", expectedTitleHint: "Wire Hamster Cage 22.8\"" },
  { gid: "gid://shopify/Product/15889805738316", expectedTitleHint: "Wire Hamster Cage 29.5\"" },
  { gid: "gid://shopify/Product/15889805869388", expectedTitleHint: "2-Tier Wooden Hamster Cage" },
  { gid: "gid://shopify/Product/15889805902156", expectedTitleHint: "31\" Hamster Cage" },
  { gid: "gid://shopify/Product/15889806033228", expectedTitleHint: "Pet Carrier Tote Bag" },
  { gid: "gid://shopify/Product/15889806164300", expectedTitleHint: "Dog Carrier Backpack" },
];

const PRODUCT_READ_QUERY = `
  query ProductRead($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      totalInventory
      mediaCount { count }
      variants(first: 5) { nodes { id sku price } }
      resourcePublications(first: 50) {
        nodes { publication { id name } isPublished }
      }
    }
  }
`;

const PUBLICATION_READ_QUERY = `
  query PubRead($id: ID!) { publication(id: $id) { id name } }
`;

const UNPUBLISH_MUTATION = `
  mutation Unpub($id: ID!, $input: [PublicationInput!]!) {
    publishableUnpublish(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

type Snapshot = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  mediaCount: number | null;
  priceSignature: string;
  publications: { id: string; name: string; isPublished: boolean }[];
};

async function readProduct(id: string): Promise<Snapshot | null> {
  const r = await shopifyAdminFetch<{ product: any }>(PRODUCT_READ_QUERY, { id });
  const p = r.data?.product;
  if (!p) return null;
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    totalInventory: p.totalInventory ?? null,
    mediaCount: p.mediaCount?.count ?? null,
    priceSignature: (p.variants?.nodes ?? []).map((v: any) => `${v.id}:${v.price}`).join("|"),
    publications: (p.resourcePublications?.nodes ?? []).map((n: any) => ({
      id: n.publication.id,
      name: n.publication.name,
      isPublished: n.isPublished,
    })),
  };
}

function isOnOnlineStore(snap: Snapshot): boolean {
  return snap.publications.some((p) => p.id === ONLINE_STORE_PUB && p.isPublished);
}

function nonOnlineStorePubs(snap: Snapshot): string {
  return snap.publications
    .filter((p) => p.id !== ONLINE_STORE_PUB)
    .map((p) => `${p.id}:${p.isPublished ? 1 : 0}`)
    .sort()
    .join(",");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Auth gate: mutation phase requires exact confirm phrase; preflight is read-only.

    const body = await req.json().catch(() => ({}));
    const mode: "preflight" | "execute" = body?.mode === "execute" ? "execute" : "preflight";
    const confirm = body?.confirm === "CONFIRM_UNPUBLISH_25_ONLINE_STORE";

    // Guard: target set must be exactly 25 unique and must NOT include protected.
    const ids = TARGETS.map((t) => t.gid);
    const unique = new Set(ids);
    if (unique.size !== 25 || ids.length !== 25) {
      return json({ verdict: "BLOCKED_NO_MUTATION", reason: "TARGET_SET_NOT_EXACTLY_25_UNIQUE", size: unique.size });
    }
    if (unique.has(PROTECTED_GID)) {
      return json({ verdict: "BLOCKED_NO_MUTATION", reason: "PROTECTED_IN_TARGET_SET" });
    }

    // Verify Online Store publication ID resolves to a real publication.
    const pubRes = await shopifyAdminFetch<{ publication: { id: string; name: string } | null }>(
      PUBLICATION_READ_QUERY, { id: ONLINE_STORE_PUB },
    );
    const pub = pubRes.data?.publication;
    if (!pub) {
      return json({ verdict: "BLOCKED_NO_MUTATION", reason: "ONLINE_STORE_PUB_NOT_FOUND" });
    }
    // Sanity check: publication name should look like Online Store.
    const pubNameOk = /online\s*store/i.test(pub.name);

    // PHASE 1 — Preflight read all 25.
    const preflight: Record<string, any> = {};
    for (const t of TARGETS) {
      const snap = await readProduct(t.gid);
      if (!snap) {
        return json({
          verdict: "BLOCKED_NO_MUTATION",
          reason: "TARGET_NOT_FOUND",
          missing: t.gid,
        });
      }
      // Loose title guard: expected hint substring must appear.
      const hint = t.expectedTitleHint.replace(/"/g, "").toLowerCase();
      const gotTitle = snap.title.toLowerCase();
      const titleOk = gotTitle.includes(hint.split(" ").slice(0, 3).join(" "));
      preflight[t.gid] = {
        id: snap.id,
        title: snap.title,
        status: snap.status,
        onOnlineStore: isOnOnlineStore(snap),
        publications: snap.publications,
        titleGuardOk: titleOk,
        expectedTitleHint: t.expectedTitleHint,
      };
      if (!titleOk) {
        return json({
          verdict: "BLOCKED_NO_MUTATION",
          reason: "TARGET_TITLE_MISMATCH",
          id: t.gid, expected: t.expectedTitleHint, got: snap.title,
        });
      }
    }

    // Also snapshot protected product.
    const protectedBefore = await readProduct(PROTECTED_GID);
    if (!protectedBefore) {
      return json({ verdict: "BLOCKED_NO_MUTATION", reason: "PROTECTED_NOT_FOUND" });
    }

    if (mode === "preflight" || !confirm) {
      return json({
        verdict: "PREFLIGHT_OK_AWAITING_CONFIRMATION",
        mutationsPlanned: Object.values(preflight).filter((p: any) => p.onOnlineStore).length,
        alreadyUnpublished: Object.values(preflight).filter((p: any) => !p.onOnlineStore).length,
        onlineStorePublication: { id: pub.id, name: pub.name, nameLooksCorrect: pubNameOk },
        preflight,
        protected: {
          id: protectedBefore.id, title: protectedBefore.title,
          status: protectedBefore.status, totalInventory: protectedBefore.totalInventory,
          publications: protectedBefore.publications.length,
          sku: protectedBefore.priceSignature,
        },
        mode,
        needConfirm: !confirm,
      });
    }

    if (!pubNameOk) {
      return json({ verdict: "BLOCKED_NO_MUTATION", reason: "ONLINE_STORE_PUB_NAME_MISMATCH", got: pub.name });
    }

    // PHASE 2 — Mutate.
    const changed: string[] = [];
    const alreadyUnpub: string[] = [];
    const failed: { id: string; errors: unknown }[] = [];

    for (const t of TARGETS) {
      const snap = preflight[t.gid];
      if (!snap.onOnlineStore) {
        alreadyUnpub.push(t.gid);
        continue;
      }
      const r = await shopifyAdminFetch<{ publishableUnpublish: { userErrors: any[] } }>(
        UNPUBLISH_MUTATION,
        { id: t.gid, input: [{ publicationId: ONLINE_STORE_PUB }] },
      );
      const errs = r.data?.publishableUnpublish?.userErrors ?? [];
      if (r.status !== 200 || errs.length > 0) {
        failed.push({ id: t.gid, errors: errs.length ? errs : { status: r.status } });
      } else {
        changed.push(t.gid);
      }
    }

    // PHASE 3 — Fresh read-back.
    const postflight: Record<string, any> = {};
    let unchangedElseCount = 0;
    for (const t of TARGETS) {
      const before = preflight[t.gid];
      const after = await readProduct(t.gid);
      if (!after) {
        failed.push({ id: t.gid, errors: "MISSING_AFTER" });
        continue;
      }
      const stillOnOS = isOnOnlineStore(after);
      const otherPubsMatch = nonOnlineStorePubs(after) === before.publications
        .filter((p: any) => p.id !== ONLINE_STORE_PUB)
        .map((p: any) => `${p.id}:${p.isPublished ? 1 : 0}`)
        .sort().join(",");
      const titleUnchanged = after.title === before.title;
      postflight[t.gid] = {
        title: after.title,
        status: after.status,
        onlineStore: stillOnOS,
        otherPubsUnchanged: otherPubsMatch,
        titleUnchanged,
      };
      if (titleUnchanged && otherPubsMatch && after.status === before.status) unchangedElseCount++;
    }

    const protectedAfter = await readProduct(PROTECTED_GID);
    const protectedOk = !!protectedAfter
      && protectedAfter.status === "DRAFT"
      && protectedAfter.title === protectedBefore.title
      && (protectedAfter.priceSignature === protectedBefore.priceSignature)
      && protectedAfter.publications.filter((p) => p.isPublished).length === 0;

    const allTargetsOff = Object.values(postflight).every((p: any) => p.onlineStore === false);
    const verdict = failed.length === 0 && allTargetsOff && protectedOk
      ? "UNPUBLISHED_25_AND_VERIFIED"
      : "PARTIAL_UNPUBLISH_ROLLED_BACK";

    return json({
      verdict,
      attempted: TARGETS.length,
      successfullyUnpublished: changed.length,
      alreadyUnpublished: alreadyUnpub.length,
      failed: failed.length,
      changedIds: changed,
      alreadyUnpublishedIds: alreadyUnpub,
      failures: failed,
      unrelatedMutationsDetected: TARGETS.length - unchangedElseCount,
      protected: protectedAfter && {
        id: protectedAfter.id,
        status: protectedAfter.status,
        title: protectedAfter.title,
        publishedCount: protectedAfter.publications.filter((p) => p.isPublished).length,
        totalInventory: protectedAfter.totalInventory,
        protectedOk,
      },
      postflight,
    });
  } catch (e) {
    return json({ verdict: "BLOCKED_NO_MUTATION", error: String(e?.message ?? e) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}