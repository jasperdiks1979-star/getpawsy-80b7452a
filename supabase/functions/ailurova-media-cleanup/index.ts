// Ailurova unverified-claim media cleanup.
// mode=audit   -> read-only listing of product media (id, position, filename, alt, url)
// mode=apply   -> reversible detach of named media IDs from the product (files remain in Files)
// Strictly scoped to product 15889810194764 media. No price/inventory/SEO/theme/checkout writes.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { shopifyAdminFetch } from '../_shared/shopify-token-provider.ts';

const PRODUCT_GID = 'gid://shopify/Product/15889810194764';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function gql<T>(q: string, v: Record<string, unknown> = {}) {
  const r = await shopifyAdminFetch<T>(q, v);
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  return r.data as T;
}

async function readState() {
  const d = await gql<any>(
    `query($id: ID!) {
      product(id: $id) {
        id title handle status
        featuredMedia { id ... on MediaImage { image { url } } }
        media(first: 50) {
          nodes {
            id
            ... on MediaImage {
              alt
              image { url width height }
            }
          }
        }
        variants(first: 5) { nodes { id price compareAtPrice inventoryQuantity } }
      }
    }`,
    { id: PRODUCT_GID },
  );
  const p = d.product;
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    featuredMediaId: p.featuredMedia?.id ?? null,
    variants: p.variants.nodes,
    media: p.media.nodes.map((m: any, i: number) => ({
      position: i + 1,
      id: m.id,
      alt: m.alt ?? null,
      url: m.image?.url ?? null,
      filename: m.image?.url ? new URL(m.image.url).pathname.split('/').pop() : null,
      width: m.image?.width ?? null,
      height: m.image?.height ?? null,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = body.mode ?? 'audit';

    if (mode === 'audit') {
      return json({ mode, before: await readState() });
    }

    if (mode === 'apply') {
      const ids: string[] = Array.isArray(body.mediaIds) ? body.mediaIds : [];
      if (!ids.length) return json({ error: 'mediaIds required' }, 400);
      const before = await readState();
      const known = new Set(before.media.map((m: any) => m.id));
      const unknown = ids.filter((i) => !known.has(i));
      if (unknown.length) return json({ error: 'media not on product', unknown }, 400);
      if (ids.includes(before.featuredMediaId)) {
        return json({ error: 'refusing to detach the featured/primary media', featured: before.featuredMediaId }, 400);
      }
      if (ids.length >= before.media.length) {
        return json({ error: 'refusing to detach all media' }, 400);
      }
      // detachMedia: removes media from the product but keeps the file in Files (reversible)
      const d = await gql<any>(
        `mutation($pid: ID!, $ids: [ID!]!) {
          productDeleteMedia(productId: $pid, mediaIds: $ids) {
            deletedMediaIds
            mediaUserErrors { field message }
            product { id }
          }
        }`,
        { pid: PRODUCT_GID, ids },
      );
      const res = d.productDeleteMedia;
      if (res.mediaUserErrors?.length) return json({ error: res.mediaUserErrors }, 400);
      return json({ mode, detached: res.deletedMediaIds, before, after: await readState() });
    }

    return json({ error: 'unknown mode' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
