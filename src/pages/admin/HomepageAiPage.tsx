import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Helmet } from 'react-helmet-async';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

/**
 * /admin/homepage-ai
 *
 * CI-8 — Lightweight admin dashboard for AI Homepage personalization.
 * Reads from `ai_homepage_variant_stats` (aggregated 24h counts) and
 * `ai_homepage_variants` (configuration + lifetime counters).
 *
 * Lazy-loaded by App.tsx so it stays out of the storefront bundle.
 */

type VariantStat = {
  variant_key: string;
  traffic_source: string | null;
  geo_tier: string | null;
  device_quality: string | null;
  emotional_angle: string | null;
  headline: string | null;
  active: boolean;
  performance_score: number;
  impressions_24h: number;
  hero_clicks_24h: number;
  pdp_views_24h: number;
  atc_24h: number;
  purchases_24h: number;
  bounces_24h: number;
};

function pct(num: number, den: number): string {
  if (!den) return '—';
  return `${((num / den) * 100).toFixed(1)}%`;
}

export default function HomepageAiPage() {
  const qc = useQueryClient();

  const { data: stats = [], isLoading } = useQuery({
    queryKey: ['admin-homepage-ai-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_homepage_variant_stats')
        .select('*')
        .order('performance_score', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as VariantStat[];
    },
    staleTime: 60_000,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ variant_key, active }: { variant_key: string; active: boolean }) => {
      const { error } = await supabase
        .from('ai_homepage_variants')
        .update({ active })
        .eq('variant_key', variant_key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-homepage-ai-stats'] });
      toast.success('Variant updated');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Update failed'),
  });

  const rollbackAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('ai_homepage_variants')
        .update({ active: false })
        .neq('variant_key', '');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-homepage-ai-stats'] });
      toast.success('All variants deactivated — storefront is now fully static.');
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Rollback failed'),
  });

  const totals = stats.reduce(
    (acc, r) => {
      acc.impressions += r.impressions_24h;
      acc.clicks += r.hero_clicks_24h;
      acc.atc += r.atc_24h;
      acc.purchases += r.purchases_24h;
      return acc;
    },
    { impressions: 0, clicks: 0, atc: 0, purchases: 0 },
  );

  return (
    <div className="container px-4 md:px-6 py-8 max-w-6xl">
      <Helmet>
        <title>Homepage AI · Admin</title>
      </Helmet>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Homepage AI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live variants powering the personalized homepage. Flip individual variants off,
            or roll back to the fully static homepage instantly.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => rollbackAll.mutate()}
          disabled={rollbackAll.isPending}
        >
          Rollback all
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Impressions (24h)</div>
          <div className="text-2xl font-semibold mt-1">{totals.impressions.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Hero CTR</div>
          <div className="text-2xl font-semibold mt-1">{pct(totals.clicks, totals.impressions)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">ATC rate</div>
          <div className="text-2xl font-semibold mt-1">{pct(totals.atc, totals.impressions)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Purchases (24h)</div>
          <div className="text-2xl font-semibold mt-1">{totals.purchases.toLocaleString()}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Variant</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-left px-3 py-2">Device</th>
                <th className="text-left px-3 py-2">Angle</th>
                <th className="text-right px-3 py-2">Impr</th>
                <th className="text-right px-3 py-2">CTR</th>
                <th className="text-right px-3 py-2">ATC</th>
                <th className="text-right px-3 py-2">Purch</th>
                <th className="text-right px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && stats.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No variants yet — enable the <code>aiHomepage</code> flag and drive traffic.</td></tr>
              )}
              {stats.map((r) => (
                <tr key={r.variant_key} className="border-t border-border/40">
                  <td className="px-3 py-2 font-mono text-xs max-w-[220px] truncate" title={r.variant_key}>
                    {r.variant_key}
                  </td>
                  <td className="px-3 py-2">{r.traffic_source ?? '—'}</td>
                  <td className="px-3 py-2">{r.device_quality ?? '—'}</td>
                  <td className="px-3 py-2">
                    {r.emotional_angle
                      ? <Badge variant="secondary" className="text-[10px]">{r.emotional_angle}</Badge>
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.impressions_24h.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.hero_clicks_24h, r.impressions_24h)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.atc_24h.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.purchases_24h.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">
                    <Switch
                      checked={r.active}
                      onCheckedChange={(v) =>
                        toggleActive.mutate({ variant_key: r.variant_key, active: v })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}