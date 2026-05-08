import { Component, type ReactNode, useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CheckCircle2,
  Link2,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Wand2,
  Zap,
  XCircle,
  Activity,
  AlertTriangle,
  Wrench,
  ExternalLink,
  Copy,
} from "lucide-react";

type PinterestConnection = {
  id: string;
  account_id: string | null;
  account_name: string | null;
  status: string;
  token_expires_at: string | null;
  token_created_at?: string | null;
  token_prefix?: string | null;
  scopes?: string | null;
  last_account_status?: number | null;
  last_boards_status?: number | null;
  board_count?: number | null;
  last_publish_at: string | null;
  last_error: string | null;
};

const PREPARE_QUEUE_COUNT = 3;

const QA_TOOLTIPS: Record<string, string> = {
  product_mismatch: "Pin copy or board references a different animal/product",
  category_mismatch: "Board does not match the product category",
  bad_crop: "Image is not 9:16 or not a valid Cloudinary render",
  unreadable_text: "Overlay text is too short, too long, or missing",
  unreadable_overlay: "Overlay text is unreadable on mobile",
  missing_cta: "Bottom CTA segment is missing or too short",
  wrong_destination_url: "Destination URL does not point to /products/<slug>",
  allowlist_disabled: "Product not in the Performance Mode allowlist",
  low_resolution: "Cloudinary asset requested below 1080×1920",
  malformed_url: "Destination link is not a valid getpawsy.pet URL",
  spam_payload: "Title/description/overlay contains spam or invalid UTF",
  duplicate_asset: "Same image was used for another pin in the last 14 days",
  weak_hook: "Hook is not in the approved hook bank",
};

function qaReasonTooltip(reason: string): string {
  return QA_TOOLTIPS[reason] || reason;
}

function humanizeOauthError(error: string) {
  return error.replace(/_/g, " ");
}

async function invokePinterestAction<T = any>(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("pinterest-automation", {
    body: { action, ...payload },
  });

  if (error) throw error;
  if (!data) throw new Error("No response from Pinterest backend");
  if (data.ok === false) throw new Error(data.error || data.message || "Pinterest action failed");

  return data as T;
}

/* ─── Error Boundary ─── */
interface ErrorBoundaryState { hasError: boolean; errorMessage: string }

class PinterestPageErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: "" };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || "Unknown error" };
  }
  componentDidCatch(error: Error) { console.error("[PinterestAutomationPage] crash", error); }
  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto max-w-5xl p-4 md:p-6">
          <Card className="border-destructive/30">
            <CardHeader><CardTitle>Pinterest Automation</CardTitle></CardHeader>
            <CardContent>
              <p className="font-semibold text-destructive">PAGE CRASHED</p>
              <p className="mt-2 break-words text-sm text-muted-foreground">{this.state.errorMessage}</p>
            </CardContent>
          </Card>
        </section>
      );
    }
    return this.props.children;
  }
}

/* Auth debug card removed for production compliance */

/* ─── Status badge helper ─── */
function StatusBadge({ status }: { status: string }) {
  const variant = status === "posted" ? "default" : status === "failed" ? "destructive" : status === "queued" ? "secondary" : "outline";
  return <Badge variant={variant} className="text-xs">{status}</Badge>;
}

function ConnectionCard({
  connection,
  queuedCount,
  actionLoading,
  authValid,
  authWarning,
  onConnect,
  onRefresh,
  onGenerateDrafts,
  onQueueDrafts,
  onPublishNow,
}: {
  connection: PinterestConnection | null;
  queuedCount: number;
  actionLoading: string | null;
  authValid: boolean;
  authWarning?: string | null;
  onConnect: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onGenerateDrafts: () => Promise<void>;
  onQueueDrafts: () => Promise<void>;
  onPublishNow: () => Promise<void>;
}) {
  const isConnected = connection?.status === "connected";
  const canPublishNow = isConnected && authValid && queuedCount > 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            {isConnected ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <XCircle className="h-5 w-5 text-destructive" />}
            Pinterest connection
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={isConnected ? "default" : "outline"}>
              {isConnected ? "Connected" : "Not connected"}
            </Badge>
            {connection?.account_name && <span>Account: {connection.account_name}</span>}
            {connection?.token_expires_at && (
              <span>Token expires: {new Date(connection.token_expires_at).toLocaleString()}</span>
            )}
            {connection?.last_publish_at && (
              <span>Last publish: {new Date(connection.last_publish_at).toLocaleString()}</span>
            )}
            {connection?.token_prefix && <span className="font-mono">Token: {connection.token_prefix}…</span>}
            {connection?.token_created_at && <span>Token created: {new Date(connection.token_created_at).toLocaleString()}</span>}
            {connection?.scopes && <span>Scopes: {connection.scopes}</span>}
            {connection?.board_count != null && <span>Boards: {connection.board_count}</span>}
          </div>
          {!authValid && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
              AUTH FAILURE — {authWarning || "publishing is disabled until account and boards APIs validate."}
            </p>
          )}
          {connection?.last_error && (
            <p className="text-sm text-destructive">Last Pinterest error: {connection.last_error}</p>
          )}
          
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onConnect()} disabled={actionLoading === "connect"}>
            {actionLoading === "connect" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            {isConnected ? "Reconnect Pinterest" : "Connect Pinterest"}
          </Button>
          <Button variant="outline" onClick={() => void onRefresh()} disabled={actionLoading === "refresh-connection"}>
            {actionLoading === "refresh-connection" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh status
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void onGenerateDrafts()} disabled title="Disabled until one queued pin publishes end-to-end">
          <Sparkles className="mr-2 h-4 w-4" />
          Generate draft pins paused
        </Button>
        <Button variant="outline" onClick={() => void onQueueDrafts()} disabled={!authValid || (!!actionLoading && actionLoading !== "queue-drafts")}>
          {actionLoading === "queue-drafts" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          Queue {PREPARE_QUEUE_COUNT} drafts
        </Button>
        <Button onClick={() => void onPublishNow()} disabled={!canPublishNow || (!!actionLoading && actionLoading !== "publish-now")}>
          {actionLoading === "publish-now" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Publish next pin now
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─── Pin Queue Table ─── */
function PinTable({ pins, onAction }: { pins: any[]; onAction?: (action: string, id: string) => void }) {
  if (!pins.length) return <p className="text-sm text-muted-foreground py-4 text-center">No pins in this category.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2">Title</th>
            <th className="py-2 pr-2">Status</th>
            <th className="py-2 pr-2">QA</th>
            <th className="py-2 pr-2">Scheduled</th>
            <th className="py-2 pr-2">Retries</th>
            {onAction && <th className="py-2">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {pins.map((pin) => (
            <tr key={pin.id} className="border-b border-border/50">
              <td className="py-2 pr-2 max-w-[200px] truncate" title={pin.pin_title}>{pin.pin_title}</td>
              <td className="py-2 pr-2"><StatusBadge status={pin.status} /></td>
              <td className="py-2 pr-2">
                {Array.isArray(pin.qa_reasons) && pin.qa_reasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {pin.qa_reasons.map((r: string) => (
                      <Badge key={r} variant="destructive" className="text-[10px]" title={qaReasonTooltip(r)}>{r}</Badge>
                    ))}
                  </div>
                ) : pin.approved_at ? (
                  <Badge variant="default" className="text-[10px]">approved</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-2 pr-2 text-xs text-muted-foreground">
                {pin.scheduled_at ? new Date(pin.scheduled_at).toLocaleString() : "—"}
              </td>
              <td className="py-2 pr-2">{pin.retries ?? 0}</td>
              {onAction && (
                <td className="py-2 flex gap-1">
                  {pin.status === "draft" && (
                    <>
                      <Button size="sm" variant="default" className="h-6 px-2" onClick={() => onAction("approve", pin.id)} title="Approve & queue">
                        <ShieldCheck className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={() => onAction("reject", pin.id)} title="Reject">
                        <ShieldAlert className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onAction("regenerate", pin.id)} title="Regenerate">
                        <Sparkles className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {pin.status === "failed" && (
                    <>
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onAction("retry", pin.id)} title="Retry">
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={() => onAction("delete", pin.id)} title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {pin.status === "queued" && (
                    <Button size="sm" variant="default" className="h-7 px-2 whitespace-nowrap" onClick={() => onAction("force", pin.id)} title="Force publish selected pin">
                      <Play className="h-3 w-3 mr-1" /> Force publish selected pin
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagnosticValue({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className={`${mono ? "font-mono" : ""} break-all text-xs font-medium text-foreground`}>{text}</p>
    </div>
  );
}

function PublishDiagnosticPanel({ health, actionLoading, onRefresh, onForcePin }: { health: any | null; actionLoading: string | null; onRefresh: () => void; onForcePin: (pinId: string) => void }) {
  const pin = health?.next_queued_pin;
  const eligibility = health?.next_queued_eligibility;
  const nowEligibility = health?.publish_now_eligibility;
  const reason = nowEligibility?.eligible ? "eligible_for_publish_now" : nowEligibility?.reason || eligibility?.reason || "no_queued_pin";
  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" /> Publish Diagnostic
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={nowEligibility?.eligible ? "default" : "destructive"}>{reason}</Badge>
          <span className="text-muted-foreground">Publish next ignores schedule but still requires a queued, approved, QA-valid pin.</span>
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={!!actionLoading}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh diagnostic
          </Button>
          {pin?.id && (
            <Button size="sm" onClick={() => onForcePin(pin.id)} disabled={!!actionLoading}>
              {actionLoading === pin.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
              Force publish selected pin
            </Button>
          )}
          {pin?.external_url && (
            <Button size="sm" variant="outline" asChild>
              <a href={pin.external_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" /> Open live pin</a>
            </Button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <DiagnosticValue label="id" value={pin?.id} mono />
          <DiagnosticValue label="status" value={pin?.status} />
          <DiagnosticValue label="approved" value={pin ? (pin.approved ? "yes" : "no") : null} />
          <DiagnosticValue label="scheduled_at" value={pin?.scheduled_at} mono />
          <DiagnosticValue label="board_id" value={pin?.board_id} mono />
          <DiagnosticValue label="image_url" value={pin?.image_url} mono />
          <DiagnosticValue label="destination_url" value={pin?.destination_url} mono />
          <DiagnosticValue label="pinterest_pin_id" value={pin?.pinterest_pin_id} mono />
          <DiagnosticValue label="retry_count" value={pin?.retry_count} />
          <DiagnosticValue label="rejection_reason" value={pin?.rejection_reason || reason} />
          <DiagnosticValue label="image validation" value={nowEligibility?.imageValidation?.reason || (nowEligibility?.imageValidation?.ok ? "ok" : "—")} />
          <DiagnosticValue label="destination validation" value={nowEligibility?.destinationValidation?.reason || (nowEligibility?.destinationValidation?.ok ? "ok" : "—")} />
        </div>
        {health?.last_publish_log && (
          <div className="rounded-md border border-border p-3 text-xs">
            <p className="mb-1 font-medium">Last publish log: {health.last_publish_log.status}</p>
            <p className="break-words text-muted-foreground">{health.last_publish_log.error_message || health.last_publish_log.response_payload?.external_url || "—"}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Log Viewer ─── */
function LogViewer({ logs }: { logs: any[] }) {
  if (!logs.length) return <p className="text-sm text-muted-foreground py-4 text-center">No logs yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2">Time</th>
            <th className="py-2 pr-2">Action</th>
            <th className="py-2 pr-2">Status</th>
            <th className="py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-border/50">
              <td className="py-2 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.created_at).toLocaleString()}
              </td>
              <td className="py-2 pr-2">{log.action}</td>
              <td className="py-2 pr-2"><StatusBadge status={log.status} /></td>
              <td className="py-2 text-xs text-destructive max-w-[250px] truncate" title={log.error_message || ""}>
                {log.error_message || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main Dashboard ─── */
function PinterestDashboard() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [connection, setConnection] = useState<PinterestConnection | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [queued, setQueued] = useState<any[]>([]);
  const [posted, setPosted] = useState<any[]>([]);
  const [failed, setFailed] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [health, setHealth] = useState<any | null>(null);
  const [directTestResult, setDirectTestResult] = useState<any | null>(null);
  const [authApiTestResult, setAuthApiTestResult] = useState<any | null>(null);
  const [directTestHistory, setDirectTestHistory] = useState<any[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<{ token: string; expires_at: string; ttl_minutes: number; label: string | null } | null>(null);
  const [debugTokenTtl, setDebugTokenTtl] = useState<number>(10);
  const [appDiagnostic, setAppDiagnostic] = useState<any | null>(null);

  const fetchAppDiagnostic = useCallback(async () => {
    try {
      const data = await invokePinterestAction<any>("pinterest_app_diagnostic");
      setAppDiagnostic(data || null);
    } catch (e) {
      console.warn("pinterest_app_diagnostic failed:", e);
    }
  }, []);

  useEffect(() => { void fetchAppDiagnostic(); }, [fetchAppDiagnostic]);

  const fetchDirectTestHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("pinterest_post_logs")
      .select("id, created_at, status, error_message, response_data")
      .eq("action", "direct_api_test")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) {
      console.warn("[direct_api_test history] fetch failed:", error);
      return;
    }
    setDirectTestHistory(data || []);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [draftRes, queuedRes, postedRes, failedRes, logRes, connectionRes] = await Promise.all([
        supabase.from("pinterest_pin_queue").select("*").eq("status", "draft").order("created_at", { ascending: false }).limit(50),
        supabase.from("pinterest_pin_queue").select("*").eq("status", "queued").order("scheduled_at", { ascending: true }).limit(50),
        supabase.from("pinterest_pin_queue").select("*").eq("status", "posted").order("posted_at", { ascending: false }).limit(20),
        supabase.from("pinterest_pin_queue").select("*").eq("status", "failed").order("updated_at", { ascending: false }).limit(50),
        supabase.from("pinterest_post_logs").select("*").order("created_at", { ascending: false }).limit(20),
        invokePinterestAction<{ connection: PinterestConnection | null }>("get_connection"),
      ]);

      const firstError = [draftRes, queuedRes, postedRes, failedRes, logRes].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      setDrafts(draftRes.data || []);
      setQueued(queuedRes.data || []);
      setPosted(postedRes.data || []);
      setFailed(failedRes.data || []);
      setLogs(logRes.data || []);
      setConnection(connectionRes.connection || null);
      try {
        const diag = await invokePinterestAction<any>("publish_diagnostics");
        setHealth(diag || null);
      } catch (diagErr) {
        console.warn("publish_diagnostics failed:", diagErr);
      }
    } catch (e) {
      console.error("Failed to fetch pinterest data:", e);
      toast.error("Could not load Pinterest automation data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { void fetchDirectTestHistory(); }, [fetchDirectTestHistory]);

  const exportDirectTestHistory = useCallback((format: "json" | "csv") => {
    if (directTestHistory.length === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    let blob: Blob;
    let filename: string;
    if (format === "json") {
      blob = new Blob([JSON.stringify(directTestHistory, null, 2)], { type: "application/json" });
      filename = `pinterest-direct-test-history-${ts}.json`;
    } else {
      const headers = ["id", "created_at", "status", "status_code", "returned_pin_id", "returned_pin_url", "board_id", "hint_category", "hint_title", "error_message"];
      const escape = (v: any) => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "string" ? v : JSON.stringify(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = directTestHistory.map((e) => {
        const d = e.response_data || {};
        return [e.id, e.created_at, e.status, d.status_code, d.returned_pin_id, d.returned_pin_url, d.selected_board?.id || d.board_id, d.hint?.category, d.hint?.title, e.error_message].map(escape).join(",");
      });
      blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
      filename = `pinterest-direct-test-history-${ts}.csv`;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [directTestHistory]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthSuccess = params.get("oauth_success");
    const oauthError = params.get("oauth_error");

    if (!oauthSuccess && !oauthError) return;

    if (oauthSuccess === "true") {
      toast.success("Pinterest connected successfully");
    }

    if (oauthError) {
      toast.error(`Pinterest connect failed: ${humanizeOauthError(oauthError)}`);
    }

    void fetchAll();

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("oauth_success");
    nextUrl.searchParams.delete("oauth_error");
    window.history.replaceState({}, "", nextUrl.toString());
  }, [fetchAll, location.search]);

  const handleConnect = async () => {
    setActionLoading("connect");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-oauth-start");
      if (error) throw error;
      if (!data?.auth_url) throw new Error("No Pinterest auth URL returned");
      window.location.assign(data.auth_url as string);
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start Pinterest OAuth";
      toast.error(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshConnection = async () => {
    setActionLoading("refresh-connection");
    await fetchAll();
    setActionLoading(null);
  };

  const handleGenerateDrafts = async () => {
    setActionLoading("generate-drafts");
    try {
      const data = await invokePinterestAction<{ products?: number; pinsGenerated?: number }>("bulk_generate");
      toast.success(`${data.pinsGenerated || 0} draft pins generated`);
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Draft generation failed");
    }
    setActionLoading(null);
  };

  const handleQueueDrafts = async () => {
    setActionLoading("queue-drafts");
    try {
      const data = await invokePinterestAction<{ queued?: number }>("queue_pins", { count: PREPARE_QUEUE_COUNT });
      toast.success(`${data.queued || 0} pins queued for publishing`);
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not queue pins");
    }
    setActionLoading(null);
  };

  const handlePublishNow = async () => {
    setActionLoading("publish-now");
    try {
      const data = await invokePinterestAction<any>("publish_next");
      if (data?.published && data?.external_url) {
        toast.success(`Published live as ${data.published}`);
      } else {
        throw new Error(data?.error || data?.eligibility?.reason || "No queued pin was eligible");
      }
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish to Pinterest");
      await fetchAll();
    }
    setActionLoading(null);
  };

  const handleDirectApiTest = async (opts?: { sourceLogId?: string }) => {
    setActionLoading(opts?.sourceLogId ? `direct-api-test-rerun-${opts.sourceLogId}` : "direct-api-test");
    setDirectTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-automation", {
        body: { action: "direct_pinterest_api_test", source_log_id: opts?.sourceLogId ?? null },
      });
      if (error) throw error;
      setDirectTestResult(data);
      if (data?.pin_id && data?.external_url) {
        toast.success(`${opts?.sourceLogId ? "Re-run" : "Direct test"} published ${data.pin_id}`);
      } else {
        throw new Error(data?.error || JSON.stringify(data?.response_body || "No Pinterest pin ID returned"));
      }
      await fetchAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Direct Pinterest API Test failed";
      setDirectTestResult((prev: any) => prev || { ok: false, error: message });
      toast.error(message);
      await fetchAll();
    }
    await fetchDirectTestHistory();
    await fetchAppDiagnostic();
    setActionLoading(null);
  };

  const handleAuthApiTest = async (target: "account" | "boards") => {
    setActionLoading(`auth-api-test-${target}`);
    try {
      const data = await invokePinterestAction<any>("pinterest_auth_api_test", { target });
      setAuthApiTestResult(data);
      if (data?.ok) toast.success(`${target === "account" ? "Account" : "Boards"} API test passed`);
      else toast.error(data?.error || "Pinterest auth API test failed");
      await fetchAll();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pinterest auth API test failed";
      setAuthApiTestResult({ ok: false, error: message });
      toast.error(message);
      await fetchAll();
    }
    setActionLoading(null);
  };

  const handleMintDebugToken = async () => {
    setActionLoading("mint-debug-token");
    try {
      const data = await invokePinterestAction<{ token: string; expires_at: string; ttl_minutes: number; label: string | null }>("mint_direct_test_token", {
        ttl_minutes: debugTokenTtl,
        label: `admin-ui ${new Date().toISOString()}`,
      });
      setDebugToken(data);
      try { await navigator.clipboard.writeText(data.token); } catch {}
      toast.success(`Debug token minted (expires ${new Date(data.expires_at).toLocaleTimeString()})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mint debug token");
    }
    setActionLoading(null);
  };

  const handleRunWithDebugToken = async () => {
    if (!debugToken?.token) return toast.error("Mint a debug token first");
    setActionLoading("direct-api-test-token");
    setDirectTestResult(null);
    try {
      // Call without admin JWT — token-only auth path. Use raw fetch so no Bearer header is sent.
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pinterest-automation`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "x-pinterest-debug-token": debugToken.token,
        },
        body: JSON.stringify({ action: "direct_pinterest_api_test", debug_token: debugToken.token }),
      });
      const data = await res.json().catch(() => ({}));
      setDirectTestResult(data);
      if (data?.pin_id && data?.external_url) {
        toast.success(`Token-auth test published ${data.pin_id}`);
      } else {
        throw new Error(data?.error || "Token-auth test failed");
      }
      // Token is single-use — clear the local copy.
      setDebugToken(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Token-auth test failed");
    }
    await fetchDirectTestHistory();
    await fetchAppDiagnostic();
    setActionLoading(null);
  };

  const handleAction = async (action: string, pinId: string) => {
    setActionLoading(pinId);
    try {
      if (action === "retry") {
        await supabase.from("pinterest_pin_queue").update({ status: "queued", retries: 0, error_message: null, scheduled_at: new Date().toISOString() }).eq("id", pinId);
        toast.success("Pin re-queued for retry");
      } else if (action === "delete") {
        await supabase.from("pinterest_pin_queue").delete().eq("id", pinId);
        toast.success("Pin deleted");
      } else if (action === "force" || action === "test") {
        const data = await invokePinterestAction<any>("force_publish", { pinId });
        if (data?.ok === false) {
          toast.error(data?.error || "Force publish failed");
        } else {
          toast.success(`Published live as ${data?.published || "—"}`);
          if (data?.external_url) console.info("[force_publish] external URL:", data.external_url, data.response);
        }
      } else if (action === "approve") {
        await invokePinterestAction("approve_pin", { pinId });
        toast.success("Pin approved & queued");
      } else if (action === "reject") {
        await invokePinterestAction("reject_pin", { pinId });
        toast.success("Pin rejected");
      } else if (action === "regenerate") {
        await invokePinterestAction("regenerate_pin", { pinId });
        toast.success("Pin regenerated — new draft queued");
      }
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
    setActionLoading(null);
  };

  const handleBulkRetry = async () => {
    setActionLoading("bulk-retry");
    await supabase.from("pinterest_pin_queue").update({ status: "queued", retries: 0, error_message: null, scheduled_at: new Date().toISOString() }).eq("status", "failed");
    toast.success("All failed pins re-queued");
    await fetchAll();
    setActionLoading(null);
  };

  const handleBulkDelete = async () => {
    setActionLoading("bulk-delete");
    await supabase.from("pinterest_pin_queue").delete().eq("status", "failed");
    toast.success("All failed pins deleted");
    await fetchAll();
    setActionLoading(null);
  };

  const handlePurgeBad = async () => {
    if (!window.confirm("Delete every draft/queued/failed/skipped pin that fails QA or is not the approved Automatic Cat Litter Box?")) return;
    setActionLoading("purge-bad");
    try {
      const data = await invokePinterestAction<{ deleted?: number }>("purge_bad_pins");
      toast.success(`Purged ${data.deleted ?? 0} bad pins`);
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purge failed");
    }
    setActionLoading(null);
  };

  const handleForceRun = async () => {
    await handlePublishNow();
  };

  const handleBulkApprove = async () => {
    const pinIds = drafts.slice(0, 10).map((p) => p.id);
    if (!pinIds.length) return toast("No drafts to approve");
    setActionLoading("bulk-approve");
    try {
      const data = await invokePinterestAction<{ approved: number; failures: any[] }>("bulk_approve", { pinIds });
      toast.success(`Approved ${data.approved} of ${pinIds.length}`);
      if (data.failures?.length) {
        toast.error(`${data.failures.length} pins failed QA — check Drafts tab`);
      }
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk approve failed");
    }
    setActionLoading(null);
  };

  const handleBulkReject = async () => {
    const pinIds = drafts.slice(0, 10).map((p) => p.id);
    if (!pinIds.length) return toast("No drafts to reject");
    if (!window.confirm(`Reject ${pinIds.length} draft pin(s)?`)) return;
    setActionLoading("bulk-reject");
    try {
      await invokePinterestAction("bulk_reject", { pinIds });
      toast.success(`Rejected ${pinIds.length} drafts`);
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk reject failed");
    }
    setActionLoading(null);
  };

  const runRecovery = async (action: string, label: string) => {
    setActionLoading(action);
    try {
      const data = await invokePinterestAction<any>(action);
      if (data?.ok === false) throw new Error(data?.error || "Recovery failed");
      const n = data?.recovered ?? data?.cleared ?? data?.deleted ?? 0;
      toast.success(`${label}: ${n}`);
      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recovery failed");
    }
    setActionLoading(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const authValid = Boolean(health?.auth_valid);
  const authWarning = health?.auth_failure_warning || connection?.last_error || null;

  return (
    <div className="space-y-4">
      <ConnectionCard
        connection={connection}
        queuedCount={queued.length}
        actionLoading={actionLoading}
        authValid={authValid}
        authWarning={authWarning}
        onConnect={handleConnect}
        onRefresh={handleRefreshConnection}
        onGenerateDrafts={handleGenerateDrafts}
        onQueueDrafts={handleQueueDrafts}
        onPublishNow={handlePublishNow}
      />

      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> One-Click Direct Pin Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Runs <code className="font-mono">POST https://api.pinterest.com/v5/pins</code> directly against the
            active Pinterest token and returns the real <code className="font-mono">pin_id</code> or the exact
            error response.
          </p>
          {appDiagnostic && (
            <div className="rounded-md border border-border bg-background/60 p-2 text-[11px]">
              <div className="grid gap-1 md:grid-cols-2">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">client_id:</span>
                  <span className="font-mono">{appDiagnostic.client_id_prefix || "—"}</span>
                  {appDiagnostic.client_id_exact_match ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
                      ✓ Standard Access ({appDiagnostic.approved_client_id})
                    </span>
                  ) : (
                    <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-semibold text-destructive">
                      ✗ NOT approved app (expected {appDiagnostic.approved_client_id})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">api_base:</span>
                  <span className="font-mono">{appDiagnostic.api_base || "—"}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{appDiagnostic.mode || "—"}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const text = [
                      `client_id: ${appDiagnostic.client_id_prefix || "—"}`,
                      `approved_app_id: ${appDiagnostic.approved_client_id || "—"}`,
                      `client_id_exact_match: ${appDiagnostic.client_id_exact_match ? "yes" : "NO"}`,
                      `api_base: ${appDiagnostic.api_base || "—"}`,
                      `mode: ${appDiagnostic.mode || "—"}`,
                      `captured_at: ${new Date().toISOString()}`,
                    ].join("\n");
                    try {
                      await navigator.clipboard.writeText(text);
                      toast.success("Diagnose gekopieerd naar klembord");
                    } catch {
                      toast.error("Kopiëren mislukt");
                    }
                  }}
                >
                  <Copy className="mr-2 h-3 w-3" /> Kopieer diagnose
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const json = JSON.stringify({ ...appDiagnostic, captured_at: new Date().toISOString() }, null, 2);
                    try {
                      await navigator.clipboard.writeText(json);
                      toast.success("Diagnose JSON gekopieerd");
                    } catch {
                      toast.error("Kopiëren mislukt");
                    }
                  }}
                >
                  <Copy className="mr-2 h-3 w-3" /> Kopieer JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const json = JSON.stringify({ ...appDiagnostic, captured_at: new Date().toISOString() }, null, 2);
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const ts = new Date().toISOString().replace(/[:.]/g, "-");
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `pinterest-app-diagnostic-${ts}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                >
                  <ExternalLink className="mr-2 h-3 w-3" /> Download JSON
                </Button>
              </div>
            </div>
          )}
          <Button
            size="lg"
            onClick={() => void handleDirectApiTest()}
            disabled={actionLoading === "direct-api-test"}
          >
            {actionLoading === "direct-api-test" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run Direct POST /v5/pins
          </Button>

          {directTestResult && (
            <div
              className={`rounded-md border p-3 text-xs ${
                directTestResult.pin_id
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              {directTestResult.pin_id ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    ✅ Pinterest accepted the pin
                  </p>
                  {directTestResult.guard_unlocked && (
                    <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-foreground">
                      🔓 Production publishing guard auto-unlocked — cron + queue publishing now enabled.
                    </p>
                  )}
                  <div className="grid gap-2 md:grid-cols-2">
                    <DiagnosticValue label="pin_id" value={directTestResult.pin_id} mono />
                    <DiagnosticValue label="status" value={directTestResult.status_code} />
                    <DiagnosticValue label="board_id" value={directTestResult.board_id || directTestResult.request_payload?.board_id} mono />
                    <DiagnosticValue label="external URL" value={directTestResult.external_url} mono />
                  </div>
                  {directTestResult.external_url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={directTestResult.external_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-3 w-3" /> Open live Pinterest pin
                      </a>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-destructive">
                    ❌ Pinterest rejected the request
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <DiagnosticValue label="status" value={directTestResult.status_code} />
                    <DiagnosticValue label="error" value={directTestResult.error} mono />
                    <DiagnosticValue label="endpoint" value={directTestResult.request_endpoint} mono />
                    <DiagnosticValue label="board_id" value={directTestResult.board_id || directTestResult.request_payload?.board_id} mono />
                  </div>
                  {directTestResult.hint && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{directTestResult.hint.title}:</span>{" "}
                      {directTestResult.hint.action}
                    </p>
                  )}
                  <pre className="max-h-60 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(directTestResult.response_body ?? directTestResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={appDiagnostic?.production_guard?.trial_detected ? "border-destructive/50" : appDiagnostic?.publishing_allowed ? "border-emerald-500/40" : "border-amber-500/40"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Pinterest App Credential Diagnostic
            </span>
            <Button size="sm" variant="ghost" onClick={() => void fetchAppDiagnostic()}>
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!appDiagnostic ? (
            <p className="text-xs text-muted-foreground">Loading credential diagnostic…</p>
          ) : (
            <>
              {(!appDiagnostic.client_id_exact_match || appDiagnostic.production_guard?.trial_detected) && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                  <p className="font-semibold text-destructive">
                    ⚠ Wrong Pinterest app credentials or approval not applied to this client_id.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Approved App ID is {appDiagnostic.approved_client_id}. Active client_id is {appDiagnostic.client_id_prefix || "not configured"}.
                    Update the Pinterest client_id + client_secret to the approved app, then run a fresh OAuth reconnect and Direct Pin Test.
                  </p>
                </div>
              )}
              {appDiagnostic.client_id_exact_match && !appDiagnostic.production_guard?.trial_detected && appDiagnostic.publishing_allowed && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-foreground">
                  ✅ Production Ready — Direct Pin Test succeeded. Cron + queue publishing enabled.
                </div>
              )}
              {appDiagnostic.client_id_exact_match && !appDiagnostic.production_guard?.trial_detected && !appDiagnostic.publishing_allowed && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-foreground">
                  Production publishing locked. Run the Direct Pinterest API Test once to verify the
                  active client_id is Standard-Access approved.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <DiagnosticValue label="active client_id" value={appDiagnostic.client_id_prefix} mono />
                <DiagnosticValue label="approved app id" value={appDiagnostic.approved_client_id} mono />
                <DiagnosticValue label="client_id exact match" value={appDiagnostic.client_id_exact_match ? "yes" : "NO"} />
                <DiagnosticValue label="client_secret present" value={appDiagnostic.client_secret_present ? "yes" : "no"} />
                <DiagnosticValue label="redirect_uri" value={appDiagnostic.redirect_uri} mono />
                <DiagnosticValue label="api_base" value={appDiagnostic.api_base} mono />
                <DiagnosticValue label="mode" value={appDiagnostic.mode} />
                <DiagnosticValue label="account" value={appDiagnostic.token?.account_name} />
                <DiagnosticValue label="token created" value={appDiagnostic.token?.token_created_at} mono />
                <DiagnosticValue label="token scopes" value={appDiagnostic.token?.scopes} mono />
                <DiagnosticValue label="board count" value={appDiagnostic.token?.board_count} />
                <DiagnosticValue label="last /boards status" value={appDiagnostic.token?.last_boards_status} />
                <DiagnosticValue label="last /user_account status" value={appDiagnostic.token?.last_account_status} />
                <DiagnosticValue label="production verified" value={appDiagnostic.production_guard?.verified ? "yes" : "no"} />
                <DiagnosticValue label="verified at" value={appDiagnostic.production_guard?.verified_at} mono />
                <DiagnosticValue label="verified client_id" value={appDiagnostic.production_guard?.verified_client_id_prefix || "—"} mono />
                <DiagnosticValue label="trial detected" value={appDiagnostic.production_guard?.trial_detected ? "YES" : "no"} />
                <DiagnosticValue label="last publish error" value={appDiagnostic.production_guard?.last_pin_publish_error || "—"} mono />
              </div>
              <p className="text-xs text-muted-foreground">{appDiagnostic.next_step}</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Last Direct Test Run
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const last = directTestHistory[0];
            if (!last) {
              return <p className="text-xs text-muted-foreground">No direct API test runs logged yet.</p>;
            }
            const data = last.response_data || {};
            const success = last.status === "success";
            return (
              <div className={`rounded-md border p-3 text-xs ${success ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <Badge variant={success ? "default" : "destructive"}>{success ? "success" : "failed"}</Badge>
                  {data.status_code != null && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">HTTP {data.status_code}</span>
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">{new Date(last.created_at).toLocaleString()}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <DiagnosticValue label="pin_id" value={data.returned_pin_id || "—"} mono />
                  <DiagnosticValue label="pin URL" value={data.returned_pin_url || "—"} mono />
                  <DiagnosticValue label="board_id" value={data.selected_board?.id || "—"} mono />
                  <DiagnosticValue label="error" value={last.error_message || "—"} mono />
                </div>
                {data.returned_pin_url && (
                  <div className="pt-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={data.returned_pin_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-3 w-3" /> Open live Pinterest pin
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-destructive" /> Direct Pinterest API Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleAuthApiTest("account")} disabled={!!actionLoading}>
              {actionLoading === "auth-api-test-account" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
              Test Pinterest Account API
            </Button>
            <Button variant="outline" onClick={() => void handleAuthApiTest("boards")} disabled={!!actionLoading}>
              {actionLoading === "auth-api-test-boards" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
              Test Pinterest Boards API
            </Button>
          </div>

          {authApiTestResult && (
            <div className="space-y-3 rounded-md border border-border p-3 text-xs">
              <div className="grid gap-3 md:grid-cols-2">
                <DiagnosticValue label="token prefix" value={authApiTestResult.token_prefix || authApiTestResult.token?.prefix} mono />
                <DiagnosticValue label="token created" value={authApiTestResult.token_created_at} mono />
                <DiagnosticValue label="scopes" value={authApiTestResult.scopes} mono />
                <DiagnosticValue label="board count" value={authApiTestResult.board_count} />
                <DiagnosticValue label="account status" value={authApiTestResult.account_status} />
                <DiagnosticValue label="boards status" value={authApiTestResult.boards_status} />
                <DiagnosticValue label="redirect URI" value={authApiTestResult.env_status?.redirect_uri_value} mono />
                <DiagnosticValue label="auth valid" value={authApiTestResult.auth_valid ? "true" : "false"} />
              </div>
              <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-[11px] text-muted-foreground">
                {JSON.stringify(authApiTestResult, null, 2)}
              </pre>
            </div>
          )}

          <Button onClick={() => void handleDirectApiTest()} disabled={!authValid || !!actionLoading}>
            {actionLoading === "direct-api-test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Direct Pinterest API Test
          </Button>

          <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-xs">
            <p className="font-semibold text-foreground">One-shot debug token</p>
            <p className="text-muted-foreground">
              Mint a single-use, time-limited token so the test can run without exposing your admin JWT
              (e.g. from curl or another client). Each token is hashed at rest and consumed on first use.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] uppercase text-muted-foreground">TTL (min)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={debugTokenTtl}
                onChange={(e) => setDebugTokenTtl(Math.max(1, Math.min(60, Number(e.target.value) || 10)))}
                className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs"
              />
              <Button size="sm" variant="outline" onClick={() => void handleMintDebugToken()} disabled={!!actionLoading}>
                {actionLoading === "mint-debug-token" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-2 h-3 w-3" />}
                Mint debug token
              </Button>
              <Button size="sm" onClick={() => void handleRunWithDebugToken()} disabled={!!actionLoading || !debugToken?.token}>
                {actionLoading === "direct-api-test-token" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
                Run test with token
              </Button>
            </div>
            {debugToken && (
              <div className="space-y-1 rounded bg-muted p-2 font-mono text-[11px] text-foreground">
                <p className="break-all">{debugToken.token}</p>
                <p className="text-muted-foreground">
                  Expires {new Date(debugToken.expires_at).toLocaleString()} · Single-use · Copied to clipboard
                </p>
              </div>
            )}
          </div>

          {directTestResult && (
            <div className="space-y-3 rounded-md border border-border p-3 text-xs">
              {directTestResult.hint && (
                <div className={`rounded-md border p-3 ${directTestResult.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Diagnosis</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{directTestResult.hint.category}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-foreground">{directTestResult.hint.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{directTestResult.hint.summary}</p>
                  <p className="mt-2 text-xs"><span className="font-semibold text-foreground">Action:</span> {directTestResult.hint.action}</p>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <DiagnosticValue label="request endpoint" value={directTestResult.request_endpoint} mono />
                <DiagnosticValue label="board_id" value={directTestResult.board_id || directTestResult.request_payload?.board_id} mono />
                <DiagnosticValue label="image_url" value={directTestResult.image_url || directTestResult.request_payload?.media_source?.url} mono />
                <DiagnosticValue label="destination_url" value={directTestResult.destination_url || directTestResult.request_payload?.link} mono />
                <DiagnosticValue label="status code" value={directTestResult.status_code} />
                <DiagnosticValue label="returned pin_id" value={directTestResult.pin_id} mono />
                <DiagnosticValue label="returned pin URL" value={directTestResult.external_url} mono />
                <DiagnosticValue label="exact error" value={directTestResult.error} mono />
              </div>
              {directTestResult.external_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={directTestResult.external_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-3 w-3" /> Open live Pinterest pin
                  </a>
                </Button>
              )}
              <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-[11px] text-muted-foreground">
                {JSON.stringify(directTestResult.response_body ?? directTestResult, null, 2)}
              </pre>
            </div>
          )}

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Run history ({directTestHistory.length})
              </p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => exportDirectTestHistory("json")} disabled={directTestHistory.length === 0}>
                  Export JSON
                </Button>
                <Button size="sm" variant="ghost" onClick={() => exportDirectTestHistory("csv")} disabled={directTestHistory.length === 0}>
                  Export CSV
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void fetchDirectTestHistory()}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Refresh
                </Button>
              </div>
            </div>
            {directTestHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">No direct API test runs logged yet.</p>
            ) : (
              <div className="space-y-2">
                {directTestHistory.map((entry) => {
                  const data = entry.response_data || {};
                  const isOpen = expandedHistoryId === entry.id;
                  return (
                    <div key={entry.id} className="rounded-md border border-border text-xs">
                      <button
                        type="button"
                        onClick={() => setExpandedHistoryId(isOpen ? null : entry.id)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant={entry.status === "success" ? "default" : "destructive"}>
                            {entry.status}
                          </Badge>
                          <Badge
                            variant={
                              data.pin_verified === true
                                ? "default"
                                : data.pin_verified === false
                                  ? "destructive"
                                  : "outline"
                            }
                            title={data.pin_verification_reason || "pin_verified status"}
                          >
                            verified: {data.pin_verified === true ? "true" : data.pin_verified === false ? "false" : "—"}
                          </Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                          {data.status_code != null && (
                            <span className="text-[11px] text-muted-foreground">HTTP {data.status_code}</span>
                          )}
                          {data.returned_pin_id && (
                            <span className="font-mono text-[11px]">{data.returned_pin_id}</span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{isOpen ? "Hide" : "View"}</span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 border-t border-border p-3">
                          <div className="grid gap-2 md:grid-cols-2">
                            <DiagnosticValue label="endpoint" value={data.endpoint} mono />
                            <DiagnosticValue label="board_id" value={data.selected_board?.id} mono />
                            <DiagnosticValue label="status_code" value={data.status_code} />
                            <DiagnosticValue label="returned pin_id" value={data.returned_pin_id} mono />
                            <DiagnosticValue label="returned pin URL" value={data.returned_pin_url} mono />
                            <DiagnosticValue label="error" value={entry.error_message} mono />
                            <DiagnosticValue label="pin_verified" value={data.pin_verified === true ? "true" : data.pin_verified === false ? "false" : "—"} />
                            <DiagnosticValue label="pin_verification_reason" value={data.pin_verification_reason} mono />
                            <DiagnosticValue label="pin_verified_at" value={data.pin_verified_at ? new Date(data.pin_verified_at).toLocaleString() : "—"} />
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {data.returned_pin_url && (
                              <Button size="sm" variant="outline" asChild>
                                <a href={data.returned_pin_url} target="_blank" rel="noreferrer">
                                  <ExternalLink className="mr-2 h-3 w-3" /> Open pin
                                </a>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={actionLoading === `direct-api-test-rerun-${entry.id}` || actionLoading === "direct-api-test"}
                              onClick={() => void handleDirectApiTest({ sourceLogId: entry.id })}
                            >
                              <RefreshCw className="mr-2 h-3 w-3" />
                              {actionLoading === `direct-api-test-rerun-${entry.id}` ? "Re-running…" : "Re-run this test"}
                            </Button>
                            {data.replays_log_id && (
                              <span className="text-[11px] text-muted-foreground">replay of {String(data.replays_log_id).slice(0, 8)}…</span>
                            )}
                          </div>
                          <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-[11px] text-muted-foreground">
                            {JSON.stringify(data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Draft", count: health?.counts_by_status?.draft ?? drafts.length },
          { label: "Queued", count: health?.counts_by_status?.queued ?? queued.length },
          { label: "Posted", count: health?.counts_by_status?.posted ?? posted.length },
          { label: "Failed", count: health?.counts_by_status?.failed ?? failed.length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-foreground">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <PublishDiagnosticPanel health={health} actionLoading={actionLoading} onRefresh={() => void fetchAll()} onForcePin={(pinId) => void handleAction("force", pinId)} />

      {/* Publish Health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Publish Health
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Pinterest API</p>
            <Badge variant={health?.api_status === "connected" ? "default" : "destructive"}>
              {health?.api_status || "unknown"}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground">Last cron tick</p>
            <p className="font-medium">{health?.last_cron_tick ? new Date(health.last_cron_tick).toLocaleString() : "never"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Posted (24h)</p>
            <p className="font-medium">{health?.posted_24h ?? 0} · {health?.success_rate_24h ?? "—"}% success</p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg publish time</p>
            <p className="font-medium">{health?.avg_publish_ms ? `${health.avg_publish_ms} ms` : "—"}</p>
          </div>
          {health?.stuck_publishing > 0 && (
            <div className="col-span-full flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>{health.stuck_publishing} pin(s) stuck in publishing &gt; 15 min</span>
            </div>
          )}
          {health?.queued_breakdown && (
            <div className="col-span-full text-muted-foreground">
              Queued breakdown: {Object.entries(health.queued_breakdown).map(([k, v]) => `${k}=${v}`).join(" · ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovery toolbar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Recovery
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 py-2">
          <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => runRecovery("recover_orphaned_queued", "Moved back to draft")}>
            Recover orphaned queued
          </Button>
          <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => runRecovery("clear_stuck_publishing", "Cleared")}>
            Clear stuck publishing
          </Button>
          <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => runRecovery("dedupe_queue", "Duplicates removed")}>
            Dedupe queue
          </Button>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      <Card>
        <CardContent className="flex flex-wrap gap-2 py-3">
          <Button size="sm" variant="outline" onClick={fetchAll} disabled={!!actionLoading}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={handleForceRun} disabled={!!actionLoading}>
            <Play className="h-3 w-3 mr-1" /> Force Cron Run
          </Button>
          <Button
            size="sm"
            title="Disabled until one queued pin publishes end-to-end"
            onClick={async () => {
              const t = toast.loading("Generating 5 viral pins…");
              try {
                const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
                  body: { productSlug: "automatic-cat-litter-box-self-cleaning-app-control" },
                });
                if (error) throw error;
                if (data?.ok === false) throw new Error(data?.message || "Failed");
                toast.success(data?.message || "Queued 5 viral pins", { id: t });
                await fetchAll();
              } catch (e: any) {
                toast.error(e?.message || "Failed to generate viral pins", { id: t });
              }
            }}
            disabled
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Zap className="h-3 w-3 mr-1" /> Generate 5 Viral Pins paused
          </Button>
          {failed.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={handleBulkRetry} disabled={!!actionLoading}>
                <RotateCcw className="h-3 w-3 mr-1" /> Retry All Failed ({failed.length})
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={!!actionLoading}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete All Failed
              </Button>
            </>
          )}
          <Button size="sm" variant="destructive" onClick={handlePurgeBad} disabled={!!actionLoading}>
            <Trash2 className="h-3 w-3 mr-1" /> Purge bad pins
          </Button>
          {drafts.length > 0 && (
            <>
              <Button size="sm" variant="default" onClick={handleBulkApprove} disabled={!!actionLoading}>
                <ShieldCheck className="h-3 w-3 mr-1" /> Bulk Approve ({Math.min(drafts.length, 10)})
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkReject} disabled={!!actionLoading}>
                <ShieldAlert className="h-3 w-3 mr-1" /> Bulk Reject ({Math.min(drafts.length, 10)})
              </Button>
            </>
          )}
          {actionLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground self-center" />}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="queued">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="draft">Draft ({health?.counts_by_status?.draft ?? drafts.length})</TabsTrigger>
          <TabsTrigger value="queued">Queued ({health?.counts_by_status?.queued ?? queued.length})</TabsTrigger>
          <TabsTrigger value="posted">Posted ({health?.counts_by_status?.posted ?? posted.length})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({health?.counts_by_status?.failed ?? failed.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="draft">
          <Card><CardContent className="pt-4"><PinTable pins={drafts} onAction={handleAction} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="queued">
          <Card><CardContent className="pt-4"><PinTable pins={queued} onAction={handleAction} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="posted">
          <Card><CardContent className="pt-4"><PinTable pins={posted} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="failed">
          <Card><CardContent className="pt-4"><PinTable pins={failed} onAction={handleAction} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="logs">
          <Card><CardContent className="pt-4"><LogViewer logs={logs} /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Page wrapper ─── */
function PinterestContent() {
  const { user, isAdmin } = useAuth();
  if (!user) {
    return (
      <Card><CardContent className="py-8 text-center">
        <p className="text-lg font-semibold text-destructive">Not authenticated</p>
        <p className="text-sm text-muted-foreground mt-1">Please log in with an admin account.</p>
      </CardContent></Card>
    );
  }
  if (!isAdmin) {
    return (
      <Card><CardContent className="py-8 text-center">
        <p className="text-lg font-semibold text-destructive">Logged in but not admin</p>
        <p className="text-sm text-muted-foreground mt-1">Current email: {user.email}</p>
      </CardContent></Card>
    );
  }
  return <PinterestDashboard />;
}

export default function PinterestAutomationPage() {
  return (
    <PinterestPageErrorBoundary>
      <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-bold">Pinterest Automation</h1>
        
        <PinterestContent />
      </section>
    </PinterestPageErrorBoundary>
  );
}
