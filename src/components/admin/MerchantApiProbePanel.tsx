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
  const [reconResult, setReconResult] = useState<InvocationResult | null>(null);
  const [previewResult, setPreviewResult] = useState<InvocationResult | null>(null);
  const [validateResult, setValidateResult] = useState<InvocationResult | null>(null);
  const [writeResult, setWriteResult] = useState<InvocationResult | null>(null);
  const [previewRunning, setPreviewRunning] = useState(false);
  const [validateRunning, setValidateRunning] = useState(false);
  const [writeRunning, setWriteRunning] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [probeRunning, setProbeRunning] = useState(false);
  const [shadowRunning, setShadowRunning] = useState(false);
  const [reconRunning, setReconRunning] = useState(false);

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

  const runRecon = async () => {
    if (!probeAllowed || !probeOk) return;
    setReconRunning(true);
    const r = await directFetchFn('merchant-api-reconciliation');
    setReconResult(r);
    setReconRunning(false);
  };

  // Dedicated direct fetch with JSON body (canary needs mode + confirm).
  const directPost = async (name: string, body: Record<string, unknown>): Promise<InvocationResult> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return { status: 401, body: null, error: 'no_session' };
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: unknown = text;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      return { status: res.status, body: parsed };
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return { status: null, body: null, error: msg };
    } finally { clearTimeout(timeout); }
  };

  const runCanaryPreview = async () => {
    if (!probeAllowed) return;
    setPreviewRunning(true);
    setValidateResult(null);
    setWriteResult(null);
    const r = await directPost('merchant-api-write-canary', { mode: 'preview' });
    setPreviewResult(r);
    setPreviewRunning(false);
  };

  const previewOk =
    previewResult?.status === 200 &&
    !!previewResult.body &&
    typeof previewResult.body === 'object' &&
    (previewResult.body as { ok?: unknown }).ok === true;

  const runCanaryValidate = async () => {
    if (!probeAllowed || !previewOk) return;
    setValidateRunning(true);
    setWriteResult(null);
    const r = await directPost('merchant-api-write-canary', { mode: 'validate' });
    setValidateResult(r);
    setValidateRunning(false);
  };

  const validateBody =
    validateResult?.body && typeof validateResult.body === 'object'
      ? (validateResult.body as Record<string, unknown>)
      : null;
  const validateVerdict = validateBody?.verdict as string | undefined;
  const validationObj =
    validateBody && typeof validateBody.validation === 'object' && validateBody.validation !== null
      ? (validateBody.validation as Record<string, unknown>)
      : null;
  const validationSafe = validationObj?.safe === true;
  const validationFindings = Array.isArray(validationObj?.schemaFindings)
    ? (validationObj!.schemaFindings as unknown[])
    : [];
  const validateOk =
    validateResult?.status === 200 &&
    !!validateBody &&
    validateVerdict === 'MERCHANT_V1_CANARY_VALIDATION_OK' &&
    validationSafe &&
    validationFindings.length === 0;

  const canExecuteCanary =
    probeAllowed &&
    previewOk &&
    validateOk &&
    confirmPhrase === 'WRITE ONE MERCHANT CANARY';

  const runCanaryWrite = async () => {
    if (!canExecuteCanary) return;
    setWriteRunning(true);
    const r = await directPost('merchant-api-write-canary', {
      mode: 'execute',
      confirm: 'WRITE ONE MERCHANT CANARY',
    });
    setWriteResult(r);
    setWriteRunning(false);
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
          <Button
            onClick={runRecon}
            variant="secondary"
            disabled={!probeAllowed || !probeOk || reconRunning}
            title={
              !probeAllowed
                ? 'Requires signed-in merchant admin with read flag enabled and write/delete disabled'
                : !probeOk
                  ? 'Run the probe successfully first (HTTP 200 + ok:true JSON)'
                  : ''
            }
          >
            {reconRunning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Run Full Product ID Reconciliation
          </Button>
        </div>

        {probeResult && <ResultBlock title="merchant-api-probe" result={probeResult} />}
        {shadowResult && <ResultBlock title="merchant-api-shadow" result={shadowResult} />}
        {reconResult && <ResultBlock title="merchant-api-reconciliation" result={reconResult} />}

        {/* ── Merchant API v1 Single-Product Write Canary ─────────────── */}
        <div className="border-t pt-4 mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold">
              Merchant API v1 — Single-Product Write Canary
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Isolated, one-product write. Bulk migration is not available here.
            Preview first; the write button unlocks only after a successful
            preview AND the exact confirmation phrase is typed below.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={runCanaryPreview}
              variant="secondary"
              disabled={!probeAllowed || previewRunning}
            >
              {previewRunning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Preview canary candidate
            </Button>
          </div>
          {previewResult && <ResultBlock title="canary preview" result={previewResult} />}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={runCanaryValidate}
              variant="secondary"
              disabled={!probeAllowed || !previewOk || validateRunning}
              title={!previewOk ? 'Run preview successfully first' : ''}
            >
              {validateRunning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Validate canary request
            </Button>
          </div>
          {validateResult && (
            <>
              <ResultBlock title="canary validate" result={validateResult} />
              {validateBody && (
                <div className="space-y-2 text-xs bg-muted/50 rounded p-3">
                  {typeof validateBody.sanitizedUrl === 'string' && (
                    <div>
                      <div className="font-semibold">Sanitized URL</div>
                      <code className="break-all">{validateBody.sanitizedUrl as string}</code>
                    </div>
                  )}
                  {validateBody.sanitizedRequestBody !== undefined && (
                    <div>
                      <div className="font-semibold">Sanitized request body</div>
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(validateBody.sanitizedRequestBody, null, 2)}
                      </pre>
                    </div>
                  )}
                  {validateBody.schemaFindings !== undefined && (
                    <div>
                      <div className="font-semibold">Schema findings</div>
                      <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(validateBody.schemaFindings, null, 2)}
                      </pre>
                    </div>
                  )}
                  {typeof validateBody.likelyCause === 'string' && (
                    <div>
                      <div className="font-semibold">Likely cause</div>
                      <div>{validateBody.likelyCause as string}</div>
                    </div>
                  )}
                  {validateVerdict && (
                    <div>
                      <div className="font-semibold">Verdict</div>
                      <div>{validateVerdict}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <div className="space-y-2">
            <label htmlFor="canary-confirm" className="text-xs font-medium">
              Type exactly <code>WRITE ONE MERCHANT CANARY</code> to enable the write button.
            </label>
            <input
              id="canary-confirm"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded bg-background font-mono"
              placeholder="WRITE ONE MERCHANT CANARY"
              disabled={!previewOk || !validateOk}
            />
            <Button
              onClick={runCanaryWrite}
              variant="destructive"
              disabled={!canExecuteCanary || writeRunning}
              title={
                !previewOk
                  ? 'Run preview successfully first'
                  : !validateOk
                    ? 'Run validate successfully first'
                    : confirmPhrase !== 'WRITE ONE MERCHANT CANARY'
                    ? 'Type the exact confirmation phrase'
                    : ''
              }
            >
              {writeRunning && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Run Merchant API Single Product Write Canary
            </Button>
          </div>
          {writeResult && <ResultBlock title="canary write" result={writeResult} />}
        </div>

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