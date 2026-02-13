import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Zap,
  RefreshCw, ShieldCheck, ArrowUp, ArrowDown, Minus, Eye, ThumbsUp, ThumbsDown, Undo2
} from 'lucide-react';
import { useSeoOptimizer } from '@/hooks/useSeoOptimizer';
import { toast } from 'sonner';
import { SEO_THRESHOLDS } from '@/lib/seo-auto-optimizer';
import type { OptimizationSuggestion } from '@/lib/seo-auto-optimizer';

const TRIGGER_COLORS: Record<string, string> = {
  ctr: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  position: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  momentum: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  decay: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const TRIGGER_ICONS: Record<string, typeof TrendingUp> = {
  ctr: Eye,
  position: Zap,
  momentum: TrendingUp,
  decay: TrendingDown,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

export default function SeoMonitorDashboard() {
  const { gscResult, report, logs, loading, loadData, saveSuggestion, updateStatus } = useSeoOptimizer();

  const handleSave = async (suggestion: OptimizationSuggestion) => {
    const ok = await saveSuggestion(suggestion);
    toast[ok ? 'success' : 'error'](ok ? 'Logged as suggestion' : 'Failed to save');
  };

  const handleStatus = async (id: string, status: 'applied' | 'dismissed' | 'reverted') => {
    const ok = await updateStatus(id, status);
    toast[ok ? 'success' : 'error'](ok ? `Marked as ${status}` : 'Failed to update');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const activeAlerts = report?.suggestions || [];
  const ctrAlerts = activeAlerts.filter(s => s.triggerType === 'ctr');
  const positionAlerts = activeAlerts.filter(s => s.triggerType === 'position');
  const momentumAlerts = activeAlerts.filter(s => s.triggerType === 'momentum');
  const decayAlerts = activeAlerts.filter(s => s.triggerType === 'decay');
  const recentLogs = logs.slice(0, 50);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">SEO Auto-Optimizer</h1>
            <p className="text-sm text-muted-foreground">
              Controlled monitoring & trigger-based optimization
            </p>
          </div>
          <button onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Guides Evaluated</div>
              <div className="text-2xl font-bold">{report?.evaluated || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Active Triggers</div>
              <div className="text-2xl font-bold text-orange-600">{report?.triggered || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Skipped (Safety)</div>
              <div className="text-2xl font-bold">{report?.skippedSafety || 0}</div>
              <div className="text-[10px] text-muted-foreground">Max {SEO_THRESHOLDS.SAFETY.maxChangesPerPage14d}/page/14d</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Applied (14d)</div>
              <div className="text-2xl font-bold text-green-600">
                {logs.filter(l => l.status === 'applied' && new Date(l.created_at) > new Date(Date.now() - 14 * 86400000)).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total Logged</div>
              <div className="text-2xl font-bold">{logs.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Threshold Config Display */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Active Thresholds</CardTitle>
          </CardHeader>
          <CardContent className="text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-2 rounded bg-muted">
              <span className="font-medium">CTR Trigger:</span> Impr ≥{SEO_THRESHOLDS.CTR.minImpressions} & CTR &lt;{SEO_THRESHOLDS.CTR.maxCtr}%
            </div>
            <div className="p-2 rounded bg-muted">
              <span className="font-medium">Position Trigger:</span> Pos {SEO_THRESHOLDS.POSITION.min}–{SEO_THRESHOLDS.POSITION.max} (stable {SEO_THRESHOLDS.POSITION.stableDays}d)
            </div>
            <div className="p-2 rounded bg-muted">
              <span className="font-medium">Momentum:</span> Impr +{SEO_THRESHOLDS.MOMENTUM.impressionGrowthPct}% WoW
            </div>
            <div className="p-2 rounded bg-muted">
              <span className="font-medium">Decay:</span> Pos drop &gt;{SEO_THRESHOLDS.DECAY.positionDropThreshold} in {SEO_THRESHOLDS.DECAY.windowDays}d
            </div>
          </CardContent>
        </Card>

        {/* Alert Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AlertSection title="CTR Optimization" icon={Eye} alerts={ctrAlerts} color="orange" onSave={handleSave} />
          <AlertSection title="Position Boost" icon={Zap} alerts={positionAlerts} color="blue" onSave={handleSave} />
          <AlertSection title="Momentum Capitalize" icon={TrendingUp} alerts={momentumAlerts} color="green" onSave={handleSave} />
          <AlertSection title="Decay Recovery" icon={TrendingDown} alerts={decayAlerts} color="red" onSave={handleSave} />
        </div>

        {/* Change Log */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Optimization Log</CardTitle>
            <CardDescription className="text-xs">All triggered suggestions and their status</CardDescription>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No optimization actions logged yet. Save suggestions above to start tracking.</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-2">Date</th>
                    <th className="text-left py-1.5 pr-2">Slug</th>
                    <th className="text-left py-1.5 pr-2">Trigger</th>
                    <th className="text-left py-1.5 pr-2">Action</th>
                    <th className="text-left py-1.5 pr-2">Status</th>
                    <th className="text-right py-1.5">Actions</th>
                  </tr></thead>
                  <tbody>
                    {recentLogs.map(log => (
                      <tr key={log.id} className="border-b border-muted/30">
                        <td className="py-1.5 pr-2 font-mono">{new Date(log.created_at).toLocaleDateString()}</td>
                        <td className="py-1.5 pr-2 font-medium truncate max-w-[150px]">{log.slug}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TRIGGER_COLORS[log.trigger_type] || 'bg-muted'}`}>
                            {log.trigger_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-muted-foreground">{log.action_type.replace(/_/g, ' ')}</td>
                        <td className="py-1.5 pr-2">
                          <Badge variant={log.status === 'applied' ? 'default' : log.status === 'dismissed' ? 'outline' : 'secondary'} className="text-[10px]">
                            {log.status}
                          </Badge>
                        </td>
                        <td className="py-1.5 text-right">
                          {log.status === 'suggested' && (
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => handleStatus(log.id, 'applied')} className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded" title="Mark applied">
                                <ThumbsUp className="h-3 w-3 text-green-600" />
                              </button>
                              <button onClick={() => handleStatus(log.id, 'dismissed')} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded" title="Dismiss">
                                <ThumbsDown className="h-3 w-3 text-red-600" />
                              </button>
                            </div>
                          )}
                          {log.status === 'applied' && (
                            <button onClick={() => handleStatus(log.id, 'reverted')} className="p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded" title="Revert">
                              <Undo2 className="h-3 w-3 text-yellow-600" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============= ALERT SECTION COMPONENT =============

function AlertSection({ title, icon: Icon, alerts, color, onSave }: {
  title: string;
  icon: typeof TrendingUp;
  alerts: OptimizationSuggestion[];
  color: string;
  onSave: (s: OptimizationSuggestion) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Icon className="h-4 w-4" /> {title}
          {alerts.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{alerts.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No triggers active</p>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div key={`${alert.slug}-${i}`} className="p-2 rounded border bg-muted/30 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">/guides/{alert.slug}</span>
                    <Badge variant={PRIORITY_COLORS[alert.priority] as 'default' | 'secondary' | 'outline' | 'destructive'} className="text-[10px]">
                      {alert.priority}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">{alert.reason}</p>
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    <span>Impr: {alert.metricsSnapshot.impressions}</span>
                    <span>CTR: {alert.metricsSnapshot.ctr.toFixed(2)}%</span>
                    <span>Pos: {alert.metricsSnapshot.avgPosition}</span>
                  </div>
                  {alert.actionDetails.actions && (
                    <ul className="list-disc list-inside text-[10px] text-muted-foreground mt-1">
                      {(alert.actionDetails.actions as string[]).map((a, j) => <li key={j}>{a}</li>)}
                    </ul>
                  )}
                  {alert.actionDetails.alternativeTitles && (
                    <div className="mt-1">
                      <p className="font-medium text-[10px]">Suggested titles:</p>
                      {(alert.actionDetails.alternativeTitles as string[]).map((t, j) => (
                        <p key={j} className="text-[10px] text-muted-foreground italic">"{t}"</p>
                      ))}
                    </div>
                  )}
                  <button onClick={() => onSave(alert)}
                    className="mt-1 px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90">
                    Log Suggestion
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
