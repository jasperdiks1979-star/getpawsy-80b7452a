import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, Sparkles, TrendingUp, TrendingDown, Zap, Target,
  BarChart3, RefreshCw, Play, Eye, MousePointerClick, Bookmark, Hash
} from 'lucide-react';
import { toast } from 'sonner';

interface DashboardStats {
  totalPins: number;
  totalImpressions: number;
  totalClicks: number;
  totalSaves: number;
  avgCtr: number;
  avgScore: number;
  queuedPins: number;
  publishedPins: number;
}

interface PinPerformance {
  id: string;
  pin_id: string;
  product_id: string;
  pin_title: string;
  hook_angle: string;
  impressions: number;
  clicks: number;
  saves: number;
  ctr: number;
  performance_score: number;
  status: string;
}

interface KeywordData {
  id: string;
  keyword: string;
  total_impressions: number;
  total_clicks: number;
  total_saves: number;
  avg_ctr: number;
  pin_count: number;
}

export default function PinterestScaleModePage() {
  const queryClient = useQueryClient();
  const [syncData, setSyncData] = useState('');

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['pinterest-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-optimizer', {
        body: { action: 'get_dashboard_stats' },
      });
      if (error) throw error;
      return data as {
        stats: DashboardStats;
        topPerformers: PinPerformance[];
        lowPerformers: PinPerformance[];
        topKeywords: KeywordData[];
      };
    },
    refetchInterval: 30000,
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-optimizer', {
        body: { action: 'analyze_and_optimize' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pinterest-dashboard'] });
      toast.success(`Optimization complete: ${data.newVariations} variations, ${data.replacements} replacements`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkGenerateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-optimizer', {
        body: { action: 'bulk_generate' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pinterest-dashboard'] });
      toast.success(`Generated pins for ${data.newly_generated} new products`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const scale100Mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-automation', {
        body: { action: 'scale_100', targetPins: 100, productCount: 10 },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Scale 100 failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pinterest-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pinterest-queue'] });
      toast.success(`Queued ${data.queued} pins across ${data.productsUsed} products (24h spread)`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const publishNextMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-automation', {
        body: { action: 'publish_next' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['pinterest-queue'] });
      if (data?.published) toast.success(`Published pin: ${data.published}`);
      else toast.message(data?.message || data?.error || 'No action');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const retryFailedMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-automation', {
        body: { action: 'retry_failed' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinterest-queue'] });
      toast.success('Failed pins requeued');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: approval, refetch: refetchApproval } = useQuery({
    queryKey: ['pinterest-approval-check'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-automation', {
        body: { action: 'approval_check' },
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        mode: 'sandbox' | 'production';
        api_base: string;
        can_publish_production: boolean;
        sandbox_working: boolean;
        pins_created: number;
        verified_pins_count?: number;
        ready_for_upgrade: boolean;
        recent_logs: any[];
      };
    },
    refetchInterval: 60000,
  });

  const testPublishMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('pinterest-automation', {
        body: { action: 'test_publish_sandbox' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Test publish failed');
      return data;
    },
    onSuccess: (data: any) => {
      refetchApproval();
      const ok = data?.success_count || 0;
      toast.success(`Created ${ok}/${data?.created?.length || 0} test pins on ${data?.mode}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setModeMutation = useMutation({
    mutationFn: async (mode: 'sandbox' | 'production') => {
      const { data, error } = await supabase.functions.invoke('pinterest-automation', {
        body: { action: 'set_mode', mode },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to switch mode');
      return data;
    },
    onSuccess: (data: any) => {
      refetchApproval();
      toast.success(`Pinterest mode set to ${data.mode}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncMutation = useMutation({
    mutationFn: async (pins: any[]) => {
      const { data, error } = await supabase.functions.invoke('pinterest-optimizer', {
        body: { action: 'sync_performance', performanceData: { pins } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pinterest-dashboard'] });
      toast.success(`Synced ${data.updated} pins`);
      setSyncData('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSyncSubmit = () => {
    try {
      const pins = JSON.parse(syncData);
      syncMutation.mutate(Array.isArray(pins) ? pins : [pins]);
    } catch {
      toast.error('Invalid JSON format');
    }
  };

  const stats = dashboard?.stats;
  const scoreColor = (score: number) => score > 60 ? 'text-green-600' : score > 30 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" />
            Pinterest Scale Mode
          </h1>
          <p className="text-muted-foreground mt-1">Self-optimizing traffic engine</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => bulkGenerateMutation.mutate()}
            disabled={bulkGenerateMutation.isPending}
          >
            {bulkGenerateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            Auto-Generate
          </Button>
          <Button
            onClick={() => optimizeMutation.mutate()}
            disabled={optimizeMutation.isPending}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
          >
            {optimizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Run Optimization
          </Button>
        </div>
      </div>

      {/* Scale Engine — 100 Pins/Day */}
      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" /> Scale Engine — 100 Pins/Day
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Generates 100 pins from 10 cat products (litter boxes, cat trees, cat care). 10 unique
            hooks per product, distributed across 4 boards, randomized over 24h to avoid burst posting.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => scale100Mutation.mutate()}
              disabled={scale100Mutation.isPending}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              {scale100Mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
              Generate 100 Pins
            </Button>
            <Button
              variant="outline"
              onClick={() => scale100Mutation.mutate()}
              disabled={scale100Mutation.isPending}
            >
              <Play className="h-4 w-4 mr-1" /> Queue Next 100
            </Button>
            <Button
              variant="outline"
              onClick={() => publishNextMutation.mutate()}
              disabled={publishNextMutation.isPending}
            >
              {publishNextMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Publish Next Pin Now
            </Button>
            <Button
              variant="outline"
              onClick={() => retryFailedMutation.mutate()}
              disabled={retryFailedMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Retry Failed
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pinterest Approval Readiness */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-500" /> Pinterest Approval Readiness
            {approval?.mode && (
              <span
                className={`ml-2 px-2 py-0.5 rounded text-xs font-bold tracking-wide ${
                  approval.mode === 'production'
                    ? 'bg-green-500/20 text-green-700 border border-green-500/40'
                    : 'bg-amber-500/20 text-amber-700 border border-amber-500/40'
                }`}
              >
                {approval.mode === 'production' ? 'PRODUCTION MODE' : 'SANDBOX MODE ACTIVE'}
              </span>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Mode: <span className="font-mono">{approval?.mode || '…'}</span> · API:{' '}
            <span className="font-mono">{approval?.api_base || '…'}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="p-2 rounded bg-background border">
              <div className="text-xs text-muted-foreground">Pins created</div>
              <div className="text-lg font-bold">{approval?.pins_created ?? '—'}</div>
            </div>
            <div className="p-2 rounded bg-background border">
              <div className="text-xs text-muted-foreground">Verified pins</div>
              <div className="text-lg font-bold">{approval?.verified_pins_count ?? '—'}</div>
            </div>
            <div className="p-2 rounded bg-background border">
              <div className="text-xs text-muted-foreground">Sandbox working</div>
              <div className="text-lg font-bold">{approval?.sandbox_working ? '✅' : '⏳'}</div>
            </div>
            <div className="p-2 rounded bg-background border">
              <div className="text-xs text-muted-foreground">Can publish prod</div>
              <div className="text-lg font-bold">{approval?.can_publish_production ? '✅' : '❌'}</div>
            </div>
            <div className="p-2 rounded bg-background border">
              <div className="text-xs text-muted-foreground">Ready for upgrade</div>
              <div className="text-lg font-bold">{approval?.ready_for_upgrade ? '✅' : '❌'}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => testPublishMutation.mutate()}
              disabled={testPublishMutation.isPending}
              variant="outline"
            >
              {testPublishMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Create 3 Test Pins (Sandbox)
            </Button>
            <Button
              variant="outline"
              disabled={!approval?.ready_for_upgrade}
              onClick={() => {
                const proof = (approval?.recent_logs || [])
                  .filter((l: any) => l.status === 'success')
                  .slice(0, 5);
                if (!proof.length) {
                  toast.error('No proof logs found yet — run test pins first');
                  return;
                }
                navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
                toast.success('Proof logs copied to clipboard — paste in Pinterest upgrade request');
              }}
            >
              Request Production Upgrade Ready
            </Button>
            {approval?.mode === 'sandbox' ? (
              <Button
                variant="default"
                disabled={setModeMutation.isPending}
                onClick={() => {
                  if (confirm('Switch Pinterest to PRODUCTION mode? Only do this after Pinterest approval.')) {
                    setModeMutation.mutate('production');
                  }
                }}
              >
                {setModeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Switch to Production Mode
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={setModeMutation.isPending}
                onClick={() => setModeMutation.mutate('sandbox')}
              >
                Switch to Sandbox Mode
              </Button>
            )}
          </div>
          {approval?.recent_logs?.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Recent proof logs</summary>
              <pre className="mt-2 p-2 bg-background border rounded overflow-auto max-h-60">
{JSON.stringify(approval.recent_logs.slice(0, 10), null, 2)}
              </pre>
            </details>
          ) : null}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Active Pins" value={stats?.totalPins || 0} />
        <StatCard icon={<Eye className="h-4 w-4" />} label="Total Impressions" value={formatNum(stats?.totalImpressions || 0)} />
        <StatCard icon={<MousePointerClick className="h-4 w-4" />} label="Total Clicks" value={formatNum(stats?.totalClicks || 0)} />
        <StatCard icon={<Bookmark className="h-4 w-4" />} label="Total Saves" value={formatNum(stats?.totalSaves || 0)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-primary">{((stats?.avgCtr || 0) * 100).toFixed(2)}%</div>
            <div className="text-sm text-muted-foreground">Avg CTR</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className={`text-3xl font-bold ${scoreColor(stats?.avgScore || 0)}`}>{stats?.avgScore || 0}</div>
            <div className="text-sm text-muted-foreground">Avg Performance Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{stats?.queuedPins || 0}</div>
            <div className="text-sm text-muted-foreground">Queued for Publishing</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="performers">
        <TabsList>
          <TabsTrigger value="performers">Top & Low Performers</TabsTrigger>
          <TabsTrigger value="keywords">Keyword Intelligence</TabsTrigger>
          <TabsTrigger value="queue">Publish Queue</TabsTrigger>
          <TabsTrigger value="sync">Sync Data</TabsTrigger>
        </TabsList>

        <TabsContent value="performers" className="space-y-4">
          {/* Top performers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" /> Top Performers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard?.topPerformers?.length ? (
                <div className="space-y-3">
                  {dashboard.topPerformers.map((pin) => (
                    <PinRow key={pin.id} pin={pin} type="top" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No performance data yet. Sync your Pinterest analytics to get started.</p>
              )}
            </CardContent>
          </Card>

          {/* Low performers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" /> Low Performers (candidates for replacement)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard?.lowPerformers?.length ? (
                <div className="space-y-3">
                  {dashboard.lowPerformers.map((pin) => (
                    <PinRow key={pin.id} pin={pin} type="low" />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No low performers detected yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keywords">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Hash className="h-5 w-5" /> Top Keywords
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dashboard?.topKeywords?.length ? (
                <div className="space-y-2">
                  {dashboard.topKeywords.map((kw) => (
                    <div key={kw.id} className="flex items-center justify-between p-3 bg-accent/30 rounded-lg">
                      <div>
                        <Badge variant="secondary">{kw.keyword}</Badge>
                        <span className="text-xs text-muted-foreground ml-2">{kw.pin_count} pins</span>
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span>{formatNum(kw.total_impressions)} imp</span>
                        <span>{formatNum(kw.total_clicks)} clicks</span>
                        <span>{((kw.avg_ctr || 0) * 100).toFixed(1)}% CTR</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Keywords will populate after optimization runs.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>

        <TabsContent value="sync">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <RefreshCw className="h-5 w-5" /> Sync Performance Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paste Pinterest analytics data as JSON. Each pin needs: pin_id, impressions, clicks, saves.
                Optionally include: product_id, product_url, title, hook_angle.
              </p>
              <textarea
                className="w-full h-40 p-3 border rounded-lg font-mono text-xs bg-background"
                placeholder={`[\n  {\n    "pin_id": "123456",\n    "impressions": 5000,\n    "clicks": 150,\n    "saves": 80,\n    "product_id": "...",\n    "title": "..."\n  }\n]`}
                value={syncData}
                onChange={(e) => setSyncData(e.target.value)}
              />
              <Button onClick={handleSyncSubmit} disabled={syncMutation.isPending || !syncData.trim()}>
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Sync Performance
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QueueTab() {
  const { data: queue, isLoading } = useQuery({
    queryKey: ['pinterest-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pinterest_publish_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="flex items-center gap-2 p-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading queue...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5" /> Publish Queue ({queue?.length || 0} pins)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {queue?.length ? (
          <div className="space-y-3">
            {queue.map((item: any) => (
              <div key={item.id} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate max-w-md">{item.pin_title}</span>
                  <Badge variant={item.status === 'published' ? 'default' : item.status === 'queued' ? 'secondary' : 'outline'}>
                    {item.status}
                  </Badge>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{item.hook_angle}</span>
                  <span>{item.posting_slot}</span>
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                {item.pin_external_id && (
                  <a
                    href={`https://www.pinterest.com/pin/${item.pin_external_id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline"
                  >
                    View live pin →
                  </a>
                )}
                {item.error_message && (
                  <div className="text-xs text-destructive truncate">⚠ {item.error_message}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Queue is empty. Run optimization to generate new pins.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PinRow({ pin, type }: { pin: PinPerformance; type: 'top' | 'low' }) {
  const maxScore = 100;
  const scorePercent = Math.min((pin.performance_score / maxScore) * 100, 100);

  return (
    <div className="p-3 border rounded-lg space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm truncate max-w-md">{pin.pin_title || pin.pin_id}</span>
        <Badge variant={type === 'top' ? 'default' : 'destructive'} className="text-xs">
          Score: {pin.performance_score}
        </Badge>
      </div>
      <Progress value={scorePercent} className="h-1.5" />
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{formatNum(pin.impressions)} imp</span>
        <span>{formatNum(pin.clicks)} clicks</span>
        <span>{formatNum(pin.saves)} saves</span>
        <span>{((pin.ctr || 0) * 100).toFixed(2)}% CTR</span>
        {pin.hook_angle && <Badge variant="outline" className="text-xs">{pin.hook_angle}</Badge>}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">{icon}<span className="text-xs">{label}</span></div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
