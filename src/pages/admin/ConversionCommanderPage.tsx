import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Repair = {
  id: string;
  category: string;
  problem: string;
  severity: string;
  risk_score: number;
  auto_safe: boolean;
  status: string;
  evidence: Record<string, unknown>;
  expected_impact: Record<string, unknown>;
  created_at: string;
};

export default function ConversionCommanderPage() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("conversion_repairs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRepairs((data as Repair[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const runScan = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("genesis-v11-2-recovery?action=scan");
      if (error) throw error;
      toast.success(`Scan complete — ${data?.inserted ?? 0} new repairs proposed`);
      await load();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const execute = async (id: string) => {
    const { error } = await supabase.functions.invoke("genesis-v11-2-recovery?action=execute", { body: { id } });
    if (error) toast.error(String(error));
    else {
      toast.success("Repair executed");
      load();
    }
  };

  const rollback = async (id: string) => {
    const reason = prompt("Rollback reason?") ?? "manual";
    const { error } = await supabase.functions.invoke("genesis-v11-2-recovery?action=rollback", { body: { id, reason } });
    if (error) toast.error(String(error));
    else {
      toast.success("Rolled back");
      load();
    }
  };

  const grouped = {
    conversion: repairs.filter((r) => r.category === "trust" || r.category === "ux"),
    revenue: repairs.filter((r) => r.category === "revenue"),
    technical: repairs.filter((r) => r.category === "analytics" || r.category === "performance"),
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GENESIS V11.2 — Conversion Commander</h1>
          <p className="text-muted-foreground text-sm">Autonomous Conversion Recovery Engine</p>
        </div>
        <Button onClick={runScan} disabled={loading}>
          {loading ? "Scanning…" : "Run scan"}
        </Button>
      </div>

      {(["conversion", "revenue", "technical"] as const).map((k) => (
        <Card key={k}>
          <CardHeader>
            <CardTitle className="capitalize">Top {k} problems</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {grouped[k].length === 0 && <p className="text-sm text-muted-foreground">No issues detected.</p>}
            {grouped[k].map((r) => (
              <div key={r.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={r.severity === "critical" ? "destructive" : "secondary"}>{r.severity}</Badge>
                  <Badge variant="outline">{r.category}</Badge>
                  <Badge variant="outline">risk {r.risk_score}</Badge>
                  {r.auto_safe && <Badge className="bg-green-600">auto-safe</Badge>}
                  <Badge variant="outline">{r.status}</Badge>
                </div>
                <p className="font-medium">{r.problem}</p>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify({ evidence: r.evidence, expected_impact: r.expected_impact }, null, 2)}
                </pre>
                <div className="flex gap-2">
                  {r.status === "proposed" && r.auto_safe && (
                    <Button size="sm" onClick={() => execute(r.id)}>
                      Execute
                    </Button>
                  )}
                  {r.status === "executed" && (
                    <Button size="sm" variant="destructive" onClick={() => rollback(r.id)}>
                      Rollback
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}