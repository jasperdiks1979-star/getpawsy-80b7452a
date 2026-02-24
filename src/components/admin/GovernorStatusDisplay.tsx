import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, ShieldCheck, ShieldAlert, ShieldOff, Zap } from 'lucide-react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { cn } from '@/lib/utils';

interface GovernorStatus {
  allowed: boolean;
  recommendedMode: 'dryrun' | 'fullstack';
  reason: string;
  nextSafeRunInSeconds: number;
  hardBlock: boolean;
  signals: {
    apiHealth: { gscTokenValid: boolean; httpErrorRate: number; recentFailedRuns: number };
    seoStability: { contentChanges12h: number; linkChanges12h: number; indexingSubmissions24h: number; crawlHealthCritical: boolean };
    systemLoad: { activeRuns: number; avgRunDurationMs: number; recentManualRuns20m: number };
  };
}

interface GovernorStatusDisplayProps {
  mode: 'dryrun' | 'fullstack';
  onForceOverrideChange?: (enabled: boolean) => void;
  forceOverride?: boolean;
}

export function GovernorStatusDisplay({ mode, onForceOverrideChange, forceOverride = false }: GovernorStatusDisplayProps) {
  const { invokeFunction } = useAuthenticatedFetch();
  const [status, setStatus] = useState<GovernorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  const evaluate = useCallback(async () => {
    setLoading(true);
    const { data } = await invokeFunction<{ ok: boolean } & GovernorStatus>('execution-governor', {
      body: JSON.stringify({ mode, forceOverride }),
      silent: true,
    });
    if (data?.ok !== undefined) {
      setStatus(data as unknown as GovernorStatus);
      if (data.nextSafeRunInSeconds && data.nextSafeRunInSeconds > 0) {
        setCountdown(data.nextSafeRunInSeconds as number);
      } else {
        setCountdown(null);
      }
    }
    setLoading(false);
  }, [invokeFunction, mode, forceOverride]);

  useEffect(() => { evaluate(); }, [evaluate]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const iv = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          evaluate(); // Re-evaluate when countdown hits 0
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [countdown, evaluate]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Evaluating system health…
      </div>
    );
  }

  if (!status) return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="space-y-1.5">
      {/* Status line */}
      <div className={cn(
        'flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-md border',
        status.allowed
          ? 'bg-green-500/5 border-green-500/20 text-green-700 dark:text-green-400'
          : status.hardBlock
            ? 'bg-destructive/5 border-destructive/20 text-destructive'
            : 'bg-yellow-500/5 border-yellow-500/20 text-yellow-700 dark:text-yellow-400'
      )}>
        {status.allowed ? (
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        ) : status.hardBlock ? (
          <ShieldOff className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1">{status.reason}</span>
        {countdown !== null && countdown > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
            {formatTime(countdown)}
          </Badge>
        )}
      </div>

      {/* Force override toggle (for both soft limits and overridable hard blocks) */}
      {!status.allowed && onForceOverrideChange && (
        <label className="flex items-center gap-1.5 cursor-pointer select-none pl-1">
          <Switch
            checked={forceOverride}
            onCheckedChange={onForceOverrideChange}
            className="scale-[0.65] origin-left"
          />
          <Zap className={cn("h-3 w-3", status.hardBlock ? "text-destructive" : "text-yellow-500")} />
          <span className="text-[10px] text-muted-foreground">
            {status.hardBlock ? 'Force Override (unsafe)' : 'Force Run (bypass soft limits)'}
          </span>
        </label>
      )}
    </div>
  );
}
