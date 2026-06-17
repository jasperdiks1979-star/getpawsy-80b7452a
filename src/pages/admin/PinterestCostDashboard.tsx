import { useEffect, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Stats = {
  spent_24h: number;
  spent_7d: number;
  waiting_ai: number;
  waiting_publish: number;
  posted_24h: number;
  cj_blocks_24h: number;
  active_jobs: number;
};

type CreditState = {
  credits_remaining: number | null;
  estimated_days_remaining: number | null;
  daily_burn_rate: number | null;
  forecast_state: string | null;
  image_generation_killed: boolean;
  autopilot_disabled: boolean;
  ai_generation_paused: boolean;
  publishing_paused: boolean;
  manual_pause: boolean;
};

const Metric = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ''}`}>{value}</div>
    </CardContent>
  </Card>
);

export default function PinterestCostDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [credit, setCredit] = useState<CreditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [creditRes, queueRes, eventsRes, postedRes, blocksRes, jobsRes] = await Promise.all([
      supabase.from('pinterest_credit_state').select('credits_remaining,estimated_days_remaining,daily_burn_rate,forecast_state,image_generation_killed,autopilot_disabled,ai_generation_paused,publishing_paused,manual_pause').eq('id', 1).maybeSingle(),
      supabase.from('pinterest_pin_queue').select('status,rejection_reason,updated_at'),
      supabase.from('pinterest_credit_events').select('credits_used,created_at').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
      supabase.from('pinterest_pin_queue').select('id', { count: 'exact', head: true }).eq('status', 'posted').gte('posted_at', new Date(Date.now() - 86400000).toISOString()),
      supabase.from('pinterest_pin_queue').select('id', { count: 'exact', head: true }).in('rejection_reason', ['blocked_supplier_image', 'blocked_legacy_source']).gte('updated_at', new Date(Date.now() - 86400000).toISOString()),
      supabase.from('background_jobs').select('id', { count: 'exact', head: true }).in('status', ['running', 'pending']).ilike('job_type', '%pinterest%'),
    ]);

    if (creditRes.data) setCredit(creditRes.data as CreditState);

    const queue = queueRes.data ?? [];
    const waiting_ai = queue.filter((r: any) => r.status === 'draft').length;
    const waiting_publish = queue.filter((r: any) => r.status === 'queued' || r.status === 'approved').length;

    const events = eventsRes.data ?? [];
    const cutoff24 = Date.now() - 86400000;
    const spent_24h = events.filter((e: any) => new Date(e.created_at).getTime() > cutoff24).reduce((s: number, e: any) => s + (e.credits_used ?? 0), 0);
    const spent_7d = events.reduce((s: number, e: any) => s + (e.credits_used ?? 0), 0);

    setStats({
      spent_24h,
      spent_7d,
      waiting_ai,
      waiting_publish,
      posted_24h: postedRes.count ?? 0,
      cj_blocks_24h: blocksRes.count ?? 0,
      active_jobs: jobsRes.count ?? 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const killed = !!(credit?.image_generation_killed || credit?.autopilot_disabled || credit?.manual_pause);

  const toggleKill = async (next: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from('pinterest_credit_state')
      .update({
        image_generation_killed: next,
        autopilot_disabled: next,
        ai_generation_paused: next,
        manual_pause: next,
        manual_pause_at: next ? new Date().toISOString() : null,
        manual_pause_reason: next ? 'admin_dashboard_kill_switch' : null,
      })
      .eq('id', 1);
    setSaving(false);
    if (error) {
      alert(`Failed to toggle kill switch: ${error.message}`);
      return;
    }
    await load();
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Helmet>
        <title>Pinterest Cost Dashboard | Admin</title>
      </Helmet>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Cost & Credit Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live AI spend, queue health, and emergency controls.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className={`mb-6 border-2 ${killed ? 'border-destructive bg-destructive/5' : 'border-amber-500/40'}`}>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-6 h-6 mt-0.5 ${killed ? 'text-destructive' : 'text-amber-500'}`} />
            <div>
              <div className="font-semibold">Emergency Kill Switch</div>
              <div className="text-sm text-muted-foreground">
                {killed
                  ? 'AI generation, autopilot, and image rendering are HALTED. Publishing of existing queue may continue.'
                  : 'All generation systems are LIVE. Flip this to immediately stop credit spend.'}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                forecast: <span className="font-mono">{credit?.forecast_state ?? '—'}</span> · img_killed:{' '}
                <span className="font-mono">{String(!!credit?.image_generation_killed)}</span> · autopilot_off:{' '}
                <span className="font-mono">{String(!!credit?.autopilot_disabled)}</span> · publishing_paused:{' '}
                <span className="font-mono">{String(!!credit?.publishing_paused)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">{killed ? 'HALTED' : 'LIVE'}</span>
            <Switch checked={killed} disabled={saving} onCheckedChange={toggleKill} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        <Metric label="Credits remaining" value={credit?.credits_remaining ?? '—'} />
        <Metric label="Spent · last 24h" value={stats?.spent_24h.toLocaleString() ?? '…'} accent={(stats?.spent_24h ?? 0) > 5000 ? 'text-destructive' : ''} />
        <Metric label="Spent · last 7d" value={stats?.spent_7d.toLocaleString() ?? '…'} />
        <Metric label="Est. days remaining" value={credit?.estimated_days_remaining?.toFixed?.(1) ?? '—'} accent={(credit?.estimated_days_remaining ?? 99) < 2 ? 'text-destructive' : ''} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        <Metric label="Active AI jobs" value={stats?.active_jobs ?? '…'} />
        <Metric label="Pins waiting · AI creatives" value={stats?.waiting_ai ?? '…'} />
        <Metric label="Pins waiting · publishing" value={stats?.waiting_publish ?? '…'} />
        <Metric label="Posted · last 24h" value={stats?.posted_24h ?? '…'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Metric label="CJ image blocks · 24h" value={stats?.cj_blocks_24h ?? '…'} />
        <Metric label="Daily burn rate" value={credit?.daily_burn_rate?.toFixed?.(0) ?? '—'} />
      </div>
    </div>
  );
}