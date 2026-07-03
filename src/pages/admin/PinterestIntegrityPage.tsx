/**
 * Pinterest Destination Integrity dashboard.
 *
 * Surfaces every audit run from `pinterest_pin_audit_runs` plus per-pin rows
 * from `pinterest_pin_audit`. Lets the admin trigger the integrity audit and
 * autorepair sweep, and shows the daily-monitor history.
 *
 * Admin-only (route is gated upstream).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Wrench, ShieldCheck, Image as ImageIcon, FileText, Undo2, History, Send } from "lucide-react";

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  pins_total: number;
  pins_valid: number;
  pins_broken: number;
  summary: Record<string, unknown>;
}

interface AuditRow {
  id: string;
  source: string;
  destination_url: string;
  final_resolved_url: string | null;
  http_status: number | null;
  repair_strategy: string | null;
  notes: string | null;
  pinterest_pin_id: string | null;
  created_at: string;
}

interface SlugSyncRow {
  id: string;
  old_slug: string;
  new_slug: string;
  table_name: string;
  rows_updated: number;
  created_at: string;
}

interface HeroSyncRow {
  id: string;
  product_id: string;
  before_image_url: string | null;
  after_image_url: string;
  reason: string;
  rolled_back_at: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  generated_at: string;
  pins_audited: number;
  pins_pass: number;
  pins_warning: number;
  pins_fail: number;
  hero_syncs: number;
  wrong_url_fixed: number;
  storage_prefix: string;
  html_path: string | null;
  csv_path: string | null;
  json_path: string | null;
}

const REASON_COLORS: Record<string, string> = {
  valid: "bg-green-100 text-green-800",
  auto_repaired: "bg-blue-100 text-blue-800",
  needs_replacement: "bg-red-100 text-red-800",
};

export default function PinterestIntegrityPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [slugLog, setSlugLog] = useState<SlugSyncRow[]>([]);
  const [heroSyncs, setHeroSyncs] = useState<HeroSyncRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: runRows }, { data: slugRows }, { data: heroRows }, { data: reportRows }] = await Promise.all([
      supabase.from("pinterest_pin_audit_runs")
        .select("*").order("started_at", { ascending: false }).limit(30),
      supabase.from("pinterest_slug_sync_log")
        .select("*").order("created_at", { ascending: false }).limit(50),
      (supabase as any).from("pinterest_hero_sync_log")
        .select("id, product_id, before_image_url, after_image_url, reason, rolled_back_at, created_at")
        .order("created_at", { ascending: false }).limit(50),
      (supabase as any).from("pinterest_integrity_reports")
        .select("id, generated_at, pins_audited, pins_pass, pins_warning, pins_fail, hero_syncs, wrong_url_fixed, storage_prefix, html_path, csv_path, json_path")
        .order("generated_at", { ascending: false }).limit(20),
    ]);
    setRuns((runRows as RunRow[]) || []);
    setSlugLog((slugRows as SlugSyncRow[]) || []);
    setHeroSyncs((heroRows as HeroSyncRow[]) || []);
    setReports((reportRows as ReportRow[]) || []);
    const latest = (runRows as RunRow[])?.[0]?.id;
    if (latest) {
      setSelectedRun(latest);
      const { data: auditRows } = await supabase.from("pinterest_pin_audit")
        .select("*").eq("run_id", latest).order("created_at", { ascending: false }).limit(500);
      setAudit((auditRows as AuditRow[]) || []);
    }
    setLoading(false);
  }

  async function syncMasters() {
    setBusy("hero");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-master-creative-sync", {
        body: { mode: "sync", limit: 200 },
      });
      if (error) throw error;
      toast({
        title: "Master creative sync complete",
        description: `${data?.summary?.synced ?? 0} hero images synced, ${data?.summary?.skipped_same ?? 0} already in sync, ${data?.summary?.errors ?? 0} errors.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Hero sync failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function rollbackHero(logId: string) {
    setBusy("rollback-" + logId);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-master-creative-sync", {
        body: { mode: "rollback", log_id: logId },
      });
      if (error) throw error;
      toast({ title: "Rolled back", description: data?.result?.status || "ok" });
      await load();
    } catch (e: any) {
      toast({ title: "Rollback failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function generateReport() {
    setBusy("report");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-integrity-report", {
        body: {},
      });
      if (error) throw error;
      toast({
        title: "Report generated",
        description: `${data?.summary?.pins_audited ?? 0} pins · ${data?.summary?.pins_pass ?? 0} PASS · ${data?.summary?.pins_fail ?? 0} FAIL`,
      });
      if (data?.signed_urls?.html) window.open(data.signed_urls.html, "_blank");
      await load();
    } catch (e: any) {
      toast({ title: "Report failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function runLegacySweep() {
    setBusy("legacy");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-legacy-repair-sweep", {
        body: {},
      });
      if (error) throw error;
      const r = data?.rollup ?? {};
      toast({
        title: "Legacy sweep complete",
        description:
          `Inventoried ${r.legacy_pins_inventoried ?? 0} legacy pins · ` +
          `audit valid ${r.audit?.valid ?? 0}/${r.audit?.total ?? 0} · ` +
          `hero synced ${r.hero_sync?.synced ?? 0} · ` +
          `report pass ${r.report?.pins_pass ?? 0}/${r.report?.pins_audited ?? 0}`,
      });
      if (r.report?.signed_urls?.html) window.open(r.report.signed_urls.html, "_blank");
      await load();
    } catch (e: any) {
      toast({ title: "Legacy sweep failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function runApprovedSweep(execute: boolean) {
    setBusy(execute ? "sweep_exec" : "sweep_dry");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-approved-publish-sweep", {
        body: { execute, max_publish: 20, interval_seconds: 120, inventory_limit: 500 },
      });
      if (error) throw error;
      const c = data?.counts ?? {};
      toast({
        title: execute ? "Approved publish sweep — staged" : "Approved publish sweep — dry run",
        description:
          `Ready ${c.READY ?? 0} · Waiting AI ${c.WAITING_AI ?? 0} · ` +
          `Blocked ${c.BLOCKED ?? 0} · Failed ${c.FAILED ?? 0}` +
          (execute ? ` · Staged ${data?.staged ?? 0} (first ${data?.first_scheduled_at ?? "-"})` : ""),
      });
      if (data?.report?.html_path) {
        const { data: signed } = await supabase.storage.from("admin-reports").createSignedUrl(data.report.html_path, 3600);
        if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
      }
      await load();
    } catch (e: any) {
      toast({ title: "Approved sweep failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(null); }
  }

  async function openReport(path: string | null) {
    if (!path) return;
    const { data } = await supabase.storage.from("admin-reports").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  useEffect(() => { load(); }, []);

  async function runAudit(autorepair: boolean) {
    setBusy(autorepair ? "repair" : "audit");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-integrity-audit", {
        body: { mode: "all", autorepair, batch_size: 500 },
      });
      if (error) throw error;
      toast({
        title: autorepair ? "Audit + repair complete" : "Audit complete",
        description: `Scanned ${data?.summary?.total ?? 0} · valid ${data?.summary?.valid ?? 0} · repaired ${data?.summary?.repaired ?? 0} · passing ${data?.passing_pct ?? 0}%`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Audit failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function loadRunDetails(id: string) {
    setSelectedRun(id);
    const { data: auditRows } = await supabase.from("pinterest_pin_audit")
      .select("*").eq("run_id", id).order("created_at", { ascending: false }).limit(500);
    setAudit((auditRows as AuditRow[]) || []);
  }

  const latest = runs[0];
  const passingPct = latest && latest.pins_total > 0
    ? Math.round((latest.pins_valid / latest.pins_total) * 100)
    : null;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Pinterest Destination Integrity
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            12-point validation across queued, scheduled, posted, video, and publish pins. Nothing publishes to a 404.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => runAudit(false)} disabled={busy !== null}>
            {busy === "audit" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            Run audit
          </Button>
          <Button size="sm" variant="default" onClick={() => runAudit(true)} disabled={busy !== null}>
            {busy === "repair" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
            Audit + auto-repair
          </Button>
          <Button size="sm" variant="secondary" onClick={syncMasters} disabled={busy !== null}>
            {busy === "hero" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-2" />}
            Sync master creatives → PDP hero
          </Button>
          <Button size="sm" variant="secondary" onClick={generateReport} disabled={busy !== null}>
            {busy === "report" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Generate report
          </Button>
          <Button size="sm" variant="destructive" onClick={runLegacySweep} disabled={busy !== null}>
            {busy === "legacy" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <History className="h-4 w-4 mr-2" />}
            Retro legacy sweep
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Total pins (last run)" value={latest?.pins_total ?? 0} />
        <KPI label="Valid" value={latest?.pins_valid ?? 0} tone="success" />
        <KPI label="Broken" value={latest?.pins_broken ?? 0} tone="danger" />
        <KPI label="Repaired" value={(latest?.summary as any)?.repaired ?? 0} tone="info" />
        <KPI label="% passing" value={passingPct === null ? "—" : `${passingPct}%`} tone={passingPct !== null && passingPct >= 99 ? "success" : "warn"} />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Recent audit runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Mode</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Valid</th>
                <th className="py-2 pr-3">Broken</th>
                <th className="py-2 pr-3">Repaired</th>
                <th className="py-2 pr-3">Needs replacement</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const s: any = r.summary || {};
                return (
                  <tr key={r.id} className={`border-b hover:bg-muted/30 cursor-pointer ${selectedRun === r.id ? "bg-muted/40" : ""}`}
                      onClick={() => loadRunDetails(r.id)}>
                    <td className="py-2 pr-3">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{s.mode || "all"}{s.autorepair ? " · repair" : ""}</Badge>
                    </td>
                    <td className="py-2 pr-3">{r.pins_total}</td>
                    <td className="py-2 pr-3 text-green-700">{r.pins_valid}</td>
                    <td className="py-2 pr-3 text-red-700">{r.pins_broken}</td>
                    <td className="py-2 pr-3 text-blue-700">{s.repaired ?? 0}</td>
                    <td className="py-2 pr-3">{s.needs_replacement ?? 0}</td>
                  </tr>
                );
              })}
              {runs.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No audit runs yet. Click "Run audit" above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Master creative → PDP hero syncs</h2>
        <p className="text-xs text-muted-foreground mb-2">
          When an AI master creative is approved (published_at set, retired_at null, PRE integrity ≥ 95),
          its image becomes the product's hero. Original CJ images stay in the gallery. Every sync is
          reversible via the rollback button.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-2">When</th>
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2">Before</th>
                <th className="py-2 pr-2">After</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {heroSyncs.map(h => (
                <tr key={h.id} className="border-b">
                  <td className="py-1 pr-2">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="py-1 pr-2 font-mono">{h.product_id.slice(0, 8)}</td>
                  <td className="py-1 pr-2">{h.before_image_url ? <img src={h.before_image_url} alt="" className="h-10 w-10 object-cover rounded" /> : "—"}</td>
                  <td className="py-1 pr-2"><img src={h.after_image_url} alt="" className="h-10 w-10 object-cover rounded" /></td>
                  <td className="py-1 pr-2">
                    {h.rolled_back_at
                      ? <Badge variant="outline">rolled back</Badge>
                      : <Badge className="bg-green-100 text-green-800">active</Badge>}
                  </td>
                  <td className="py-1 pr-2">
                    {!h.rolled_back_at && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => rollbackHero(h.id)}>
                        <Undo2 className="h-3 w-3 mr-1" /> Rollback
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {heroSyncs.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No hero syncs yet. Click "Sync master creatives → PDP hero" above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Integrity report bundles</h2>
        <p className="text-xs text-muted-foreground mb-2">
          Each bundle is stored privately under <code>admin-reports/pinterest-integrity/</code> and contains
          the JSON, CSV and HTML views of the underlying audit run.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3">Generated</th>
                <th className="py-2 pr-3">Audited</th>
                <th className="py-2 pr-3">PASS</th>
                <th className="py-2 pr-3">WARN</th>
                <th className="py-2 pr-3">FAIL</th>
                <th className="py-2 pr-3">Hero syncs</th>
                <th className="py-2 pr-3">Wrong URL fixed</th>
                <th className="py-2 pr-3">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="py-1 pr-3">{new Date(r.generated_at).toLocaleString()}</td>
                  <td className="py-1 pr-3">{r.pins_audited}</td>
                  <td className="py-1 pr-3 text-green-700">{r.pins_pass}</td>
                  <td className="py-1 pr-3 text-amber-700">{r.pins_warning}</td>
                  <td className="py-1 pr-3 text-red-700">{r.pins_fail}</td>
                  <td className="py-1 pr-3">{r.hero_syncs}</td>
                  <td className="py-1 pr-3">{r.wrong_url_fixed}</td>
                  <td className="py-1 pr-3 space-x-2">
                    <button className="underline" onClick={() => openReport(r.html_path)}>HTML</button>
                    <button className="underline" onClick={() => openReport(r.csv_path)}>CSV</button>
                    <button className="underline" onClick={() => openReport(r.json_path)}>JSON</button>
                  </td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No reports yet. Click "Generate report" above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Audit details {selectedRun ? `(run ${selectedRun.slice(0, 8)})` : ""}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-2">Source</th>
                <th className="py-2 pr-2">Pin ID</th>
                <th className="py-2 pr-2">Destination</th>
                <th className="py-2 pr-2">Final</th>
                <th className="py-2 pr-2">HTTP</th>
                <th className="py-2 pr-2">Strategy</th>
                <th className="py-2 pr-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {audit.map(a => (
                <tr key={a.id} className="border-b">
                  <td className="py-1 pr-2"><Badge variant="outline">{a.source}</Badge></td>
                  <td className="py-1 pr-2 font-mono">{a.pinterest_pin_id || "—"}</td>
                  <td className="py-1 pr-2 max-w-[280px] truncate" title={a.destination_url}>{a.destination_url}</td>
                  <td className="py-1 pr-2 max-w-[240px] truncate" title={a.final_resolved_url || ""}>{a.final_resolved_url || "—"}</td>
                  <td className="py-1 pr-2">{a.http_status ?? "—"}</td>
                  <td className="py-1 pr-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${REASON_COLORS[a.repair_strategy || ""] || "bg-muted"}`}>
                      {a.repair_strategy || "—"}
                    </span>
                  </td>
                  <td className="py-1 pr-2 max-w-[220px] truncate" title={a.notes || ""}>{a.notes || ""}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No audit rows for this run.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Recent slug auto-syncs</h2>
        <p className="text-xs text-muted-foreground mb-2">
          When a product slug changes, the database trigger automatically rewrites every queued, scheduled, draft, video and publish-queue destination so no pin ever points to a dead slug.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Old slug</th>
                <th className="py-2 pr-3">New slug</th>
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">Rows</th>
              </tr>
            </thead>
            <tbody>
              {slugLog.map(s => (
                <tr key={s.id} className="border-b">
                  <td className="py-1 pr-3">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{s.old_slug}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{s.new_slug}</td>
                  <td className="py-1 pr-3"><Badge variant="outline">{s.table_name}</Badge></td>
                  <td className="py-1 pr-3">{s.rows_updated}</td>
                </tr>
              ))}
              {slugLog.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No slug changes detected yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "danger" | "info" | "warn" }) {
  const color =
    tone === "success" ? "text-green-700" :
    tone === "danger" ? "text-red-700" :
    tone === "info" ? "text-blue-700" :
    tone === "warn" ? "text-amber-700" : "text-foreground";
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </Card>
  );
}