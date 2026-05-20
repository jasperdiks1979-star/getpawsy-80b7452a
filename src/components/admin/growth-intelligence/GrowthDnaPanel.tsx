import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dna, Sparkles } from "lucide-react";

type DnaRow = {
  id: string;
  gene_type: "hook" | "angle" | "backdrop";
  gene_value: string;
  generation: number;
  status: "active" | "testing" | "retired";
  ewma_reward: number;
  sample_size: number;
  parent_id: string | null;
};

const TYPES: Array<"hook" | "angle" | "backdrop"> = ["hook", "angle", "backdrop"];

export function GrowthDnaPanel() {
  const [rows, setRows] = useState<DnaRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("growth_creative_dna" as any)
      .select("*")
      .order("ewma_reward", { ascending: false })
      .limit(120);
    setRows((data as any as DnaRow[]) ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function callFn(name: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(name);
      if (error) throw error;
      toast.success(name, { description: JSON.stringify(data).slice(0, 140) });
      await load();
    } catch (e: any) {
      toast.error(name, { description: e.message });
    } finally { setLoading(false); }
  }

  const counts = TYPES.reduce((acc, t) => {
    const subset = rows.filter((r) => r.gene_type === t);
    acc[t] = {
      active: subset.filter((r) => r.status === "active").length,
      testing: subset.filter((r) => r.status === "testing").length,
      retired: subset.filter((r) => r.status === "retired").length,
    };
    return acc;
  }, {} as Record<string, { active: number; testing: number; retired: number }>);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Dna className="h-4 w-4" /> Creative DNA
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => callFn("growth-dna-evaluate")}>
            Evaluate
          </Button>
          <Button size="sm" disabled={loading} onClick={() => callFn("growth-dna-mutate")}>
            <Sparkles className="h-3 w-3 mr-1" /> Mutate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-xs">
          {TYPES.map((t) => (
            <div key={t} className="rounded-md border p-2">
              <div className="font-semibold capitalize mb-1">{t}</div>
              <div className="flex gap-2 text-muted-foreground">
                <span className="text-emerald-500">●{counts[t]?.active ?? 0}</span>
                <span className="text-amber-500">●{counts[t]?.testing ?? 0}</span>
                <span className="text-muted-foreground">●{counts[t]?.retired ?? 0}</span>
              </div>
            </div>
          ))}
        </div>

        {TYPES.map((t) => {
          const subset = rows.filter((r) => r.gene_type === t && r.status !== "retired").slice(0, 8);
          if (!subset.length) return null;
          return (
            <section key={t}>
              <h3 className="text-sm font-semibold capitalize mb-2">{t}s</h3>
              <div className="space-y-1">
                {subset.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                      {r.generation > 0 && <span className="text-muted-foreground">G{r.generation}</span>}
                      <span className="truncate">{r.gene_value}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-muted-foreground font-mono">
                      <span>R {r.ewma_reward.toFixed(2)}</span>
                      <span>n={r.sample_size}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {!rows.length && (
          <p className="text-xs text-muted-foreground">
            No DNA yet. Seed by running a daily selection cycle, then click Mutate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default GrowthDnaPanel;