/**
 * /admin/ai-revenue — AI Revenue Operator v1
 *
 * Additive growth-intelligence layer. Reads the same lp_funnel_events
 * pipeline already used by FunnelHealth and adds:
 *  - aggregated revenue health KPIs (mobile-first)
 *  - product intelligence (winners / breakouts / rage-prone)
 *  - traffic quality by source
 *  - AI insights + persisted recommendations
 *  - manual AI content draft generator (no auto-publish)
 *
 * Does NOT touch Stripe, checkout, webhooks, or any existing route.
 */
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Loader2, Sparkles, RefreshCw, TrendingUp, AlertTriangle, Brain, Wand2, Copy as CopyIcon, CalendarIcon, X, Download, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

type Range = '24h' | '7d' | '30d';
type SourceFilter = 'all' | 'tiktok' | 'pinterest' | 'google' | 'organic' | 'direct' | 'other';

/** Generic localStorage-backed state. Dates need custom ser/des. */
function usePersistedState<T>(
  key: string,
  initial: T,
  opts?: { serialize?: (v: T) => string; deserialize?: (s: string) => T }
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored != null) {
        return opts?.deserialize ? opts.deserialize(stored) : (JSON.parse(stored) as T);
      }
    } catch { /* ignore corrupt storage */ }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, opts?.serialize ? opts.serialize(value) : JSON.stringify(value));
    } catch { /* storage full or private mode */ }
  }, [key, value, opts]);
  return [value, setValue];
}

const dateToIso = (d: Date | undefined) => (d ? d.toISOString() : '');
const isoToDate = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? undefined : d; };

interface Thresholds {
  min_views: number;
  min_prior_views: number;
  winner_atc_z: number;
  winner_views_z: number;
  breakout_views_z: number;
  breakout_views_delta_pct: number;
  rising_atc_z: number;
  rising_min_views: number;
  falling_delta_pct: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  min_views: 5,
  min_prior_views: 5,
  winner_atc_z: 1,
  winner_views_z: 0,
  breakout_views_z: 1,
  breakout_views_delta_pct: 200,
  rising_atc_z: 0.5,
  rising_min_views: 3,
  falling_delta_pct: -30,
};

const SOURCE_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'All sources' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'google', label: 'Google / Paid' },
  { value: 'organic', label: 'Organic search' },
  { value: 'direct', label: 'Direct' },
  { value: 'other', label: 'Other' },
];

interface Summary {
  range: Range;
  total_events: number;
  total_sessions: number;
  bot_filtered_events?: number;
  bot_filtered_pct?: number;
  quality_scores?: {
    funnel_friction: number;
    pdp_quality: number;
    mobile_conversion: number;
    traffic_quality: number;
  };
  device_split?: Array<{ key: string; sessions: number; views: number; atc: number; checkouts: number; atc_rate_pct: number; checkout_rate_pct: number }>;
  os_split?: Array<{ key: string; sessions: number; views: number; atc: number; checkouts: number; atc_rate_pct: number; checkout_rate_pct: number }>;
  baselines?: {
    prior_since: string;
    prior_until: string;
    prior_events: number;
    overall_atc_rate_pct: number;
    product_views_mean: number;
    product_views_std: number;
    product_atc_rate_mean_pct: number;
    product_atc_rate_std_pp: number;
    sample_size: number;
  };
  thresholds?: Thresholds;
  funnel: {
    pdp_views: number; cart_opens: number; add_to_cart: number;
    begin_checkout: number; payment_success: number;
    pdp_to_atc_pct: number; atc_to_checkout_pct: number; checkout_to_payment_pct: number;
  };
  behavior: { bounce_rate_pct: number; rage_click_pct: number; sticky_atc_views: number; return_visit_pct: number };
  devices: Record<string, number>;
  os: Record<string, number>;
  traffic_quality: Array<{ source: string; sessions: number; views: number; atc_rate: number; bounce_rate: number; avg_dwell_ms: number }>;
  top_products: ProductRow[];
  breakout_products: Summary['top_products'];
  winner_products?: Summary['top_products'];
  rising_products?: Summary['top_products'];
  falling_products?: Summary['top_products'];
  best_dwell: Summary['top_products'];
  worst_rage: Summary['top_products'];
  top_landing: Array<{ path: string; count: number }>;
  top_exit: Array<{ path: string; count: number }>;
}

interface ProductRow {
  id: string; name: string; views: number; atc: number; atc_rate: number;
  avg_dwell_ms: number; rage_clicks: number; sessions: number;
  prior_views?: number; prior_atc_rate?: number;
  views_delta_pct?: number | null; atc_rate_delta_pp?: number;
  views_z?: number; atc_rate_z?: number;
  wilson_atc_lower?: number; is_new?: boolean;
  classification?: 'winner' | 'breakout' | 'rising' | 'falling' | 'stable';
  // Iteration D — Winner v2 derived scores (0-100). Optional, additive.
  winner_score?: number;
  trend_velocity?: number;
  conversion_momentum?: number;
}

interface Insight { title: string; body: string; severity: 'info' | 'warning' | 'critical'; category: string; product_id?: string | null }
interface Recommendation { id: string; category: string; severity: string; title: string; body: string; status: string; created_at: string }
interface Draft { id: string; kind: string; output: string; created_at: string; product_name?: string | null }

interface StoredInsight {
  id: string;
  scope: string;
  scope_ref: string | null;
  insight_type: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  recommendations: string[];
  model: string | null;
  generated_at: string;
  dismissed_at: string | null;
  snoozed_until: string | null;
}

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'tiktok_hook', label: 'TikTok Hooks' },
  { value: 'pinterest_caption', label: 'Pinterest Captions' },
  { value: 'seo_faq', label: 'SEO FAQ Block' },
  { value: 'comparison', label: 'Comparison Section' },
  { value: 'email', label: 'Email Campaign Ideas' },
  { value: 'urgency', label: 'Urgency Copy' },
  { value: 'trust_badge', label: 'Trust Badge Copy' },
  { value: 'before_after', label: 'Before / After Framing' },
  { value: 'ugc_script', label: 'UGC Video Script' },
];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function severityVariant(sev: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (sev === 'critical') return 'destructive';
  if (sev === 'warning') return 'default';
  return 'secondary';
}

export default function AiRevenuePage() {
  const [range, setRange] = usePersistedState<Range>('gp_ai_rev_range', '7d');
  const [fromDate, setFromDate] = usePersistedState<Date | undefined>('gp_ai_rev_from', undefined, { serialize: dateToIso, deserialize: isoToDate });
  const [toDate, setToDate] = usePersistedState<Date | undefined>('gp_ai_rev_to', undefined, { serialize: dateToIso, deserialize: isoToDate });
  const [source, setSource] = usePersistedState<SourceFilter>('gp_ai_rev_source', 'all');
  const [thresholds, setThresholds] = usePersistedState<Thresholds>('gp_ai_rev_thresholds', DEFAULT_THRESHOLDS);
  // Prior comparison window: 'equal' mirrors the current window length
  // immediately before `since`; 'custom' uses user-picked priorFrom/priorTo.
  const [priorMode, setPriorMode] = usePersistedState<'equal' | 'custom'>('gp_ai_rev_prior_mode', 'equal');
  const [priorFrom, setPriorFrom] = usePersistedState<Date | undefined>('gp_ai_rev_prior_from', undefined, { serialize: dateToIso, deserialize: isoToDate });
  const [priorTo, setPriorTo] = usePersistedState<Date | undefined>('gp_ai_rev_prior_to', undefined, { serialize: dateToIso, deserialize: isoToDate });
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [kind, setKind] = useState<string>('tiktok_hook');
  const [productId, setProductId] = useState<string>('');
  const [extraContext, setExtraContext] = useState<string>('');
  const [genBusy, setGenBusy] = useState(false);

  // Iteration B: persisted AI insights (separate from live `insights`)
  const [storedInsights, setStoredInsights] = useState<StoredInsight[]>([]);
  const [storedBusy, setStoredBusy] = useState(false);
  const [storedSeverity, setStoredSeverity] = useState<'all' | 'info' | 'warn' | 'critical'>('all');
  const [genInsightsBusy, setGenInsightsBusy] = useState(false);
  // Iteration D — traffic quality classifier state
  const [classifyBusy, setClassifyBusy] = useState(false);
  const [classifyResult, setClassifyResult] = useState<null | {
    scanned: number; updated: number; breakdown: Record<string, number>;
  }>(null);

  // Per-product drilldown panel state. Lazily fetches when a row is clicked.
  interface DrilldownMetrics { views: number; atc: number; atc_rate_pct: number; rage_clicks: number; avg_dwell_ms: number; sessions: number }
  interface DrilldownSession {
    session_id: string; started_at: string | null; ended_at: string | null;
    event_count: number; views: number; atc: number; rage: number;
    source: string; landing_path: string | null;
    timeline: Array<{ event: string; path: string | null; dwell_ms: number | null; product_id: string | null; at: string }>;
  }
  interface DrilldownPayload {
    product_id: string; product_name: string;
    window: { since: string; until: string };
    prior_window: { since: string; until: string };
    source: string;
    current: DrilldownMetrics; prior: DrilldownMetrics;
    deltas: {
      views_delta_pct: number | null; atc_delta_pct: number | null;
      atc_rate_delta_pp: number; dwell_delta_pct: number | null;
      rage_delta_pct: number | null; sessions_delta_pct: number | null;
    };
    example_sessions: DrilldownSession[];
  }
  const [drilldown, setDrilldown] = useState<DrilldownPayload | null>(null);
  const [drillBusy, setDrillBusy] = useState(false);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillRow, setDrillRow] = useState<ProductRow | null>(null);

  async function openDrilldown(p: ProductRow) {
    setDrillRow(p);
    setDrillOpen(true);
    setDrillBusy(true);
    setDrilldown(null);
    try {
      const qs = buildQuery(range, { drilldown: p.id });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-revenue-insights?${qs}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'failed');
      setDrilldown(json.drilldown as DrilldownPayload);
    } catch (e: any) {
      toast.error('Drilldown failed: ' + e.message);
    } finally {
      setDrillBusy(false);
    }
  }

  /**
   * Iteration D — Traffic Quality Engine v2.
   * Calls `ai-traffic-classify` to derive `sessions.quality_class` for the
   * last 30 days. Strictly read+update on the sessions table; never touches
   * checkout, Stripe, or any payment flow.
   */
  async function runTrafficClassifier(dryRun = false) {
    setClassifyBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-traffic-classify', {
        body: { days: 30, limit: 5000, dry_run: dryRun, only_unclassified: false },
      });
      if (error) throw error;
      const payload = data as {
        ok: boolean; message?: string;
        scanned?: number; updated?: number;
        breakdown?: Record<string, number>;
      };
      if (!payload?.ok) throw new Error(payload?.message || 'classify_failed');
      setClassifyResult({
        scanned: payload.scanned ?? 0,
        updated: payload.updated ?? 0,
        breakdown: payload.breakdown ?? {},
      });
      toast.success(
        dryRun
          ? `Preview: ${payload.scanned ?? 0} sessions analysed`
          : `Classified ${payload.updated ?? 0} of ${payload.scanned ?? 0} sessions`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Traffic classify failed: ' + msg);
    } finally {
      setClassifyBusy(false);
    }
  }

  function buildQuery(r: Range, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    if (fromDate || toDate) {
      if (fromDate) params.set('from', fromDate.toISOString());
      if (toDate) {
        // include the whole selected end day
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }
    } else {
      params.set('range', r);
    }
    if (source && source !== 'all') params.set('source', source);
    // Prior-window override. Only sent when the user chose a custom range and
    // both endpoints are valid; otherwise the edge function falls back to an
    // equal-length window before `since`.
    if (priorMode === 'custom' && priorFrom && priorTo) {
      params.set('prior_mode', 'custom');
      params.set('prior_from', priorFrom.toISOString());
      const pEnd = new Date(priorTo);
      pEnd.setHours(23, 59, 59, 999);
      params.set('prior_to', pEnd.toISOString());
    }
    // Pass classification thresholds through to the edge function so winner /
    // breakout / rising / falling cutoffs are tunable per request.
    const defaults = DEFAULT_THRESHOLDS as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(thresholds as unknown as Record<string, number>)) {
      if (v !== defaults[k]) {
        params.set(k, String(v));
      }
    }
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return params.toString();
  }

  function downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toCsv(rows: Array<Record<string, string | number | null | undefined>>) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
  }

  function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildExportPayload() {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return { ts, payload: { summary, insights, recommendations: recs, drafts, filters: { range, fromDate, toDate, source, thresholds, prior_mode: priorMode, prior_from: priorFrom, prior_to: priorTo } } };
  }

  async function loadSummary(r: Range) {
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-revenue-insights?${buildQuery(r)}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'failed');
      setSummary(json.summary);
    } catch (e: any) {
      toast.error('Failed to load metrics: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAi(persist: boolean) {
    setAiBusy(true);
    try {
      const extra: Record<string, string> = { ai: '1' };
      if (persist) extra.persist = '1';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-revenue-insights?${buildQuery(range, extra)}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'failed');
      setSummary(json.summary);
      setInsights((json.ai_insights || []) as Insight[]);
      if (persist) {
        toast.success('Saved recommendations');
        loadRecs();
      } else {
        toast.success('Generated AI insights');
      }
    } catch (e: any) {
      toast.error('AI failed: ' + e.message);
    } finally {
      setAiBusy(false);
    }
  }

  async function loadRecs() {
    const { data } = await supabase
      .from('ai_revenue_recommendations')
      .select('id,category,severity,title,body,status,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setRecs((data || []) as Recommendation[]);
  }

  async function loadDrafts() {
    const { data } = await supabase
      .from('ai_content_drafts')
      .select('id,kind,output,created_at,product_name')
      .order('created_at', { ascending: false })
      .limit(20);
    setDrafts((data || []) as Draft[]);
  }

  async function updateRecStatus(id: string, status: string) {
    const { error } = await supabase
      .from('ai_revenue_recommendations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRecs(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  }

  async function generateContent() {
    setGenBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-content-generator', {
        body: { kind, product_id: productId || null, context: extraContext || null },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || 'failed');
      toast.success('Draft created');
      setExtraContext('');
      loadDrafts();
    } catch (e: any) {
      toast.error('Generation failed: ' + e.message);
    } finally {
      setGenBusy(false);
    }
  }

  async function loadStoredInsights() {
    setStoredBusy(true);
    try {
      const nowIso = new Date().toISOString();
      let q = supabase
        .from('ai_revenue_insights' as any)
        .select('id,scope,scope_ref,insight_type,severity,title,body,evidence,recommendations,model,generated_at,dismissed_at,snoozed_until')
        .is('dismissed_at', null)
        .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`)
        .order('generated_at', { ascending: false })
        .limit(50);
      if (storedSeverity !== 'all') q = q.eq('severity', storedSeverity);
      const { data, error } = await q;
      if (error) throw error;
      setStoredInsights((data || []) as unknown as StoredInsight[]);
    } catch (e: any) {
      toast.error('Could not load saved insights: ' + (e?.message || 'error'));
    } finally {
      setStoredBusy(false);
    }
  }

  async function generateStoredInsights(force = false) {
    setGenInsightsBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-insights-generate', {
        body: { range, source, force },
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.rate_limited) toast.error('AI rate-limited. Try again in a minute.');
        else if (data?.credits_exhausted) toast.error('AI credits exhausted. Add funds in Workspace.');
        else if (data?.deduped) toast.message(data?.message || 'Recent insights already exist.');
        else throw new Error(data?.message || 'AI failed');
        return;
      }
      toast.success(`Saved ${data.inserted ?? 0} new insights`);
      loadStoredInsights();
    } catch (e: any) {
      toast.error('AI insights failed: ' + (e?.message || 'error'));
    } finally {
      setGenInsightsBusy(false);
    }
  }

  async function dismissStoredInsight(id: string) {
    const { error } = await supabase
      .from('ai_revenue_insights' as any)
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    setStoredInsights(prev => prev.filter(i => i.id !== id));
  }

  async function snoozeStoredInsight(id: string, days: number) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('ai_revenue_insights' as any)
      .update({ snoozed_until: until })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    setStoredInsights(prev => prev.filter(i => i.id !== id));
    toast.success(`Snoozed ${days}d`);
  }

  useEffect(() => {
    loadSummary(range);
    // re-fetch when any filter changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, fromDate, toDate, source, thresholds, priorMode, priorFrom, priorTo]);
  useEffect(() => { loadRecs(); loadDrafts(); }, []);
  useEffect(() => { loadStoredInsights(); /* eslint-disable-next-line */ }, [storedSeverity]);

  const winners = useMemo(() => summary?.winner_products ?? [], [summary]);
  const breakouts = useMemo(() => summary?.breakout_products ?? [], [summary]);
  const rising = useMemo(() => summary?.rising_products ?? [], [summary]);
  const falling = useMemo(() => summary?.falling_products ?? [], [summary]);

  return (
    <div className="max-w-7xl mx-auto px-3 py-6 space-y-6">
      <Helmet><title>AI Revenue Operator · GetPawsy Admin</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Brain className="w-6 h-6" /> AI Revenue Operator</h1>
          <p className="text-sm text-muted-foreground">
            Live funnel intelligence and AI-generated growth recommendations.
            {(fromDate || toDate || source !== 'all') && (
              <span className="ml-2 text-foreground">
                · Filtered{fromDate || toDate ? ` ${fromDate ? format(fromDate, 'MMM d') : '…'} → ${toDate ? format(toDate, 'MMM d') : '…'}` : ''}
                {source !== 'all' ? ` · ${SOURCE_OPTIONS.find(s => s.value === source)?.label}` : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={range} onValueChange={(v) => { setFromDate(undefined); setToDate(undefined); setRange(v as Range); }}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn('justify-start text-left font-normal', !fromDate && 'text-muted-foreground')}
              >
                <CalendarIcon className="w-4 h-4 mr-2" />
                {fromDate ? format(fromDate, 'MMM d') : 'From'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus className={cn('p-3 pointer-events-auto')} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn('justify-start text-left font-normal', !toDate && 'text-muted-foreground')}
              >
                <CalendarIcon className="w-4 h-4 mr-2" />
                {toDate ? format(toDate, 'MMM d') : 'To'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus className={cn('p-3 pointer-events-auto')} />
            </PopoverContent>
          </Popover>

          {(fromDate || toDate) && (
            <Button size="sm" variant="ghost" onClick={() => { setFromDate(undefined); setToDate(undefined); }} title="Clear dates">
              <X className="w-4 h-4" />
            </Button>
          )}

          <Select value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={() => loadSummary(range)} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" title="Choose prior comparison window">
                <CalendarIcon className="w-4 h-4 mr-1" />
                Prior: {priorMode === 'custom' && priorFrom && priorTo
                  ? `${format(priorFrom, 'MMM d')}–${format(priorTo, 'MMM d')}`
                  : 'equal-length'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3 space-y-3" align="end">
              <div className="text-sm font-semibold">Prior comparison window</div>
              <p className="text-xs text-muted-foreground">
                Baselines for winner / breakout / rising / falling compare the current
                window to a prior period. Default is the equal-length window immediately
                before the current one.
              </p>
              <Select value={priorMode} onValueChange={(v) => setPriorMode(v as 'equal' | 'custom')}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Equal-length (auto)</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {priorMode === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('justify-start text-left font-normal', !priorFrom && 'text-muted-foreground')}>
                        <CalendarIcon className="w-3 h-3 mr-2" />
                        {priorFrom ? format(priorFrom, 'MMM d') : 'From'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={priorFrom} onSelect={setPriorFrom} initialFocus className={cn('p-3 pointer-events-auto')} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn('justify-start text-left font-normal', !priorTo && 'text-muted-foreground')}>
                        <CalendarIcon className="w-3 h-3 mr-2" />
                        {priorTo ? format(priorTo, 'MMM d') : 'To'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={priorTo} onSelect={setPriorTo} initialFocus className={cn('p-3 pointer-events-auto')} />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              {priorMode === 'custom' && (priorFrom || priorTo) && (
                <Button size="sm" variant="ghost" onClick={() => { setPriorFrom(undefined); setPriorTo(undefined); }}>
                  Clear custom range
                </Button>
              )}
              {summary?.baselines && (
                <div className="text-[11px] text-muted-foreground border-t pt-2">
                  Active prior: {new Date(summary.baselines.prior_since).toLocaleDateString()} → {new Date(summary.baselines.prior_until).toLocaleDateString()} · {summary.baselines.prior_events} events
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" title="Adjust classification thresholds">
                <SlidersHorizontal className="w-4 h-4 mr-1" /> Thresholds
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Classification thresholds</div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
                >
                  Reset
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tighten z-scores or raise the minimum sample size to surface only the strongest signals.
                Loosen them to explore early movers.
              </p>
              {[
                { key: 'min_views', label: 'Min views (winner)', step: 1 },
                { key: 'winner_atc_z', label: 'Winner ATC z ≥', step: 0.1 },
                { key: 'winner_views_z', label: 'Winner views z ≥', step: 0.1 },
                { key: 'breakout_views_z', label: 'Breakout views z ≥', step: 0.1 },
                { key: 'breakout_views_delta_pct', label: 'Breakout Δviews % ≥', step: 10 },
                { key: 'rising_min_views', label: 'Min views (rising)', step: 1 },
                { key: 'rising_atc_z', label: 'Rising ATC z ≥', step: 0.1 },
                { key: 'min_prior_views', label: 'Min prior views (falling)', step: 1 },
                { key: 'falling_delta_pct', label: 'Falling Δviews % ≤', step: 5 },
              ].map(({ key, label, step }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <label className="text-xs text-muted-foreground flex-1" htmlFor={`thr-${key}`}>{label}</label>
                  <Input
                    id={`thr-${key}`}
                    type="number"
                    step={step}
                    value={(thresholds as unknown as Record<string, number>)[key]}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      setThresholds(prev => ({ ...prev, [key]: n }));
                    }}
                    className="h-8 w-24 text-right tabular-nums"
                  />
                </div>
              ))}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={!summary}><Download className="w-4 h-4 mr-1" /> Export</Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2 space-y-1">
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => { const { ts, payload } = buildExportPayload(); downloadJson(`ai-revenue-${ts}.json`, payload); }}>
                <Download className="w-3 h-3 mr-2" /> Full report (JSON)
              </Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => {
                const { ts } = buildExportPayload();
                const buckets: Array<[string, ProductRow[] | undefined]> = summary ? [
                  ['top', summary.top_products],
                  ['winner', summary.winner_products],
                  ['breakout', summary.breakout_products],
                  ['rising', summary.rising_products],
                  ['falling', summary.falling_products],
                ] : [];
                const seen = new Set<string>();
                const rows: Array<Record<string, string | number | null | undefined>> = [];
                for (const [bucket, list] of buckets) {
                  for (const p of (list ?? [])) {
                    const key = `${bucket}:${p.id}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    rows.push({
                      bucket,
                      id: p.id,
                      name: p.name,
                      classification: p.classification ?? '',
                      is_new: p.is_new ? 1 : 0,
                      views: p.views,
                      prior_views: p.prior_views ?? '',
                      views_delta_pct: p.views_delta_pct ?? '',
                      views_z: p.views_z ?? '',
                      atc: p.atc,
                      atc_rate_pct: p.atc_rate,
                      prior_atc_rate_pct: p.prior_atc_rate ?? '',
                      atc_rate_delta_pp: p.atc_rate_delta_pp ?? '',
                      atc_rate_z: p.atc_rate_z ?? '',
                      wilson_atc_lower_pct: p.wilson_atc_lower ?? '',
                      dwell_sec: (p.avg_dwell_ms / 1000).toFixed(1),
                      rage_clicks: p.rage_clicks,
                      sessions: p.sessions,
                    });
                  }
                }
                downloadCsv(`products-${ts}.csv`, rows);
              }}>
                <Download className="w-3 h-3 mr-2" /> Product data (CSV)
              </Button>
              <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => { const { ts } = buildExportPayload(); const rows = summary ? summary.traffic_quality.map(t => ({ source: t.source, sessions: t.sessions, views: t.views, atc_rate_pct: t.atc_rate, bounce_rate_pct: t.bounce_rate, avg_dwell_sec: (t.avg_dwell_ms / 1000).toFixed(1) })) : []; downloadCsv(`traffic-${ts}.csv`, rows); }}>
                <Download className="w-3 h-3 mr-2" /> Traffic quality (CSV)
              </Button>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" title="Classify recent sessions into real_human / suspicious / crawler / likely_bot">
                {classifyBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Traffic Quality
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3 space-y-3">
              <div className="text-sm font-semibold">Traffic Quality Engine v2</div>
              <p className="text-xs text-muted-foreground">
                Labels recent sessions with a quality class based on bot signals,
                UA, geo, and engagement. Strictly additive — never touches
                checkout, Stripe, or payment flows.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" disabled={classifyBusy} onClick={() => runTrafficClassifier(true)}>
                  Dry run
                </Button>
                <Button size="sm" className="flex-1" disabled={classifyBusy} onClick={() => runTrafficClassifier(false)}>
                  Classify 30d
                </Button>
              </div>
              {classifyResult && (
                <div className="border-t pt-2 space-y-1 text-xs">
                  <div className="text-muted-foreground">
                    Scanned <span className="tabular-nums font-medium text-foreground">{classifyResult.scanned}</span>
                    {' · '}Updated <span className="tabular-nums font-medium text-foreground">{classifyResult.updated}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['real_human','suspicious','crawler','likely_bot'] as const).map(k => (
                      <div key={k} className="flex justify-between border rounded px-2 py-1">
                        <span className="capitalize">{k.replace('_',' ')}</span>
                        <span className="tabular-nums font-medium">{classifyResult.breakdown[k] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {summary && (
        <>
          {/* Revenue Health */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Revenue Health</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="PDP → ATC" value={`${summary.funnel.pdp_to_atc_pct}%`} sub={`${summary.funnel.add_to_cart} / ${summary.funnel.pdp_views}`} />
              <StatCard label="ATC → Checkout" value={`${summary.funnel.atc_to_checkout_pct}%`} sub={`${summary.funnel.begin_checkout} starts`} />
              <StatCard label="Checkout → Pay" value={`${summary.funnel.checkout_to_payment_pct}%`} sub={`${summary.funnel.payment_success} paid`} />
              <StatCard label="Sessions" value={summary.total_sessions} sub={`${summary.total_events} events`} />
              <StatCard label="Bounce" value={`${summary.behavior.bounce_rate_pct}%`} />
              <StatCard label="Rage clicks" value={`${summary.behavior.rage_click_pct}%`} />
              <StatCard label="Return visits" value={`${summary.behavior.return_visit_pct}%`} />
              <StatCard label="Sticky ATC views" value={summary.behavior.sticky_atc_views} />
            </div>
            {summary.quality_scores && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Funnel friction score" value={`${summary.quality_scores.funnel_friction}`} sub="0–100 · higher = healthier funnel" />
                <StatCard label="PDP quality score" value={`${summary.quality_scores.pdp_quality}`} sub="dwell + ATC − rage" />
                <StatCard label="Mobile conversion score" value={`${summary.quality_scores.mobile_conversion}`} sub="mobile ATC vs traffic share" />
                <StatCard label="Traffic quality score" value={`${summary.quality_scores.traffic_quality}`} sub={`${summary.bot_filtered_pct ?? 0}% bot-filtered`} />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card>
                <CardHeader><CardTitle className="text-sm">Device conversion</CardTitle><CardDescription className="text-xs">Sessions · ATC % · Checkout %</CardDescription></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {(summary.device_split ?? []).map(d => (
                    <div key={d.key} className="flex justify-between gap-2">
                      <span className="capitalize">{d.key}</span>
                      <span className="tabular-nums text-muted-foreground">{d.sessions} · {d.atc_rate_pct}% · {d.checkout_rate_pct}%</span>
                    </div>
                  ))}
                  {(!summary.device_split || summary.device_split.length === 0) && Object.entries(summary.devices).map(([k, v]) => <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="tabular-nums">{v}</span></div>)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">OS conversion (iOS vs Android)</CardTitle><CardDescription className="text-xs">Sessions · ATC % · Checkout %</CardDescription></CardHeader>
                <CardContent className="text-sm space-y-1">
                  {(summary.os_split ?? []).map(o => (
                    <div key={o.key} className="flex justify-between gap-2">
                      <span className="capitalize">{o.key}</span>
                      <span className="tabular-nums text-muted-foreground">{o.sessions} · {o.atc_rate_pct}% · {o.checkout_rate_pct}%</span>
                    </div>
                  ))}
                  {(!summary.os_split || summary.os_split.length === 0) && Object.entries(summary.os).map(([k, v]) => <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="tabular-nums">{v}</span></div>)}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Traffic Quality */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Traffic Quality</h2>
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr><th className="text-left p-2">Source</th><th className="text-right p-2">Sessions</th><th className="text-right p-2">Views</th><th className="text-right p-2">ATC %</th><th className="text-right p-2">Bounce %</th><th className="text-right p-2">Avg dwell</th></tr>
                </thead>
                <tbody>
                  {summary.traffic_quality.map(t => (
                    <tr key={t.source} className="border-t"><td className="p-2 font-medium capitalize">{t.source}</td><td className="p-2 text-right tabular-nums">{t.sessions}</td><td className="p-2 text-right tabular-nums">{t.views}</td><td className="p-2 text-right tabular-nums">{t.atc_rate}%</td><td className="p-2 text-right tabular-nums">{t.bounce_rate}%</td><td className="p-2 text-right tabular-nums">{(t.avg_dwell_ms / 1000).toFixed(1)}s</td></tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          </section>

          {/* Product Intelligence */}
          <section className="space-y-3">
            <div className="flex items-end justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">Product Intelligence</h2>
              {summary.baselines && (
                <p className="text-xs text-muted-foreground">
                  Baseline: site ATC {summary.baselines.overall_atc_rate_pct}% ·
                  product views μ {summary.baselines.product_views_mean} ±{summary.baselines.product_views_std} ·
                  ATC-rate μ {summary.baselines.product_atc_rate_mean_pct}% ±{summary.baselines.product_atc_rate_std_pp}pp ·
                  prior window {summary.baselines.prior_events} events
                </p>
              )}
              {summary.thresholds && (
                <p className="text-[11px] text-muted-foreground">
                  Cutoffs · winner: views ≥ {summary.thresholds.min_views}, views z ≥ {summary.thresholds.winner_views_z}, ATC z ≥ {summary.thresholds.winner_atc_z} ·
                  breakout: views z ≥ {summary.thresholds.breakout_views_z} or Δ ≥ {summary.thresholds.breakout_views_delta_pct}% ·
                  rising: views ≥ {summary.thresholds.rising_min_views}, ATC z ≥ {summary.thresholds.rising_atc_z} ·
                  falling: prior ≥ {summary.thresholds.min_prior_views}, Δ ≤ {summary.thresholds.falling_delta_pct}%
                </p>
              )}
            </div>
            <Tabs defaultValue="top">
              <TabsList className="flex-wrap">
                <TabsTrigger value="top">Most viewed</TabsTrigger>
                <TabsTrigger value="winners">Winners ({winners.length})</TabsTrigger>
                <TabsTrigger value="breakout">Breakout ({breakouts.length})</TabsTrigger>
                <TabsTrigger value="rising">Rising ({rising.length})</TabsTrigger>
                <TabsTrigger value="falling">Falling ({falling.length})</TabsTrigger>
                <TabsTrigger value="dwell">Best dwell</TabsTrigger>
                <TabsTrigger value="rage">High rage</TabsTrigger>
              </TabsList>
              {[
                { v: 'top', list: summary.top_products },
                { v: 'winners', list: winners },
                { v: 'breakout', list: breakouts },
                { v: 'rising', list: rising },
                { v: 'falling', list: falling },
                { v: 'dwell', list: summary.best_dwell },
                { v: 'rage', list: summary.worst_rage },
              ].map(({ v, list }) => (
                <TabsContent key={v} value={v}>
                  <Card><CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs uppercase">
                        <tr>
                          <th className="text-left p-2">Product</th>
                          <th className="text-right p-2" title="Page views in current window">Views</th>
                          <th className="text-right p-2" title="Views vs prior period of equal length">Δ Views</th>
                          <th className="text-right p-2" title="Views z-score vs site mean">z</th>
                          <th className="text-right p-2">ATC %</th>
                          <th className="text-right p-2" title="ATC % change in percentage points vs prior period">Δ ATC pp</th>
                          <th className="text-right p-2" title="Wilson 95% lower bound of ATC rate (sample-size aware)">Wilson</th>
                          <th className="text-right p-2">Dwell</th>
                          <th className="text-right p-2">Rage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No data yet for this slice</td></tr>}
                        {list.map((p: ProductRow) => {
                          const dv = p.views_delta_pct;
                          const dvLabel = p.is_new ? 'NEW' : dv == null ? '—' : `${dv >= 0 ? '+' : ''}${dv}%`;
                          const dvColor = p.is_new ? 'text-emerald-600 font-semibold' : dv == null ? 'text-muted-foreground' : dv > 0 ? 'text-emerald-600' : dv < 0 ? 'text-red-600' : '';
                          const da = p.atc_rate_delta_pp;
                          const daLabel = da == null ? '—' : `${da >= 0 ? '+' : ''}${da}pp`;
                          const daColor = da == null ? 'text-muted-foreground' : da > 0 ? 'text-emerald-600' : da < 0 ? 'text-red-600' : '';
                          return (
                            <tr key={p.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => openDrilldown(p)} title="Open drilldown">
                              <td className="p-2 max-w-[14rem] truncate text-primary underline-offset-2 hover:underline">{p.name}</td>
                              <td className="p-2 text-right tabular-nums">{p.views}</td>
                              <td className={`p-2 text-right tabular-nums ${dvColor}`}>{dvLabel}</td>
                              <td className="p-2 text-right tabular-nums text-muted-foreground">{p.views_z ?? 0}</td>
                              <td className="p-2 text-right tabular-nums">{p.atc_rate}%</td>
                              <td className={`p-2 text-right tabular-nums ${daColor}`}>{daLabel}</td>
                              <td className="p-2 text-right tabular-nums text-muted-foreground">{p.wilson_atc_lower ?? 0}%</td>
                              <td className="p-2 text-right tabular-nums">{(p.avg_dwell_ms / 1000).toFixed(1)}s</td>
                              <td className="p-2 text-right tabular-nums">{p.rage_clicks}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent></Card>
                </TabsContent>
              ))}
            </Tabs>
          </section>

          {/* Landing / Exit */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card><CardHeader><CardTitle className="text-sm">Top landing pages</CardTitle></CardHeader><CardContent className="text-sm space-y-1">
              {summary.top_landing.map(l => <div key={l.path} className="flex justify-between gap-2"><span className="truncate">{l.path}</span><span className="tabular-nums text-muted-foreground">{l.count}</span></div>)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Top exit pages</CardTitle></CardHeader><CardContent className="text-sm space-y-1">
              {summary.top_exit.map(l => <div key={l.path} className="flex justify-between gap-2"><span className="truncate">{l.path}</span><span className="tabular-nums text-muted-foreground">{l.count}</span></div>)}
            </CardContent></Card>
          </section>
        </>
      )}

      {/* AI Insights */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Insights</h2>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={aiBusy || !summary} onClick={() => runAi(false)}>
              {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate
            </Button>
            <Button size="sm" disabled={aiBusy || !summary} onClick={() => runAi(true)}>
              Save as recommendations
            </Button>
            {insights.length > 0 && (
              <>
                <Button size="sm" variant="ghost" onClick={() => { const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); downloadJson(`insights-${ts}.json`, insights); }}><Download className="w-4 h-4 mr-1" /> JSON</Button>
                <Button size="sm" variant="ghost" onClick={() => { const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); const rows = insights.map(it => ({ title: it.title, category: it.category, severity: it.severity, body: it.body, product_id: it.product_id ?? '' })); downloadCsv(`insights-${ts}.csv`, rows); }}><Download className="w-4 h-4 mr-1" /> CSV</Button>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((it, i) => (
            <Card key={i}><CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardTitle className="text-sm">{it.title}</CardTitle><Badge variant={severityVariant(it.severity)}>{it.severity}</Badge></div><CardDescription className="text-xs uppercase">{it.category}</CardDescription></CardHeader><CardContent className="text-sm pt-0">{it.body}</CardContent></Card>
          ))}
          {!insights.length && <p className="text-sm text-muted-foreground">No insights yet. Click Generate to run the AI analyst.</p>}
        </div>
      </section>

      {/* Iteration B — Saved AI Insights (gemini-2.5-pro, persisted, dedupe 24h) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4" /> Saved AI Insights
            <Badge variant="outline" className="text-[10px] uppercase">pro model</Badge>
          </h2>
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={storedSeverity} onValueChange={(v) => setStoredSeverity(v as any)}>
              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => loadStoredInsights()} disabled={storedBusy}>
              {storedBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => generateStoredInsights(false)} disabled={genInsightsBusy}>
              {genInsightsBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Generate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => generateStoredInsights(true)} disabled={genInsightsBusy} title="Force regenerate (bypass 24h dedupe)">
              Force
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Pro-model analysis of the current window, persisted with 24h dedupe. Dismiss or snooze to keep the list tidy.
        </p>
        <div className="space-y-2">
          {storedInsights.length === 0 && !storedBusy && (
            <p className="text-sm text-muted-foreground">No saved insights. Click Generate to run the pro analyst.</p>
          )}
          {storedInsights.map((it) => (
            <Card key={it.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={severityVariant(it.severity === 'warn' ? 'warning' : it.severity)}>{it.severity}</Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">{it.scope}{it.scope_ref ? `:${it.scope_ref}` : ''}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{it.insight_type}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(it.generated_at).toLocaleString()}</span>
                    </div>
                    <div className="font-medium mt-1">{it.title}</div>
                    <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{it.body}</div>
                    {Array.isArray(it.recommendations) && it.recommendations.length > 0 && (
                      <ul className="text-sm mt-2 list-disc pl-5 space-y-0.5">
                        {it.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => snoozeStoredInsight(it.id, 1)}>1d</Button>
                    <Button size="sm" variant="ghost" onClick={() => snoozeStoredInsight(it.id, 7)}>7d</Button>
                    <Button size="sm" variant="outline" onClick={() => dismissStoredInsight(it.id)}>Dismiss</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Recommendations</h2>
          {recs.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); downloadJson(`recommendations-${ts}.json`, recs); }}><Download className="w-4 h-4 mr-1" /> JSON</Button>
              <Button size="sm" variant="ghost" onClick={() => { const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); const rows = recs.map(r => ({ id: r.id, title: r.title, category: r.category, severity: r.severity, status: r.status, body: r.body, created_at: r.created_at })); downloadCsv(`recommendations-${ts}.csv`, rows); }}><Download className="w-4 h-4 mr-1" /> CSV</Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {recs.length === 0 && <p className="text-sm text-muted-foreground">No saved recommendations yet.</p>}
          {recs.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap"><Badge variant={severityVariant(r.severity)}>{r.severity}</Badge><Badge variant="outline">{r.category}</Badge><Badge variant="secondary">{r.status}</Badge></div>
                    <div className="font-medium mt-1">{r.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">{r.body}</div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => updateRecStatus(r.id, 'acknowledged')}>Ack</Button>
                    <Button size="sm" variant="outline" onClick={() => updateRecStatus(r.id, 'shipped')}>Shipped</Button>
                    <Button size="sm" variant="ghost" onClick={() => updateRecStatus(r.id, 'dismissed')}>Dismiss</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* AI Content Generator */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4" /> AI Content Generator</h2>
          {drafts.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); downloadJson(`drafts-${ts}.json`, drafts); }}><Download className="w-4 h-4 mr-1" /> JSON</Button>
              <Button size="sm" variant="ghost" onClick={() => { const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); const rows = drafts.map(d => ({ id: d.id, kind: d.kind, product_name: d.product_name ?? '', output: d.output, created_at: d.created_at })); downloadCsv(`drafts-${ts}.csv`, rows); }}><Download className="w-4 h-4 mr-1" /> CSV</Button>
            </div>
          )}
        </div>
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Kind</label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KIND_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Product ID (optional)</label>
              <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="prod_..." />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Extra context (optional)</label>
            <Textarea value={extraContext} onChange={(e) => setExtraContext(e.target.value)} placeholder="Audience, angle, season, etc." rows={3} />
          </div>
          <div className="flex justify-end">
            <Button onClick={generateContent} disabled={genBusy}>
              {genBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />} Generate draft
            </Button>
          </div>
        </CardContent></Card>

        <div className="space-y-2">
          {drafts.map(d => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm capitalize">{d.kind.replace(/_/g, ' ')}{d.product_name ? ` · ${d.product_name}` : ''}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(d.output); toast.success('Copied'); }}>
                      <CopyIcon className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <pre className="whitespace-pre-wrap text-sm font-sans">{d.output}</pre>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground pt-4">
        Drafts are not auto-published. Stripe, checkout, webhooks, and SEO canonicals are untouched.
      </p>

      <Dialog open={drillOpen} onOpenChange={setDrillOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span className="truncate">{drillRow?.name ?? 'Product drilldown'}</span>
              {drillRow?.classification && drillRow.classification !== 'stable' && (
                <Badge variant="outline" className="uppercase text-[10px]">{drillRow.classification}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Current window vs equal-length prior period. Click a session to inspect its event timeline.
            </DialogDescription>
          </DialogHeader>

          {drillBusy && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading drilldown…
            </div>
          )}

          {!drillBusy && drilldown && (
            <div className="space-y-4">
              {/* Metric comparison grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {([
                  { k: 'views', label: 'Views', fmt: (v: number) => String(v), delta: drilldown.deltas.views_delta_pct, unit: '%' },
                  { k: 'atc', label: 'ATCs', fmt: (v: number) => String(v), delta: drilldown.deltas.atc_delta_pct, unit: '%' },
                  { k: 'atc_rate_pct', label: 'ATC rate', fmt: (v: number) => `${v}%`, delta: drilldown.deltas.atc_rate_delta_pp, unit: 'pp' },
                  { k: 'avg_dwell_ms', label: 'Avg dwell', fmt: (v: number) => `${(v / 1000).toFixed(1)}s`, delta: drilldown.deltas.dwell_delta_pct, unit: '%' },
                  { k: 'rage_clicks', label: 'Rage clicks', fmt: (v: number) => String(v), delta: drilldown.deltas.rage_delta_pct, unit: '%', invert: true },
                  { k: 'sessions', label: 'Sessions', fmt: (v: number) => String(v), delta: drilldown.deltas.sessions_delta_pct, unit: '%' },
                ] as const).map((m) => {
                  const cur = (drilldown.current as any)[m.k] as number;
                  const pri = (drilldown.prior as any)[m.k] as number;
                  const d = m.delta;
                  const good = d == null ? null : (m as any).invert ? d < 0 : d > 0;
                  const color = d == null ? 'text-muted-foreground' : good ? 'text-emerald-600' : d === 0 ? 'text-muted-foreground' : 'text-red-600';
                  const label = d == null ? '—' : `${d >= 0 ? '+' : ''}${d}${m.unit}`;
                  return (
                    <Card key={m.k}>
                      <CardContent className="p-3">
                        <div className="text-xs uppercase text-muted-foreground">{m.label}</div>
                        <div className="text-lg font-semibold tabular-nums">{m.fmt(cur)}</div>
                        <div className="text-xs flex justify-between gap-2">
                          <span className="text-muted-foreground">prior {m.fmt(pri)}</span>
                          <span className={`tabular-nums ${color}`}>{label}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Classification basis */}
              {drillRow && (
                <div className="text-xs text-muted-foreground border rounded p-2 leading-relaxed">
                  Classification basis · views z {drillRow.views_z ?? 0} ·
                  ATC z {drillRow.atc_rate_z ?? 0} ·
                  Wilson lower {drillRow.wilson_atc_lower ?? 0}% ·
                  {drillRow.is_new ? ' new product (no prior baseline)' : ` prior views ${drillRow.prior_views ?? 0}`}
                </div>
              )}

              {/* Example sessions */}
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Example sessions ({drilldown.example_sessions.length})
                </h3>
                {drilldown.example_sessions.length === 0 && (
                  <div className="text-sm text-muted-foreground border rounded p-3">
                    No sessions touched this product in the current window.
                  </div>
                )}
                <div className="space-y-2">
                  {drilldown.example_sessions.map((s) => (
                    <details key={s.session_id} className="border rounded">
                      <summary className="cursor-pointer p-2 text-sm flex flex-wrap items-center gap-2">
                        <code className="text-xs">{s.session_id.slice(0, 8)}</code>
                        <Badge variant="secondary" className="text-[10px] uppercase">{s.source}</Badge>
                        <span className="text-muted-foreground text-xs">{s.landing_path}</span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {s.event_count} events · {s.views} views · {s.atc} ATC{s.rage ? ` · ${s.rage} rage` : ''}
                        </span>
                      </summary>
                      <div className="p-2 border-t bg-muted/20 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="text-left p-1">Time</th>
                              <th className="text-left p-1">Event</th>
                              <th className="text-left p-1">Path</th>
                              <th className="text-right p-1">Dwell</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.timeline.map((e, i) => (
                              <tr key={i} className={`border-t ${e.product_id === drilldown.product_id ? 'bg-primary/5' : ''}`}>
                                <td className="p-1 tabular-nums whitespace-nowrap">{new Date(e.at).toLocaleTimeString()}</td>
                                <td className="p-1 font-mono">{e.event}</td>
                                <td className="p-1 truncate max-w-[16rem]">{e.path}</td>
                                <td className="p-1 text-right tabular-nums">{e.dwell_ms ? `${(e.dwell_ms / 1000).toFixed(1)}s` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}