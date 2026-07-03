/**
 * Phase 20 — Product Identity Graph command center.
 *
 * Visual Truth Engine dashboard. Extends VPI / PRE / Master Creative Sync /
 * Pinterest Integrity — no duplicate systems. Shows graph completeness,
 * certified vs uncertified assets by role, duplicate registry, recent sweep
 * runs, and top revenue-risk mismatches.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Network, ShieldCheck, Copy, Wrench } from "lucide-react";

type Run = { id: string; run_kind: string; status: string; started_at: string; finished_at: string | null; stats: Record<string, number>; };
type Cert = { id: string; product_id: string; node_id: string; role: string; match_kind: string; identity_score: number; revenue_risk: number; passed: boolean; certified_at: string | null; };
type NodeRow = { id: string; kind: string; product_id: string | null; url: string | null; source: string };
type Dup = { id: string; primary_node: string; duplicate_node: string; similarity: number; method: string };

const KIND_LABEL: Record<string, string> = {
  product: "Products", hero_image: "Hero", gallery_image: "Gallery",
  pinterest_pin: "Pinterest", ai_creative: "AI creative", cj_image: "CJ",
  video: "Video", pdp_image: "PDP", image: "Image",
};

export default function ProductIdentityGraphPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [dups, setDups] = useState<Dup[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [r, c, n, d] = await Promise.all([
      supabase.from("pig_runs").select("id,run_kind,status,started_at,finished_at,stats").order("started_at", { ascending: false }).limit(20),
      supabase.from("pig_certifications").select("id,product_id,node_id,role,match_kind,identity_score,revenue_risk,passed,certified_at").order("revenue_risk", { ascending: false }).limit(200),
      supabase.from("pig_nodes").select("id,kind,product_id,url,source").limit(2000),
      supabase.from("pig_duplicates").select("id,primary_node,duplicate_node,similarity,method").order("created_at", { ascending: false }).limit(100),
    ]);
    setRuns((r.data ?? []) as Run[]);
    setCerts((c.data ?? []) as Cert[]);
    setNodes((n.data ?? []) as NodeRow[]);
    setDups((d.data ?? []) as Dup[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function trigger(mode: "ingest" | "dna" | "duplicates" | "certify" | "full", extra: Record<string, string> = {}) {
    setRunning(mode);
    try {
      const params = new URLSearchParams({ mode, ...extra });
      const { data, error } = await supabase.functions.invoke(`product-identity-graph-sweep?${params.toString()}`, { method: "POST" });
      if (error) throw error;
      toast.success(`PIG ${mode} complete`, { description: JSON.stringify((data as any)?.stats ?? {}) });
      await load();
    } catch (e) {
      toast.error(`PIG ${mode} failed: ${(e as Error).message}`);
    } finally { setRunning(null); }
  }

  const kindCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const n of nodes) m[n.kind] = (m[n.kind] ?? 0) + 1;
    return m;
  }, [nodes]);

  const stats = useMemo(() => {
    const s = { total: certs.length, passed: 0, failed: 0, avg: 0, risk: 0 };
    let sum = 0;
    for (const c of certs) {
      sum += Number(c.identity_score) || 0;
      s.risk += Number(c.revenue_risk) || 0;
      if (c.passed) s.passed++; else s.failed++;
    }
    s.avg = certs.length ? Math.round(sum / certs.length) : 0;
    s.risk = Math.round(s.risk * 100) / 100;
    return s;
  }, [certs]);

  const failing = useMemo(() => certs.filter((c) => !c.passed).slice(0, 100), [certs]);

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Network className="h-6 w-6"/> Product Identity Graph</h1>
          <p className="text-sm text-muted-foreground">
            Visual Truth Engine. One product · one identity · one truth. Extends VPI + PRE + PEI DNA + Master Creative Sync — no duplicate systems.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>} Reload</Button>
          <Button variant="outline" disabled={!!running} onClick={() => trigger("ingest")}>{running === "ingest" ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Ingest</Button>
          <Button variant="outline" disabled={!!running} onClick={() => trigger("dna")}>{running === "dna" ? <Loader2 className="h-4 w-4 animate-spin"/> : null} DNA</Button>
          <Button variant="outline" disabled={!!running} onClick={() => trigger("duplicates")}>{running === "duplicates" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Copy className="h-4 w-4"/>} Duplicates</Button>
          <Button variant="outline" disabled={!!running} onClick={() => trigger("certify", { limit: "20" })}>{running === "certify" ? <Loader2 className="h-4 w-4 animate-spin"/> : <ShieldCheck className="h-4 w-4"/>} Certify 20</Button>
          <Button disabled={!!running} onClick={() => trigger("full", { limit: "40" })}>{running === "full" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wrench className="h-4 w-4"/>} Full sweep</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Object.entries(kindCounts).map(([k, v]) => (
          <Card key={k} className="p-3">
            <div className="text-xs text-muted-foreground">{KIND_LABEL[k] ?? k}</div>
            <div className="text-2xl font-semibold">{v}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Certifications</div><div className="text-2xl font-semibold">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Passed</div><div className="text-2xl font-semibold text-green-600">{stats.passed}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Failed</div><div className="text-2xl font-semibold text-red-600">{stats.failed}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Avg identity</div><div className="text-2xl font-semibold">{stats.avg || "—"}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Revenue risk</div><div className="text-2xl font-semibold text-amber-600">{stats.risk}</div></Card>
      </div>

      <Card>
        <div className="p-4 border-b font-medium">Recent sweep runs</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr><th className="px-3 py-2">Started</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Stats</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{r.run_kind}</Badge></td>
                  <td className="px-3 py-2"><Badge variant={r.status === "completed" ? "secondary" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge></td>
                  <td className="px-3 py-2 text-xs font-mono text-muted-foreground max-w-[720px] break-all">{JSON.stringify(r.stats)}</td>
                </tr>
              ))}
              {!runs.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No runs yet. Trigger a full sweep to bootstrap the graph.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b font-medium">Top revenue-risk mismatches</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr><th className="px-3 py-2">Role</th><th className="px-3 py-2">Match</th><th className="px-3 py-2">Identity</th><th className="px-3 py-2">Revenue risk</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Node</th></tr>
            </thead>
            <tbody>
              {failing.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2"><Badge variant="outline">{c.role}</Badge></td>
                  <td className="px-3 py-2"><Badge variant={c.match_kind === "exact" ? "secondary" : c.match_kind === "wrong" ? "destructive" : "outline"}>{c.match_kind}</Badge></td>
                  <td className="px-3 py-2 font-semibold">{c.identity_score}</td>
                  <td className="px-3 py-2 text-amber-600 font-semibold">{c.revenue_risk}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.product_id.slice(0, 8)}…</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.node_id.slice(0, 8)}…</td>
                </tr>
              ))}
              {!failing.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Zero mismatches. Every certified asset is exact.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b font-medium">Duplicates registered ({dups.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr><th className="px-3 py-2">Method</th><th className="px-3 py-2">Similarity</th><th className="px-3 py-2">Primary</th><th className="px-3 py-2">Duplicate</th></tr>
            </thead>
            <tbody>
              {dups.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2">{d.method}</td>
                  <td className="px-3 py-2">{d.similarity}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.primary_node.slice(0, 8)}…</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.duplicate_node.slice(0, 8)}…</td>
                </tr>
              ))}
              {!dups.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No duplicates detected yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Every gate (Pinterest publisher, integrity guard, repair workers, analytics) reads the Visual Truth API. No independent comparisons.
        Certifications expire after 72h so the graph self-heals as assets change.
      </p>
    </div>
  );
}