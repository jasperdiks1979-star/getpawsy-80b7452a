/**
 * /admin/hero-products — Hero Product Intelligence Layer
 *
 * Lets admins tier products (hero / testing / seasonal / low_priority /
 * clearance). Read by recommendation, homepage and creative engines via
 * `src/lib/productPriority.ts`. Pure admin, lazy-loaded, no storefront
 * bundle impact.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  TIER_LABEL,
  TIER_COLOR,
  invalidateProductPriorityCache,
  type ProductTier,
} from '@/lib/productPriority';

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  image: string | null;
}

const TIER_OPTIONS: Array<{ value: ProductTier | 'none'; label: string }> = [
  { value: 'none', label: 'Unassigned' },
  { value: 'hero', label: 'Hero' },
  { value: 'testing', label: 'Testing' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'low_priority', label: 'Low priority' },
  { value: 'clearance', label: 'Clearance' },
];

export default function HeroProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [priorities, setPriorities] = useState<Record<string, ProductTier>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProductTier | 'all' | 'none'>('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [{ data: prodData }, { data: prioData }] = await Promise.all([
        supabase
          .from('products_public')
          .select('id, name, slug, category, image')
          .order('name', { ascending: true })
          .limit(500),
        supabase.from('product_priority').select('product_id, tier'),
      ]);
      if (cancel) return;
      setProducts((prodData ?? []) as ProductRow[]);
      const map: Record<string, ProductTier> = {};
      for (const r of (prioData ?? []) as Array<{ product_id: string; tier: ProductTier }>) {
        map[r.product_id] = r.tier;
      }
      setPriorities(map);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.slug ?? '').toLowerCase().includes(q)) {
        return false;
      }
      const t = priorities[p.id];
      if (filter === 'all') return true;
      if (filter === 'none') return !t;
      return t === filter;
    });
  }, [products, query, filter, priorities]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { hero: 0, testing: 0, seasonal: 0, low_priority: 0, clearance: 0, none: 0 };
    for (const p of products) {
      const t = priorities[p.id];
      if (t) c[t] = (c[t] ?? 0) + 1;
      else c.none += 1;
    }
    return c;
  }, [products, priorities]);

  async function setTier(productId: string, tier: ProductTier | 'none') {
    setSavingId(productId);
    try {
      if (tier === 'none') {
        const { error } = await supabase
          .from('product_priority')
          .delete()
          .eq('product_id', productId);
        if (error) throw error;
        setPriorities((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('product_priority')
          .upsert(
            { product_id: productId, tier, updated_by: u?.user?.id ?? null, updated_at: new Date().toISOString() },
            { onConflict: 'product_id' },
          );
        if (error) throw error;
        setPriorities((prev) => ({ ...prev, [productId]: tier }));
      }
      invalidateProductPriorityCache();
      toast.success('Priority updated');
    } catch (e) {
      toast.error('Failed to update priority', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Helmet>
        <title>Hero Products · Admin · GetPawsy</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header>
        <h1 className="text-2xl font-bold">Hero Products</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tier products for merchandising, recommendation, creative and SEO weighting. Hero products receive priority across the entire AI stack. Changes apply within ~60 seconds via cache.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(['all', 'hero', 'testing', 'seasonal', 'low_priority', 'clearance', 'none'] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? 'default' : 'outline'}
            onClick={() => setFilter(k as ProductTier | 'all' | 'none')}
          >
            {k === 'all' ? `All (${products.length})` : `${k === 'none' ? 'Unassigned' : TIER_LABEL[k as ProductTier]} (${counts[k] ?? 0})`}
          </Button>
        ))}
      </div>

      <Input
        placeholder="Search products by name or slug"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading products…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Product</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Tier</th>
                <th className="text-left p-3">Set</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const t = priorities[p.id];
                return (
                  <tr key={p.id} className="border-t border-border/50">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {p.image && (
                          <img
                            src={p.image}
                            alt=""
                            className="w-10 h-10 rounded-md object-cover bg-muted"
                            loading="lazy"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate max-w-[26rem]">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[26rem]">{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{p.category ?? '—'}</td>
                    <td className="p-3">
                      {t ? (
                        <Badge className={TIER_COLOR[t]}>{TIER_LABEL[t]}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {TIER_OPTIONS.map((opt) => (
                          <Button
                            key={opt.value}
                            size="sm"
                            variant={t === opt.value || (!t && opt.value === 'none') ? 'default' : 'outline'}
                            disabled={savingId === p.id}
                            onClick={() => setTier(p.id, opt.value)}
                            className="h-7 px-2 text-xs"
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    No products match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}