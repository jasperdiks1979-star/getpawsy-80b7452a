import { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, RefreshCw, Gauge, ArrowLeft, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const SETTING_KEY = 'crawler_visit_sample_rate';

type Probe = {
  ok: boolean;
  effectiveSampleRate: number;
  cachedBefore: number | null;
  cachedAgeMs: number | null;
  cacheTtlMs: number;
  forcedRefresh: boolean;
  ts: string;
};

function clampRate(v: number): number {
  if (!Number.isFinite(v)) return 1;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return Math.round(v * 1000) / 1000;
}

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatAge(ms: number | null): string {
  if (ms === null) return 'cold (no cache yet)';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s old`;
  return `${Math.floor(s / 60)}m ${s % 60}s old`;
}

export default function CrawlerSampleRatePage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<number>(1);
  const [text, setText] = useState<string>('1');

  const { data: setting, isLoading } = useQuery({
    queryKey: ['site-settings', SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('key,value,updated_at,description')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Initialize draft once we have data.
  useEffect(() => {
    if (setting?.value !== undefined && setting?.value !== null) {
      const n = clampRate(Number(setting.value));
      setDraft(n);
      setText(String(n));
    }
  }, [setting?.value]);

  const probeQuery = useQuery({
    queryKey: ['crawler-sample-rate-probe'],
    queryFn: async (): Promise<Probe> => {
      const { data, error } = await supabase.functions.invoke('log-crawler-visit', {
        method: 'GET',
      } as never);
      // The supabase client doesn't pass query params on invoke easily, so
      // fall back to a direct fetch with the anon key.
      if (!error && data?.ok) return data as Probe;
      throw error ?? new Error('Probe failed');
    },
    enabled: false, // we trigger manually via fetch helper below
    retry: false,
  });

  // Direct fetch helper so we can pass `?probe=sample-rate&refresh=1`.
  const fetchProbe = async (refresh: boolean): Promise<Probe> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const url = new URL(`${supabaseUrl}/functions/v1/log-crawler-visit`);
    url.searchParams.set('probe', 'sample-rate');
    if (refresh) url.searchParams.set('refresh', '1');
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!res.ok) throw new Error(`Probe HTTP ${res.status}`);
    return (await res.json()) as Probe;
  };

  const [probe, setProbe] = useState<Probe | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const runProbe = async (refresh: boolean) => {
    setProbing(true);
    setProbeError(null);
    try {
      const p = await fetchProbe(refresh);
      setProbe(p);
    } catch (e) {
      setProbeError(e instanceof Error ? e.message : String(e));
    } finally {
      setProbing(false);
    }
  };

  // Auto-probe on first mount and when value changes.
  useEffect(() => {
    void runProbe(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (newRate: number) => {
      const value = String(clampRate(newRate));
      // Try update first; fall back to insert if row doesn't exist.
      const { data: existing, error: selErr } = await supabase
        .from('site_settings')
        .select('key')
        .eq('key', SETTING_KEY)
        .maybeSingle();
      if (selErr) throw selErr;
      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ value })
          .eq('key', SETTING_KEY);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('site_settings').insert({
          key: SETTING_KEY,
          value,
          description: 'Probability (0–1) of persisting non-priority crawler visits.',
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['site-settings', SETTING_KEY] });
      toast({
        title: 'Sample rate saved',
        description: 'Forcing edge cache refresh and re-probing…',
      });
      // Bypass the 60s cache so the change is visible immediately.
      await runProbe(true);
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to save sample rate',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const persistedRate = useMemo(() => {
    if (setting?.value === undefined || setting?.value === null) return null;
    return clampRate(Number(setting.value));
  }, [setting?.value]);

  const draftDiffersFromPersisted =
    persistedRate === null ? true : Math.abs(draft - persistedRate) > 0.0005;

  const probeDiffersFromPersisted =
    probe && persistedRate !== null
      ? Math.abs(probe.effectiveSampleRate - persistedRate) > 0.0005
      : false;

  const handleSliderChange = (vals: number[]) => {
    const v = clampRate(vals[0] ?? 0);
    setDraft(v);
    setText(String(v));
  };

  const handleTextChange = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (Number.isFinite(n)) setDraft(clampRate(n));
  };

  const handleSave = () => {
    if (!Number.isFinite(draft) || draft < 0 || draft > 1) {
      toast({
        title: 'Invalid value',
        description: 'Sample rate must be between 0 and 1.',
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate(draft);
  };

  return (
    <>
      <Helmet>
        <title>Crawler Sample Rate | Admin</title>
      </Helmet>
      <div className="container max-w-3xl py-8 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to admin
            </Link>
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" />
            Crawler Visit Sample Rate
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controls the probability that a non-priority crawler ping is persisted
            to <code className="text-xs bg-muted px-1 rounded">crawler_visits</code>.
            Render-trace, verified Googlebot, spoofed-UA, and appeal-page pings are
            always logged regardless of this setting.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sample rate (0 – 1)</CardTitle>
            <CardDescription>
              {isLoading ? (
                'Loading current value…'
              ) : persistedRate === null ? (
                'No value stored yet — defaults to 1.0 (log everything).'
              ) : (
                <>
                  Currently stored: <strong>{persistedRate.toFixed(3)}</strong>{' '}
                  ({formatPercent(persistedRate)})
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="rate-slider">Slider</Label>
                <Badge variant="secondary" className="font-mono">
                  {draft.toFixed(3)} · {formatPercent(draft)}
                </Badge>
              </div>
              <Slider
                id="rate-slider"
                min={0}
                max={1}
                step={0.01}
                value={[draft]}
                onValueChange={handleSliderChange}
                disabled={isLoading || saveMutation.isPending}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0 (drop all)</span>
                <span>0.5</span>
                <span>1 (log all)</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-text">Exact value</Label>
              <div className="flex gap-2">
                <Input
                  id="rate-text"
                  type="number"
                  min={0}
                  max={1}
                  step={0.001}
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  disabled={isLoading || saveMutation.isPending}
                  className="font-mono"
                />
                <Button
                  onClick={handleSave}
                  disabled={
                    isLoading ||
                    saveMutation.isPending ||
                    !draftDiffersFromPersisted
                  }
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" /> Save & refresh cache
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Saving immediately calls the edge function with{' '}
                <code className="bg-muted px-1 rounded">?refresh=1</code> so the
                in-memory cache (TTL 60s) is bypassed and the new value takes
                effect within seconds.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Live edge probe
              </CardTitle>
              <CardDescription>
                Calls{' '}
                <code className="text-xs bg-muted px-1 rounded">
                  log-crawler-visit?probe=sample-rate
                </code>{' '}
                so you can see what the function is actually using right now.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runProbe(false)}
                disabled={probing}
              >
                {probing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Probe
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => runProbe(true)}
                disabled={probing}
              >
                Force refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {probeError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{probeError}</AlertDescription>
              </Alert>
            ) : !probe ? (
              <p className="text-sm text-muted-foreground">No probe yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Effective rate (this edge instance)
                    </p>
                    <p className="text-2xl font-bold font-mono">
                      {probe.effectiveSampleRate.toFixed(3)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatPercent(probe.effectiveSampleRate)} of non-priority
                      pings logged
                    </p>
                  </div>
                  <div className="text-right">
                    {probeDiffersFromPersisted ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Cache stale
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> In sync
                      </Badge>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Cached value before probe</dt>
                  <dd className="font-mono">
                    {probe.cachedBefore === null
                      ? '— (cold)'
                      : probe.cachedBefore.toFixed(3)}
                  </dd>
                  <dt className="text-muted-foreground">Cache age</dt>
                  <dd>{formatAge(probe.cachedAgeMs)}</dd>
                  <dt className="text-muted-foreground">Cache TTL</dt>
                  <dd>{Math.round(probe.cacheTtlMs / 1000)}s</dd>
                  <dt className="text-muted-foreground">Forced refresh</dt>
                  <dd>{probe.forcedRefresh ? 'yes' : 'no'}</dd>
                  <dt className="text-muted-foreground">Probed at</dt>
                  <dd className="font-mono text-xs">{probe.ts}</dd>
                </dl>

                {probeDiffersFromPersisted && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      The edge function still has the old cached value. Click{' '}
                      <strong>Force refresh</strong> to bypass the 60-second
                      cache, or wait up to a minute for it to expire naturally.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">What this controls</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Always logged</strong> (sample rate ignored): pdp-render-trace
              pings, verified Googlebot, spoofed-Googlebot UAs, and visits to
              appeal pages (<code className="bg-muted px-1 rounded">/google-review</code>,{' '}
              <code className="bg-muted px-1 rounded">/technical-declaration</code>,{' '}
              <code className="bg-muted px-1 rounded">/appeal-response</code>).
            </p>
            <p>
              <strong>Sampled</strong>: ordinary human + non-priority bot traffic.
              Set to <code className="bg-muted px-1 rounded">0</code> to drop all
              such pings, <code className="bg-muted px-1 rounded">1</code> to log
              everything.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
