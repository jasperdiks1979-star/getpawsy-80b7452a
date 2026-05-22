import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface DnaRow {
  dna_fingerprint: string;
  hook_type: string | null;
  scene_sequence: any;
  motion_sequence: any;
  style_preset: string | null;
  score: number;
  sample_count: number;
}

/**
 * Surfaces top-performing creative DNA patterns and lets admin
 * trigger a global rescoring pass.
 */
export function CreativeDNAPanel() {
  const [rows, setRows] = useState<DnaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cinematic_creative_dna" as any)
      .select("dna_fingerprint, hook_type, scene_sequence, motion_sequence, style_preset, score, sample_count")
      .order("score", { ascending: false })
      .limit(8);
    setLoading(false);
    if (error) {
      console.error("[creative-dna] load failed", error);
      return;
    }
    setRows((data as unknown as DnaRow[]) ?? []);
  }

  async function rescore() {
    setRescoring(true);
    const { data, error } = await supabase.functions.invoke("cinematic-ad-dna-bias", {
      body: { action: "score_all" },
    });
    setRescoring(false);
    if (error) {
      toast.error("Rescore failed");
      return;
    }
    toast.success(`Rescored ${(data as any)?.updated ?? 0} patterns`);
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Creative DNA Memory
          </CardTitle>
          <CardDescription>
            Winning ad structures the autopilot biases new renders toward.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={rescore} disabled={rescoring}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${rescoring ? "animate-spin" : ""}`} />
          Rescore
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No DNA recorded yet — patterns accumulate as renders earn engagement.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.dna_fingerprint}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {r.hook_type ?? "unknown"}
                    </Badge>
                    {r.style_preset && (
                      <Badge variant="outline">{r.style_preset}</Badge>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {Array.isArray(r.motion_sequence)
                      ? r.motion_sequence.slice(0, 6).join(" → ")
                      : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-3">
                  <div className="flex items-center gap-1 text-xs">
                    <TrendingUp className="h-3 w-3" />
                    <span className="font-mono">{r.score.toFixed(1)}</span>
                  </div>
                  <Badge variant="outline">{r.sample_count}×</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}