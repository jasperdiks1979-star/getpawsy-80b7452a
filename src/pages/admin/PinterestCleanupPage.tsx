import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, RefreshCw, Archive, Trash2, ShieldCheck, AlertTriangle, Play, Pause } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

type AuditRow = {
  pin_id: string;
  slug: string | null;
  hook_text: string | null;
  composite_quality_score: number;
  visual_dup_count: number;
  slug_repeat_count: number;
  hook_repeat_count: number;
  is_slideshow_spam: boolean;
  engagement_rate: number;
  recommendation: "KEEP" | "ARCHIVE" | "DELETE";
  reasons: string[];
  audited_at: string;
};

type Trust = {
  score: number | null;
  avg_composite?: number;
  sample_size: number;
  last_audit_at: string | null;
  distribution: Record<string, number>;
};

type ScanSession = {
  id: string;
  status: "running" | "paused" | "completed" | "failed";
  cursor: string | null;
  processed_count: number;
  remaining_count: number | null;
  total_estimate: number | null;
  mode: "light" | "full";
  last_error: string | null;
  started_at: string;
  completed_at: string | null;
  partial_summary?: { avg_ms_per_pin?: number };
};

const REC_FILTERS = ["DELETE", "ARCHIVE", "KEEP", "ALL"] as const;
type RecFilter = (typeof REC_FILTERS)[number];

export default function PinterestCleanupPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [tab, setTab] = useState<RecFilter>("DELETE");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [session, setSession] = useState<ScanSession | null>(null);
  const [lightMode, setLightMode] = useState(true);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [authMissing, setAuthMissing] = useState(false);

  async function loadTrust() {
    const { data, error } = await supabase.functions.invoke("pinterest-cleanup-audit", {
      body: undefined,
      method: "GET",
    } as never).catch((e) => ({ data: null, error: e }));
    // Fallback: direct fetch with mode=trust
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) { setAuthMissing(true); return; }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pinterest-cleanup-audit?mode=trust`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const j = await r.json();
      if (j?.ok) setTrust({ score: j.score, avg_composite: j.avg_composite, sample_size: j.sample_size, last_audit_at: j.last_audit_at, distribution: j.distribution ?? {} });
    } catch {}
    void data; void error;
  }

  async function loadRows() {
    setLoading(true); setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) { setAuthMissing(true); setLoading(false); return; }
      let q = supabase.from("pinterest_cleanup_audit" as never).select("*").order("composite_quality_score", { ascending: true }).limit(200);
      if (tab !== "ALL") q = (q as any).eq("recommendation", tab);
      const { data, error } = await (q as any);
      if (error) throw error;
      setRows((data ?? []) as AuditRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTrust(); }, []);
  useEffect(() => { void loadRows(); }, [tab]);

  // Load latest session on mount so users can resume after a crash/refresh.
  useEffect(() => {
    (async () => {
      try {
        const s = (await supabase.auth.getSession()).data.session;
        if (!s) return;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pinterest-cleanup-audit?mode=status`;
        const r = await fetch(url, { headers: { Authorization: `Bearer ${s.access_token}` } });
        const j = await r.json();
        if (j?.ok && j.session) setSession(j.session as ScanSession);
      } catch {}
    })();
  }, []);

  async function callScanFn(mode: "start" | "continue" | "finalize", sessionId?: string): Promise<ScanSession | null> {
    const s = (await supabase.auth.getSession()).data.session;
    if (!s) { setAuthMissing(true); return null; }
    const params = new URLSearchParams({ mode });
    if (sessionId) params.set("session_id", sessionId);
    if (mode === "start") params.set("scan_mode", lightMode ? "light" : "full");
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pinterest-cleanup-audit?${params}`;
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${s.access_token}` } });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.message ?? `${mode} failed`);
    return (j.session as ScanSession) ?? null;
  }

  async function runScan() {
    setScanning(true); setPaused(false);
    try {
      // Start (or resume an existing running session via idempotent start)
      let s = await callScanFn("start");
      setSession(s);
      // Loop chunks until completed/failed/paused.
      while (s && s.status === "running" && !paused) {
        s = await callScanFn("continue", s.id);
        setSession(s);
        // Refresh visible rows so users see live updates.
        void loadRows();
      }
      await loadTrust();
      if (s?.status === "completed") {
        toast({ title: "Scan complete", description: `Audited ${s.processed_count} pins` });
      }
    } catch (e) {
      toast({ title: "Scan failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }

  async function resumeScan() {
    if (!session) return;
    setScanning(true); setPaused(false);
    try {
      let s: ScanSession | null = session;
      while (s && s.status === "running" && !paused) {
        s = await callScanFn("continue", s.id);
        setSession(s);
        void loadRows();
      }
      await loadTrust();
    } catch (e) {
      toast({ title: "Resume failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setScanning(false); }
  }

  async function executeBatch(action: "archive" | "delete") {
    if (selected.size === 0) return;
    if (action === "delete") {
      const confirm = window.prompt(`Type DELETE ${selected.size} to confirm permanent removal`);
      if (confirm !== `DELETE ${selected.size}`) {
        toast({ title: "Aborted", description: "Confirmation phrase did not match." });
        return;
      }
    }
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) { setAuthMissing(true); return; }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pinterest-cleanup-audit?mode=execute`;
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, pin_ids: Array.from(selected) }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message ?? "execute failed");
      toast({ title: `${action} complete`, description: `${j.processed}/${selected.size} processed` });
      setSelected(new Set());
      await loadRows();
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const trustColor = useMemo(() => {
    const s = trust?.score ?? 0;
    if (s >= 70) return "text-emerald-600";
    if (s >= 50) return "text-amber-600";
    return "text-rose-600";
  }, [trust?.score]);

  const progressPct = useMemo(() => {
    if (!session?.total_estimate) return 0;
    return Math.min(100, Math.round((session.processed_count / session.total_estimate) * 100));
  }, [session?.processed_count, session?.total_estimate]);

  const etaSeconds = useMemo(() => {
    if (!session?.partial_summary?.avg_ms_per_pin || !session.remaining_count) return null;
    return Math.round((session.partial_summary.avg_ms_per_pin * session.remaining_count) / 1000);
  }, [session?.partial_summary?.avg_ms_per_pin, session?.remaining_count]);

  if (authMissing) {
    return (
      <div className="p-6">
        <Helmet><title>Pinterest Cleanup</title></Helmet>
        <Card><CardContent className="py-10 text-center text-muted-foreground">Admin login required.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <Helmet><title>Pinterest Cleanup · Admin</title></Helmet>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Pinterest Cleanup
        </h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Light scan
            <Switch checked={lightMode} onCheckedChange={setLightMode} disabled={scanning} />
          </label>
          {session && session.status === "running" && !scanning ? (
            <Button onClick={resumeScan} size="sm" variant="secondary">
              <Play className="h-4 w-4 mr-2" /> Resume
            </Button>
          ) : null}
          {scanning ? (
            <Button onClick={() => setPaused(true)} size="sm" variant="outline">
              <Pause className="h-4 w-4 mr-2" /> Pause
            </Button>
          ) : (
            <Button onClick={runScan} disabled={scanning} size="sm">
              <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
              Run scan
            </Button>
          )}
        </div>
      </div>

      {session ? (
        <Card>
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                Scan {session.status} · {session.mode} mode
              </span>
              <span className="text-muted-foreground">
                {session.processed_count}
                {session.total_estimate ? ` / ${session.total_estimate}` : ""} pins
                {etaSeconds != null ? ` · ETA ~${etaSeconds}s` : ""}
              </span>
            </div>
            <Progress value={progressPct} />
            {session.last_error ? (
              <div className="text-xs text-rose-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {session.last_error}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Trust Recovery Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Trust Recovery Score</CardTitle>
        </CardHeader>
        <CardContent>
          {trust && trust.score !== null ? (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <div className={`text-5xl font-bold ${trustColor}`}>{trust.score}</div>
                <div className="text-xs text-muted-foreground">avg composite {trust.avg_composite ?? "—"} · {trust.sample_size} pins</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(trust.distribution).map(([k, v]) => (
                  <Badge key={k} variant={k === "DELETE" ? "destructive" : k === "ARCHIVE" ? "secondary" : "default"}>{k}: {v}</Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground ml-auto">last audit: {trust.last_audit_at ? new Date(trust.last_audit_at).toLocaleString() : "never"}</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No audit yet — run a scan to populate.</div>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as RecFilter); setSelected(new Set()); }}>
        <TabsList>
          {REC_FILTERS.map((r) => (
            <TabsTrigger key={r} value={r}>{r}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {selected.size > 0 && (
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-md px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Button size="sm" variant="secondary" onClick={() => executeBatch("archive")}><Archive className="h-3 w-3 mr-1" /> Archive</Button>
              <Button size="sm" variant="destructive" onClick={() => executeBatch("delete")}><Trash2 className="h-3 w-3 mr-1" /> Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          {loading ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Loading audit…</CardContent></Card>
          ) : error ? (
            <Card><CardContent className="py-6 text-rose-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</CardContent></Card>
          ) : rows.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No audited pins for "{tab}". Run a scan to populate.</CardContent></Card>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => {
                const isChecked = selected.has(r.pin_id);
                const sevColor = r.recommendation === "DELETE" ? "border-rose-300" : r.recommendation === "ARCHIVE" ? "border-amber-300" : "border-emerald-300";
                return (
                  <Card key={r.pin_id} className={`border ${sevColor}`}>
                    <CardContent className="py-3 px-3 flex flex-col md:flex-row gap-3">
                      <div className="flex items-start gap-2">
                        <Checkbox checked={isChecked} onCheckedChange={() => toggleSelect(r.pin_id)} className="mt-1" />
                        <div className="text-3xl font-bold tabular-nums w-12 text-center">{r.composite_quality_score}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={r.recommendation === "DELETE" ? "destructive" : r.recommendation === "ARCHIVE" ? "secondary" : "default"}>{r.recommendation}</Badge>
                          <span className="text-sm font-medium truncate">{r.slug ?? "(no slug)"}</span>
                          <span className="text-xs text-muted-foreground font-mono truncate">{r.pin_id}</span>
                        </div>
                        <div className="text-sm mt-1 line-clamp-2 text-muted-foreground">{r.hook_text || "(no hook text)"}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {r.reasons.map((x, i) => <Badge key={i} variant="outline" className="text-xs">{x}</Badge>)}
                          <Badge variant="outline" className="text-xs">eng {(r.engagement_rate * 100).toFixed(2)}%</Badge>
                          {r.visual_dup_count > 0 && <Badge variant="outline" className="text-xs">visual dup ×{r.visual_dup_count}</Badge>}
                          {r.slug_repeat_count > 0 && <Badge variant="outline" className="text-xs">slug ×{r.slug_repeat_count}</Badge>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}