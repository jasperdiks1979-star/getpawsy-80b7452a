/**
 * CtaAbTestLiftReport — live A/B test scoreboard for the /go CTA experiment.
 *
 * Reads:
 *   - cta_variant_config (the experiment definition: which two variants
 *     compete, when it started, whether it is even on)
 *   - cta_ab_test_results() RPC (impressions/clicks/CTR per variant since
 *     ab_test_started_at, excluding internal traffic)
 *
 * Renders a compact two-column scoreboard with absolute lift in CTR (pp)
 * and relative lift (%) of variant A over variant B. No statistical
 * significance test yet — sample sizes shown so the operator can eyeball
 * confidence.
 *
 * Toggle button flips `ab_test_enabled`. Disabled-state controls are
 * read-only (admin-only writes are enforced by RLS server-side).
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Power, RefreshCw } from 'lucide-react';

type Config = {
  ab_test_enabled: boolean;
  ab_test_variant_a: string | null;
  ab_test_variant_b: string | null;
  ab_test_split_a_pct: number;
  ab_test_started_at: string | null;
};

type ResultRow = { variant: string; impressions: number; clicks: number; ctr_pct: number };

function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}

export function CtaAbTestLiftReport() {
  const [config, setConfig] = useState<Config | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg }, { data: results }] = await Promise.all([
      supabase
        .from('cta_variant_config')
        .select('ab_test_enabled, ab_test_variant_a, ab_test_variant_b, ab_test_split_a_pct, ab_test_started_at')
        .eq('id', 1)
        .maybeSingle(),
      // Cast — RPC type is generated lazily; this returns the SQL function rows.
      supabase.rpc('cta_ab_test_results' as never) as unknown as Promise<{ data: ResultRow[] | null }>,
    ]);
    setConfig((cfg as Config) ?? null);
    setRows(results ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (!config) return;
    setBusy(true);
    const next = !config.ab_test_enabled;
    const patch: Partial<Config> & { ab_test_started_at?: string } = { ab_test_enabled: next };
    // Stamp start time when turning ON for the first time so the results
    // RPC has a clean window boundary.
    if (next && !config.ab_test_started_at) {
      patch.ab_test_started_at = new Date().toISOString();
    }
    await supabase.from('cta_variant_config').update(patch).eq('id', 1);
    setBusy(false);
    await load();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading A/B test status…
        </CardContent>
      </Card>
    );
  }

  if (!config?.ab_test_variant_a || !config?.ab_test_variant_b) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          A/B test variants are not configured. Set <code>ab_test_variant_a</code> and{' '}
          <code>ab_test_variant_b</code> in <code>cta_variant_config</code>.
        </CardContent>
      </Card>
    );
  }

  const aRow = rows.find((r) => r.variant === config.ab_test_variant_a);
  const bRow = rows.find((r) => r.variant === config.ab_test_variant_b);
  const aCtr = aRow?.ctr_pct ?? 0;
  const bCtr = bRow?.ctr_pct ?? 0;
  const absLift = Number((aCtr - bCtr).toFixed(2));
  const relLift = bCtr > 0 ? Number((((aCtr - bCtr) / bCtr) * 100).toFixed(1)) : null;
  const winnerIsA = absLift > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">/go A/B test — lift report</CardTitle>
          <Badge variant={config.ab_test_enabled ? 'default' : 'secondary'}>
            {config.ab_test_enabled ? 'LIVE' : 'PAUSED'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={config.ab_test_enabled ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => void toggle()}
          >
            <Power className="h-4 w-4 mr-1.5" />
            {config.ab_test_enabled ? 'Pause test' : 'Start test'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Split <strong>{config.ab_test_split_a_pct}%</strong> /{' '}
          <strong>{100 - config.ab_test_split_a_pct}%</strong>
          {config.ab_test_started_at && (
            <> · Running since {new Date(config.ab_test_started_at).toLocaleString()}</>
          )}
          {' · Internal/Founder traffic excluded'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'A', variant: config.ab_test_variant_a, row: aRow, isWinner: winnerIsA && config.ab_test_enabled },
            { label: 'B', variant: config.ab_test_variant_b, row: bRow, isWinner: !winnerIsA && config.ab_test_enabled },
          ].map(({ label, variant, row, isWinner }) => (
            <div
              key={variant ?? label}
              className={`rounded-lg border p-3 ${
                isWinner ? 'border-primary bg-primary/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Variant {label}
                </p>
                {isWinner && (
                  <Badge variant="default" className="text-[10px]">Winning</Badge>
                )}
              </div>
              <p className="font-mono text-xs text-foreground/80 mb-2">{variant}</p>
              <p className="text-2xl font-bold text-foreground">{fmtPct(row?.ctr_pct ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">
                {(row?.clicks ?? 0).toLocaleString()} clicks /{' '}
                {(row?.impressions ?? 0).toLocaleString()} impressions
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <p className="font-semibold text-foreground">
            Lift A vs B:{' '}
            <span className={absLift > 0 ? 'text-emerald-600' : absLift < 0 ? 'text-red-600' : ''}>
              {absLift > 0 ? '+' : ''}
              {absLift} pp
            </span>
            {relLift !== null && (
              <span className="text-muted-foreground font-normal">
                {' '}
                ({relLift > 0 ? '+' : ''}
                {relLift}% relative)
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}