import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Gauge } from 'lucide-react';
import { toast } from 'sonner';

type Bucket = 'premium' | 'good' | 'weak' | 'curiosity_only' | 'suspicious';

const TONE: Record<Bucket, string> = {
  premium: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  good: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  weak: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  curiosity_only: 'bg-muted text-muted-foreground',
  suspicious: 'bg-destructive/10 text-destructive',
};

const LABEL: Record<Bucket, string> = {
  premium: 'Premium',
  good: 'Good',
  weak: 'Weak',
  curiosity_only: 'Curiosity only',
  suspicious: 'Suspicious',
};

/**
 * CI-3 — surfaces the `sessions.source_quality` breakdown so admins can see
 * how much truly high-intent traffic is hitting the site vs. drive-by social.
 * Read-only; the bucketing is done by ai-traffic-classify.
 */
export default function SourceQualityCard({ days = 7 }: { days?: number }) {
  const [counts, setCounts] = useState<Record<Bucket, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase
        .from('sessions')
        .select('source_quality')
        .gte('started_at', since)
        .limit(10000);
      const next: Record<Bucket, number> = {
        premium: 0, good: 0, weak: 0, curiosity_only: 0, suspicious: 0,
      };
      for (const r of (data || []) as Array<{ source_quality: string | null }>) {
        const k = (r.source_quality ?? '') as Bucket;
        if (k in next) next[k]++;
      }
      setCounts(next);
    } finally {
      setLoading(false);
    }
  }

  async function reclassify() {
    setReclassifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-traffic-classify', {
        body: { days, limit: 5000, only_unclassified: false },
      });
      if (error) throw error;
      toast.success(`Reclassified ${data?.updated ?? 0} sessions`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'classification failed');
    } finally {
      setReclassifying(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [days]);

  const total = counts
    ? Object.values(counts).reduce((s, n) => s + n, 0)
    : 0;
  const highIntent = counts ? counts.premium + counts.good : 0;
  const highIntentPct = total ? Math.round((highIntent / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Traffic source quality ({days}d)
          </CardTitle>
          <CardDescription>
            {total
              ? `${highIntentPct}% high-intent · ${total.toLocaleString()} sessions scored`
              : 'No scored sessions yet — run a reclassification pass.'}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={reclassify} disabled={reclassifying}>
            {reclassifying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
            Reclassify
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !counts ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(LABEL) as Bucket[]).map((k) => (
              <Badge key={k} className={`${TONE[k]} border-0`}>
                {LABEL[k]}: {counts?.[k] ?? 0}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}