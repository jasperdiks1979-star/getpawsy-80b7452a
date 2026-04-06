import { Component, type ReactNode, useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/auth/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Trash2, Play, RotateCcw, Loader2 } from "lucide-react";

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

/* ─── Auth Debug (compact) ─── */
function AuthDebugCard() {
  const location = useLocation();
  const { user, isLoading, isAdmin } = useAuth();
  const authenticated = !!user;
  const emailMatch = isAdminEmail(user?.email);
  const adminSource = isAdmin ? (emailMatch ? "email-allowlist" : "db-role") : "none";

  return (
    <Card className="border border-primary/20 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-3 py-3 text-xs font-mono">
        {isLoading && <span className="animate-pulse text-muted-foreground">Loading…</span>}
        <span>path: {location.pathname}</span>
        <Badge variant={authenticated ? "default" : "destructive"}>
          {authenticated ? `✅ ${user?.email}` : "❌ Not logged in"}
        </Badge>
        {authenticated && (
          <Badge variant={isAdmin ? "default" : "destructive"}>
            admin: {String(isAdmin)} ({adminSource})
          </Badge>
        )}
        {!authenticated && (
          <Button asChild size="sm" variant="outline" className="h-6 text-xs">
            <Link to={`/auth?next=${encodeURIComponent(location.pathname)}`}>Login</Link>
          </Button>
        )}
        {authenticated && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>
            Logout
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Status badge helper ─── */
function StatusBadge({ status }: { status: string }) {
  const variant = status === "posted" ? "default" : status === "failed" ? "destructive" : status === "queued" ? "secondary" : "outline";
  return <Badge variant={variant} className="text-xs">{status}</Badge>;
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
              <td className="py-2 pr-2 text-xs text-muted-foreground">
                {pin.scheduled_at ? new Date(pin.scheduled_at).toLocaleString() : "—"}
              </td>
              <td className="py-2 pr-2">{pin.retries ?? 0}</td>
              {onAction && (
                <td className="py-2 flex gap-1">
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
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [queued, setQueued] = useState<any[]>([]);
  const [posted, setPosted] = useState<any[]>([]);
  const [failed, setFailed] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [draftRes, queuedRes, postedRes, failedRes, logRes] = await Promise.all([
        supabase.from("pinterest_pin_queue").select("*").eq("status", "draft").order("created_at", { ascending: false }).limit(50),
        supabase.from("pinterest_pin_queue").select("*").eq("status", "queued").order("scheduled_at", { ascending: true }).limit(50),
        supabase.from("pinterest_pin_queue").select("*").eq("status", "posted").order("posted_at", { ascending: false }).limit(20),
        supabase.from("pinterest_pin_queue").select("*").eq("status", "failed").order("updated_at", { ascending: false }).limit(50),
        supabase.from("pinterest_post_logs").select("*").order("created_at", { ascending: false }).limit(20),
      ]);
      setDrafts(draftRes.data || []);
      setQueued(queuedRes.data || []);
      setPosted(postedRes.data || []);
      setFailed(failedRes.data || []);
      setLogs(logRes.data || []);
    } catch (e) {
      console.error("Failed to fetch pinterest data:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAction = async (action: string, pinId: string) => {
    setActionLoading(pinId);
    try {
      if (action === "retry") {
        await supabase.from("pinterest_pin_queue").update({ status: "queued", retries: 0, error_message: null, scheduled_at: new Date().toISOString() }).eq("id", pinId);
        toast.success("Pin re-queued for retry");
      } else if (action === "delete") {
        await supabase.from("pinterest_pin_queue").delete().eq("id", pinId);
        toast.success("Pin deleted");
      } else if (action === "force") {
        await supabase.from("pinterest_pin_queue").update({ status: "queued", scheduled_at: new Date().toISOString() }).eq("id", pinId);
        toast.success("Pin scheduled for immediate posting");
      }
      await fetchAll();
    } catch (e) {
      toast.error("Action failed");
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

  const handleForceRun = async () => {
    setActionLoading("force-run");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-cron-worker", { body: {} });
      if (error) throw error;
      toast.success(`Cron run complete: ${data?.processed || 0} pins processed`);
      await fetchAll();
    } catch (e) {
      toast.error("Force run failed");
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
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Draft", count: drafts.length, color: "text-muted-foreground" },
          { label: "Queued", count: queued.length, color: "text-blue-600" },
          { label: "Posted", count: posted.length, color: "text-green-600" },
          { label: "Failed", count: failed.length, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
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
        <AuthDebugCard />
        <PinterestContent />
      </section>
    </PinterestPageErrorBoundary>
  );
}
