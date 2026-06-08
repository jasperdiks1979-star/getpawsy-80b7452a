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
import { Loader2, RefreshCw, Wrench, ShieldCheck } from "lucide-react";

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

const REASON_COLORS: Record<string, string> = {
  valid: "bg-green-100 text-green-800",
  auto_repaired: "bg-blue-100 text-blue-800",
  needs_replacement: "bg-red-100 text-red-800",
};

export default function PinterestIntegrityPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [slugLog, setSlugLog] = useState<SlugSyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: runRows }, { data: slugRows }] = await Promise.all([
      supabase.from("pinterest_pin_audit_runs")
        .select("*").order("started_at", { ascending: false }).limit(30),
      supabase.from("pinterest_slug_sync_log")
        .select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setRuns((runRows as RunRow[]) || []);
    setSlugLog((slugRows as SlugSyncRow[]) || []);
    const latest = (runRows as RunRow[])?.[0]?.id;
    if (latest) {
      setSelectedRun(latest);
      const { data: auditRows } = await supabase.from("pinterest_pin_audit")
        .select("*").eq("run_id", latest).order("created_at", { ascending: false }).limit(500);
      setAudit((auditRows as AuditRow[]) || []);
    }
    setLoading(false);
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