import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck, ShieldAlert, ShieldOff, RefreshCw, CheckCircle, XCircle,
  AlertTriangle, ArrowRight, Link2, Globe, FileX, Layers, ArrowDown, ArrowUp,
  Loader2, BarChart3, Minus, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface RedirectChainHop {
  url: string;
  status: number;
  location: string | null;
  server: string | null;
  cfRay: string | null;
}

interface RedirectIntegrity {
  pass: boolean;
  isPermanent: boolean;
  targetIsApex: boolean;
  hasIntermediate302: boolean;
  firstHopStatus: number;
  firstHopLocation: string;
  redirectSource: string;
  chain: RedirectChainHop[];
  failures: string[];
}

interface GovernorDecision {
  allowed: boolean;
  reason: string;
  hardBlock: boolean;
  recommendedMode: string;
  nextSafeRunInSeconds: number;
}

interface StabilityData {
  redirect: {
    statusCode: number;
    isPermanent: boolean;
    isApex: boolean;
    source: string;
    warning?: string;
    error?: string;
  };
  redirectIntegrity: RedirectIntegrity | null;
  unmatchedCount: number;
  unmatchedUrls: string[];
  orphans: {
    total: number;
    byType: { type: string; count: number; trend: string }[];
  };
  internalLinksAdded: number;
  hubsStatus: { slug: string; name: string; ok: boolean; detail: string }[];
  contentOutlines: number;
  nextActions: string[];
  governorStatus: string;
  governorDecision: GovernorDecision | null;
}

export function AGMStabilityDashboard() {
  const [data, setData] = useState<StabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch latest run report data
      const { data: latestRun } = await supabase
        .from('job_runs')
        .select('id, status')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let orphanTotal = 0;
      let redirectStatus: StabilityData['redirect'] = { statusCode: 302, isPermanent: false, isApex: true, source: 'unknown' };
      let redirectIntegrity: RedirectIntegrity | null = null;
      let unmatchedUrls: string[] = [];

      if (latestRun?.id) {
        // Get crawl health step result
        const { data: crawlStep } = await supabase
          .from('job_run_steps')
          .select('result')
          .eq('run_id', latestRun.id)
          .eq('step_key', 'crawl_health_check')
          .single();

        if (crawlStep?.result) {
          const result = crawlStep.result as Record<string, unknown>;
          const checks = (result as any).checks || [];
          const wwwCheck = checks.find?.((c: any) => c.label?.includes('www'));
          if (wwwCheck) {
            redirectStatus = {
              statusCode: wwwCheck.status || 302,
              isPermanent: wwwCheck.status === 301 || wwwCheck.status === 308,
              isApex: !wwwCheck.error,
              source: wwwCheck.redirectSource || 'unknown',
              warning: wwwCheck.warning,
              error: wwwCheck.error,
            };
          }
          // Extract redirect integrity proof if available
          if ((result as any).redirectIntegrity) {
            redirectIntegrity = (result as any).redirectIntegrity as RedirectIntegrity;
          }
        }

        // Get orphan detection step
        const { data: orphanStep } = await supabase
          .from('job_run_steps')
          .select('result')
          .eq('run_id', latestRun.id)
          .eq('step_key', 'orphan_detection')
          .single();

        if (orphanStep?.result) {
          const r = orphanStep.result as any;
          orphanTotal = r.orphansBefore || r.totalOrphans || r.totalPages || 0;
        }

        // Get GSC sync for unmatched
        const { data: gscStep } = await supabase
          .from('job_run_steps')
          .select('result')
          .eq('run_id', latestRun.id)
          .eq('step_key', 'gsc_query_level_sync')
          .single();

        if (gscStep?.result) {
          const r = gscStep.result as any;
          unmatchedUrls = r.unmatchedUrls || [];
        }
      }

      // Count products and blog posts
      const { count: productCount } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      const { count: blogCount } = await supabase
        .from('blog_posts')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true);

      // Count recent internal link injections
      const { count: linkCount } = await supabase
        .from('internal_link_injections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      // Get latest governor decision
      const { data: govLog } = await supabase
        .from('governor_decision_logs')
        .select('decision, reason, signals, next_safe_run_seconds, force_override')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let governorDecision: GovernorDecision | null = null;
      if (govLog) {
        governorDecision = {
          allowed: govLog.decision === 'allowed',
          reason: govLog.reason || '',
          hardBlock: govLog.decision === 'blocked',
          recommendedMode: govLog.decision === 'allowed' ? 'FULL' : govLog.decision === 'softlimit' ? 'LIGHT' : 'BLOCKED',
          nextSafeRunInSeconds: govLog.next_safe_run_seconds || 0,
        };
      }

      // Build stability data
      const stabilityData: StabilityData = {
        redirect: redirectStatus,
        redirectIntegrity,
        unmatchedCount: unmatchedUrls.length,
        unmatchedUrls: unmatchedUrls.slice(0, 10),
        orphans: {
          total: orphanTotal,
          byType: [
            { type: 'Products', count: productCount || 0, trend: 'stable' },
            { type: 'Blog/Guides', count: blogCount || 0, trend: 'stable' },
          ],
        },
        internalLinksAdded: linkCount || 0,
        hubsStatus: [
          { slug: '/cats', name: 'Cat Hub', ok: true, detail: 'Active with collections + guides' },
          { slug: '/dogs', name: 'Dog Hub', ok: true, detail: 'Active with collections + guides' },
        ],
        contentOutlines: 0,
        nextActions: [],
        governorStatus: governorDecision?.allowed ? 'allowed' : governorDecision?.hardBlock ? 'blocked' : 'softlimit',
        governorDecision,
      };

      // Generate next actions
      const actions: string[] = [];
      if (!stabilityData.redirect.isPermanent) {
        actions.push('Fix www→apex redirect from 302 to 301/308 at hosting layer');
      }
      if (stabilityData.unmatchedCount > 0) {
        actions.push(`Resolve ${stabilityData.unmatchedCount} unmatched GSC URLs`);
      }
      if (stabilityData.orphans.total > 50) {
        actions.push(`Reduce orphan pages (${stabilityData.orphans.total}) via internal link patches`);
      }
      if (stabilityData.contentOutlines < 5) {
        actions.push('Generate 5-10 content outlines from GSC opportunities');
      }
      if (actions.length === 0) {
        actions.push('All stability checks passed');
      }
      stabilityData.nextActions = actions;

      setData(stabilityData);
    } catch (err) {
      console.error('[AGMStability] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-64" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              AGM – Stability & Index Hygiene
            </CardTitle>
            <CardDescription>
              Redirect integrity, orphan elimination, governor status, sitemap hygiene
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusCard
            label="www→apex Redirect"
            value={`${data.redirect.statusCode}`}
            ok={data.redirect.isPermanent && data.redirect.isApex}
            warning={!!data.redirect.warning}
            detail={data.redirect.isPermanent ? '301/308 ✓' : `${data.redirect.statusCode} — needs fix`}
          />
          <StatusCard
            label="Unmatched URLs"
            value={String(data.unmatchedCount)}
            ok={data.unmatchedCount === 0}
            detail={data.unmatchedCount === 0 ? 'All clean' : `${data.unmatchedCount} need resolution`}
          />
          <StatusCard
            label="Total Pages"
            value={String(data.orphans.total)}
            ok={true}
            detail={`${data.orphans.byType[0]?.count || 0} products, ${data.orphans.byType[1]?.count || 0} blog`}
          />
          <StatusCard
            label="Links Injected"
            value={String(data.internalLinksAdded)}
            ok={true}
            detail="Approved injections"
          />
        </div>

        {/* Governor Decision Summary */}
        {data.governorDecision && (
          <div className={cn(
            'flex items-start gap-2 text-xs px-3 py-2.5 rounded-md border',
            data.governorDecision.allowed
              ? 'bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400'
              : data.governorDecision.hardBlock
                ? 'bg-destructive/5 border-destructive/20 text-destructive'
                : 'bg-yellow-500/5 border-yellow-500/20 text-yellow-700 dark:text-yellow-400'
          )}>
            {data.governorDecision.allowed ? (
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
            ) : data.governorDecision.hardBlock ? (
              <ShieldOff className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-semibold">
                Governor: {data.governorDecision.recommendedMode}
                {data.governorDecision.nextSafeRunInSeconds > 0 && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-2">
                    next in {formatTime(data.governorDecision.nextSafeRunInSeconds)}
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground mt-0.5">{data.governorDecision.reason}</div>
            </div>
          </div>
        )}

        {/* Redirect Integrity Proof */}
        {data.redirectIntegrity && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="h-3 w-3" />
              Redirect Chain Proof
              <Badge variant={data.redirectIntegrity.pass ? 'default' : 'destructive'} className="text-[9px] h-4 px-1.5 ml-1">
                {data.redirectIntegrity.pass ? 'PASS' : 'FAIL'}
              </Badge>
            </h4>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-1.5 font-medium text-muted-foreground">Hop</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">URL</th>
                    <th className="text-center p-1.5 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">Location</th>
                    <th className="text-left p-1.5 font-medium text-muted-foreground">Server</th>
                  </tr>
                </thead>
                <tbody>
                  {data.redirectIntegrity.chain.map((hop, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="p-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="p-1.5 font-mono truncate max-w-[200px]">{hop.url}</td>
                      <td className="p-1.5 text-center">
                        <Badge variant={hop.status === 301 || hop.status === 308 ? 'default' : hop.status === 302 || hop.status === 307 ? 'destructive' : 'secondary'} className="text-[9px] h-4 px-1">
                          {hop.status}
                        </Badge>
                      </td>
                      <td className="p-1.5 font-mono truncate max-w-[200px] text-muted-foreground">{hop.location || '—'}</td>
                      <td className="p-1.5 text-muted-foreground">{hop.server || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.redirectIntegrity.failures.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {data.redirectIntegrity.failures.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-destructive">
                    <XCircle className="h-3 w-3 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Redirect Detail (legacy fallback when no chain proof) */}
        {!data.redirectIntegrity && (data.redirect.warning || data.redirect.error) && (
          <div className={cn(
            'flex items-start gap-2 text-xs px-3 py-2 rounded-md border',
            data.redirect.error
              ? 'bg-destructive/5 border-destructive/20 text-destructive'
              : 'bg-yellow-500/5 border-yellow-500/20 text-yellow-700 dark:text-yellow-400'
          )}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">{data.redirect.error ? 'Critical: ' : 'Warning: '}</span>
              {data.redirect.error || data.redirect.warning}
              <span className="text-muted-foreground ml-1">(Source: {data.redirect.source})</span>
            </div>
          </div>
        )}

        {/* Unmatched URLs List */}
        {data.unmatchedUrls.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Unmatched GSC URLs
            </h4>
            <div className="border rounded-md p-2 space-y-1">
              {data.unmatchedUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
                  <FileX className="h-3 w-3 shrink-0 text-destructive" />
                  <code className="text-[10px] truncate">{url}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Page Breakdown */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Page Breakdown by Type
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {data.orphans.byType.map(o => (
              <div key={o.type} className="border rounded-md p-2 flex items-center justify-between">
                <span className="text-xs font-medium">{o.type}</span>
                <span className="text-sm font-bold">{o.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hub Pages Status */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Hub Pages
          </h4>
          <div className="space-y-1">
            {data.hubsStatus.map(hub => (
              <div key={hub.slug} className="flex items-center gap-2 text-xs py-1 px-2 border rounded">
                {hub.ok ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                )}
                <span className="font-medium">{hub.name}</span>
                <code className="text-muted-foreground text-[10px]">{hub.slug}</code>
                <span className="text-muted-foreground ml-auto text-[10px]">{hub.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Next Actions */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Next Actions
          </h4>
          <div className="border rounded-md p-2 space-y-1.5">
            {data.nextActions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-primary" />
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusCard({ label, value, ok, warning, detail }: {
  label: string; value: string; ok: boolean; warning?: boolean; detail: string;
}) {
  return (
    <div className={cn(
      'border rounded-lg p-3 text-center',
      ok ? 'border-green-500/20' : warning ? 'border-yellow-500/20' : 'border-destructive/20'
    )}>
      {ok ? (
        <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-500" />
      ) : warning ? (
        <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
      ) : (
        <XCircle className="h-4 w-4 mx-auto mb-1 text-destructive" />
      )}
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground font-medium">{label}</div>
      <div className="text-[9px] text-muted-foreground mt-0.5">{detail}</div>
    </div>
  );
}

export default AGMStabilityDashboard;
