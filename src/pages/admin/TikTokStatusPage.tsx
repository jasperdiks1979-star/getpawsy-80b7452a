import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link as RouterLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Key,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Zap,
  ClipboardCopy,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LAST_TEST_KEY = "tiktok_status_last_test";

type StatusResponse = {
  ok: boolean;
  is_healthy?: boolean;
  summary?: string;
  mode?: "sandbox" | "production" | "unknown";
  mode_detail?: string;
  config?: {
    client_key_masked: string;
    client_key_full?: string | null;
    client_key_length: number;
    client_secret_set: boolean;
    redirect_uri: string;
    scopes: string;
    scopes_list: string[];
  };
  connected_account?: {
    open_id: string;
    display_name: string | null;
    avatar_url: string | null;
    scopes_granted: string[];
    expires_at: string;
    token_expired: boolean;
    seconds_until_expiry: number;
    connected_at: string;
    last_updated_at: string;
  } | null;
  errors?: string[];
  warnings?: string[];
  checked_at?: string;
  error?: string;
};

type LastTestRecord = {
  timestamp: string;
  is_healthy: boolean;
  summary: string;
  mode: string;
  account_open_id: string | null;
  errors_count: number;
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "in the future";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 0) return "expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function TikTokStatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastTest, setLastTest] = useState<LastTestRecord | null>(null);

  // Hydrate last test record from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_TEST_KEY);
      if (raw) setLastTest(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const runStatusCheck = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<StatusResponse>(
        "tiktok-oauth-status",
        { body: {} },
      );
      if (error) throw error;
      if (!data) throw new Error("No response from status endpoint");

      setStatus(data);

      const record: LastTestRecord = {
        timestamp: new Date().toISOString(),
        is_healthy: !!data.is_healthy,
        summary: data.summary ?? (data.is_healthy ? "Healthy" : "Issues detected"),
        mode: data.mode ?? "unknown",
        account_open_id: data.connected_account?.open_id ?? null,
        errors_count: data.errors?.length ?? 0,
      };
      try {
        localStorage.setItem(LAST_TEST_KEY, JSON.stringify(record));
      } catch {
        // ignore quota errors
      }
      setLastTest(record);

      if (data.is_healthy) {
        toast.success("TikTok connection is healthy");
      } else if (data.errors?.length) {
        toast.error(`TikTok status: ${data.errors[0]}`);
      } else {
        toast.warning("TikTok status returned with warnings");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to check status: ${message}`);
      setStatus({ ok: false, error: message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run on mount
  useEffect(() => {
    runStatusCheck();
  }, [runStatusCheck]);

  const isHealthy = status?.is_healthy === true;
  const hasStatus = !!status;

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <Helmet>
        <title>TikTok Status — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <RouterLink to="/admin/tiktok-automation">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to TikTok Automation
            </RouterLink>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">TikTok Status</h1>
          <p className="text-muted-foreground">
            Live health check for the TikTok OAuth connection
          </p>
        </div>
        <Button onClick={runStatusCheck} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {loading ? "Checking…" : "Re-test connection"}
        </Button>
      </div>

      {/* Headline status card */}
      <Card
        className={
          hasStatus
            ? isHealthy
              ? "border-green-500/40 bg-green-500/5"
              : "border-destructive/40 bg-destructive/5"
            : ""
        }
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              {!hasStatus && loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mt-1" />
              ) : isHealthy ? (
                <CheckCircle2 className="h-8 w-8 text-green-600 mt-1" />
              ) : (
                <XCircle className="h-8 w-8 text-destructive mt-1" />
              )}
              <div>
                <CardTitle className="text-2xl">
                  {!hasStatus
                    ? "Checking…"
                    : isHealthy
                    ? "Connection healthy"
                    : "Connection has issues"}
                </CardTitle>
                <CardDescription className="mt-1">
                  {status?.summary ?? "Running diagnostic check…"}
                </CardDescription>
              </div>
            </div>
            {status?.mode && (
              <Badge variant={status.mode === "production" ? "default" : "secondary"}>
                {status.mode.toUpperCase()}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  Last tested
                </div>
                <div className="font-medium">
                  {lastTest ? formatRelative(lastTest.timestamp) : "Never"}
                </div>
                {lastTest && (
                  <div className="text-xs text-muted-foreground">
                    {new Date(lastTest.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  Last result
                </div>
                <div className="font-medium">
                  {lastTest ? (lastTest.is_healthy ? "Healthy" : "Failing") : "—"}
                </div>
                {lastTest && lastTest.errors_count > 0 && (
                  <div className="text-xs text-destructive">
                    {lastTest.errors_count} error(s)
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Key className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  Mode
                </div>
                <div className="font-medium capitalize">{status?.mode ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{status?.mode_detail ?? ""}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Errors / warnings */}
      {status?.errors && status.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errors</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              {status.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {status?.warnings && status.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              {status.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Connected account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5" />
            Connected account
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status?.connected_account ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {status.connected_account.avatar_url && (
                  <img
                    src={status.connected_account.avatar_url}
                    alt={status.connected_account.display_name ?? "TikTok avatar"}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                )}
                <div>
                  <div className="font-medium">
                    {status.connected_account.display_name ?? "(no display name)"}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {status.connected_account.open_id}
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">
                    Token expires
                  </div>
                  <div className="font-medium">
                    {status.connected_account.token_expired ? (
                      <span className="text-destructive">Expired</span>
                    ) : (
                      <>in {formatDuration(status.connected_account.seconds_until_expiry)}</>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">
                    Connected
                  </div>
                  <div className="font-medium">
                    {formatRelative(status.connected_account.connected_at)}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                  Granted scopes
                </div>
                <div className="flex flex-wrap gap-1">
                  {status.connected_account.scopes_granted.length === 0 ? (
                    <span className="text-sm text-muted-foreground">None</span>
                  ) : (
                    status.connected_account.scopes_granted.map((s) => (
                      <Badge key={s} variant="secondary" className="font-mono text-xs">
                        {s}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground space-y-3">
              <p>No TikTok account is currently connected.</p>
              <Button asChild size="sm">
                <RouterLink to="/admin/tiktok-automation">
                  <Zap className="h-4 w-4 mr-2" />
                  Connect TikTok account
                </RouterLink>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config snapshot */}
      {status?.config && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="h-5 w-5" />
                Configuration
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const cfg = status.config!;
                  const fullKey = cfg.client_key_full || cfg.client_key_masked;
                  const template = [
                    "TikTok Developer Portal — App configuration",
                    "",
                    `Client key:    ${fullKey}`,
                    `Redirect URI:  ${cfg.redirect_uri}`,
                    `Scopes:        ${cfg.scopes_list.join(", ")}`,
                    `Mode:          ${status.mode ?? "unknown"}`,
                    "",
                    "Paste the Redirect URI under:",
                    "  Login Kit → Redirect domain (and exact URI under Redirect URI)",
                    "Verify the Client key matches the value shown in:",
                    "  Manage apps → <your app> → App credentials → Client key",
                  ].join("\n");
                  try {
                    await navigator.clipboard.writeText(template);
                    toast.success("Template copied to clipboard");
                  } catch {
                    toast.error("Could not access clipboard — copy manually");
                  }
                }}
              >
                <ClipboardCopy className="h-4 w-4 mr-2" />
                Copy paste-ready template
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Client key
                </dt>
                <dd className="font-mono">{status.config.client_key_masked}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Client secret
                </dt>
                <dd>
                  {status.config.client_secret_set ? (
                    <Badge variant="secondary">Set</Badge>
                  ) : (
                    <Badge variant="destructive">Missing</Badge>
                  )}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Redirect URI
                </dt>
                <dd className="font-mono text-xs break-all">{status.config.redirect_uri}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                  Scopes
                </dt>
                <dd className="flex flex-wrap gap-1">
                  {status.config.scopes_list.map((s) => (
                    <Badge key={s} variant="outline" className="font-mono text-xs">
                      {s}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
        <div>
          {status?.checked_at && <>Server check: {new Date(status.checked_at).toLocaleString()}</>}
        </div>
        <Button variant="link" size="sm" asChild className="text-xs">
          <RouterLink to="/admin/tiktok-config-checklist">
            Open config checklist
            <ExternalLink className="h-3 w-3 ml-1" />
          </RouterLink>
        </Button>
      </div>
    </div>
  );
}
