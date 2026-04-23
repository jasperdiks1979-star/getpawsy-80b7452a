import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Bell, Plus, Trash2, AlertTriangle, BellRing, Pencil } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';

// -----------------------------------------------------------------------------
// Render-trace alert configuration & live firing panel
// -----------------------------------------------------------------------------
// Lets admins define threshold rules ("warn me when overall timeout rate >5%
// over the last 24h" or "warn me when any cat-tree slug times out >10%").
// Rules are evaluated server-side via `evaluate_render_trace_alerts` so the
// panel always reflects the same data the dashboard charts.
// -----------------------------------------------------------------------------

type AlertScope = 'overall' | 'slug';

interface AlertRule {
  id: string;
  name: string;
  scope: AlertScope;
  slug_pattern: string | null;
  threshold_rate: number; // 0..1
  min_sample: number;
  window_days: number;
  enabled: boolean;
  cooldown_minutes: number;
  last_triggered_at: string | null;
}

interface FiringAlert {
  alert_id: string;
  name: string;
  scope: AlertScope;
  slug: string | null;
  observed_rate: number;
  observed_timeouts: number;
  observed_shell: number;
  threshold_rate: number;
  window_days: number;
  recorded: boolean;
}

interface EvaluateResponse {
  evaluated_at: string;
  firings: FiringAlert[];
}

interface FormState {
  name: string;
  scope: AlertScope;
  slug_pattern: string;
  threshold_pct: string; // user enters percentage (0-100)
  min_sample: string;
  window_days: string;
  cooldown_minutes: string;
  enabled: boolean;
}

const DEFAULT_FORM: FormState = {
  name: '',
  scope: 'overall',
  slug_pattern: '',
  threshold_pct: '5',
  min_sample: '20',
  window_days: '1',
  cooldown_minutes: '60',
  enabled: true,
};

export function RenderTraceAlerts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const rules = useQuery({
    queryKey: ['render-trace-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('render_trace_alerts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as AlertRule[];
    },
    refetchOnWindowFocus: false,
  });

  // Evaluate rules every 60s so the firing list stays fresh without spamming RPC.
  const firings = useQuery({
    queryKey: ['render-trace-alerts-firings'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('evaluate_render_trace_alerts', {
        p_record: true,
      });
      if (error) throw error;
      return data as unknown as EvaluateResponse;
    },
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
    enabled: (rules.data?.length ?? 0) > 0,
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<AlertRule> & { id?: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from('render_trace_alerts')
          .update({
            name: payload.name,
            scope: payload.scope,
            slug_pattern: payload.slug_pattern,
            threshold_rate: payload.threshold_rate,
            min_sample: payload.min_sample,
            window_days: payload.window_days,
            cooldown_minutes: payload.cooldown_minutes,
            enabled: payload.enabled,
          })
          .eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('render_trace_alerts').insert({
          name: payload.name!,
          scope: payload.scope!,
          slug_pattern: payload.slug_pattern,
          threshold_rate: payload.threshold_rate!,
          min_sample: payload.min_sample!,
          window_days: payload.window_days!,
          cooldown_minutes: payload.cooldown_minutes!,
          enabled: payload.enabled ?? true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['render-trace-alerts'] });
      qc.invalidateQueries({ queryKey: ['render-trace-alerts-firings'] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
      toast({ title: editingId ? 'Alert updated' : 'Alert created' });
    },
    onError: (e: any) => {
      toast({
        title: 'Failed to save alert',
        description: e?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('render_trace_alerts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['render-trace-alerts'] });
      qc.invalidateQueries({ queryKey: ['render-trace-alerts-firings'] });
      toast({ title: 'Alert deleted' });
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('render_trace_alerts')
        .update({ enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['render-trace-alerts'] });
      qc.invalidateQueries({ queryKey: ['render-trace-alerts-firings'] });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (rule: AlertRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      scope: rule.scope,
      slug_pattern: rule.slug_pattern ?? '',
      threshold_pct: (rule.threshold_rate * 100).toString(),
      min_sample: rule.min_sample.toString(),
      window_days: rule.window_days.toString(),
      cooldown_minutes: rule.cooldown_minutes.toString(),
      enabled: rule.enabled,
    });
    setDialogOpen(true);
  };

  const submit = () => {
    const pct = parseFloat(form.threshold_pct);
    const minSample = parseInt(form.min_sample, 10);
    const windowDays = parseInt(form.window_days, 10);
    const cooldown = parseInt(form.cooldown_minutes, 10);
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      toast({ title: 'Threshold must be between 0 and 100', variant: 'destructive' });
      return;
    }
    if (Number.isNaN(minSample) || minSample < 1) {
      toast({ title: 'Minimum sample must be ≥ 1', variant: 'destructive' });
      return;
    }
    if (Number.isNaN(windowDays) || windowDays < 1 || windowDays > 30) {
      toast({ title: 'Window must be 1–30 days', variant: 'destructive' });
      return;
    }
    if (Number.isNaN(cooldown) || cooldown < 0) {
      toast({ title: 'Cooldown must be ≥ 0', variant: 'destructive' });
      return;
    }
    upsert.mutate({
      id: editingId ?? undefined,
      name: form.name.trim(),
      scope: form.scope,
      slug_pattern: form.scope === 'slug' && form.slug_pattern.trim()
        ? form.slug_pattern.trim()
        : null,
      threshold_rate: pct / 100,
      min_sample: minSample,
      window_days: windowDays,
      cooldown_minutes: cooldown,
      enabled: form.enabled,
    });
  };

  const list = rules.data ?? [];
  const firingList = firings.data?.firings ?? [];
  const firingsByAlert = new Map<string, FiringAlert[]>();
  for (const f of firingList) {
    const arr = firingsByAlert.get(f.alert_id) ?? [];
    arr.push(f);
    firingsByAlert.set(f.alert_id, arr);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Timeout alerts
              {firingList.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <BellRing className="h-3 w-3" />
                  {firingList.length} firing
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Configure thresholds for overall or per-slug timeout rates. Evaluated server-side
              every minute against the same data the charts show.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> New alert
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Currently firing */}
        {firingList.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Currently firing
            </div>
            <div className="space-y-1.5">
              {firingList.slice(0, 12).map((f, i) => (
                <div
                  key={`${f.alert_id}-${f.slug ?? 'overall'}-${i}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{f.name}</span>
                    {f.scope === 'slug' && f.slug && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground truncate">
                        {f.slug}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {(f.observed_rate * 100).toFixed(1)}% timeout
                    <span className="text-muted-foreground/60"> · </span>
                    {f.observed_timeouts}/{f.observed_shell} in {f.window_days}d
                    <span className="text-muted-foreground/60"> · threshold </span>
                    {(f.threshold_rate * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
              {firingList.length > 12 && (
                <p className="text-xs text-muted-foreground pt-1">
                  + {firingList.length - 12} more.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Rules list */}
        {rules.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : list.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
            No alerts configured yet. Click <strong>New alert</strong> to create one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">On</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead className="text-right">Min sample</TableHead>
                  <TableHead className="text-right">Window</TableHead>
                  <TableHead className="text-right">Cooldown</TableHead>
                  <TableHead>Last fired</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((rule) => {
                  const isFiring = (firingsByAlert.get(rule.id)?.length ?? 0) > 0;
                  return (
                    <TableRow key={rule.id} className={isFiring ? 'bg-destructive/5' : undefined}>
                      <TableCell>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(v) =>
                            toggleEnabled.mutate({ id: rule.id, enabled: v })
                          }
                          aria-label={`Toggle ${rule.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {rule.name}
                          {isFiring && (
                            <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                              firing
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {rule.scope === 'overall' ? (
                          <Badge variant="secondary">Overall</Badge>
                        ) : (
                          <div className="flex flex-col">
                            <Badge variant="outline" className="w-fit">Per slug</Badge>
                            {rule.slug_pattern && (
                              <code className="text-[11px] text-muted-foreground mt-0.5">
                                {rule.slug_pattern}
                              </code>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(rule.threshold_rate * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{rule.min_sample}</TableCell>
                      <TableCell className="text-right tabular-nums">{rule.window_days}d</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {rule.cooldown_minutes}m
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {rule.last_triggered_at
                          ? format(new Date(rule.last_triggered_at), 'MMM d, HH:mm')
                          : <span className="italic">never</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(rule)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete alert?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete <strong>{rule.name}</strong> and its
                                  firing history.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => remove.mutate(rule.id)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {firings.dataUpdatedAt > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Last evaluated {format(new Date(firings.dataUpdatedAt), 'MMM d, HH:mm:ss')}
            {' '}· auto-refresh every 60s
          </p>
        )}
      </CardContent>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit alert' : 'New timeout alert'}</DialogTitle>
            <DialogDescription>
              Fires when timeout rate (timeouts ÷ shell pings) exceeds the threshold within
              the chosen window.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="alert-name">Name</Label>
              <Input
                id="alert-name"
                placeholder="e.g. Overall timeout > 5%"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alert-scope">Scope</Label>
              <Select
                value={form.scope}
                onValueChange={(v: AlertScope) => setForm({ ...form, scope: v })}
              >
                <SelectTrigger id="alert-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="overall">Overall (across all slugs)</SelectItem>
                  <SelectItem value="slug">Per slug</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.scope === 'slug' && (
              <div className="space-y-1.5">
                <Label htmlFor="alert-pattern">
                  Slug pattern <span className="text-muted-foreground font-normal">(optional, ILIKE)</span>
                </Label>
                <Input
                  id="alert-pattern"
                  placeholder="e.g. cat-tree-% — leave blank for any slug"
                  value={form.slug_pattern}
                  onChange={(e) => setForm({ ...form, slug_pattern: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Use SQL ILIKE wildcards (<code>%</code>). Empty matches every slug individually.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="alert-threshold">Threshold (%)</Label>
                <Input
                  id="alert-threshold"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={form.threshold_pct}
                  onChange={(e) => setForm({ ...form, threshold_pct: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-min-sample">Min shell pings</Label>
                <Input
                  id="alert-min-sample"
                  type="number"
                  min={1}
                  value={form.min_sample}
                  onChange={(e) => setForm({ ...form, min_sample: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-window">Window (days)</Label>
                <Input
                  id="alert-window"
                  type="number"
                  min={1}
                  max={30}
                  value={form.window_days}
                  onChange={(e) => setForm({ ...form, window_days: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="alert-cooldown">Cooldown (min)</Label>
                <Input
                  id="alert-cooldown"
                  type="number"
                  min={0}
                  value={form.cooldown_minutes}
                  onChange={(e) => setForm({ ...form, cooldown_minutes: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="alert-enabled" className="text-sm">Enabled</Label>
                <p className="text-xs text-muted-foreground">Disabled rules don't evaluate or fire.</p>
              </div>
              <Switch
                id="alert-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Create alert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
