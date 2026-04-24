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
const PORTAL_URI_KEY = "tiktok_status_portal_uri";

/**
 * Canonical set of origins that GetPawsy serves the OAuth callback from.
 * Each one needs its own entry in the TikTok Developer Portal whitelist.
 * The current browser origin is added at runtime so preview URLs are covered.
 */
const KNOWN_ORIGINS = [
  { label: "Custom domain (apex)", origin: "https://getpawsy.pet" },
  { label: "Custom domain (www)", origin: "https://www.getpawsy.pet" },
  { label: "Lovable published", origin: "https://getpawsy.lovable.app" },
] as const;

function buildCallback(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/auth/tiktok/callback`;
}

/**
 * Strict comparison helpers — TikTok requires exact match on scheme, host,
 * port, path, including trailing slash and case. Mismatches are silent
 * "redirect_uri mismatch" failures, so we surface every difference.
 */
type DiffKind = "scheme" | "host" | "path" | "case" | "trailing_slash" | "whitespace";

function diffUris(a: string, b: string): DiffKind[] {
  const diffs: DiffKind[] = [];
  if (a !== a.trim() || b !== b.trim()) diffs.push("whitespace");
  const ta = a.trim();
  const tb = b.trim();
  if (ta === tb) return diffs;

  // Trailing slash difference (one has it, the other doesn't)
  if (ta.replace(/\/+$/, "") === tb.replace(/\/+$/, "") && ta !== tb) {
    diffs.push("trailing_slash");
    return diffs;
  }
  // Case-only difference
  if (ta.toLowerCase() === tb.toLowerCase()) {
    diffs.push("case");
    return diffs;
  }
  try {
    const ua = new URL(ta);
    const ub = new URL(tb);
    if (ua.protocol !== ub.protocol) diffs.push("scheme");
    if (ua.host !== ub.host) diffs.push("host");
    if (ua.pathname !== ub.pathname) diffs.push("path");
  } catch {
    diffs.push("path");
  }
  return diffs;
}

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
  const [portalUri, setPortalUri] = useState<string>("");

  // Hydrate last test record from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_TEST_KEY);
      if (raw) setLastTest(JSON.parse(raw));
    } catch {
      // ignore
    }
    try {
      const saved = localStorage.getItem(PORTAL_URI_KEY);
      if (saved) setPortalUri(saved);
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
        <>
        {/* Redirect URI exact-match check */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LinkIcon className="h-5 w-5" />
              Redirect URI match check
            </CardTitle>
            <CardDescription>
              TikTok requires an <strong>exact</strong> match (scheme, host, path,
              case, trailing slash). Whitelist every origin you serve from.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Configured callback (server-side) */}
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                Currently configured (server)
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-xs break-all bg-muted px-2 py-1 rounded">
                  {status.config.redirect_uri}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(status.config!.redirect_uri);
                      toast.success("Copied configured URI");
                    } catch {
                      toast.error("Clipboard blocked");
                    }
                  }}
                >
                  <ClipboardCopy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Expected URIs derived from known origins + current browser */}
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-2">
                Expected URIs to whitelist in TikTok Developer Portal
              </div>
              <ul className="space-y-2">
                {(() => {
                  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
                  const all = [
                    ...KNOWN_ORIGINS.map((k) => ({ ...k, current: false })),
                    ...(currentOrigin && !KNOWN_ORIGINS.some((k) => k.origin === currentOrigin)
                      ? [{ label: "Current browser origin", origin: currentOrigin, current: true }]
                      : []),
                  ];
                  const configured = status.config!.redirect_uri;
                  return all.map((row) => {
                    const uri = buildCallback(row.origin);
                    const matchesConfigured = uri === configured;
                    return (
                      <li
                        key={row.origin}
                        className="flex items-start gap-2 text-sm border rounded p-2"
                      >
                        {matchesConfigured ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-xs">{row.label}</span>
                            {row.current && (
                              <Badge variant="outline" className="text-xs">
                                Active
                              </Badge>
                            )}
                            {matchesConfigured && (
                              <Badge variant="secondary" className="text-xs">
                                Server uses this
                              </Badge>
                            )}
                          </div>
                          <code className="font-mono text-xs break-all block mt-1">{uri}</code>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(uri);
                              toast.success(`Copied ${row.label}`);
                            } catch {
                              toast.error("Clipboard blocked");
                            }
                          }}
                        >
                          <ClipboardCopy className="h-3 w-3" />
                        </Button>
                      </li>
                    );
                  });
                })()}
              </ul>
            </div>

            {/* Verifier: paste what's in the portal */}
            <div className="border-t pt-4 space-y-2">
              <Label htmlFor="portal-uri" className="text-xs uppercase tracking-wide">
                Paste the URI from your TikTok Developer Portal
              </Label>
              <Input
                id="portal-uri"
                placeholder="https://example.com/auth/tiktok/callback"
                value={portalUri}
                onChange={(e) => {
                  setPortalUri(e.target.value);
                  try {
                    localStorage.setItem(PORTAL_URI_KEY, e.target.value);
                  } catch {
                    // ignore
                  }
                }}
                className="font-mono text-xs"
              />
              {portalUri.trim() && (() => {
                const configured = status.config!.redirect_uri;
                const diffs = diffUris(portalUri, configured);
                if (diffs.length === 0) {
                  return (
                    <Alert className="border-green-500/40 bg-green-500/5">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle>Exact match</AlertTitle>
                      <AlertDescription>
                        Your portal value matches the configured redirect URI. OAuth
                        from this origin should succeed.
                      </AlertDescription>
                    </Alert>
                  );
                }
                const reasons: Record<DiffKind, string> = {
                  scheme: "Scheme differs (http vs https). TikTok requires HTTPS.",
                  host: "Hostname differs. Add this exact host as a separate redirect URI in the portal.",
                  path: "Path differs. The path must be exactly /auth/tiktok/callback.",
                  case: "Case differs. URIs are case-sensitive in TikTok's matcher.",
                  trailing_slash: "Trailing slash differs. Remove or add it on both sides.",
                  whitespace: "Leading or trailing whitespace detected — trim it.",
                };
                return (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Mismatch detected</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
                        {diffs.map((d) => (
                          <li key={d}>{reasons[d]}</li>
                        ))}
                      </ul>
                      <div className="mt-3 text-xs space-y-1">
                        <div>
                          <span className="text-muted-foreground">Portal:</span>{" "}
                          <code className="font-mono break-all">{portalUri.trim()}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Server:</span>{" "}
                          <code className="font-mono break-all">{configured}</code>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                );
              })()}
            </div>
          </CardContent>
        </Card>

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
        </>
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
