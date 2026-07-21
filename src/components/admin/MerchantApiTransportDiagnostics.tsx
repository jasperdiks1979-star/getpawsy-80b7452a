// Read-only iPhone-safe transport diagnostics for Merchant API probes.
// Never modifies infrastructure, never publishes, never displays secrets.
// One-tap sequential runner: A → B → C.

import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FlaskConical, Trash2, Play, Copy, Download, RotateCw } from 'lucide-react';

export type Method =
  | 'direct_fetch'
  | 'supabase_invoke'
  | 'unauth_get'
  | 'same_origin_relay';

export type Classification =
  | 'AUTHENTICATED_EDGE_SUCCESS'
  | 'AUTHENTICATED_HTTP_ERROR'
  | 'UNAUTHENTICATED_EDGE_REACHABLE'
  | 'PREFLIGHT_OR_BROWSER_TRANSPORT_FAILURE'
  | 'REQUEST_TIMEOUT'
  | 'SESSION_MISSING'
  | 'STOREFRONT_HTML_INTERCEPTION'
  | 'UNKNOWN_FAILURE';

export interface Attempt {
  id: string;
  probeId: string;
  method: Method;
  label: string;
  url: string;
  httpMethod: 'GET' | 'POST';
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
  echoedProbeIdMatches?: boolean;
  reachedEdge?: boolean;
  errorName?: string;
  errorMessage?: string;
  hasSession: boolean;
  hasBearer: boolean;
  classification: Classification;
}

const FN_NAME = 'merchant-api-probe';
const REQUEST_TIMEOUT_MS = 20_000;

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

/** Classify a completed attempt. Exported for tests. */
export function classifyAttempt(input: {
  method: Method;
  httpStatus?: number | null;
  contentType?: string | null;
  bodyPreview?: string;
  parsedJson?: unknown;
  errorName?: string;
  errorMessage?: string;
  hasBearer: boolean;
  requiresAuth: boolean;
}): Classification {
  const { method, httpStatus, contentType, bodyPreview, parsedJson, errorName, errorMessage, hasBearer, requiresAuth } = input;
  const ct = (contentType || '').toLowerCase();
  const body = bodyPreview || '';
  const looksHtml = ct.startsWith('text/html') || /^\s*<!doctype html/i.test(body);

  if (errorName === 'AbortError' || /timeout|timed out/i.test(errorMessage || '')) {
    return 'REQUEST_TIMEOUT';
  }
  if (requiresAuth && !hasBearer) return 'SESSION_MISSING';

  if (method === 'same_origin_relay' && looksHtml) return 'STOREFRONT_HTML_INTERCEPTION';
  if (looksHtml && method !== 'unauth_get') return 'STOREFRONT_HTML_INTERCEPTION';

  if (httpStatus == null) {
    return errorMessage ? 'PREFLIGHT_OR_BROWSER_TRANSPORT_FAILURE' : 'UNKNOWN_FAILURE';
  }

  if (method === 'unauth_get') {
    if (httpStatus === 401) return 'UNAUTHENTICATED_EDGE_REACHABLE';
    if (httpStatus >= 200 && httpStatus < 500) return 'UNAUTHENTICATED_EDGE_REACHABLE';
    return 'AUTHENTICATED_HTTP_ERROR';
  }

  if (httpStatus >= 200 && httpStatus < 300) {
    const ok = parsedJson && typeof parsedJson === 'object' && (parsedJson as { ok?: boolean }).ok === true;
    return ok ? 'AUTHENTICATED_EDGE_SUCCESS' : 'AUTHENTICATED_HTTP_ERROR';
  }
  return 'AUTHENTICATED_HTTP_ERROR';
}

function withTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      controller.abort();
      const e = new Error(`Request timed out after ${ms}ms`);
      e.name = 'AbortError';
      reject(e);
    }, ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}

/** Clipboard write with iPhone-safe textarea fallback. Exported for tests. */
export async function copyToClipboardSafe(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function MerchantApiTransportDiagnostics() {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [running, setRunning] = useState<Method | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number; label: string } | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [completedOnce, setCompletedOnce] = useState(false);
  const wakeLockRef = useRef<{ release?: () => Promise<void> } | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const directUrl = `${supabaseUrl}/functions/v1/${FN_NAME}`;
  const invokeInternalUrl = directUrl;

  const push = useCallback((a: Attempt) => setAttempts((prev) => [a, ...prev].slice(0, 20)), []);

  const baseMeta = useMemo(() => ({
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
    origin: typeof window !== 'undefined' ? window.location.origin : 'n/a',
  }), []);

  const getSessionSafe = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token || null;
    return { hasSession: !!data.session, hasBearer: !!token, token };
  }, []);

  const buildBase = useCallback((method: Method, label: string, url: string, httpMethod: 'GET' | 'POST', probeId: string, hasSession: boolean, hasBearer: boolean): Attempt => ({
    id: probeId,
    probeId,
    method,
    label,
    url,
    httpMethod,
    userAgent: baseMeta.userAgent,
    origin: baseMeta.origin,
    crossOrigin: isCrossOrigin(url),
    startedAt: new Date().toISOString(),
    hasSession,
    hasBearer,
    classification: 'UNKNOWN_FAILURE',
  }), [baseMeta]);

  const runDirectFetch = useCallback(async (): Promise<Attempt> => {
    setRunning('direct_fetch');
    const probeId = randomProbeId();
    const t0 = performance.now();
    const { hasSession, hasBearer, token } = await getSessionSafe();
    const base = buildBase('direct_fetch', 'A. Direct authenticated fetch', directUrl, 'POST', probeId, hasSession, hasBearer);
    const controller = new AbortController();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-client-probe-id': probeId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      headers['apikey'] = publishableKey;
      const res = await withTimeout(fetch(directUrl, { method: 'POST', headers, body: JSON.stringify({}), signal: controller.signal }), REQUEST_TIMEOUT_MS, controller);
      const { text, json } = await safeText(res);
      const echoed = extractEchoedProbeId(res.headers, json);
      const contentType = res.headers.get('content-type');
      const result: Attempt = {
        ...base,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: res.status,
        contentType,
        bodyPreview: text.slice(0, 1000),
        parsedJson: json,
        echoedProbeId: echoed,
        echoedProbeIdMatches: echoed === probeId,
        reachedEdge: res.status > 0,
        classification: classifyAttempt({ method: 'direct_fetch', httpStatus: res.status, contentType, bodyPreview: text, parsedJson: json, hasBearer, requiresAuth: true }),
      };
      push(result); return result;
    } catch (e) {
      const err = e as Error;
      const result: Attempt = {
        ...base,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: null,
        errorName: err.name,
        errorMessage: err.message,
        reachedEdge: false,
        classification: classifyAttempt({ method: 'direct_fetch', httpStatus: null, errorName: err.name, errorMessage: err.message, hasBearer, requiresAuth: true }),
      };
      push(result); return result;
    } finally {
      setRunning(null);
    }
  }, [buildBase, directUrl, publishableKey, getSessionSafe, push]);

  const runSupabaseInvoke = useCallback(async (): Promise<Attempt> => {
    setRunning('supabase_invoke');
    const probeId = randomProbeId();
    const t0 = performance.now();
    const { hasSession, hasBearer } = await getSessionSafe();
    const base = buildBase('supabase_invoke', 'B. supabase.functions.invoke', invokeInternalUrl, 'POST', probeId, hasSession, hasBearer);
    try {
      const invokeCall = supabase.functions.invoke(FN_NAME, {
        body: { probeId },
        headers: { 'x-client-probe-id': probeId },
      });
      // supabase-js does not accept AbortSignal; wrap with Promise.race timeout.
      let timedOut = false;
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => { timedOut = true; const e = new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`); e.name = 'AbortError'; reject(e); }, REQUEST_TIMEOUT_MS);
      });
      const { data, error } = await Promise.race([invokeCall, timeout]) as Awaited<typeof invokeCall>;
      if (timedOut) throw Object.assign(new Error('Request timed out'), { name: 'AbortError' });
      const parsed = data ?? null;
      const status = (error as { context?: { status?: number } } | null)?.context?.status ?? (error ? null : 200);
      const echoed = extractEchoedProbeId(null, parsed);
      const preview = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      const result: Attempt = {
        ...base,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: status ?? null,
        contentType: 'application/json (via supabase-js)',
        bodyPreview: (preview || '').slice(0, 1000),
        parsedJson: parsed,
        echoedProbeId: echoed,
        echoedProbeIdMatches: echoed === probeId,
        reachedEdge: echoed === probeId || (status != null && status > 0),
        errorName: error ? 'FunctionsFetchError' : undefined,
        errorMessage: error?.message,
        classification: classifyAttempt({ method: 'supabase_invoke', httpStatus: status ?? null, parsedJson: parsed, errorName: error ? 'FunctionsFetchError' : undefined, errorMessage: error?.message, hasBearer, requiresAuth: true }),
      };
      push(result); return result;
    } catch (e) {
      const err = e as Error;
      const result: Attempt = {
        ...base,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: null,
        errorName: err.name,
        errorMessage: err.message,
        reachedEdge: false,
        classification: classifyAttempt({ method: 'supabase_invoke', httpStatus: null, errorName: err.name, errorMessage: err.message, hasBearer, requiresAuth: true }),
      };
      push(result); return result;
    } finally {
      setRunning(null);
    }
  }, [buildBase, invokeInternalUrl, getSessionSafe, push]);

  const runUnauthGet = useCallback(async (): Promise<Attempt> => {
    setRunning('unauth_get');
    const probeId = randomProbeId();
    const t0 = performance.now();
    const base = buildBase('unauth_get', 'C. Unauthenticated reachability (GET)', directUrl, 'GET', probeId, false, false);
    const controller = new AbortController();
    try {
      const res = await withTimeout(fetch(directUrl, { method: 'GET', signal: controller.signal }), REQUEST_TIMEOUT_MS, controller);
      const { text, json } = await safeText(res);
      const contentType = res.headers.get('content-type');
      const result: Attempt = {
        ...base,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: res.status,
        contentType,
        bodyPreview: text.slice(0, 1000),
        parsedJson: json,
        echoedProbeId: null,
        echoedProbeIdMatches: false,
        reachedEdge: res.status > 0,
        classification: classifyAttempt({ method: 'unauth_get', httpStatus: res.status, contentType, bodyPreview: text, parsedJson: json, hasBearer: false, requiresAuth: false }),
      };
      push(result); return result;
    } catch (e) {
      const err = e as Error;
      const result: Attempt = {
        ...base,
        finishedAt: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - t0),
        httpStatus: null,
        errorName: err.name,
        errorMessage: err.message,
        reachedEdge: false,
        classification: classifyAttempt({ method: 'unauth_get', httpStatus: null, errorName: err.name, errorMessage: err.message, hasBearer: false, requiresAuth: false }),
      };
      push(result); return result;
    } finally {
      setRunning(null);
    }
  }, [buildBase, directUrl, push]);

  const requestWakeLock = useCallback(async () => {
    try {
      const anyNav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
      if (anyNav.wakeLock?.request) {
        wakeLockRef.current = await anyNav.wakeLock.request('screen');
      }
    } catch { /* unsupported */ }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try { await wakeLockRef.current?.release?.(); } catch { /* ignore */ }
    wakeLockRef.current = null;
  }, []);

  const runAllSafe = useCallback(async () => {
    if (running) return;
    setCompletedOnce(false);
    await requestWakeLock();
    try {
      setProgress({ index: 1, total: 3, label: 'Running A of 3 — Direct authenticated fetch' });
      await runDirectFetch();
      setProgress({ index: 2, total: 3, label: 'Running B of 3 — supabase.functions.invoke' });
      await runSupabaseInvoke();
      setProgress({ index: 3, total: 3, label: 'Running C of 3 — Unauthenticated reachability' });
      await runUnauthGet();
    } finally {
      setProgress(null);
      setCompletedOnce(true);
      await releaseWakeLock();
    }
  }, [running, runDirectFetch, runSupabaseInvoke, runUnauthGet, requestWakeLock, releaseWakeLock]);

  const retryFailed = useCallback(async () => {
    if (running) return;
    const failedMethods = new Set(attempts.filter((a) => a.classification !== 'AUTHENTICATED_EDGE_SUCCESS' && a.classification !== 'UNAUTHENTICATED_EDGE_REACHABLE').map((a) => a.method));
    if (failedMethods.has('direct_fetch')) await runDirectFetch();
    if (failedMethods.has('supabase_invoke')) await runSupabaseInvoke();
    if (failedMethods.has('unauth_get')) await runUnauthGet();
  }, [attempts, running, runDirectFetch, runSupabaseInvoke, runUnauthGet]);

  const diagnosticsJson = useMemo(() => {
    // Never include any secret material. Attempts already exclude token bodies.
    const payload = {
      generatedAt: new Date().toISOString(),
      origin: baseMeta.origin,
      userAgent: baseMeta.userAgent,
      canonicalAdminRoute: '/admin/integrations/merchant',
      attempts,
    };
    return JSON.stringify(payload, null, 2);
  }, [attempts, baseMeta]);

  const copyJson = useCallback(async () => {
    const ok = await copyToClipboardSafe(diagnosticsJson);
    setCopyState(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 2500);
  }, [diagnosticsJson]);

  const downloadJson = useCallback(() => {
    const blob = new Blob([diagnosticsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-api-diagnostics-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [diagnosticsJson]);

  return (
    <Card className="border-dashed border-amber-500/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <FlaskConical className="h-5 w-5" />
          Merchant API — iPhone One-Tap Transport Diagnostics
        </CardTitle>
        <CardDescription>
          Admin-only read-only diagnostic. Runs A → B → C sequentially.
          Never displays JWTs, apikey, or refresh tokens. No writes, no
          infrastructure changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="break-all max-w-full">origin: {baseMeta.origin}</Badge>
          <Badge variant="outline">signedIn: {String(!!user)}</Badge>
        </div>

        <Button
          size="lg"
          onClick={runAllSafe}
          disabled={running !== null}
          className="w-full min-h-[52px] text-base"
          data-testid="run-all-diagnostics"
        >
          {running !== null ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Play className="h-5 w-5 mr-2" />}
          Run all safe diagnostics
        </Button>

        {progress && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/40 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{progress.label}</span>
            </div>
          </div>
        )}

        {completedOnce && !progress && (
          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/40 p-3 text-sm">
            Diagnostics completed — copy the JSON and return it to ChatGPT.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={copyJson}
            disabled={attempts.length === 0}
            className="w-full min-h-[48px]"
            data-testid="copy-diagnostics"
          >
            <Copy className="h-4 w-4 mr-2" />
            {copyState === 'copied' ? 'Copied ✓' : copyState === 'failed' ? 'Copy failed' : 'Copy full diagnostics JSON'}
          </Button>
          <Button
            variant="outline"
            onClick={downloadJson}
            disabled={attempts.length === 0}
            className="w-full min-h-[48px]"
          >
            <Download className="h-4 w-4 mr-2" />
            Download diagnostics JSON
          </Button>
          <Button
            variant="outline"
            onClick={retryFailed}
            disabled={running !== null || attempts.length === 0}
            className="w-full min-h-[48px]"
          >
            <RotateCw className="h-4 w-4 mr-2" />
            Retry failed tests
          </Button>
          <Button
            variant="ghost"
            onClick={() => { setAttempts([]); setCompletedOnce(false); }}
            disabled={attempts.length === 0 || running !== null}
            className="w-full min-h-[48px]"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear results
          </Button>
        </div>

        {attempts.length === 0 && !progress && (
          <p className="text-xs text-muted-foreground">
            Tap “Run all safe diagnostics” to sequentially execute A → B → C.
            Results stack newest-first. The relay path is disabled as an
            active transport (see historical note below).
          </p>
        )}

        <div className="space-y-3">
          {attempts.map((a) => (
            <div key={a.id + a.startedAt} className="rounded border p-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="whitespace-normal text-left">{a.label}</Badge>
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
                <Badge variant="secondary">{a.classification}</Badge>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                <div><span className="text-muted-foreground">method:</span> <code>{a.httpMethod}</code></div>
                <div className="sm:col-span-2 break-all"><span className="text-muted-foreground">url:</span> <code>{a.url}</code></div>
                <div><span className="text-muted-foreground">probeId:</span> <code>{a.probeId}</code></div>
                <div><span className="text-muted-foreground">echoed:</span> <code>{a.echoedProbeId ?? '—'}</code>{a.echoedProbeIdMatches ? ' ✓' : ''}</div>
                <div><span className="text-muted-foreground">content-type:</span> <code>{a.contentType ?? '—'}</code></div>
                <div><span className="text-muted-foreground">elapsed:</span> {a.elapsedMs ?? '—'} ms</div>
                <div><span className="text-muted-foreground">started:</span> {a.startedAt}</div>
                <div><span className="text-muted-foreground">finished:</span> {a.finishedAt ?? '—'}</div>
                <div className="sm:col-span-2 break-all"><span className="text-muted-foreground">userAgent:</span> <code>{a.userAgent}</code></div>
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

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">
            D. Relay check — known storefront interception (historical, disabled)
          </summary>
          <p className="mt-2">
            The same-origin path <code>/api/edge/*</code> is intercepted by
            Lovable’s storefront shell and never reaches the Cloudflare
            Worker. It is therefore not a viable transport and is excluded
            from the active diagnostic flow. Kept here as historical
            reference only.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

export default MerchantApiTransportDiagnostics;