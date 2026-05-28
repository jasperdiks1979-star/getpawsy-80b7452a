/**
 * /admin/ai-seo — Iteration C
 *
 * Data-driven AI SEO recommendations: keyword gaps, FAQs, internal links,
 * metadata, schema, low-CTR warnings, orphan pages, weak content, guide ideas.
 *
 * Draft-only. NEVER touches canonicals, sitemap, robots, or routing.
 */
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, RefreshCw, Check, X, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

type SeoKind =
  | 'keyword_gap' | 'faq' | 'internal_link' | 'metadata' | 'schema'
  | 'low_ctr_warning' | 'orphan_page' | 'weak_content' | 'guide_idea' | 'collection_expansion';

const KIND_LABELS: Record<SeoKind, string> = {
  keyword_gap: 'Keyword gap opportunities',
  faq: 'FAQ block suggestions',
  internal_link: 'Internal link suggestions',
  metadata: 'Title / meta improvements',
  schema: 'Schema opportunities',
  low_ctr_warning: 'Low-CTR page warnings',
  orphan_page: 'Orphan page detection',
  weak_content: 'Weak content detection',
  guide_idea: 'Guide / article ideas',
  collection_expansion: 'Collection expansion ideas',
};

type Status = 'suggested' | 'approved' | 'draft_ready' | 'published' | 'dismissed';

interface DraftRow {
  id: string;
  kind: SeoKind;
  affected_url: string | null;
  title: string;
  body: string | null;
  recommendations: string[];
  evidence: Record<string, unknown>;
  quality_score: number | null;
  quality_flags: string[];
  confidence: number | null;
  expected_seo_impact: string | null;
  priority: string;
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

const PRIORITY_TONES: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  low: 'bg-muted text-muted-foreground',
};

export default function AiSeoPage() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [kind, setKind] = useState<SeoKind>('keyword_gap');
  const [focus, setFocus] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('ai_seo_drafts')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(100);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (priorityFilter !== 'all') q = q.eq('priority', priorityFilter);
    const { data, error } = await q;
    if (error) { toast.error('Failed to load drafts: ' + error.message); setLoading(false); return; }
    setRows((data ?? []) as unknown as DraftRow[]);
    setLoading(false);
  }, [statusFilter, priorityFilter]);

  useEffect(() => { load(); }, [load]);

  const generate = async (force = false) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-content-generate', {
        body: { family: 'seo', kind, focus: focus.trim() || undefined, range: '30d', force },
      });
      if (error) { toast.error('Generation failed: ' + error.message); return; }
      if (!(data as any)?.ok) {
        if ((data as any)?.rate_limited) toast.error('AI rate-limited, try again in a minute.');
        else if ((data as any)?.credits_exhausted) toast.error('AI credits exhausted. Add funds in Settings.');
        else toast.error((data as any)?.message || 'Generation failed');
        return;
      }
      const d = data as any;
      if (d.deduped) {
        toast.info('Recent drafts already exist. Use Force to regenerate.');
      } else {
        toast.success(`Inserted ${d.inserted} SEO draft(s)${d.rejected?.length ? `, ${d.rejected.length} rejected` : ''}`);
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
    const { error } = await supabase.from('ai_seo_drafts').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  return (
    <>
      <Helmet>
        <title>AI SEO Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="container max-w-6xl py-6 px-4 sm:py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" /> AI SEO Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Buyer-intent SEO recommendations grounded in real site data. Draft-only — no canonical, sitemap, or routing changes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generate</CardTitle>
            <CardDescription>Pick the recommendation kind and (optionally) focus area.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Kind</label>
                <Select value={kind} onValueChange={(v) => setKind(v as SeoKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Focus (optional)</label>
                <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. cat trees, dog travel" maxLength={200} />
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

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">SEO opportunities</CardTitle>
                <CardDescription>{rows.length} drafts</CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['all','suggested','approved','draft_ready','published','dismissed'] as const).map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['all','high','medium','low'] as const).map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No SEO drafts yet. Generate some above.</p>
            ) : (
              <ul className="space-y-3">
                {rows.map(r => (
                  <li key={r.id} className="rounded-lg border border-border p-3 sm:p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{KIND_LABELS[r.kind] ?? r.kind}</Badge>
                      <Badge className={STATUS_TONES[r.status]} variant="outline">{r.status}</Badge>
                      <Badge className={PRIORITY_TONES[r.priority] ?? PRIORITY_TONES.medium} variant="outline">
                        {r.priority}
                      </Badge>
                      {r.expected_seo_impact && <Badge variant="outline">impact: {r.expected_seo_impact}</Badge>}
                      {typeof r.confidence === 'number' && (
                        <Badge variant="outline">conf {Math.round(r.confidence * 100)}%</Badge>
                      )}
                      {typeof r.quality_score === 'number' && (
                        <Badge variant="outline">q{Math.round(r.quality_score)}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(r.generated_at).toLocaleString()}</span>
                    </div>
                    <div className="font-medium">{r.title}</div>
                    {r.affected_url && (
                      <div className="text-xs font-mono text-muted-foreground break-all">{r.affected_url}</div>
                    )}
                    {r.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.body}</p>}
                    {r.recommendations?.length > 0 && (
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {r.recommendations.map((rec, i) => (<li key={i}>{rec}</li>))}
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