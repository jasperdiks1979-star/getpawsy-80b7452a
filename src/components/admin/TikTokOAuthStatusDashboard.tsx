import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Key,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TestTube2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Envelope returned by the tiktok-oauth-status edge function.
 * Mirrors the shape produced by supabase/functions/tiktok-oauth-status/index.ts
 * so the frontend can surface every field without re-running checks client-side.
 */
type StatusResponse = {
  ok: boolean;
  is_healthy?: boolean;
  summary?: string;
  mode?: "sandbox" | "production" | "unknown";
  mode_detail?: string;
  config?: {
    client_key_masked: string;
    client_key_length: number;
    client_secret_set: boolean;
    client_secret_length: number;
    redirect_uri: string;
    origin_used: string;
    scopes: string;
    scopes_list: string[];
  };
  connected_account?: {
    open_id: string;
    display_name: string | null;
    avatar_url: string | null;
    scope: string | null;
    scopes_granted: string[];
    expires_at: string;
    refresh_expires_at: string | null;
    token_expired: boolean;
    refresh_expired: boolean | null;
    seconds_until_expiry: number;
    connected_at: string;
    last_updated_at: string;
  } | null;
  recent_state_attempts?: Array<{
    state_masked: string | null;
    user_id: string | null;
    redirect_to: string | null;
    created_at: string;
    expires_at: string | null;
    expired: boolean | null;
  }>;
  errors?: string[];
  warnings?: string[];
  token_query_error?: string | null;
  checked_at?: string;
  error?: string;
};

function formatDuration(seconds: number): string {
  if (seconds < 0) return "expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Mini dashboard for TikTok OAuth status.
 *
 * Auto-loads on mount, supports manual refresh, and surfaces:
 *   - Health badge + summary line
 *   - Sandbox vs Production mode (from client_key prefix)
 *   - Masked client key, secret presence, redirect URI, requested scopes
 *   - Connected account with token TTL and granted scopes
 *   - Recent OAuth start attempts (CSRF state rows)
 *   - Errors (red) and warnings (amber) with concrete fix hints
 */
export function TikTokOAuthStatusDashboard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchStatus = async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.functions.invoke("tiktok-oauth-status", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      setStatus(data as StatusResponse);
      if (manual) {
        if ((data as StatusResponse)?.is_healthy) {
          toast.success("TikTok OAuth is healthy");
        } else if ((data as StatusResponse)?.errors?.length) {
          toast.error((data as StatusResponse).errors![0]);
        } else {
          toast.message((data as StatusResponse)?.summary || "Status refreshed");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load OAuth status";
      setFetchError(msg);
      if (manual) toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const healthBadge = (() => {
    if (!status?.ok) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Unreachable
        </Badge>
      );
    }
    if (status.is_healthy) {
      return (
        <Badge variant="default" className="gap-1 bg-primary/90">
          <CheckCircle2 className="h-3 w-3" />
          Healthy
        </Badge>
      );
    }
    if (status.errors && status.errors.length > 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Broken
        </Badge>
      );
    }
    if (!status.connected_account) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Not Connected
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Degraded
      </Badge>
    );
  })();

  const modeBadge = (() => {
    if (!status?.mode) return null;
    if (status.mode === "production") {
      return (
        <Badge variant="default" className="gap-1 bg-primary/80">
          <Zap className="h-3 w-3" />
          Production
        </Badge>
      );
    }
    if (status.mode === "sandbox") {
      return (
        <Badge variant="secondary" className="gap-1">
          <TestTube2 className="h-3 w-3" />
          Sandbox
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Unknown mode
      </Badge>
    );
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              TikTok OAuth Status
            </CardTitle>
            <CardDescription className="mt-1">
              Live snapshot of the TikTok integration: client key, mode, scopes, and connected account.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchStatus(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading OAuth status…
          </div>
        ) : fetchError ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Could not load status</AlertTitle>
            <AlertDescription className="break-words">{fetchError}</AlertDescription>
          </Alert>
        ) : status ? (
          <>
            {/* Health summary */}
            <div className="flex items-center gap-2 flex-wrap">
              {healthBadge}
              {modeBadge}
              {status.checked_at && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Checked {new Date(status.checked_at).toLocaleTimeString()}
                </span>
              )}
            </div>

            {status.summary && (
              <p className="text-sm text-foreground">{status.summary}</p>
            )}
            {status.mode_detail && (
              <p className="text-xs text-muted-foreground -mt-2">{status.mode_detail}</p>
            )}

            {/* Errors */}
            {status.errors && status.errors.length > 0 && (
              <div className="space-y-2">
                {status.errors.map((err, i) => (
                  <Alert key={i} variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Configuration error</AlertTitle>
                    <AlertDescription className="break-words">{err}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Warnings */}
            {status.warnings && status.warnings.length > 0 && (
              <div className="space-y-2">
                {status.warnings.map((w, i) => (
                  <Alert key={i}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warning</AlertTitle>
                    <AlertDescription className="break-words">{w}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Config block */}
            {status.config && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Key className="h-3.5 w-3.5" />
                  Active Configuration
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-muted-foreground">TIKTOK_CLIENT_KEY</dt>
                    <dd className="font-mono break-all">{status.config.client_key_masked}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">TIKTOK_CLIENT_SECRET</dt>
                    <dd className="font-mono">
                      {status.config.client_secret_set
                        ? `set (len=${status.config.client_secret_length})`
                        : "(not set)"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Redirect URI</dt>
                    <dd className="font-mono break-all">{status.config.redirect_uri}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Requested scopes</dt>
                    <dd className="flex flex-wrap gap-1 mt-0.5">
                      {status.config.scopes_list.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px] font-mono">
                          {s}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {/* Connected account */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Connected Account
              </div>
              {status.connected_account ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    {status.connected_account.avatar_url ? (
                      <img
                        src={status.connected_account.avatar_url}
                        alt={status.connected_account.display_name || "TikTok"}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {status.connected_account.display_name
                          ? `@${status.connected_account.display_name}`
                          : status.connected_account.open_id}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        open_id: {status.connected_account.open_id}
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Access token</dt>
                      <dd className="font-mono">
                        {status.connected_account.token_expired ? (
                          <span className="text-destructive">expired</span>
                        ) : (
                          <>valid · {formatDuration(status.connected_account.seconds_until_expiry)} left</>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Refresh token</dt>
                      <dd className="font-mono">
                        {status.connected_account.refresh_expired === null
                          ? "n/a"
                          : status.connected_account.refresh_expired
                            ? <span className="text-destructive">expired</span>
                            : "valid"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Granted scopes</dt>
                      <dd className="flex flex-wrap gap-1 mt-0.5">
                        {status.connected_account.scopes_granted.length > 0 ? (
                          status.connected_account.scopes_granted.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px] font-mono">
                              {s}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground italic">none reported</span>
                        )}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Connected at</dt>
                      <dd>{new Date(status.connected_account.connected_at).toLocaleString()}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No TikTok account connected yet. Use “Connect TikTok Account” above to authorize.
                </p>
              )}
            </div>

            {/* Recent OAuth start attempts */}
            {status.recent_state_attempts && status.recent_state_attempts.length > 0 && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Recent OAuth Start Attempts
                </div>
                <ul className="space-y-1.5">
                  {status.recent_state_attempts.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 text-[11px] font-mono"
                    >
                      <span className="truncate">
                        {s.state_masked || "?"} · {new Date(s.created_at).toLocaleString()}
                      </span>
                      {s.expired ? (
                        <Badge variant="outline" className="text-[10px]">expired</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">pending</Badge>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground italic">
                  These are CSRF tickets created when "Connect TikTok" was clicked. If you see no
                  recent rows after clicking Connect, the start endpoint isn't being reached.
                </p>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}