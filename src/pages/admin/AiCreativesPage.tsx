/**
 * /admin/ai-creatives — Iteration C
 *
 * Data-driven AI Creative Engine. Generates TikTok hooks, Pinterest concepts,
 * Meta ad angles, hero copy, PDP blocks, UGC ideas, and benefit bullets using
 * REAL funnel + insight data from ai-revenue-insights + ai_revenue_insights.
 *
 * Draft-only. Never auto-publishes. Admin-only via AdminRouteGuard.
 * Lazy-loaded in App.tsx so it adds zero bytes to the storefront bundle.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, RefreshCw, Copy as CopyIcon, Check, X, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import LandingMatchAnalyzer from '@/components/admin/analytics/LandingMatchAnalyzer';

type CreativeKind =
  | 'tiktok_hook' | 'pinterest_concept' | 'meta_angle' | 'hero_copy'
  | 'pdp_block' | 'ugc_idea' | 'benefit_bullets' | 'homepage_promo' | 'scroll_stopper';

const KIND_LABELS: Record<CreativeKind, string> = {
  tiktok_hook: 'TikTok hooks',
  pinterest_concept: 'Pinterest concepts',
  meta_angle: 'Meta ad angles',
  hero_copy: 'Mobile hero copy',
  pdp_block: 'PDP conversion blocks',
  ugc_idea: 'UGC content ideas',
  benefit_bullets: 'Benefit bullets',
  homepage_promo: 'Homepage promo ideas',
  scroll_stopper: 'Scroll-stopping intros',
};

type Status = 'suggested' | 'approved' | 'draft_ready' | 'published' | 'dismissed';

interface DraftRow {
  id: string;
  kind: CreativeKind;
  target_ref: string | null;
  title: string;
  body: string | null;
  variants: string[];
  evidence: Record<string, unknown>;
  quality_score: number | null;
  quality_flags: string[];
  confidence: number | null;
  expected_revenue_impact: string | null;
  traffic_source: string | null;
  status: Status;
  model: string | null;
  generated_at: string;
}

const STATUS_TONES: Record<Status, string> = {
  suggested: 'bg-muted text-muted-foreground',
  approved: 'bg-primary/10 text-primary',
  draft_ready: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  published: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  dismissed: 'bg-destructive/10 text-destructive',
};

export default function AiCreativesPage() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [kind, setKind] = useState<CreativeKind>('tiktok_hook');
  const [source, setSource] = useState('all');
  const [focus, setFocus] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('ai_creative_drafts')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(100);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    const { data, error } = await q;
    if (error) { toast.error('Failed to load drafts: ' + error.message); setLoading(false); return; }
    setRows((data ?? []) as unknown as DraftRow[]);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const generate = async (force = false) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-content-generate', {
        body: { family: 'creative', kind, source, focus: focus.trim() || undefined, range: '7d', force },
      });
      if (error) { toast.error('Generation failed: ' + error.message); return; }
      if (!(data as any)?.ok) {
        const msg = (data as any)?.message || 'Generation failed';
        if ((data as any)?.rate_limited) toast.error('AI rate-limited, try again in a minute.');
        else if ((data as any)?.credits_exhausted) toast.error('AI credits exhausted. Add funds in Settings.');
        else toast.error(msg);
        return;
      }
      const d = data as any;
      if (d.deduped) {
        toast.info('Recent drafts already exist. Use Force to regenerate.');
      } else {
        toast.success(`Inserted ${d.inserted} draft(s)${d.rejected?.length ? `, ${d.rejected.length} rejected by quality filter` : ''}`);
      }
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (id: string, status: Status) => {
    const patch: any = { status };
    if (status === 'approved' || status === 'draft_ready') patch.reviewed_at = new Date().toISOString();
    if (status === 'dismissed') patch.dismissed_at = new Date().toISOString();
    if (status === 'published') patch.published_at = new Date().toISOString();
    const { error } = await supabase.from('ai_creative_drafts').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const copyVariant = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied'));
  };

  const filtered = useMemo(() => rows.filter(r => r.kind === kind || statusFilter !== 'all'), [rows, kind, statusFilter]);

  return (
    <>
      <Helmet>
        <title>AI Creative Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="container max-w-6xl py-6 px-4 sm:py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> AI Creative Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Data-driven draft variants from real funnel + insight evidence. Draft-only — nothing auto-publishes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generate</CardTitle>
            <CardDescription>Pick kind, optionally focus on a product/source, then generate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Kind</label>
                <Select value={kind} onValueChange={(v) => setKind(v as CreativeKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Traffic source</label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['all','tiktok','pinterest','google','organic','direct','other'].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Focus (optional)</label>
                <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. cat litter box, mobile bounce" maxLength={200} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => generate(false)} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                Generate
              </Button>
              <Button variant="outline" onClick={() => generate(true)} disabled={generating}>
                Force (skip dedupe)
              </Button>
              <Button variant="ghost" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <LandingMatchAnalyzer />

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Creative queue</CardTitle>
                <CardDescription>{filtered.length} drafts</CardDescription>
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['all','suggested','approved','draft_ready','published','dismissed'] as const).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No drafts yet. Generate some above.</p>
            ) : (
              <ul className="space-y-3">
                {filtered.map(r => (
                  <li key={r.id} className="rounded-lg border border-border p-3 sm:p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{KIND_LABELS[r.kind] ?? r.kind}</Badge>
                      <Badge className={STATUS_TONES[r.status]} variant="outline">{r.status}</Badge>
                      {r.traffic_source && <Badge variant="secondary">{r.traffic_source}</Badge>}
                      {r.expected_revenue_impact && <Badge variant="outline">impact: {r.expected_revenue_impact}</Badge>}
                      {typeof r.confidence === 'number' && (
                        <Badge variant="outline">conf {Math.round(r.confidence * 100)}%</Badge>
                      )}
                      {typeof r.quality_score === 'number' && (
                        <Badge variant="outline">q{Math.round(r.quality_score)}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(r.generated_at).toLocaleString()}</span>
                    </div>
                    <div className="font-medium">{r.title}</div>
                    {r.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.body}</p>}
                    {r.variants?.length > 0 && (
                      <ul className="space-y-1">
                        {r.variants.map((v, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm bg-muted/40 rounded px-2 py-1">
                            <span className="flex-1">{v}</span>
                            <button onClick={() => copyVariant(v)} className="text-muted-foreground hover:text-foreground" aria-label="Copy variant">
                              <CopyIcon className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.quality_flags?.length > 0 && (
                      <div className="text-xs text-amber-600 dark:text-amber-400">flags: {r.quality_flags.join(', ')}</div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'approved')}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'draft_ready')}>
                        Mark draft-ready
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, 'dismissed')}>
                        <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}