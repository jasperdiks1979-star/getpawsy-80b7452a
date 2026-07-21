// Read-only transport diagnostics for Merchant API probes.
// Purpose: reconcile whether direct cross-origin fetch, supabase.functions.invoke,
// and unauthenticated GET reachability differ at transport level across
// iPhone Safari, desktop Chrome/Edge on getpawsy.pet, and the Lovable preview.
// Never modifies infrastructure, never publishes, never displays secrets.

import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, Trash2 } from 'lucide-react';

type Method = 'direct_fetch' | 'supabase_invoke' | 'unauth_get' | 'same_origin_relay';

type Classification =
  | 'RELAY_NOT_EXECUTING_STOREFRONT_INTERCEPTED'
  | 'RELAY_REACHED_AUTH_MISSING'
  | 'RELAY_EXECUTED'
  | 'EDGE_FUNCTION_REACHED'
  | 'RELAY_NETWORK_FAILURE'
  | 'RELAY_EXECUTED_ALLOWLIST_REJECTED'
  | 'RELAY_EXECUTED_WRONG_METHOD';

interface Attempt {
  id: string;
  probeId: string;
  method: Method;
  url: string;
  userAgent: string;
  origin: string;
  crossOrigin: boolean;
  startedAt: string;
  finishedAt?: string;
  elapsedMs?: number;
  httpStatus?: number | null;
  contentType?: string | null;
  bodyPreview?: string;
  parsedJson?: unknown;
  echoedProbeId?: string | null;
  reachedEdge?: boolean;
  errorName?: string;
  errorMessage?: string;
  hasSession: boolean;
  hasBearer: boolean;
  classification?: Classification;
  relayUpstreamStatus?: string | null;
}

const FN_NAME = 'merchant-api-probe';

function randomProbeId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return 'probe_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isCrossOrigin(targetUrl: string): boolean {
  try {
    const t = new URL(targetUrl, window.location.href);
    return t.origin !== window.location.origin;
  } catch {
    return true;
  }
}

async function safeText(res: Response): Promise<{ text: string; json: unknown | undefined }> {
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { text, json };
}

function extractEchoedProbeId(headers: Headers | null, parsed: unknown): string | null {
  const fromHeader = headers?.get('x-echo-probe-id') || null;
  if (fromHeader) return fromHeader;
  if (parsed && typeof parsed === 'object' && 'probeId' in (parsed as Record<string, unknown>)) {
    const v = (parsed as Record<string, unknown>).probeId;
    if (typeof v === 'string') return v;
  }
  return null;
}

export function MerchantApiTransportDiagnostics() {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [running, setRunning] = useState<Method | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const directUrl = `${supabaseUrl}/functions/v1/${FN_NAME}`;
  const invokeInternalUrl = directUrl; // supabase-js constructs the same URL under the hood
  const relayUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/edge/${FN_NAME}`
    : `/api/edge/${FN_NAME}`;

  const push = (a: Attempt) => setAttempts((prev) => [a, ...prev].slice(0, 20));

  const baseMeta = useMemo(() => ({
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
    origin: typeof window !== 'undefined' ? window.location.origin : 'n/a',
  }), []);

  async function getSessionSafe() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || null;
    return { hasSession: !!data.session, hasBearer: !!token, token };
  }

  async function runDirectFetch() {
    setRunning('direct_fetch');
    const probeId = randomProbeId();
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const { hasSession, hasBearer, token } = await getSessionSafe();
    const url = directUrl;
    const attempt: Attempt = {
      id: probeId, probeId, method: 'direct_fetch', url,
      userAgent: baseMeta.userAgent, origin: baseMeta.origin,
      crossOrigin: isCrossOrigin(url), startedAt, hasSession, hasBearer,
    };
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-client-probe-id': probeId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      headers['apikey'] = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ probeId }) });
      const { text, json } = await safeText(res);
      const echoed = extractEchoedProbeId(res.headers, json);
      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: res.status,
        contentType: res.headers.get('content-type'),
        bodyPreview: text.slice(0, 500),
        parsedJson: json,
        echoedProbeId: echoed,
        reachedEdge: echoed === probeId || (res.status > 0 && res.status !== 0),
      });
    } catch (e) {
      const err = e as Error;
      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: null,
        errorName: err.name,
        errorMessage: err.message,
        reachedEdge: false,
      });
    } finally {
      setRunning(null);
    }
  }

  async function runSupabaseInvoke() {
    setRunning('supabase_invoke');
    const probeId = randomProbeId();
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const { hasSession, hasBearer } = await getSessionSafe();
    const url = invokeInternalUrl;
    const attempt: Attempt = {
      id: probeId, probeId, method: 'supabase_invoke', url,
      userAgent: baseMeta.userAgent, origin: baseMeta.origin,
      crossOrigin: isCrossOrigin(url), startedAt, hasSession, hasBearer,
    };
    try {
      const { data, error } = await supabase.functions.invoke(FN_NAME, {
        body: { probeId },
        headers: { 'x-client-probe-id': probeId },
      });
      const parsed = data ?? null;
      const status = (error as { context?: { status?: number } } | null)?.context?.status ?? (error ? null : 200);
      const echoed = extractEchoedProbeId(null, parsed);
      const preview = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: status ?? null,
        contentType: 'application/json (via supabase-js)',
        bodyPreview: (preview || '').slice(0, 500),
        parsedJson: parsed,
        echoedProbeId: echoed,
        reachedEdge: echoed === probeId,
        errorName: error ? 'FunctionsFetchError' : undefined,
        errorMessage: error?.message,
      });
    } catch (e) {
      const err = e as Error;
      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: null,
        errorName: err.name,
        errorMessage: err.message,
        reachedEdge: false,
      });
    } finally {
      setRunning(null);
    }
  }

  async function runUnauthGet() {
    setRunning('unauth_get');
    const probeId = randomProbeId();
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const url = directUrl;
    const attempt: Attempt = {
      id: probeId, probeId, method: 'unauth_get', url,
      userAgent: baseMeta.userAgent, origin: baseMeta.origin,
      crossOrigin: isCrossOrigin(url), startedAt, hasSession: false, hasBearer: false,
    };
    try {
      // No Authorization, no apikey, no preflight-triggering custom headers.
      const res = await fetch(url, { method: 'GET' });
      const { text, json } = await safeText(res);
      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: res.status,
        contentType: res.headers.get('content-type'),
        bodyPreview: text.slice(0, 500),
        parsedJson: json,
        echoedProbeId: null,
        // Reaching a 401 "missing_auth" still proves TCP + TLS + edge boot.
        reachedEdge: res.status > 0,
      });
    } catch (e) {
      const err = e as Error;
      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: null,
        errorName: err.name,
        errorMessage: err.message,
        reachedEdge: false,
      });
    } finally {
      setRunning(null);
    }
  }

  async function runSameOriginRelay() {
    setRunning('same_origin_relay');
    const probeId = randomProbeId();
    const startedAt = new Date().toISOString();
    const t0 = performance.now();
    const { hasSession, hasBearer, token } = await getSessionSafe();
    const url = relayUrl;
    const attempt: Attempt = {
      id: probeId, probeId, method: 'same_origin_relay', url,
      userAgent: baseMeta.userAgent, origin: baseMeta.origin,
      crossOrigin: isCrossOrigin(url), startedAt, hasSession, hasBearer,
    };
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-client-probe-id': probeId,
      };
      // Bearer only. The relay attaches apikey server-side; browser MUST NOT send it.
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ probeId }),
      });
      const ct = res.headers.get('content-type') || '';
      const upstream = res.headers.get('x-relay-upstream-status');
      const { text, json } = await safeText(res);
      const echoed = extractEchoedProbeId(res.headers, json);

      // Classification per spec — order matters.
      let classification: Classification;
      const looksHtml = /^text\/html/i.test(ct) || /^\s*<!doctype html/i.test(text);
      if (looksHtml) {
        classification = 'RELAY_NOT_EXECUTING_STOREFRONT_INTERCEPTED';
      } else if (res.status === 401 && /missing_auth/i.test(text)) {
        classification = 'RELAY_REACHED_AUTH_MISSING';
      } else if (res.status === 404 && /function_not_allowed/i.test(text)) {
        classification = 'RELAY_EXECUTED_ALLOWLIST_REJECTED';
      } else if (res.status === 405) {
        classification = 'RELAY_EXECUTED_WRONG_METHOD';
      } else if (echoed && echoed === probeId) {
        classification = 'EDGE_FUNCTION_REACHED';
      } else if (upstream) {
        classification = 'RELAY_EXECUTED';
      } else {
        classification = 'RELAY_NOT_EXECUTING_STOREFRONT_INTERCEPTED';
      }

      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: res.status,
        contentType: ct || null,
        bodyPreview: text.slice(0, 500),
        parsedJson: json,
        echoedProbeId: echoed,
        reachedEdge: classification === 'EDGE_FUNCTION_REACHED' || classification === 'RELAY_EXECUTED',
        relayUpstreamStatus: upstream,
        classification,
      });
    } catch (e) {
      const err = e as Error;
      push({
        ...attempt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: null,
        errorName: err.name,
        errorMessage: err.message,
        reachedEdge: false,
        classification: 'RELAY_NETWORK_FAILURE',
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <Card className="border-dashed border-amber-500/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <FlaskConical className="h-5 w-5" />
          Merchant API — Transport Reconciliation (Read-Only Diagnostics)
        </CardTitle>
        <CardDescription>
          Temporary admin-only diagnostic. Compares direct cross-origin{' '}
          <code>fetch</code>, <code>supabase.functions.invoke</code>, and
          unauthenticated GET reachability. No writes. No infrastructure
          changes. Never displays JWTs, apikey, or refresh tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">origin: {baseMeta.origin}</Badge>
          <Badge variant="outline">signedIn: {String(!!user)}</Badge>
          <Badge variant="outline">direct URL cross-origin: {String(isCrossOrigin(directUrl))}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={runDirectFetch} disabled={running !== null}>
            {running === 'direct_fetch' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            A. Test direct fetch
          </Button>
          <Button size="sm" variant="secondary" onClick={runSupabaseInvoke} disabled={running !== null}>
            {running === 'supabase_invoke' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            B. Test supabase.functions.invoke
          </Button>
          <Button size="sm" variant="secondary" onClick={runUnauthGet} disabled={running !== null}>
            {running === 'unauth_get' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            C. Test unauthenticated GET reachability
          </Button>
          <Button size="sm" onClick={runSameOriginRelay} disabled={running !== null}>
            {running === 'same_origin_relay' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            D. Test same-origin relay
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const safe = attempts.map((a) => ({ ...a }));
              try {
                navigator.clipboard?.writeText(JSON.stringify(safe, null, 2));
              } catch { /* ignore */ }
            }}
            disabled={attempts.length === 0}
          >
            Copy full diagnostics JSON
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAttempts([])} disabled={attempts.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear results
          </Button>
        </div>

        {attempts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No attempts yet. Run A/B/C/D on each target environment
            (iPhone Safari on getpawsy.pet, desktop Chrome/Edge on
            getpawsy.pet, Lovable preview). A + B are cross-origin and
            preflighted; B is still <code>fetch</code> under the hood;
            C proves only DNS/TLS/function reachability; D is the actual
            production same-origin transport. Results stack newest-first.
          </p>
        )}

        <div className="space-y-3">
          {attempts.map((a) => (
            <div key={a.id} className="rounded border p-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{a.method}</Badge>
                <Badge variant="outline">HTTP {a.httpStatus ?? 'ERR'}</Badge>
                <Badge variant="outline">{a.elapsedMs ?? '?'} ms</Badge>
                <Badge variant={a.crossOrigin ? 'destructive' : 'default'}>
                  {a.crossOrigin ? 'cross-origin' : 'same-origin'}
                </Badge>
                <Badge variant={a.reachedEdge ? 'default' : 'secondary'}>
                  edge reached: {String(!!a.reachedEdge)}
                </Badge>
                <Badge variant="outline">hasSession={String(a.hasSession)}</Badge>
                <Badge variant="outline">hasBearer={String(a.hasBearer)}</Badge>
                {a.classification && (
                  <Badge variant="secondary">{a.classification}</Badge>
                )}
                {a.relayUpstreamStatus && (
                  <Badge variant="outline">x-relay-upstream-status={a.relayUpstreamStatus}</Badge>
                )}
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                <div><span className="text-muted-foreground">url:</span> <code className="break-all">{a.url}</code></div>
                <div><span className="text-muted-foreground">probeId:</span> <code>{a.probeId}</code></div>
                <div><span className="text-muted-foreground">echoed:</span> <code>{a.echoedProbeId ?? '—'}</code></div>
                <div><span className="text-muted-foreground">content-type:</span> <code>{a.contentType ?? '—'}</code></div>
                <div><span className="text-muted-foreground">started:</span> {a.startedAt}</div>
                <div><span className="text-muted-foreground">finished:</span> {a.finishedAt ?? '—'}</div>
                <div className="sm:col-span-2"><span className="text-muted-foreground">userAgent:</span> <code className="break-all">{a.userAgent}</code></div>
              </div>
              {a.errorMessage && (
                <div className="p-2 rounded bg-destructive/10 text-destructive break-words">
                  {a.errorName}: {a.errorMessage}
                </div>
              )}
              {a.bodyPreview && (
                <pre className="bg-muted rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-words">
                  {a.bodyPreview}
                </pre>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default MerchantApiTransportDiagnostics;