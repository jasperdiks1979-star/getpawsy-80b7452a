import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, GitBranch, AlertTriangle, Layers, Sparkles } from "lucide-react";
import inventory from "./omega-architect-inventory.json";

interface Scan {
  id: string;
  created_at: string;
  edge_functions_count: number;
  admin_pages_count: number;
  architecture_score: number;
  summary: string;
  duplicates: Array<{ kind: string; group: string; items: string[]; note: string }>;
  dead_candidates: Array<{ kind: string; name: string; reason: string }>;
  hotspots: Array<{ domain: string; edge_functions: number; note: string }>;
  module_scores: Array<{ module: string; edge_functions: number; complexity: number; debt: number; quality: number }>;
  proposals: Array<{ title: string; evidence: string[]; risk: string; rollback: string; expected_gain: string }>;
}

export default function GenesisOmegaArchitectPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("genesis_omega_architecture_scans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    setScans((data as Scan[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const { error } = await supabase.functions.invoke("genesis-omega-architect", {
        body: {
          edge_functions: inventory.edge_functions,
          admin_pages: inventory.admin_pages,
        },
      });
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };

  const latest = scans[0];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GitBranch className="h-7 w-7" /> Genesis Ω.1 — Architect
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Permanent Chief Software Architect. Continuously inventories every Genesis component,
            detects duplication and technical debt, and proposes elegant consolidations.
          </p>
        </div>
        <Button onClick={run} disabled={running} size="lg">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Run Architecture Audit
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-destructive">{error}</CardContent>
        </Card>
      )}

      {latest && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Architecture Score" value={`${latest.architecture_score}/100`} accent />
            <Stat label="Edge Functions" value={latest.edge_functions_count} />
            <Stat label="Admin Pages" value={latest.admin_pages_count} />
            <Stat label="Duplicate Clusters" value={latest.duplicates.length} />
            <Stat label="Legacy Artifacts" value={latest.dead_candidates.length} />
          </div>

          <Card>
            <CardHeader><CardTitle>Executive Summary</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{latest.summary}</p></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Hotspots</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {latest.hotspots.map((h) => (
                <div key={h.domain} className="flex items-center justify-between border rounded p-2">
                  <div>
                    <div className="font-mono text-sm">{h.domain}</div>
                    <div className="text-xs text-muted-foreground">{h.note}</div>
                  </div>
                  <Badge variant={h.edge_functions > 25 ? "destructive" : "secondary"}>{h.edge_functions} fns</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Duplicate Clusters</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {latest.duplicates.slice(0, 15).map((d, i) => (
                <div key={i} className="border rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs">{d.kind} · {d.group}</span>
                    <Badge>{d.items.length}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">{d.items.slice(0, 6).join(", ")}{d.items.length > 6 ? "…" : ""}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top Consolidation Proposals</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {latest.proposals.map((p, i) => (
                <div key={i} className="border rounded p-3">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">Gain: {p.expected_gain} · Risk: {p.risk}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>Scan History</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {scans.map((s) => (
            <div key={s.id} className="flex justify-between border-b py-1">
              <span>{new Date(s.created_at).toLocaleString()}</span>
              <span>Score {s.architecture_score} · {s.edge_functions_count} fns · {s.duplicates.length} dup</span>
            </div>
          ))}
          {scans.length === 0 && <div className="text-muted-foreground">No scans yet — run the first audit.</div>}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary" : undefined}>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}