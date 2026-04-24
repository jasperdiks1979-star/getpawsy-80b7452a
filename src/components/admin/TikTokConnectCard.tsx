import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Link as LinkIcon,
  Loader2,
  LogOut,
  AlertTriangle,
  ShieldCheck,
  XCircle,
  Copy,
  Stethoscope,
  Info,
  RefreshCw,
  Eye,
  ExternalLink,
  UserPlus,
  Link2,
  KeyRound,
  Globe,
  FlaskConical,
  LayoutDashboard,
  ClipboardCopy,
} from "lucide-react";
import { toast } from "sonner";
import { retryWithBackoff } from "@/hooks/useRetryWithBackoff";
import { recordConnectAttemptAndDetectDrift } from "@/lib/tiktok/connect-drift";

type DiagnoseCheck = {
  name: string;
  status: "pass" | "fail" | "warn" | "info";
  detail: string;
  hint?: string;
};
type DiagnoseResult = {
  ok: boolean;
  summary: string;
  redirectUri?: string;
  elapsed_ms?: number;
  checks: DiagnoseCheck[];
};

type ConnectedAccount = {
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  expires_at: string;
  scope: string | null;
};

type ConfigInspectResult = {
  ok: boolean;
  client_key_masked?: string;
  client_secret_set?: boolean;
  client_secret_length?: number;
  redirect_uri?: string;
  origin_used?: string;
  scopes?: string;
  authorize_url_preview?: string;
  hints?: string[];
  client_key_validation?: SecretValidationReport;
  client_secret_validation?: SecretValidationReport;
  sandbox_test_user_help?: {
    tiktok_username_to_add: string;
    portal_apps_url: string;
    sandbox_docs_url: string;
    steps: string[];
    why_sandbox_only: string;
  };
  error?: string;
  /**
   * Stable error code from the inspect edge function. Used by the UI to
   * render a precise message instead of a raw 401/403/500.
   */
  code?:
    | "missing_authorization_header"
    | "invalid_auth_token"
    | "user_not_found"
    | "not_admin"
    | "internal_error";
};

type ContaminationKind =
  | "trailing_whitespace"
  | "leading_whitespace"
  | "internal_whitespace"
  | "bom"
  | "zero_width"
  | "nbsp"
  | "control_char";

type SecretValidationIssue = {
  kind: ContaminationKind;
  position: number;
  char_code: number;
  char_label: string;
  message: string;
};

type SecretValidationReport = {
  secret_name: string;
  is_set: boolean;
  raw_length: number;
  clean_length: number;
  has_contamination: boolean;
  issues: SecretValidationIssue[];
  summary: string;
};

type SmokeCheck = {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  hint?: string;
  evidence?: Record<string, unknown>;
};

type SmokeTestResult = {
  ok: boolean;
  summary: string;
  elapsed_ms: number;
  redirect_uri: string;
  client_key_masked: string;
  client_secret_set: boolean;
  checks: SmokeCheck[];
  // Auth-failure shape (no checks array) — keep optional so we can render
  // a friendly error without a separate type.
  code?:
    | "missing_authorization_header"
    | "invalid_auth_token"
    | "not_admin"
    | "internal_error";
  error?: string;
};

/**
 * Redirect URIs that MUST be registered in the TikTok Developer Portal
 * (Login Kit → Redirect URI section). Both apex and lovable.app are supported
 * because admin OAuth can be initiated from either host.
 */
const EXPECTED_REDIRECT_URIS = [
  "https://getpawsy.pet/auth/tiktok/callback",
  "https://getpawsy.lovable.app/auth/tiktok/callback",
] as const;

/**
 * Connect TikTok button for the admin panel.
 * Initiates OAuth via tiktok-oauth-start and shows the connected account.
 */
export function TikTokConnectCard() {
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnoseResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [config, setConfig] = useState<ConfigInspectResult | null>(null);
  const [smokeTesting, setSmokeTesting] = useState(false);
  const [smoke, setSmoke] = useState<SmokeTestResult | null>(null);
  // Retry telemetry surfaced in UI while we re-attempt tiktok-oauth-start.
  const [retryInfo, setRetryInfo] = useState<{
    attempt: number;
    maxRetries: number;
    nextDelayMs: number;
    lastError: string;
  } | null>(null);

  const loadAccount = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tiktok_oauth_tokens")
      .select("open_id, display_name, avatar_url, expires_at, scope")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAccount(data);
    setLoading(false);
  };

  useEffect(() => {
    loadAccount();
    // Refresh after OAuth roundtrip
    if (new URLSearchParams(window.location.search).get("connected") === "1") {
      toast.success("TikTok connected successfully!");
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setRetryInfo(null);
    const MAX_RETRIES = 3;
    try {
      // Pre-flight: ask the inspector to validate TIKTOK_CLIENT_KEY for
      // whitespace/BOM/zero-width contamination *before* we redirect to
      // TikTok. The OAuth functions auto-sanitize at runtime, but if the
      // stored secret is contaminated we still want to alert the operator
      // and let them abort so they can re-save a clean value (silent
      // sanitization can mask a buggy paste flow).
      try {
        const { data: preflight } = await supabase.functions.invoke(
          "tiktok-oauth-config-inspect",
          { body: { origin: window.location.origin } },
        );
        const validation = (preflight as ConfigInspectResult | null)
          ?.client_key_validation;
        if (validation?.has_contamination) {
          // Surface the issues into the inspector panel so the admin can
          // see exact char codes after they cancel.
          setConfig(preflight as ConfigInspectResult);
          const issueList = validation.issues
            .map((i) => `• ${i.message}`)
            .join("\n");
          const proceed = confirm(
            `⚠ TIKTOK_CLIENT_KEY contains ${validation.issues.length} ` +
            `contamination issue${validation.issues.length === 1 ? "" : "s"}:\n\n` +
            `${issueList}\n\n` +
            `The OAuth functions will auto-sanitize at runtime, but TikTok ` +
            `may still reject the request. We recommend re-saving the secret ` +
            `cleanly first.\n\n` +
            `Click OK to continue with auto-sanitization anyway, or Cancel ` +
            `to fix the secret first.`,
          );
          if (!proceed) {
            toast.warning(
              "OAuth aborted — fix TIKTOK_CLIENT_KEY whitespace and try again.",
            );
            setConnecting(false);
            return;
          }
          toast.warning(
            "Continuing with auto-sanitized client_key — re-save the secret to fix permanently.",
          );
        }
      } catch {
        // Pre-flight is best-effort; don't block OAuth on inspector errors.
      }

      // Drift detection: compare current TikTok config (client_key + redirect
      // URI) against the snapshot we stored on the previous attempt. Surfaces
      // a toast + appends to the drift log on the status page so silent
      // rotations of the secret or portal redirect URI become visible
      // immediately. Fully non-blocking — always continues to OAuth.
      await recordConnectAttemptAndDetectDrift(window.location.origin);

      // Wrap the edge-function call in exponential-backoff retry. We only
      // retry on transient failures (network blips, 5xx, rate limits) — auth
      // and validation errors short-circuit immediately.
      const data = await retryWithBackoff(
        async () => {
          const { data, error } = await supabase.functions.invoke("tiktok-oauth-start", {
            body: { origin: window.location.origin },
          });
          if (error) throw error;
          if (!data?.ok || !data?.authUrl) {
            throw new Error(data?.error || "Failed to start OAuth");
          }
          return data as { ok: boolean; authUrl: string; clientTicket?: string; state?: string };
        },
        {
          maxRetries: MAX_RETRIES,
          baseDelayMs: 800,
          maxDelayMs: 8000,
          backoffMultiplier: 2,
          shouldRetry: (err) => {
            const msg = (err.message || "").toLowerCase();
            // Don't retry on permanent failures.
            if (msg.includes("unauthorized") || msg.includes("401")) return false;
            if (msg.includes("admin access required") || msg.includes("403")) return false;
            if (msg.includes("tiktok_client_key not configured")) return false;
            // Retry network errors, 5xx, timeouts, generic "failed to fetch".
            return true;
          },
          onRetry: (attempt, error, delayMs) => {
            setRetryInfo({
              attempt,
              maxRetries: MAX_RETRIES,
              nextDelayMs: Math.round(delayMs),
              lastError: error.message,
            });
          },
        },
      );
      // Success — clear retry banner.
      setRetryInfo(null);
      // Stash the client_ticket so the callback page can post it back for validation.
      if (data.clientTicket && data.state) {
        sessionStorage.setItem(`tiktok_oauth_ticket:${data.state}`, data.clientTicket);
      }
      window.location.href = data.authUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start TikTok OAuth";
      toast.error(
        retryInfo
          ? `TikTok OAuth failed after ${retryInfo.attempt} retries: ${msg}`
          : msg,
      );
      setConnecting(false);
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    setDiagnostic(null);
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-oauth-diagnose", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      setDiagnostic(data as DiagnoseResult);
      if (data?.ok) {
        toast.success("All TikTok OAuth checks passed");
      } else {
        toast.error(data?.summary || "TikTok OAuth diagnostic found issues");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Diagnose failed");
    } finally {
      setDiagnosing(false);
    }
  };

  const handleInspectConfig = async () => {
    setInspecting(true);
    setConfig(null);
    try {
      // Client-side guard so unauthenticated users get an instant, friendly
      // message instead of a confusing 401 from the edge function. The server
      // still re-validates everything — this is purely UX.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const msg =
          "You need to be signed in as an admin to use the config inspector. Please sign in first.";
        setConfig({ ok: false, code: "missing_authorization_header", error: msg });
        toast.error(msg);
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "tiktok-oauth-config-inspect",
        { body: { origin: window.location.origin } },
      );

      // supabase.functions.invoke surfaces non-2xx responses as `error`, but
      // the body (with our typed `code`) lives on error.context.response.
      // Try to recover it so the UI can show the precise reason.
      if (error) {
        let recovered: ConfigInspectResult | null = null;
        const ctxResp = (error as { context?: { response?: Response } })?.context?.response;
        if (ctxResp && typeof ctxResp.json === "function") {
          try {
            recovered = await ctxResp.clone().json();
          } catch {
            recovered = null;
          }
        }
        const friendly = friendlyInspectError(recovered?.code, recovered?.error ?? error.message);
        const result: ConfigInspectResult = {
          ok: false,
          code: recovered?.code ?? "internal_error",
          error: friendly,
        };
        setConfig(result);
        toast.error(friendly);
        return;
      }

      const result = data as ConfigInspectResult;
      setConfig(result);
      if (result?.ok) {
        toast.success("Loaded TikTok OAuth config");
      } else {
        const friendly = friendlyInspectError(result?.code, result?.error);
        toast.error(friendly);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Inspect failed";
      setConfig({ ok: false, code: "internal_error", error: msg });
      toast.error(msg);
    } finally {
      setInspecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    if (!confirm(`Disconnect TikTok account @${account.display_name || account.open_id}?`)) return;
    const { error } = await supabase
      .from("tiktok_oauth_tokens")
      .delete()
      .eq("open_id", account.open_id);
    if (error) {
      toast.error("Failed to disconnect");
    } else {
      toast.success("TikTok disconnected");
      setAccount(null);
    }
  };

  /**
   * Run the live OAuth smoke test against TikTok's authorize + token endpoints
   * using the sanitized server-side secrets. Surfaces a per-check pass/fail
   * grid so the operator can tell at a glance whether the credentials are
   * recognized by TikTok or whether something (whitespace, wrong key, missing
   * sandbox user) is still tripping the OAuth flow.
   */
  const handleSmokeTest = async () => {
    setSmokeTesting(true);
    setSmoke(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const msg = "Sign in as admin to run the TikTok smoke test.";
        setSmoke({
          ok: false,
          code: "missing_authorization_header",
          error: msg,
          summary: msg,
          elapsed_ms: 0,
          redirect_uri: "",
          client_key_masked: "",
          client_secret_set: false,
          checks: [],
        });
        toast.error(msg);
        return;
      }
      const { data, error } = await supabase.functions.invoke(
        "tiktok-oauth-smoke-test",
        { body: { origin: window.location.origin } },
      );
      if (error) {
        // Try to recover the typed error body from the non-2xx response.
        let recovered: SmokeTestResult | null = null;
        const ctxResp = (error as { context?: { response?: Response } })?.context?.response;
        if (ctxResp && typeof ctxResp.json === "function") {
          try {
            recovered = await ctxResp.clone().json();
          } catch {
            recovered = null;
          }
        }
        const msg = recovered?.error || error.message || "Smoke test failed";
        setSmoke({
          ok: false,
          code: recovered?.code ?? "internal_error",
          error: msg,
          summary: msg,
          elapsed_ms: recovered?.elapsed_ms ?? 0,
          redirect_uri: recovered?.redirect_uri ?? "",
          client_key_masked: recovered?.client_key_masked ?? "",
          client_secret_set: recovered?.client_secret_set ?? false,
          checks: recovered?.checks ?? [],
        });
        toast.error(msg);
        return;
      }
      const result = data as SmokeTestResult;
      setSmoke(result);
      if (result.ok) {
        toast.success(result.summary);
      } else {
        toast.error(result.summary);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Smoke test failed";
      setSmoke({
        ok: false,
        code: "internal_error",
        error: msg,
        summary: msg,
        elapsed_ms: 0,
        redirect_uri: "",
        client_key_masked: "",
        client_secret_set: false,
        checks: [],
      });
      toast.error(msg);
    } finally {
      setSmokeTesting(false);
    }
  };

  const tokenExpired = account && new Date(account.expires_at).getTime() < Date.now();

  // Validator: which expected URI matches the current browser origin?
  const currentCallback =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/\/$/, "")}/auth/tiktok/callback`
      : "";
  const currentMatches = EXPECTED_REDIRECT_URIS.includes(
    currentCallback as (typeof EXPECTED_REDIRECT_URIS)[number],
  );

  const copyUri = async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  /**
   * Build a chat-friendly markdown summary of the inspector output and copy
   * it to the clipboard. Designed so the operator can paste a single block
   * into chat/support and get a complete picture of the live OAuth config
   * (masked secrets, exact redirect URI, hints) without copying each row by
   * hand. Falls back gracefully if there is nothing to copy yet.
   */
  const copyInspectionOutput = async () => {
    if (!config) {
      toast.error("Run \"Inspect Config\" first");
      return;
    }

    const lines: string[] = [];
    lines.push("**TikTok OAuth — Live Config Inspection**");
    lines.push(`_captured: ${new Date().toISOString()}_`);
    lines.push("");

    if (!config.ok) {
      lines.push(`- Status: ❌ ${config.code ?? "error"}`);
      if (config.error) lines.push(`- Error: ${config.error}`);
    } else {
      lines.push(`- TIKTOK_CLIENT_KEY (masked): \`${config.client_key_masked ?? "(unknown)"}\``);
      lines.push(
        `- TIKTOK_CLIENT_SECRET: ${
          config.client_secret_set
            ? `set (length=${config.client_secret_length ?? "?"})`
            : "(not set)"
        }`,
      );
      lines.push(`- Redirect URI: \`${config.redirect_uri ?? "(unknown)"}\``);
      lines.push(`- Scopes: \`${config.scopes ?? "(unknown)"}\``);
      if (config.authorize_url_preview) {
        lines.push(`- Authorize URL preview: \`${config.authorize_url_preview}\``);
      }
      if (config.hints && config.hints.length > 0) {
        lines.push("");
        lines.push("**Hints:**");
        for (const h of config.hints) lines.push(`- ${h}`);
      }
    }

    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(config, null, 2));
    lines.push("```");

    const payload = lines.join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Inspection output copied — paste into chat");
    } catch {
      toast.error("Copy failed — your browser blocked clipboard access");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          TikTok Account Connection
        </CardTitle>
        <CardDescription>
          Authorize the @getpawsy TikTok account so the publisher can post directly via the Content Posting API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Retry progress banner — visible while tiktok-oauth-start is being
            re-attempted with exponential backoff after a transient failure. */}
        {retryInfo && connecting && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs"
          >
            <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground animate-spin" />
            <div className="min-w-0">
              <div className="font-medium text-foreground">
                Retrying TikTok OAuth start (attempt {retryInfo.attempt} of {retryInfo.maxRetries})
              </div>
              <div className="text-muted-foreground break-words">
                Last error: <code className="text-[10px]">{retryInfo.lastError}</code>
              </div>
              <div className="text-muted-foreground/80 mt-0.5">
                Next attempt in ~{(retryInfo.nextDelayMs / 1000).toFixed(1)}s with exponential backoff.
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking connection…
          </div>
        ) : account ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {account.avatar_url ? (
                <img
                  src={account.avatar_url}
                  alt={account.display_name || "TikTok"}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
              )}
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {account.display_name ? `@${account.display_name}` : account.open_id}
                  {tokenExpired ? (
                    <Badge variant="destructive" className="text-[10px]">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Token expired
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Token expires: {new Date(account.expires_at).toLocaleString()}
                </div>
                {account.scope && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Scopes: {account.scope}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {tokenExpired && (
                <Button size="sm" onClick={handleConnect} disabled={connecting}>
                  {connecting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <LinkIcon className="h-4 w-4 mr-1" />
                  )}
                  Reconnect
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleDisconnect}>
                <LogOut className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Not connected yet. Click below to log in with the @getpawsy TikTok account and grant publishing access.
            </p>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LinkIcon className="h-4 w-4 mr-2" />
              )}
              Connect TikTok Account
            </Button>
            <p className="text-xs text-muted-foreground">
              You'll be redirected to TikTok to authorize. Make sure to log in as <strong>@getpawsy</strong>.
            </p>
          </div>
        )}

        {/* Redirect URI validator */}
        <div className="mt-6 pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Redirect URI Validator
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Both URIs below must be registered in your TikTok Developer Portal under{" "}
            <strong>Login Kit → Redirect URI</strong>. If either is missing, OAuth will fail with{" "}
            <code className="text-[10px]">invalid_redirect</code> or{" "}
            <code className="text-[10px]">invalid_client_key</code>.
          </p>

          <ul className="space-y-2">
            {EXPECTED_REDIRECT_URIS.map((uri) => {
              const isCurrent = uri === currentCallback;
              return (
                <li
                  key={uri}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <code className="text-xs font-mono truncate">{uri}</code>
                    {isCurrent && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        Current origin
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copyUri(uri)}
                    aria-label={`Copy ${uri}`}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>

          {currentMatches ? (
            <div className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-foreground">
                This origin (<code>{window.location.origin}</code>) matches an expected redirect URI.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs">
              <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <span className="text-foreground">
                Current origin <code>{currentCallback}</code> is <strong>not</strong> in the expected
                list. OAuth from this host will be rejected by TikTok. Open the admin from{" "}
                <code>getpawsy.pet</code> or <code>getpawsy.lovable.app</code> instead.
              </span>
            </div>
          )}

          {!currentMatches && (
            <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                Tip: also add this preview origin to TikTok's Redirect URIs if you plan to test from here.
              </span>
            </div>
          )}
        </div>

        {/* Developer Portal Quick Links */}
        <div className="mt-6 pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Developer Portal Quick Links
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Jump straight to the exact TikTok Developer Portal page you need to fix
            common OAuth errors — missing scopes, redirect URI mismatches, or an
            unverified URL prefix.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PortalLinkButton
              href="https://developers.tiktok.com/apps"
              icon={LayoutDashboard}
              title="Apps dashboard"
              hint="Pick your app to edit any setting below"
            />
            <PortalLinkButton
              href="https://developers.tiktok.com/apps"
              icon={Link2}
              title="Login Kit → Redirect URIs"
              hint="Fix invalid_redirect / mismatch errors"
            />
            <PortalLinkButton
              href="https://developers.tiktok.com/apps"
              icon={KeyRound}
              title="Scopes (user.info.basic, video.upload, video.publish)"
              hint="Fix scope_not_authorized on publish"
            />
            <PortalLinkButton
              href="https://developers.tiktok.com/doc/content-posting-api-get-started/"
              icon={Globe}
              title="Verified URL prefix (Content Posting API)"
              hint="Required for PULL_FROM_URL uploads"
            />
            <PortalLinkButton
              href="https://developers.tiktok.com/doc/login-kit-web"
              icon={Info}
              title="Login Kit docs"
              hint="Reference for OAuth params & errors"
            />
            <PortalLinkButton
              href="https://developers.tiktok.com/doc/sandbox-accounts-management"
              icon={FlaskConical}
              title="Sandbox test users"
              hint="Add @getpawsy before testing in sandbox"
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            TikTok doesn't expose stable deep links to specific app sub-tabs, so
            most buttons land on the Apps dashboard — open your app, then go to the
            named tab. Docs links open the canonical reference page.
          </p>
        </div>

        {/* Pre-flight Diagnose */}
        <div className="mt-6 pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                OAuth Pre-flight Diagnose
              </h3>
            </div>
            <Button size="sm" variant="outline" onClick={handleDiagnose} disabled={diagnosing}>
              {diagnosing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Stethoscope className="h-4 w-4 mr-1" />
              )}
              Run Diagnose
            </Button>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
            <RouterLink to="/admin/tiktok-config-checklist">
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Open full configuration checklist
            </RouterLink>
          </Button>
          <p className="text-xs text-muted-foreground">
            Validates secrets, redirect URI, scopes, TikTok endpoints and DB writability before
            redirecting you to TikTok. Run this first if "Connect" keeps failing with{" "}
            <code className="text-[10px]">invalid_client_key</code>.
          </p>

          {diagnostic && (
            <div className="space-y-2">
              <div
                className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
                  diagnostic.ok
                    ? "bg-primary/10 text-foreground"
                    : "bg-destructive/10 text-foreground"
                }`}
              >
                {diagnostic.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <span>{diagnostic.summary}</span>
              </div>
              <ul className="space-y-1.5">
                {diagnostic.checks.map((c, i) => {
                  const Icon =
                    c.status === "pass"
                      ? CheckCircle2
                      : c.status === "fail"
                      ? XCircle
                      : c.status === "warn"
                      ? AlertTriangle
                      : Info;
                  const color =
                    c.status === "pass"
                      ? "text-primary"
                      : c.status === "fail"
                      ? "text-destructive"
                      : c.status === "warn"
                      ? "text-muted-foreground"
                      : "text-muted-foreground";
                  return (
                    <li
                      key={i}
                      className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{c.name}</div>
                          <div className="text-muted-foreground break-words">{c.detail}</div>
                          {c.hint && (
                            <div className="text-muted-foreground/80 mt-1 italic">
                              {c.hint}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Live config inspector — shows the masked TIKTOK_CLIENT_KEY and
            redirect URI that tiktok-oauth-start will actually send to TikTok.
            Useful when "Connect" keeps failing with `client_key` errors and
            you need to confirm which value is in the secret right now. */}
        <div className="mt-6 pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Live OAuth Config Inspector
              </h3>
            </div>
            <Button size="sm" variant="outline" onClick={handleInspectConfig} disabled={inspecting}>
              {inspecting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Eye className="h-4 w-4 mr-1" />
              )}
              Inspect Config
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={copyInspectionOutput}
              disabled={!config}
              title={
                config
                  ? "Copy a markdown summary of the inspection output for pasting into chat/support"
                  : "Run \"Inspect Config\" first to capture the output"
              }
            >
              <ClipboardCopy className="h-4 w-4 mr-1" />
              Copy inspection output
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shows the masked <code className="text-[10px]">TIKTOK_CLIENT_KEY</code> and the exact
            redirect URI that the edge function would send to TikTok right now. Use this if you keep
            seeing <code className="text-[10px]">client_key</code> errors — the value here is what
            TikTok actually receives.
          </p>

          {/* Auth/permission error block. Renders when the inspector returned
              a typed error code (missing token, expired session, non-admin
              account, or backend failure). We never silently fail — admins
              must always see *why* the inspector rejected them. */}
          {config && !config.ok && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-2"
            >
              <div className="flex items-start gap-2">
                {config.code === "not_admin" ? (
                  <ShieldCheck className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="space-y-1">
                  <div className="font-medium text-foreground">
                    {config.code === "not_admin"
                      ? "Admin access required"
                      : config.code === "missing_authorization_header" ||
                          config.code === "invalid_auth_token" ||
                          config.code === "user_not_found"
                        ? "Sign-in required"
                        : "Inspector failed"}
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {config.error}
                  </p>
                  {(config.code === "missing_authorization_header" ||
                    config.code === "invalid_auth_token" ||
                    config.code === "user_not_found") && (
                    <div className="pt-1">
                      <Button asChild size="sm" variant="outline">
                        <RouterLink
                          to={`/auth?next=${encodeURIComponent(
                            typeof window !== "undefined"
                              ? window.location.pathname + window.location.search
                              : "/admin/tiktok-status",
                          )}`}
                        >
                          Sign in as admin
                        </RouterLink>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {config?.ok && (
            <div className="space-y-2">
              <ul className="space-y-1.5">
                <li className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">TIKTOK_CLIENT_KEY (masked)</div>
                  <code className="text-[11px] font-mono break-all text-muted-foreground">
                    {config.client_key_masked}
                  </code>
                </li>
                <li className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">TIKTOK_CLIENT_SECRET</div>
                  <code className="text-[11px] font-mono text-muted-foreground">
                    {config.client_secret_set
                      ? `set (length=${config.client_secret_length})`
                      : "(not set)"}
                  </code>
                </li>
                <li className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">Redirect URI sent to TikTok</div>
                      <code className="text-[11px] font-mono break-all text-muted-foreground">
                        {config.redirect_uri}
                      </code>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => config.redirect_uri && copyUri(config.redirect_uri)}
                      aria-label="Copy redirect URI"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
                <li className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">Scopes</div>
                  <code className="text-[11px] font-mono break-all text-muted-foreground">
                    {config.scopes}
                  </code>
                </li>
                <li className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">Authorize URL preview (masked)</div>
                  <code className="text-[11px] font-mono break-all text-muted-foreground">
                    {config.authorize_url_preview}
                  </code>
                </li>
              </ul>

              {config.hints && config.hints.length > 0 && (
                <div className="space-y-1">
                  {config.hints.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs"
                    >
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <span className="text-foreground break-words">
                        {renderHintWithLinks(h)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {config.sandbox_test_user_help && (
                <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <UserPlus className="h-4 w-4 text-primary" />
                    Add{" "}
                    <code className="font-mono rounded bg-muted px-1 py-0.5">
                      {config.sandbox_test_user_help.tiktok_username_to_add}
                    </code>{" "}
                    as a sandbox test user
                  </div>
                  <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                    {config.sandbox_test_user_help.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <p className="text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">
                      Why this is required:{" "}
                    </span>
                    {config.sandbox_test_user_help.why_sandbox_only}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={config.sandbox_test_user_help.portal_apps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 hover:bg-muted"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open Developer Portal → Apps
                    </a>
                    <a
                      href={config.sandbox_test_user_help.sandbox_docs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 hover:bg-muted"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Sandbox docs
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live OAuth Smoke Test — actually pings TikTok with the sanitized
            secrets and reports whether the credential pair is recognized. */}
        <div className="mt-6 pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                OAuth Smoke Test (live TikTok call)
              </h3>
            </div>
            <Button size="sm" variant="outline" onClick={handleSmokeTest} disabled={smokeTesting}>
              {smokeTesting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-1" />
              )}
              Run Smoke Test
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sends the sanitized <code className="text-[10px]">TIKTOK_CLIENT_KEY</code> and{" "}
            <code className="text-[10px]">TIKTOK_CLIENT_SECRET</code> to TikTok's authorize and
            token endpoints (with a fake code) to confirm both credentials are recognized — without
            requiring a browser login.
          </p>

          {smoke && (
            <div className="space-y-2">
              <div
                className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
                  smoke.ok ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-foreground"
                }`}
              >
                {smoke.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{smoke.summary}</div>
                  {smoke.elapsed_ms > 0 && (
                    <div className="text-muted-foreground text-[11px] mt-0.5">
                      Completed in {smoke.elapsed_ms}ms
                      {smoke.client_key_masked && ` · key=${smoke.client_key_masked}`}
                    </div>
                  )}
                </div>
              </div>
              {smoke.checks.length > 0 && (
                <ul className="space-y-1.5">
                  {smoke.checks.map((c, i) => {
                    const Icon =
                      c.status === "pass"
                        ? CheckCircle2
                        : c.status === "fail"
                          ? XCircle
                          : AlertTriangle;
                    const color =
                      c.status === "pass"
                        ? "text-primary"
                        : c.status === "fail"
                          ? "text-destructive"
                          : "text-muted-foreground";
                    return (
                      <li
                        key={i}
                        className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs"
                      >
                        <div className="flex items-start gap-2">
                          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-foreground">{c.name}</div>
                            <div className="text-muted-foreground break-words">{c.detail}</div>
                            {c.hint && (
                              <div className="text-muted-foreground/80 mt-1 italic">{c.hint}</div>
                            )}
                            {c.evidence && (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-[11px] text-muted-foreground/80 hover:text-foreground">
                                  Show TikTok response
                                </summary>
                                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted px-2 py-1.5 text-[10px] font-mono whitespace-pre-wrap break-all">
                                  {JSON.stringify(c.evidence, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Linkify any http(s) URLs found inside an inspector hint string so admins
 * can jump straight to the TikTok Developer Portal / docs.
 */
function renderHintWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-primary break-all"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Map the typed `code` from the inspect edge function to a user-facing
 * sentence. Falls back to the raw error for unknown codes so we never
 * accidentally hide a real failure.
 */
function friendlyInspectError(
  code: ConfigInspectResult["code"] | undefined,
  fallback: string | undefined,
): string {
  switch (code) {
    case "missing_authorization_header":
      return "You're not signed in. Please sign in as an admin to use the TikTok config inspector.";
    case "invalid_auth_token":
      return "Your session expired. Please sign out and sign back in as an admin, then retry.";
    case "user_not_found":
      return "We couldn't find your account. Please sign in again as an admin.";
    case "not_admin":
      return "Admin access required. The TikTok config inspector is restricted to admin accounts.";
    case "internal_error":
      return fallback || "An unexpected error occurred while loading the TikTok config.";
    default:
      return fallback || "Failed to load TikTok config.";
  }
}

/**
 * Quick-link card to a TikTok Developer Portal page or doc.
 * Opens in a new tab and shows a short hint explaining why an admin
 * would click it (which OAuth error it helps resolve).
 */
function PortalLinkButton({
  href,
  icon: Icon,
  title,
  hint,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted transition-colors"
    >
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-medium text-foreground">
          <span className="truncate">{title}</span>
          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 group-hover:text-foreground" />
        </div>
        <div className="text-[11px] text-muted-foreground leading-snug">{hint}</div>
      </div>
    </a>
  );
}