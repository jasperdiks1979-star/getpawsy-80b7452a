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
} from "lucide-react";

type PinterestConnection = {
  id: string;
  account_id: string | null;
  account_name: string | null;
  status: string;
  token_expires_at: string | null;
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
  onConnect,
  onRefresh,
  onGenerateDrafts,
  onQueueDrafts,
  onPublishNow,
}: {
  connection: PinterestConnection | null;
  queuedCount: number;
  actionLoading: string | null;
  onConnect: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onGenerateDrafts: () => Promise<void>;
  onQueueDrafts: () => Promise<void>;
  onPublishNow: () => Promise<void>;
}) {
  const isConnected = connection?.status === "connected";
  const canPublishNow = isConnected && queuedCount > 0;

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
          </div>
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
        <Button variant="outline" onClick={() => void onGenerateDrafts()} disabled={!!actionLoading && actionLoading !== "generate-drafts"}>
          {actionLoading === "generate-drafts" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Generate draft pins
        </Button>
        <Button variant="outline" onClick={() => void onQueueDrafts()} disabled={!!actionLoading && actionLoading !== "queue-drafts"}>
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
                  {(pin.status === "queued" || pin.status === "draft") && (
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onAction("force", pin.id)} title="Force post now">
                      <Play className="h-3 w-3" />
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
      const { data, error } = await supabase.functions.invoke("pinterest-cron-worker", { body: {} });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "Pinterest publish failed");

      const results = Array.isArray(data?.results) ? data.results : [];
      const postedCount = results.filter((result: { status?: string }) => result.status === "posted").length;
      const firstError = results.find((result: { error?: string }) => result.error)?.error;

      if (postedCount > 0) {
        toast.success(`${postedCount} pin${postedCount === 1 ? "" : "s"} published to Pinterest`);
      } else if (firstError) {
        throw new Error(firstError);
      } else {
        // Surface why nothing ran by querying diagnostics.
        try {
          const diag = await invokePinterestAction<any>("publish_diagnostics");
          const r = diag?.queued_breakdown;
          const parts: string[] = [];
          if (r?.not_approved) parts.push(`${r.not_approved} not approved`);
          if (r?.scheduled_in_future) parts.push(`${r.scheduled_in_future} scheduled later`);
          if (r?.slug_not_allowed) parts.push(`${r.slug_not_allowed} blocked by allowlist`);
          if (r?.retries_exceeded) parts.push(`${r.retries_exceeded} hit retry limit`);
          if (r?.ready) parts.push(`${r.ready} ready (cron should pick up)`);
          toast(parts.length ? `No pins published. Reasons: ${parts.join(", ")}` : "No queued pins are ready to publish yet");
        } catch {
          toast("No queued pins are ready to publish yet");
        }
      }

      await fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish to Pinterest");
    }
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

  return (
    <div className="space-y-4">
      <ConnectionCard
        connection={connection}
        queuedCount={queued.length}
        actionLoading={actionLoading}
        onConnect={handleConnect}
        onRefresh={handleRefreshConnection}
        onGenerateDrafts={handleGenerateDrafts}
        onQueueDrafts={handleQueueDrafts}
        onPublishNow={handlePublishNow}
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Draft", count: drafts.length },
          { label: "Queued", count: queued.length },
          { label: "Posted", count: posted.length },
          { label: "Failed", count: failed.length },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold text-foreground">{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
            disabled={!!actionLoading}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Zap className="h-3 w-3 mr-1" /> Generate 5 Viral Pins
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
          <TabsTrigger value="draft">Draft ({drafts.length})</TabsTrigger>
          <TabsTrigger value="queued">Queued ({queued.length})</TabsTrigger>
          <TabsTrigger value="posted">Posted ({posted.length})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({failed.length})</TabsTrigger>
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
