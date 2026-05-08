import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, ExternalLink, Search, Download } from 'lucide-react';
import { detectNiche, type NicheKey } from '@/lib/niche-detector';

type Row = {
  id: string;
  name: string | null;
  slug: string | null;
  category: string | null;
  image_url: string | null;
  is_active: boolean | null;
};

export default function PinterestGenericNichePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [counts, setCounts] = useState<Record<NicheKey, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from('products_public')
          .select('id, name, slug, category, image_url, is_active')
          .order('name', { ascending: true })
          .limit(2000);
        if (!includeInactive) q = q.eq('is_active', true);
        const { data, error: e } = await q;
        if (e) throw e;
        if (cancelled) return;
        const all = (data ?? []) as Row[];
        const tally = {} as Record<NicheKey, number>;
        const generic: Row[] = [];
        for (const r of all) {
          const n = detectNiche({ name: r.name, slug: r.slug, category: r.category });
          tally[n] = (tally[n] ?? 0) + 1;
          if (n === 'generic_pet') generic.push(r);
        }
        setRows(generic);
        setCounts(tally);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [includeInactive]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.slug, r.category].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const total = useMemo(
    () => (counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0),
    [counts],
  );
  const genericPct = total > 0 ? Math.round(((counts?.generic_pet ?? 0) / total) * 100) : 0;

  function exportCsv() {
    const header = ['id', 'name', 'slug', 'category', 'is_active'];
    const lines = [header.join(',')];
    for (const r of filtered) {
      lines.push(
        [r.id, r.name ?? '', r.slug ?? '', r.category ?? '', r.is_active ? '1' : '0']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generic-pet-products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-600" /> Generic-pet products
        </h1>
        <p className="text-sm text-muted-foreground">
          Products that the Pinterest niche detector falls back to{' '}
          <code className="font-mono">generic_pet</code> on. These render with the generic Style DNA
          instead of a niche-specific brief — review names/categories or extend the keyword rules in{' '}
          <code className="font-mono">_shared/pinterest-style-dna.ts</code>.
        </p>
      </div>

      {counts && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Catalog niche distribution</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Total scanned: {total}</Badge>
              <Badge
                className={
                  genericPct >= 20
                    ? 'bg-rose-500/15 text-rose-700 border-rose-200'
                    : 'bg-emerald-500/15 text-emerald-700 border-emerald-200'
                }
                variant="outline"
              >
                generic_pet: {counts.generic_pet ?? 0} ({genericPct}%)
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {(Object.entries(counts) as [NicheKey, number][])
                .filter(([k]) => k !== 'generic_pet')
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <Badge key={k} variant="outline" className="font-mono text-[10px]">
                    {k}: {v}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, slug, category…"
            className="pl-8 h-9"
          />
        </div>
        <label className="text-xs flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          include inactive
        </label>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {rows.length} generic_pet products
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning catalog…
        </div>
      )}
      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="text-sm text-rose-700 py-3">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            No products fall into <code className="font-mono">generic_pet</code> — niche coverage is
            clean.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((r) => (
          <Card key={r.id} className="overflow-hidden">
            <div className="flex gap-3 p-3">
              {r.image_url ? (
                <img
                  src={r.image_url}
                  alt=""
                  className="h-20 w-20 object-cover rounded border bg-muted shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-20 w-20 rounded border bg-muted shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm line-clamp-2">{r.name || '(unnamed)'}</div>
                <div className="text-xs text-muted-foreground font-mono line-clamp-1">{r.slug}</div>
                <div className="text-xs text-muted-foreground line-clamp-1">
                  {r.category || '—'}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  {!r.is_active && (
                    <Badge variant="outline" className="text-[10px]">inactive</Badge>
                  )}
                  {r.slug && (
                    <Link
                      to={`/products/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                    >
                      view PDP <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}