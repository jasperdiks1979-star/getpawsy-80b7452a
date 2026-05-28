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
import { Loader2, Sparkles, RefreshCw, TrendingUp, AlertTriangle, Brain, Wand2, Copy as CopyIcon } from 'lucide-react';
import { toast } from 'sonner';

type Range = '24h' | '7d' | '30d';

interface Summary {
  range: Range;
  total_events: number;
  total_sessions: number;
  funnel: {
    pdp_views: number; cart_opens: number; add_to_cart: number;
    begin_checkout: number; payment_success: number;
    pdp_to_atc_pct: number; atc_to_checkout_pct: number; checkout_to_payment_pct: number;
  };
  behavior: { bounce_rate_pct: number; rage_click_pct: number; sticky_atc_views: number; return_visit_pct: number };
  devices: Record<string, number>;
  os: Record<string, number>;
  traffic_quality: Array<{ source: string; sessions: number; views: number; atc_rate: number; bounce_rate: number; avg_dwell_ms: number }>;
  top_products: Array<{ id: string; name: string; views: number; atc: number; atc_rate: number; avg_dwell_ms: number; rage_clicks: number; sessions: number }>;
  breakout_products: Summary['top_products'];
  best_dwell: Summary['top_products'];
  worst_rage: Summary['top_products'];
  top_landing: Array<{ path: string; count: number }>;
  top_exit: Array<{ path: string; count: number }>;
}

interface Insight { title: string; body: string; severity: 'info' | 'warning' | 'critical'; category: string; product_id?: string | null }
interface Recommendation { id: string; category: string; severity: string; title: string; body: string; status: string; created_at: string }
interface Draft { id: string; kind: string; output: string; created_at: string; product_name?: string | null }

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
  const [range, setRange] = useState<Range>('7d');
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

  async function loadSummary(r: Range) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-revenue-insights', {
        body: null,
        method: 'GET',
      } as any);
      // Fallback: use GET via fetch (invoke does not support GET params for all stacks)
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-revenue-insights?range=${r}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message || 'failed');
      setSummary(json.summary);
      // Suppress unused
      void data; void error;
    } catch (e: any) {
      toast.error('Failed to load metrics: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAi(persist: boolean) {
    setAiBusy(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-revenue-insights?range=${range}&ai=1${persist ? '&persist=1' : ''}`;
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

  useEffect(() => { loadSummary(range); }, [range]);
  useEffect(() => { loadRecs(); loadDrafts(); }, []);

  const winners = useMemo(() => {
    if (!summary) return [];
    return summary.top_products
      .filter(p => p.views >= 5 && p.atc_rate >= 3 && p.rage_clicks <= 1)
      .sort((a, b) => b.atc_rate - a.atc_rate)
      .slice(0, 8);
  }, [summary]);

  const rising = useMemo(() => {
    if (!summary) return [];
    return summary.breakout_products.filter(p => p.views >= 3 && p.views < 20).slice(0, 8);
  }, [summary]);

  return (
    <div className="max-w-7xl mx-auto px-3 py-6 space-y-6">
      <Helmet><title>AI Revenue Operator · GetPawsy Admin</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Brain className="w-6 h-6" /> AI Revenue Operator</h1>
          <p className="text-sm text-muted-foreground">Live funnel intelligence and AI-generated growth recommendations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
            <TabsList>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={() => loadSummary(range)} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card><CardHeader><CardTitle className="text-sm">Devices</CardTitle></CardHeader><CardContent className="text-sm space-y-1">
                {Object.entries(summary.devices).map(([k, v]) => <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="tabular-nums">{v}</span></div>)}
              </CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm">Operating systems</CardTitle></CardHeader><CardContent className="text-sm space-y-1">
                {Object.entries(summary.os).map(([k, v]) => <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="tabular-nums">{v}</span></div>)}
              </CardContent></Card>
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
            <h2 className="text-lg font-semibold">Product Intelligence</h2>
            <Tabs defaultValue="top">
              <TabsList className="flex-wrap">
                <TabsTrigger value="top">Most viewed</TabsTrigger>
                <TabsTrigger value="winners">Winners</TabsTrigger>
                <TabsTrigger value="rising">Rising</TabsTrigger>
                <TabsTrigger value="dwell">Best dwell</TabsTrigger>
                <TabsTrigger value="rage">High rage</TabsTrigger>
              </TabsList>
              {[
                { v: 'top', list: summary.top_products },
                { v: 'winners', list: winners },
                { v: 'rising', list: rising },
                { v: 'dwell', list: summary.best_dwell },
                { v: 'rage', list: summary.worst_rage },
              ].map(({ v, list }) => (
                <TabsContent key={v} value={v}>
                  <Card><CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs uppercase"><tr><th className="text-left p-2">Product</th><th className="text-right p-2">Views</th><th className="text-right p-2">ATC</th><th className="text-right p-2">ATC %</th><th className="text-right p-2">Dwell</th><th className="text-right p-2">Rage</th></tr></thead>
                      <tbody>
                        {list.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No data yet for this slice</td></tr>}
                        {list.map(p => (
                          <tr key={p.id} className="border-t"><td className="p-2 max-w-[14rem] truncate">{p.name}</td><td className="p-2 text-right tabular-nums">{p.views}</td><td className="p-2 text-right tabular-nums">{p.atc}</td><td className="p-2 text-right tabular-nums">{p.atc_rate}%</td><td className="p-2 text-right tabular-nums">{(p.avg_dwell_ms / 1000).toFixed(1)}s</td><td className="p-2 text-right tabular-nums">{p.rage_clicks}</td></tr>
                        ))}
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
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={aiBusy || !summary} onClick={() => runAi(false)}>
              {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate
            </Button>
            <Button size="sm" disabled={aiBusy || !summary} onClick={() => runAi(true)}>
              Save as recommendations
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {insights.map((it, i) => (
            <Card key={i}><CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardTitle className="text-sm">{it.title}</CardTitle><Badge variant={severityVariant(it.severity)}>{it.severity}</Badge></div><CardDescription className="text-xs uppercase">{it.category}</CardDescription></CardHeader><CardContent className="text-sm pt-0">{it.body}</CardContent></Card>
          ))}
          {!insights.length && <p className="text-sm text-muted-foreground">No insights yet. Click Generate to run the AI analyst.</p>}
        </div>
      </section>

      {/* Saved Recommendations */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Recommendations</h2>
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
        <h2 className="text-lg font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4" /> AI Content Generator</h2>
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
    </div>
  );
}