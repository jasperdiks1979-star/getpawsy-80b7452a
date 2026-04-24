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
  sandbox_test_user_help?: {
    tiktok_username_to_add: string;
    portal_apps_url: string;
    sandbox_docs_url: string;
    steps: string[];
    why_sandbox_only: string;
  };
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
      const { data, error } = await supabase.functions.invoke("tiktok-oauth-config-inspect", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      setConfig(data as ConfigInspectResult);
      if (data?.ok) {
        toast.success("Loaded TikTok OAuth config");
      } else {
        toast.error(data?.error || "Failed to load config");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Inspect failed");
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
          </div>
          <p className="text-xs text-muted-foreground">
            Shows the masked <code className="text-[10px]">TIKTOK_CLIENT_KEY</code> and the exact
            redirect URI that the edge function would send to TikTok right now. Use this if you keep
            seeing <code className="text-[10px]">client_key</code> errors — the value here is what
            TikTok actually receives.
          </p>

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
                      <span className="text-foreground">{h}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}