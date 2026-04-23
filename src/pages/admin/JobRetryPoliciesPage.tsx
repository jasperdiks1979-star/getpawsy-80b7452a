import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Wrench,
  Download,
  Upload,
  FileJson,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  buildPoliciesCsv,
  buildPoliciesJson,
  parsePoliciesCsv,
  parsePoliciesJson,
  triggerDownload,
  type ExportablePolicy,
} from '@/lib/admin/jobRetryPoliciesIO';

/**
 * Admin page to view and edit per-(provider, job_type) retry policies that
 * override the env-default retry behaviour in the `job-worker` edge function.
 *
 * Validation rules (mirrored client + DB):
 * - Either provider OR job_type must be set (DB CHECK constraint).
 * - max_attempts must be 1–20 when provided.
 * - backoff_minutes must be a comma-separated list of non-negative numbers,
 *   each between 0 and 10080 (= 1 week), max 20 entries.
 */

interface RetryPolicyRow {
  id: string;
  provider: string | null;
  job_type: string | null;
  max_attempts: number | null;
  backoff_minutes: number[] | null;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const TRIM = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
const EMPTY_TO_NULL = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v;

const PolicyFormSchema = z
  .object({
    provider: z.preprocess(
      EMPTY_TO_NULL,
      z
        .string()
        .max(64, 'Provider naam max 64 tekens')
        .regex(/^[a-z0-9_-]+$/i, 'Alleen letters, cijfers, _ en -')
        .nullable(),
    ),
    job_type: z.preprocess(
      EMPTY_TO_NULL,
      z
        .string()
        .max(64, 'Job type naam max 64 tekens')
        .regex(/^[a-z0-9_-]+$/i, 'Alleen letters, cijfers, _ en -')
        .nullable(),
    ),
    max_attempts: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
      z
        .number({ invalid_type_error: 'Moet een getal zijn' })
        .int('Geheel getal vereist')
        .min(1, 'Minstens 1')
        .max(20, 'Max 20 pogingen')
        .nullable(),
    ),
    backoff_csv: z.preprocess(
      TRIM,
      z
        .string()
        .max(500, 'Te lang')
        .refine((v) => v === '' || /^[\d.,\s]+$/.test(v), {
          message: 'Alleen getallen, komma\'s en spaties',
        })
        .optional()
        .default(''),
    ),
    enabled: z.boolean(),
    notes: z.preprocess(
      EMPTY_TO_NULL,
      z.string().max(500, 'Max 500 tekens').nullable(),
    ),
  })
  .superRefine((val, ctx) => {
    if (!val.provider && !val.job_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Vul ten minste provider OF job_type in',
        path: ['provider'],
      });
    }
    if (val.backoff_csv && val.backoff_csv.trim() !== '') {
      const parts = val.backoff_csv
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
      if (parts.length === 0) return;
      if (parts.length > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Max 20 backoff-stappen',
          path: ['backoff_csv'],
        });
      }
      for (const p of parts) {
        const n = Number(p);
        if (!Number.isFinite(n) || n < 0 || n > 10080) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${p}" is geen geldig aantal minuten (0–10080)`,
            path: ['backoff_csv'],
          });
          break;
        }
      }
    }
  });

type PolicyForm = z.infer<typeof PolicyFormSchema>;

const EMPTY_FORM: PolicyForm = {
  provider: null,
  job_type: null,
  max_attempts: null,
  backoff_csv: '',
  enabled: true,
  notes: null,
};

function backoffToCsv(arr: number[] | null): string {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr.join(', ');
}

function csvToBackoff(csv: string): number[] | null {
  const trimmed = csv.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parts.length > 0 ? parts : null;
}

function scopeLabel(p: RetryPolicyRow): string {
  const prov = p.provider ?? '*';
  const job = p.job_type ?? '*';
  return `${prov} / ${job}`;
}

export default function JobRetryPoliciesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RetryPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<RetryPolicyRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<RetryPolicyRow | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('job_retry_policies')
      .select('*')
      .order('provider', { ascending: true, nullsFirst: false })
      .order('job_type', { ascending: true, nullsFirst: false });
    if (error) {
      toast.error(`Kon policies niet laden: ${error.message}`);
      setRows([]);
    } else {
      setRows((data ?? []) as RetryPolicyRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (row: RetryPolicyRow) => {
    setEditing(row);
    setForm({
      provider: row.provider,
      job_type: row.job_type,
      max_attempts: row.max_attempts,
      backoff_csv: backoffToCsv(row.backoff_minutes),
      enabled: row.enabled,
      notes: row.notes,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const parsed = PolicyFormSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error('Validatie faalde — controleer de velden');
      return;
    }
    setErrors({});
    setSaving(true);
    const payload = {
      provider: parsed.data.provider,
      job_type: parsed.data.job_type,
      max_attempts: parsed.data.max_attempts,
      backoff_minutes: csvToBackoff(parsed.data.backoff_csv ?? ''),
      enabled: parsed.data.enabled,
      notes: parsed.data.notes,
    };
    const op = editing
      ? supabase.from('job_retry_policies').update(payload).eq('id', editing.id)
      : supabase.from('job_retry_policies').insert(payload);
    const { error } = await op;
    setSaving(false);
    if (error) {
      // Surface unique-violation in plain Dutch.
      if (error.code === '23505') {
        toast.error(
          'Er bestaat al een policy met dezelfde provider + job_type combinatie.',
        );
      } else {
        toast.error(`Opslaan faalde: ${error.message}`);
      }
      return;
    }
    toast.success(editing ? 'Policy bijgewerkt' : 'Policy aangemaakt');
    setDialogOpen(false);
    fetchRows();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('job_retry_policies')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      toast.error(`Verwijderen faalde: ${error.message}`);
    } else {
      toast.success('Policy verwijderd');
      fetchRows();
    }
    setDeleteTarget(null);
  };

  const handleToggle = async (row: RetryPolicyRow, next: boolean) => {
    const { error } = await supabase
      .from('job_retry_policies')
      .update({ enabled: next })
      .eq('id', row.id);
    if (error) {
      toast.error(`Toggle faalde: ${error.message}`);
    } else {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, enabled: next } : r)),
      );
    }
  };

  const sorted = useMemo(() => {
    // Active policies first, then by scope specificity (most specific = both
    // fields set), so admins see what's actually in effect at a glance.
    return [...rows].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      const aSpec = (a.provider ? 2 : 0) + (a.job_type ? 1 : 0);
      const bSpec = (b.provider ? 2 : 0) + (b.job_type ? 1 : 0);
      if (aSpec !== bSpec) return bSpec - aSpec;
      return scopeLabel(a).localeCompare(scopeLabel(b));
    });
  }, [rows]);

  return (
    <>
      <Helmet>
        <title>Job Retry Policies | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-6 space-y-6 max-w-6xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Wrench className="h-6 w-6 text-primary" />
              Job Retry Policies
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Per-(provider, job_type) overrides voor max attempts en backoff van de marketing job-worker.
              Wildcards (leeg veld) gelden voor alles binnen die as.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Nieuwe policy
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Resolve-volgorde
            </CardTitle>
            <CardDescription>
              De worker kiest de meest-specifieke enabled policy: <strong>exact provider + job_type</strong> &gt;{' '}
              <strong>provider only</strong> &gt; <strong>job_type only</strong> &gt; <strong>wildcard</strong>.
              Geen match? Dan gelden de env-defaults (<code>JOB_WORKER_MAX_ATTEMPTS</code>,{' '}
              <code>JOB_WORKER_BACKOFF_MINUTES</code>).
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Policies ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Nog geen policies. Voeg er één toe om de defaults te overschrijven.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope (provider / job_type)</TableHead>
                      <TableHead className="text-right">Max attempts</TableHead>
                      <TableHead>Backoff (min)</TableHead>
                      <TableHead>Notities</TableHead>
                      <TableHead className="text-center">Aan</TableHead>
                      <TableHead className="text-right">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((row) => (
                      <TableRow key={row.id} className={!row.enabled ? 'opacity-60' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono text-foreground">
                              {scopeLabel(row)}
                            </code>
                            {row.provider && row.job_type && (
                              <Badge variant="default" className="text-[10px]">exact</Badge>
                            )}
                            {(!row.provider || !row.job_type) && (
                              <Badge variant="secondary" className="text-[10px]">wildcard</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.max_attempts ?? <span className="text-muted-foreground">env</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.backoff_minutes && row.backoff_minutes.length > 0
                            ? row.backoff_minutes.join(', ')
                            : <span className="text-muted-foreground">env</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                          {row.notes ?? '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={row.enabled}
                            onCheckedChange={(v) => handleToggle(row, v)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit / create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Policy bewerken' : 'Nieuwe retry policy'}
            </DialogTitle>
            <DialogDescription>
              Laat een veld leeg om als wildcard te functioneren. Validatie loopt
              client + database side.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <Input
                  id="provider"
                  placeholder="bv. google (leeg = alle)"
                  value={form.provider ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, provider: e.target.value || null })
                  }
                  maxLength={64}
                />
                {errors.provider && (
                  <p className="text-xs text-destructive mt-1">{errors.provider}</p>
                )}
              </div>
              <div>
                <Label htmlFor="job_type">Job type</Label>
                <Input
                  id="job_type"
                  placeholder="bv. sync_product (leeg = alle)"
                  value={form.job_type ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, job_type: e.target.value || null })
                  }
                  maxLength={64}
                />
                {errors.job_type && (
                  <p className="text-xs text-destructive mt-1">{errors.job_type}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="max_attempts">Max attempts (1–20, leeg = env-default)</Label>
              <Input
                id="max_attempts"
                type="number"
                min={1}
                max={20}
                placeholder="env-default"
                value={form.max_attempts ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_attempts: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
              {errors.max_attempts && (
                <p className="text-xs text-destructive mt-1">{errors.max_attempts}</p>
              )}
            </div>

            <div>
              <Label htmlFor="backoff_csv">
                Backoff in minuten (comma-separated, max 20 stappen, 0–10080 elk)
              </Label>
              <Input
                id="backoff_csv"
                placeholder="bv. 1, 5, 15, 60, 360"
                value={form.backoff_csv ?? ''}
                onChange={(e) => setForm({ ...form, backoff_csv: e.target.value })}
              />
              {errors.backoff_csv && (
                <p className="text-xs text-destructive mt-1">{errors.backoff_csv}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Worker pakt index = (attempt - 1), clamp op laatste waarde.
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Notities</Label>
              <Textarea
                id="notes"
                placeholder="Optioneel — waarom wijkt deze policy af?"
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                maxLength={500}
                rows={2}
              />
              {errors.notes && (
                <p className="text-xs text-destructive mt-1">{errors.notes}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="enabled" className="text-sm">Actief</Label>
                <p className="text-xs text-muted-foreground">
                  Alleen actieve policies worden gematched door de worker.
                </p>
              </div>
              <Switch
                id="enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Annuleren
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Opslaan' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Policy verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>De policy voor scope <code>{scopeLabel(deleteTarget)}</code> wordt verwijderd. De worker valt terug op de volgende minder-specifieke match (of env-defaults).</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
