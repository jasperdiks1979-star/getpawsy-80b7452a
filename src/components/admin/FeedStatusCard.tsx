import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock, Database, FileCheck2 } from 'lucide-react';

interface LastSyncRow {
  id: string;
  status: string | null;
  sync_type: string | null;
  mode: string | null;
  total_products: number | null;
  sent_count: number | null;
  eligible_count: number | null;
  products_with_issues: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

interface ValidationSummary {
  totalItemsInFeed: number;
  ok: number;
  fail: number;
  fetchedAt: string;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (isNaN(diffMs)) return '';
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/**
 * Read-only feed status panel for admins.
 * Shows the last successful merchant sync (from `merchant_sync_logs`)
 * and runs a live validation against the public `merchant-feed.xml`
 * to display the current item count and pass/fail summary.
 */
export function FeedStatusCard() {
  const [lastSync, setLastSync] = useState<LastSyncRow | null>(null);
  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [loadingSync, setLoadingSync] = useState(true);
  const [loadingValidation, setLoadingValidation] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const loadLastSync = useCallback(async () => {
    setLoadingSync(true);
    const { data, error: dbErr } = await supabase
      .from('merchant_sync_logs')
      .select(
        'id,status,sync_type,mode,total_products,sent_count,eligible_count,products_with_issues,started_at,completed_at,error_message'
      )
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dbErr) {
      setError(dbErr.message);
    } else {
      setLastSync((data as LastSyncRow | null) ?? null);
    }
    setLoadingSync(false);
  }, []);

  const loadValidation = useCallback(async () => {
    setLoadingValidation(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/validate-merchant-feed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: '{}',
        }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        totalItemsInFeed?: number;
        summary?: { ok?: number; fail?: number };
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `Validation failed (${res.status})`);
      }
      setValidation({
        totalItemsInFeed: Number(json.totalItemsInFeed ?? 0),
        ok: Number(json.summary?.ok ?? 0),
        fail: Number(json.summary?.fail ?? 0),
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingValidation(false);
    }
  }, [projectId, anonKey]);

  useEffect(() => {
    loadLastSync();
    loadValidation();
  }, [loadLastSync, loadValidation]);

  const refreshAll = () => {
    setError(null);
    loadLastSync();
    loadValidation();
  };

  const syncOk = lastSync?.status === 'completed' && !lastSync?.error_message;
  const validationOk = validation && validation.fail === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Feed Status
            </CardTitle>
            <CardDescription>
              Last sync to Google Merchant Center and current state of the public feed.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={loadingSync || loadingValidation}
          >
            {loadingSync || loadingValidation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Last Sync */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Last Merchant Sync
          </div>
          {loadingSync ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          ) : lastSync ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                {syncOk ? (
                  <Badge variant="default" className="mt-1">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> {lastSync.status}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="mt-1">
                    <XCircle className="h-3 w-3 mr-1" /> {lastSync.status ?? 'unknown'}
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="mt-1">{formatTime(lastSync.completed_at)}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(lastSync.completed_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Products sent</p>
                <p className="mt-1 font-mono">
                  {lastSync.sent_count ?? lastSync.total_products ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Eligible / Issues</p>
                <p className="mt-1 font-mono">
                  {lastSync.eligible_count ?? '—'} / {lastSync.products_with_issues ?? 0}
                </p>
              </div>
              {lastSync.error_message && (
                <p className="col-span-full text-xs text-destructive font-mono">
                  {lastSync.error_message}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sync runs recorded yet.</p>
          )}
        </div>

        {/* Live Validation */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileCheck2 className="h-4 w-4 text-muted-foreground" />
            Live Feed Validation
          </div>
          {loadingValidation ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Fetching merchant-feed.xml…
            </p>
          ) : validation ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Result</p>
                {validationOk ? (
                  <Badge variant="default" className="mt-1">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> healthy
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="mt-1">
                    <XCircle className="h-3 w-3 mr-1" /> {validation.fail} issues
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Items in feed</p>
                <p className="mt-1 font-mono">{validation.totalItemsInFeed}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sample ok / fail</p>
                <p className="mt-1 font-mono">
                  {validation.ok} / {validation.fail}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fetched</p>
                <p className="mt-1">{formatTime(validation.fetchedAt)}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(validation.fetchedAt)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No validation data.</p>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive font-mono border-t border-border pt-3">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}