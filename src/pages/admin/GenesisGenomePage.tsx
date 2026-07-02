import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Dna, Search } from "lucide-react";
import inventory from "./genome-inventory.json";

interface Snapshot {
  id: string;
  created_at: string;
  node_count: number;
  edge_count: number;
  completeness: number;
  health_score: number;
  rooms: Record<string, { functions: number; pages: number; tables: number; externals: number }>;
  summary: string;
}
interface NodeRow { node_key: string; kind: string; room: string; label: string }

export default function GenesisGenomePage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [q, setQ] = useState("");
  const [room, setRoom] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("genesis_genome_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);
    const snap = (data?.[0] as unknown) as Snapshot | undefined;
    setSnapshot(snap ?? null);
    if (snap) {
      const { data: n } = await supabase
        .from("genesis_genome_nodes")
        .select("node_key,kind,room,label")
        .eq("snapshot_id", snap.id)
        .limit(3000);
      setNodes(((n as unknown) as NodeRow[]) ?? []);
    }
  };
  useEffect(() => { load(); }, []);

  const build = async () => {
    setRunning(true); setError(null);
    try {
      const { error } = await supabase.functions.invoke("genesis-genome-build", { body: inventory });
      if (error) throw error;
      await load();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setRunning(false); }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return nodes.filter((n) => (!room || n.room === room) && (!term || n.label.toLowerCase().includes(term) || n.kind.includes(term)));
  }, [nodes, q, room]);

  const roomKeys = snapshot ? Object.keys(snapshot.rooms).sort() : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Dna className="h-7 w-7" /> Genesis Ω.2 — Genome
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            The living digital DNA of GetPawsy. One graph of every function, table, page and external system,
            grouped into executive rooms and searchable end-to-end.
          </p>
        </div>
        <Button onClick={build} disabled={running} size="lg">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Dna className="h-4 w-4 mr-2" />}
          Rebuild Genome
        </Button>
      </div>

      {error && <Card className="border-destructive"><CardContent className="pt-4 text-destructive">{error}</CardContent></Card>}

      {snapshot && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Stat label="Nodes" value={snapshot.node_count} />
            <Stat label="Edges" value={snapshot.edge_count} />
            <Stat label="Rooms" value={roomKeys.length} />
            <Stat label="Completeness" value={`${snapshot.completeness}%`} />
            <Stat label="Health" value={`${snapshot.health_score}/100`} accent />
          </div>

          <Card>
            <CardHeader><CardTitle>Genome Summary</CardTitle></CardHeader>
            <CardContent className="text-sm">{snapshot.summary}</CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Executive Rooms</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-2">
              {roomKeys.map((r) => {
                const c = snapshot.rooms[r];
                const active = room === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRoom(active ? "" : r)}
                    className={`text-left border rounded p-3 transition ${active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <div className="font-medium">{r}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.functions} fns · {c.pages} pages · {c.tables} tables · {c.externals} external
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" /> Genome Search</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Search functions, tables, pages…" value={q} onChange={(e) => setQ(e.target.value)} />
                {room && <Button variant="outline" onClick={() => setRoom("")}>Clear room: {room}</Button>}
              </div>
              <div className="text-xs text-muted-foreground">{filtered.length.toLocaleString()} matches</div>
              <div className="max-h-[520px] overflow-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-xs">
                    <tr><th className="text-left p-2">Kind</th><th className="text-left p-2">Room</th><th className="text-left p-2">Name</th></tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 500).map((n) => (
                      <tr key={n.node_key} className="border-t">
                        <td className="p-2"><Badge variant="outline">{n.kind}</Badge></td>
                        <td className="p-2 text-muted-foreground">{n.room}</td>
                        <td className="p-2 font-mono text-xs">{n.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!snapshot && !running && (
        <Card><CardContent className="pt-6 text-muted-foreground">No genome snapshot yet — run the first build.</CardContent></Card>
      )}
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