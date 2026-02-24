import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain, Play, Eye, FileText, Rocket, RefreshCw, CheckCircle2,
  Clock, AlertTriangle, XCircle, Link2, Zap, Shield, Settings,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type RunMode = 'dry_run' | 'plan_only' | 'plan_generate' | 'plan_publish_index';

interface EngineRun {
  id: string;
  mode: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  clusters_found: number;
  actions_planned: number;
  drafts_generated: number;
  urls_published: number;
  urls_indexed: number;
  summary: Record<string, unknown>;
}

interface ActionItem {
  id: string;
  action_type: string;
  target_url: string;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface ContentDraft {
  id: string;
  url: string;
  content_type: string;
  title: string;
  meta_description: string | null;
  word_count: number;
  status: string;
  created_at: string;
  markdown: string | null;
}

interface EngineConfig {
  max_new_urls_per_week: number;
  max_updates_per_week: number;
  max_title_rewrites_per_week: number;
  max_indexing_per_day: number;
  approval_required: boolean;
  auto_publish: boolean;
  min_words_guide: number;
  min_words_blog: number;
}

const MODE_CONFIG: Record<RunMode, { label: string; icon: React.ReactNode; description: string; variant: 'default' | 'outline' | 'destructive' }> = {
  dry_run: { label: 'Dry Run', icon: <Eye className="h-4 w-4" />, description: 'Simulate only — no writes', variant: 'outline' },
  plan_only: { label: 'Plan Only', icon: <FileText className="h-4 w-4" />, description: 'Cluster + plan actions, no content', variant: 'outline' },
  plan_generate: { label: 'Plan + Drafts', icon: <Brain className="h-4 w-4" />, description: 'Plan + generate content drafts', variant: 'default' },
  plan_publish_index: { label: 'Full Execute', icon: <Rocket className="h-4 w-4" />, description: 'Plan + generate + publish + index', variant: 'destructive' },
};

const statusBadge = (status: string) => {
  if (status === 'completed' || status === 'published' || status === 'approved' || status === 'executed')
    return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-[10px]">{status}</Badge>;
  if (status === 'running' || status === 'planned')
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px]">{status}</Badge>;
  if (status === 'draft')
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-[10px]">{status}</Badge>;
  if (status === 'failed' || status === 'rejected')
    return <Badge variant="destructive" className="text-[10px]">{status}</Badge>;
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
};

export function AutonomousSeoEngine() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<RunMode | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [runsRes, configRes] = await Promise.all([
      supabase.from('seo_engine_runs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.from('seo_engine_config').select('*').single(),
    ]);
    setRuns((runsRes.data || []) as EngineRun[]);
    if (configRes.data) setConfig(configRes.data as unknown as EngineConfig);

    // Load actions/drafts for latest run
    const latestRun = runsRes.data?.[0];
    if (latestRun) {
      setSelectedRun(latestRun.id);
      await loadRunDetails(latestRun.id);
    }
    setLoading(false);
  };

  const loadRunDetails = async (runId: string) => {
    const [actRes, draftRes] = await Promise.all([
      supabase.from('seo_actions_queue').select('*').eq('run_id', runId).order('created_at'),
      supabase.from('seo_content_drafts').select('*').eq('run_id', runId).order('created_at'),
    ]);
    setActions((actRes.data || []) as ActionItem[]);
    setDrafts((draftRes.data || []) as ContentDraft[]);
  };

  useEffect(() => { loadData(); }, []);

  const triggerRun = async (mode: RunMode) => {
    setRunning(mode);
    try {
      const { data, error } = await supabase.functions.invoke('autonomous-seo-engine', {
        body: { mode },
      });
      if (error) throw error;
      toast({ title: 'Engine run started', description: `Mode: ${mode} — ${data?.clusters_found || 0} clusters found` });
      await loadData();
    } catch (err) {
      toast({ title: 'Run failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  const updateConfig = async (key: keyof EngineConfig, value: boolean | number) => {
    if (!config) return;
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    await supabase.from('seo_engine_config').update({ [key]: value }).eq('id', '00000000-0000-0000-0000-000000000001');
  };

  const approveDraft = async (draftId: string) => {
    await supabase.from('seo_content_drafts').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', draftId);
    toast({ title: 'Draft approved' });
    if (selectedRun) await loadRunDetails(selectedRun);
  };

  const rejectDraft = async (draftId: string) => {
    await supabase.from('seo_content_drafts').update({ status: 'rejected' }).eq('id', draftId);
    if (selectedRun) await loadRunDetails(selectedRun);
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  const latestRun = runs[0];

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Brain className="h-7 w-7 text-primary" /> Autonomous SEO Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Cluster → Plan → Generate → Publish → Index — with guardrails
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Run Buttons */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Play className="h-4 w-4" /> Execute Run</CardTitle>
          <CardDescription className="text-xs">Choose execution mode. Guardrails enforce weekly quotas automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.entries(MODE_CONFIG) as [RunMode, typeof MODE_CONFIG[RunMode]][]).map(([mode, cfg]) => (
              <Button
                key={mode}
                variant={cfg.variant}
                className="h-auto py-3 flex flex-col items-start gap-1"
                disabled={running !== null}
                onClick={() => triggerRun(mode)}
              >
                <div className="flex items-center gap-2">
                  {running === mode ? <RefreshCw className="h-4 w-4 animate-spin" /> : cfg.icon}
                  <span className="font-semibold text-sm">{cfg.label}</span>
                </div>
                <span className="text-[10px] opacity-70 font-normal">{cfg.description}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Config + Latest Run Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Config */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Settings className="h-4 w-4" /> Guardrails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="approval" className="text-xs">Approval Required</Label>
              <Switch id="approval" checked={config?.approval_required ?? true} onCheckedChange={v => updateConfig('approval_required', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="autopub" className="text-xs">Auto-Publish</Label>
              <Switch id="autopub" checked={config?.auto_publish ?? false} onCheckedChange={v => updateConfig('auto_publish', v)} />
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>New URLs/week</span><Badge variant="outline">{config?.max_new_urls_per_week ?? 3}</Badge></div>
              <div className="flex justify-between"><span>Updates/week</span><Badge variant="outline">{config?.max_updates_per_week ?? 5}</Badge></div>
              <div className="flex justify-between"><span>Title rewrites/week</span><Badge variant="outline">{config?.max_title_rewrites_per_week ?? 5}</Badge></div>
              <div className="flex justify-between"><span>Indexing/day</span><Badge variant="outline">{config?.max_indexing_per_day ?? 10}</Badge></div>
              <div className="flex justify-between"><span>Min words (guide)</span><Badge variant="outline">{config?.min_words_guide ?? 900}</Badge></div>
              <div className="flex justify-between"><span>Min words (blog)</span><Badge variant="outline">{config?.min_words_blog ?? 600}</Badge></div>
            </div>
          </CardContent>
        </Card>

        {/* Latest Run */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" /> Latest Run</CardTitle>
          </CardHeader>
          <CardContent>
            {latestRun ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(latestRun.status)}
                  <Badge variant="outline" className="text-[10px]">{latestRun.mode}</Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(latestRun.started_at).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="text-center"><p className="text-2xl font-bold">{latestRun.clusters_found}</p><p className="text-[10px] text-muted-foreground">Clusters</p></div>
                  <div className="text-center"><p className="text-2xl font-bold">{latestRun.actions_planned}</p><p className="text-[10px] text-muted-foreground">Actions</p></div>
                  <div className="text-center"><p className="text-2xl font-bold">{latestRun.drafts_generated}</p><p className="text-[10px] text-muted-foreground">Drafts</p></div>
                  <div className="text-center"><p className="text-2xl font-bold">{latestRun.urls_published}</p><p className="text-[10px] text-muted-foreground">Published</p></div>
                  <div className="text-center"><p className="text-2xl font-bold">{latestRun.urls_indexed}</p><p className="text-[10px] text-muted-foreground">Indexed</p></div>
                </div>
                {latestRun.summary && typeof latestRun.summary === 'object' && (latestRun.summary as Record<string, unknown>).top_clusters && (
                  <div className="mt-3">
                    <p className="text-xs font-medium mb-2">Top Clusters</p>
                    <div className="space-y-1">
                      {((latestRun.summary as Record<string, unknown>).top_clusters as Array<{ label: string; impressions: number; avg_position: number; intent: string }>)?.slice(0, 5).map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[9px]">{c.intent}</Badge>
                          <span className="font-mono truncate flex-1">{c.label}</span>
                          <span className="text-muted-foreground">{c.impressions} imp</span>
                          <span className="text-muted-foreground">pos {c.avg_position}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No runs yet. Click a mode above to start.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Actions, Drafts, History */}
      <Tabs defaultValue="actions" className="w-full">
        <TabsList className="w-full flex h-auto gap-1">
          <TabsTrigger value="actions" className="text-xs py-2 gap-1 flex-1">
            <Link2 className="h-3.5 w-3.5 hidden sm:block" /> Actions ({actions.length})
          </TabsTrigger>
          <TabsTrigger value="drafts" className="text-xs py-2 gap-1 flex-1">
            <FileText className="h-3.5 w-3.5 hidden sm:block" /> Drafts ({drafts.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs py-2 gap-1 flex-1">
            <Clock className="h-3.5 w-3.5 hidden sm:block" /> History ({runs.length})
          </TabsTrigger>
        </TabsList>

        {/* Actions */}
        <TabsContent value="actions" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No actions in this run</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {actions.map(a => (
                      <div key={a.id} className="border rounded-lg p-3 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={a.action_type === 'NEW_URL' ? 'destructive' : a.action_type === 'UPDATE' ? 'default' : 'secondary'} className="text-[10px]">
                            {a.action_type}
                          </Badge>
                          {statusBadge(a.status)}
                        </div>
                        <p className="font-mono text-xs truncate">{a.target_url}</p>
                        {a.payload && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(a.payload as Record<string, unknown>).top_keywords &&
                              ((a.payload as Record<string, unknown>).top_keywords as string[]).slice(0, 3).map((kw, i) => (
                                <Badge key={i} variant="outline" className="text-[9px]">{kw}</Badge>
                              ))
                            }
                            {(a.payload as Record<string, unknown>).total_impressions && (
                              <span className="text-[10px] text-muted-foreground">{String((a.payload as Record<string, unknown>).total_impressions)} imp</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Drafts */}
        <TabsContent value="drafts" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              {drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No drafts. Run in "Plan + Drafts" mode to generate content.</p>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {drafts.map(d => (
                      <div key={d.id} className="border rounded-lg p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[9px]">{d.content_type}</Badge>
                              {statusBadge(d.status)}
                              <span className="text-[10px] text-muted-foreground">{d.word_count} words</span>
                            </div>
                            <h3 className="text-sm font-semibold truncate">{d.title}</h3>
                            <p className="text-[11px] text-muted-foreground truncate">{d.meta_description}</p>
                            <p className="font-mono text-[10px] text-muted-foreground truncate mt-1">{d.url}</p>
                          </div>
                          {d.status === 'draft' && (
                            <div className="flex gap-1 flex-shrink-0">
                              <Button size="sm" className="h-7 text-[10px]" onClick={() => approveDraft(d.id)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => rejectDraft(d.id)}>
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                        {d.markdown && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-primary hover:underline">Preview content</summary>
                            <pre className="mt-2 p-3 bg-muted rounded-lg text-[11px] whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                              {d.markdown.slice(0, 2000)}{d.markdown.length > 2000 ? '\n\n... (truncated)' : ''}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {runs.map(r => (
                    <div
                      key={r.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedRun === r.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => { setSelectedRun(r.id); loadRunDetails(r.id); }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(r.status)}
                        <Badge variant="outline" className="text-[10px]">{r.mode}</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                      </div>
                      <div className="flex gap-4 mt-1 text-[11px] text-muted-foreground">
                        <span>{r.clusters_found} clusters</span>
                        <span>{r.actions_planned} actions</span>
                        <span>{r.drafts_generated} drafts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Safety Banner */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle className="text-sm">Guardrails Active</AlertTitle>
        <AlertDescription className="text-xs">
          Max {config?.max_new_urls_per_week ?? 3} new URLs/week · Max {config?.max_updates_per_week ?? 5} updates/week ·
          Max {config?.max_indexing_per_day ?? 10} indexing/day · {config?.approval_required ? 'Approval required' : 'Auto-approve ON'} ·
          All canonicals/links use apex domain only (getpawsy.pet)
        </AlertDescription>
      </Alert>
    </div>
  );
}
