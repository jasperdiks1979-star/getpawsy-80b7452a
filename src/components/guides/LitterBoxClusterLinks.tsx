/**
 * LitterBoxClusterLinks — small contextual internal-link block for the
 * litter-box SEO cluster only (collection, two automatic-litter-box guides,
 * best-2026 and Reddit roundups).
 *
 * Product links resolve at runtime from products_public with the same
 * storefront gates as the homepage (active, in stock, not merch-hidden,
 * not blocked, not duplicate), so nothing can point at a dead PDP.
 * Product clicks reuse the existing guide_product_click event.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { trackEvent } from '@/lib/analytics';

export type LitterClusterPage =
  | 'collection'
  | 'automatic-guide'
  | 'training-guide'
  | 'best-2026'
  | 'reddit';

interface ClusterLink { text: string; href: string }

const L = {
  collection: { text: 'Browse our current cat litter boxes', href: '/collections/cat-litter-boxes' },
  automatic: { text: 'Automatic litter box guide', href: '/guides/automatic-litter-box-guide' },
  training: { text: 'How to train your cat to use an automatic litter box', href: '/guides/how-to-train-cat-to-use-automatic-litter-box' },
  best2026: { text: 'Compare current litter box options for 2026', href: '/guides/best-cat-litter-box-2026' },
  reddit: { text: 'Litter boxes cat owners discuss on Reddit', href: '/guides/best-cat-litter-box-2026' },
} satisfies Record<string, ClusterLink>;

/** Links per page. Links already present on a page are intentionally omitted. */
export const LITTER_CLUSTER_CONFIG: Record<LitterClusterPage, { slug: string; links: ClusterLink[]; products: number }> = {
  collection: { slug: 'cat-litter-boxes', links: [L.automatic, L.training, L.best2026], products: 0 },
  // No automatic/self-cleaning litter box is currently live and in stock,
  // so the automatic guides get no product links (never a non-automatic stand-in).
  'automatic-guide': { slug: 'automatic-litter-box-guide', links: [L.collection, L.training], products: 0 },
  'training-guide': { slug: 'how-to-train-cat-to-use-automatic-litter-box', links: [L.collection, L.automatic], products: 0 },
  // best-2026 already links the collection and the Reddit page.
  'best-2026': { slug: 'best-cat-litter-box-2026', links: [L.automatic, L.training], products: 3 },
  // reddit already links best-2026 (breadcrumb, CTA, related list).
  reddit: { slug: 'best-cat-litter-box-reddit', links: [L.collection], products: 2 },
};

export function LitterBoxClusterLinks({ page }: { page: LitterClusterPage }) {
  const cfg = LITTER_CLUSTER_CONFIG[page];

  const { data: products = [] } = useQuery({
    queryKey: ['litter-cluster-products', cfg.products],
    enabled: cfg.products > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('id,name,slug,stock')
        .eq('is_active', true)
        .gt('stock', 0)
        .eq('category', 'Cat Litter Boxes')
        .eq('merch_hidden', false)
        .neq('merch_role', 'blocked')
        .eq('is_duplicate', false)
        .ilike('name', '%litter box%')
        .not('slug', 'is', null)
        .order('stock', { ascending: false })
        .limit(cfg.products);
      if (error) return [];
      return data ?? [];
    },
  });

  const track = (productSlug: string) => {
    try {
      trackEvent('guide_product_click', {
        guide_slug: cfg.slug,
        product_slug: productSlug,
        placement: 'litter_cluster_links',
      });
    } catch { /* never block navigation */ }
  };

  return (
    <nav aria-label="More on litter boxes" className="my-10 rounded-xl border border-border bg-card p-5">
      <p className="text-sm font-semibold text-foreground mb-3">Keep exploring litter boxes</p>
      <ul className="space-y-2">
        {cfg.links.map(l => (
          <li key={l.href}>
            <Link to={l.href} className="text-sm text-primary hover:underline">{l.text} →</Link>
          </li>
        ))}
        {products.map(p => (
          <li key={p.id}>
            <Link
              to={`/products/${p.slug}`}
              onClick={() => track(p.slug as string)}
              className="text-sm text-primary hover:underline line-clamp-1"
            >
              {(p.name ?? '').trim()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
