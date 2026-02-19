import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Brain, Eye, Wrench, Zap, Rocket, ShieldCheck, AlertTriangle,
  Play, Loader2, CheckCircle, XCircle, ArrowUp, ArrowDown, BarChart3,
  RefreshCw, Target, TrendingUp,
} from 'lucide-react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MODES = [
  { key: 'observe', label: 'Observe', icon: Eye, desc: 'Score only, no changes', color: 'text-muted-foreground' },
  { key: 'assisted', label: 'Assisted', icon: Wrench, desc: 'Drafts + suggestions', color: 'text-blue-500' },
  { key: 'autonomous_safe', label: 'Auto Safe', icon: ShieldCheck, desc: 'Low-risk auto-publish', color: 'text-green-500' },
  { key: 'autonomous_full', label: 'Auto Full', icon: Rocket, desc: 'Medium-risk + staged rollout', color: 'text-orange-500' },
] as const;

interface AGMStatus {
  executionMode: string;
  stats: {
    totalNodes: number;
    totalActions: number;
    queuedActions: number;
    executedActions: number;
    activeExperiments: number;
    recentImpactUplift: number;
    anomalies: number;
  };
  config: Record<string, unknown>;
}

interface Opportunity {
  page: string;
  query: string;
  score: number;
  suggestedActions: string[];
}

export function AutonomousGrowthDashboard() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [status, setStatus] = useState<AGMStatus | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);

  const fetchStatus = useCallback(async () => {
    const { data, error } = await invokeFunction<{ ok: boolean } & AGMStatus>('growth-brain', {
      body: JSON.stringify({ action: 'status' }),
      silent: true,
    });
    if (data?.ok) setStatus(data as unknown as AGMStatus);
    setLoading(false);
  }, [invokeFunction]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const runScan = async () => {
    setScanning(true);
    const { data, error } = await invokeFunction<{
      ok: boolean; opportunitiesFound: number;
      topOpportunities: Opportunity[]; actionsQueued: number;
    }>('growth-brain', {
      body: JSON.stringify({ action: 'scan' }),
      silent: true,
    });
    if (data?.ok) {
      setOpportunities(data.topOpportunities || []);
      toast.success(`Found ${data.opportunitiesFound} opportunities, ${data.actionsQueued} actions queued`);
      fetchStatus();
    } else {
      toast.error('Scan failed');
    }
    setScanning(false);
  };

  const updateMode = async (mode: string) => {
    if (mode === 'autonomous_full') {
      if (!confirm('⚠️ AUTONOMOUS FULL mode will auto-publish medium-risk changes with staged rollout. Are you sure?')) return;
    }
    setUpdatingMode(true);
    const { data } = await invokeFunction<{ ok: boolean }>('growth-brain', {
      body: JSON.stringify({ action: 'update_mode', mode }),
      silent: true,
    });
    if (data?.ok) {
      toast.success(`Mode switched to ${mode}`);
      fetchStatus();
    }
    setUpdatingMode(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-56" /></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const currentMode = status?.executionMode || 'observe';
  const stats = status?.stats;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Autonomous Growth Mode (AGM)
            </CardTitle>
            <CardDescription>
              Self-learning SEO growth engine — discover, plan, execute, measure, learn
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchStatus}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Mode Selector */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Execution Mode</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {MODES.map(m => {
              const Icon = m.icon;
              const active = currentMode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => updateMode(m.key)}
                  disabled={updatingMode}
                  className={cn(
                    'flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-all',
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  )}
                >
                  <Icon className={cn('h-5 w-5', active ? m.color : 'text-muted-foreground')} />
                  <span className={cn('font-medium', active && 'text-foreground')}>{m.label}</span>
                  <span className="text-[10px] text-muted-foreground text-center">{m.desc}</span>
                </button>
              );
            })}
          </div>
          {currentMode === 'autonomous_full' && (
            <div className="flex items-center gap-2 text-xs bg-orange-500/10 text-orange-600 border border-orange-500/20 rounded px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Full autonomous mode active — medium-risk changes will auto-publish with staged rollout.
            </div>
          )}
        </div>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Opportunities" value={stats.totalNodes} icon={Target} />
            <StatCard label="Actions Queued" value={stats.queuedActions} icon={Play} />
            <StatCard label="Executed" value={stats.executedActions} icon={CheckCircle} color="text-green-500" />
            <StatCard
              label="Impact (14d)"
              value={stats.recentImpactUplift > 0 ? `+${stats.recentImpactUplift}` : String(stats.recentImpactUplift)}
              icon={stats.recentImpactUplift >= 0 ? TrendingUp : ArrowDown}
              color={stats.recentImpactUplift >= 0 ? 'text-green-500' : 'text-destructive'}
            />
          </div>
        )}

        {/* Scan Button */}
        <div className="flex items-center gap-3">
          <Button onClick={runScan} disabled={scanning} className="gap-2">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {scanning ? 'Scanning…' : 'Run Opportunity Scan'}
          </Button>
          {stats?.anomalies ? (
            <Badge variant="destructive" className="text-[10px]">
              {stats.anomalies} anomalies detected
            </Badge>
          ) : null}
          {stats?.activeExperiments ? (
            <Badge variant="outline" className="text-[10px]">
              {stats.activeExperiments} active experiments
            </Badge>
          ) : null}
        </div>

        {/* Top Opportunities */}
        {opportunities.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Top Opportunities
            </h4>
            <ScrollArea className="h-64 border rounded">
              <div className="p-2 space-y-1">
                {opportunities.map((opp, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] shrink-0 w-10 justify-center">
                        {opp.score}
                      </Badge>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{opp.query}</div>
                        <div className="text-muted-foreground truncate text-[10px]">{opp.page}</div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {opp.suggestedActions.map(a => (
                        <Badge key={a} variant="secondary" className="text-[8px] px-1">
                          {a.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: typeof CheckCircle; color?: string;
}) {
  return (
    <div className="border rounded-lg p-3 text-center">
      <Icon className={cn('h-4 w-4 mx-auto mb-1', color || 'text-muted-foreground')} />
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

export default AutonomousGrowthDashboard;
