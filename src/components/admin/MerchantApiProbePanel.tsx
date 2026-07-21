import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

// Connected merchant admin (Phase 2A authorized identity)
const MERCHANT_ADMIN_USER_ID = '1b97d610-98c8-46c0-b363-63ef6495fa8a';

// Read flags from Vite env for display only. These are booleans surfaced by
// the app config; the true source of truth lives server-side in edge secrets.
// We display the intended/known state — writes/deletes are hard-disabled.
const READ_FLAG_ENABLED = true; // MERCHANT_API_READ_ENABLED=true
const WRITE_FLAG_ENABLED = false;
const DELETE_FLAG_ENABLED = false;

interface InvocationResult {
  status: number | null;
  body: unknown;
  error?: string;
}

async function invokeFn(name: string): Promise<InvocationResult> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { status: 401, body: null, error: 'no_session' };

  // Primary: supabase.functions.invoke (do NOT use the same-origin /api/edge/*
  // relay — it is intercepted by Lovable's storefront shell and never reaches
  // the Cloudflare Worker). Fallback once to an explicit direct fetch if the
  // invoke transport throws.
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: {} });
    if (!error) return { status: 200, body: data };
    const status = (error as { context?: { status?: number } }).context?.status ?? null;
    return { status, body: data ?? null, error: error.message };
  } catch (invokeErr) {
    const imsg = invokeErr instanceof Error ? `${invokeErr.name}: ${invokeErr.message}` : String(invokeErr);
    // One-shot direct fetch fallback. No infinite retry loops.
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = JSON.parse(text); } catch { /* keep text */ }
      return { status: res.status, body: parsed };
    } catch (directErr) {
      const dmsg = directErr instanceof Error ? `${directErr.name}: ${directErr.message}` : String(directErr);
      return { status: null, body: null, error: `invoke: ${imsg} | direct: ${dmsg}` };
    }
  }
}

/**
 * Direct authenticated fetch transport (primary for merchant-api-shadow).
 *
 * Mirrors the working probe direct-fetch path: POST to
 * `${VITE_SUPABASE_URL}/functions/v1/<name>` with Authorization bearer,
 * apikey and Content-Type. 20s abort timeout, no retries. Non-2xx JSON
 * bodies are parsed and returned so the UI can render them instead of
 * showing "null".
 */
async function directFetchFn(name: string): Promise<InvocationResult> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { status: 401, body: null, error: 'no_session' };

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
    return { status: res.status, body: parsed };
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { status: null, body: null, error: aborted ? 'timeout_20s' : `direct: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? 'default' : 'secondary'} className="gap-1">
      {ok ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function ResultBlock({ title, result }: { title: string; result: InvocationResult }) {
  const pretty = typeof result.body === 'string'
    ? result.body
    : JSON.stringify(result.body, null, 2);
  const banner = result.status === 401
    ? 'Your admin session is missing or expired. Sign out and sign in again.'
    : result.status === 403 && result.body && typeof result.body === 'object'
      ? `403 — ${(result.body as any).code ?? (result.body as any).error ?? 'forbidden'}`
      : result.status === null
        ? `Network/CORS error — ${result.error ?? 'fetch failed before reaching the function'}`
        : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="outline">HTTP {result.status ?? 'ERR'}</Badge>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(pretty);
            toast.success('Copied JSON');
          }}
        >
          <Copy className="h-3 w-3 mr-1" />
          Copy JSON
        </Button>
      </div>
      {banner && (
        <div className="p-2 rounded bg-destructive/10 text-destructive text-sm">{banner}</div>
      )}
      {result.error && result.status !== null && (
        <div className="p-2 rounded bg-muted text-xs text-muted-foreground break-words">
          {result.error}
        </div>
      )}
      <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap break-words">
        {pretty}
      </pre>
    </div>
  );
}

export function MerchantApiProbePanel() {
  const { user } = useAuth();
  const [probeResult, setProbeResult] = useState<InvocationResult | null>(null);
  const [shadowResult, setShadowResult] = useState<InvocationResult | null>(null);
  const [probeRunning, setProbeRunning] = useState(false);
  const [shadowRunning, setShadowRunning] = useState(false);

  const signedIn = !!user;
  const adminMatch = user?.id === MERCHANT_ADMIN_USER_ID;

  // Probe allowed when: signed in, merchant admin matched, read flag enabled,
  // write flag disabled, delete flag disabled.
  const probeAllowed =
    signedIn &&
    adminMatch &&
    READ_FLAG_ENABLED &&
    !WRITE_FLAG_ENABLED &&
    !DELETE_FLAG_ENABLED;

  // Genuine probe success: HTTP 200 + parsed JSON object + ok === true.
  // HTML shells, nulls, transport errors and 200-with-invalid-JSON do NOT
  // enable the Shadow Comparison.
  const probeOk =
    probeResult?.status === 200 &&
    !!probeResult.body &&
    typeof probeResult.body === 'object' &&
    (probeResult.body as { ok?: unknown }).ok === true;

  const runProbe = async () => {
    if (!probeAllowed) return;
    setProbeRunning(true);
    setShadowResult(null);
    const r = await invokeFn('merchant-api-probe');
    setProbeResult(r);
    setProbeRunning(false);
  };

  const runShadow = async () => {
    if (!probeAllowed || !probeOk) return;
    setShadowRunning(true);
    // Shadow uses the direct authenticated fetch transport (same as the
    // working probe direct path). This avoids the supabase.functions.invoke
    // failure mode on iPhone Safari where non-2xx JSON bodies are surfaced
    // as `null`. Read-only: no writes, no retries, 20s timeout.
    const r = await directFetchFn('merchant-api-shadow');
    setShadowResult(r);
    setShadowRunning(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Merchant API — Phase 2A Read-Only Probe
        </CardTitle>
        <CardDescription>
          Admin-only verification. Read-only calls to the deployed
          <code className="mx-1">merchant-api-probe</code> and
          <code className="mx-1">merchant-api-shadow</code> functions.
          No writes, no deletes, no feed/product changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Status ok={signedIn} label={signedIn ? 'Signed in' : 'Signed out'} />
          <Status ok={adminMatch} label={adminMatch ? 'Merchant admin matched' : 'Merchant admin not matched'} />
          <Status ok={READ_FLAG_ENABLED} label="Read flag enabled" />
          <Status ok={!WRITE_FLAG_ENABLED} label="Write flag disabled" />
          <Status ok={!DELETE_FLAG_ENABLED} label="Delete flag disabled" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={runProbe}
            disabled={!probeAllowed || probeRunning}
            title={
              !probeAllowed
                ? 'Requires signed-in merchant admin with read flag enabled and write/delete disabled'
                : ''
            }
          >
            {probeRunning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Run Merchant API Probe
          </Button>
          <Button
            onClick={runShadow}
            variant="secondary"
            disabled={!probeAllowed || !probeOk || shadowRunning}
            title={
              !probeAllowed
                ? 'Requires signed-in merchant admin with read flag enabled and write/delete disabled'
                : !probeOk
                  ? 'Run the probe successfully first (HTTP 200 + ok:true JSON)'
                  : ''
            }
          >
            {shadowRunning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Run Merchant API Shadow Comparison
          </Button>
        </div>

        {probeResult && <ResultBlock title="merchant-api-probe" result={probeResult} />}
        {shadowResult && <ResultBlock title="merchant-api-shadow" result={shadowResult} />}

        {!adminMatch && signedIn && (
          <p className="text-xs text-muted-foreground">
            Note: functions authorize the connected merchant admin only. Requests
            from other admins will return 403.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default MerchantApiProbePanel;