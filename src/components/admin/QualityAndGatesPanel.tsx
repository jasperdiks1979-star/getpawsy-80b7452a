import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Lock, Unlock, Loader2 } from "lucide-react";
import { toast } from "sonner";

type LandingRow = {
  url: string;
  overall_score: number;
  trust_score: number;
  clarity_score: number;
  speed_score: number;
  pinterest_consistency_score: number;
  sample_size: number;
  audited_at: string;
  issues: any[];
};

type ProductRow = {
  product_id: string;
  overall_score: number;
  pdp_health_score: number;
  creative_dna_score: number;
  winner_score: number;
  sample_size: number;
  computed_at: string;
};

type GateRow = {
  module_key: string;
  category: string;
  description: string;
  required_samples: number;
  required_confidence: number;
  current_samples: number;
  current_confidence: number;
  is_active: boolean;
  activated_at: string | null;
  last_evaluated_at: string;
};

export default function QualityAndGatesPanel() {
  const [landings, setLandings] = useState<LandingRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [gates, setGates] = useState<GateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [l, p, g] = await Promise.all([
      supabase.from("landing_quality_scores").select("*").order("audited_at", { ascending: false }).limit(50),
      supabase.from("product_quality_scores").select("*").order("computed_at", { ascending: false }).limit(50),
      supabase.from("module_activation_gates").select("*").order("category"),
    ]);
    if (!l.error) setLandings(l.data as any);
    if (!p.error) setProducts(p.data as any);
    if (!g.error) setGates(g.data as any);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function run(fn: string, label: string) {
    setRunning(fn);
    const { error } = await supabase.functions.invoke(fn, { body: {} });
    setRunning(null);
    if (error) toast.error(`${label} failed: ${error.message}`);
    else { toast.success(`${label} completed`); load(); }
  }

  async function evaluateGates() {
    setRunning("gates");
    const { error } = await supabase.rpc("evaluate_module_gates" as any);
    setRunning(null);
    if (error) toast.error(`Gate evaluation failed: ${error.message}`);
    else { toast.success("Gates re-evaluated"); load(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => run("landing-quality-audit", "Landing audit")} disabled={running !== null}>
          {running === "landing-quality-audit" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Run landing audit
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("product-quality-rollup", "Product rollup")} disabled={running !== null}>
          {running === "product-quality-rollup" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Run product rollup
        </Button>
        <Button size="sm" variant="outline" onClick={evaluateGates} disabled={running !== null}>
          {running === "gates" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Re-evaluate gates
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Module activation gates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {gates.length === 0 && <div className="text-sm text-muted-foreground">No gates registered.</div>}
          {gates.map((g) => {
            const pctSamples = Math.min(100, (g.current_samples / Math.max(1, g.required_samples)) * 100);
            const pctConf = Math.min(100, (g.current_confidence / Math.max(0.01, g.required_confidence)) * 100);
            return (
              <div key={g.module_key} className="border rounded-md p-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {g.is_active
                      ? <Unlock className="w-4 h-4 text-emerald-500" />
                      : <Lock className="w-4 h-4 text-muted-foreground" />}
                    <span className="font-mono text-sm">{g.module_key}</span>
                    <Badge variant="outline" className="text-xs">{g.category}</Badge>
                    {g.is_active
                      ? <Badge className="bg-emerald-600 text-white">ACTIVE</Badge>
                      : <Badge variant="secondary">LOCKED — awaiting evidence</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{g.description}</p>
                  <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-4">
                    <div>
                      Samples {g.current_samples}/{g.required_samples}
                      <div className="h-1.5 bg-muted rounded mt-0.5">
                        <div className="h-full bg-primary rounded" style={{ width: `${pctSamples}%` }} />
                      </div>
                    </div>
                    <div>
                      Confidence {(g.current_confidence * 100).toFixed(0)}%/{(g.required_confidence * 100).toFixed(0)}%
                      <div className="h-1.5 bg-muted rounded mt-0.5">
                        <div className="h-full bg-primary rounded" style={{ width: `${pctConf}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Landing quality (last audits)</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-auto">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {!loading && landings.length === 0 && <div className="text-sm text-muted-foreground">No audits yet. Click "Run landing audit".</div>}
            {landings.map((r) => (
              <div key={r.url + r.audited_at} className="border rounded p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-mono truncate">{r.url}</span>
                  <Badge variant={r.overall_score >= 70 ? "default" : "destructive"}>{Math.round(r.overall_score)}</Badge>
                </div>
                <div className="text-muted-foreground mt-1">
                  T{Math.round(r.trust_score)} · C{Math.round(r.clarity_score)} · S{Math.round(r.speed_score)} · P{Math.round(r.pinterest_consistency_score)} · n={r.sample_size}
                </div>
                {r.issues?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.issues.map((i, k) => <Badge key={k} variant="outline" className="text-[10px]">{i.code}</Badge>)}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Product quality (rollup)</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-auto">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {!loading && products.length === 0 && <div className="text-sm text-muted-foreground">No rollups yet. Click "Run product rollup".</div>}
            {products.map((r) => (
              <div key={r.product_id + r.computed_at} className="border rounded p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-mono truncate">{r.product_id.slice(0, 8)}</span>
                  <Badge variant={r.overall_score >= 70 ? "default" : "destructive"}>{Math.round(r.overall_score)}</Badge>
                </div>
                <div className="text-muted-foreground mt-1">
                  PDP{Math.round(r.pdp_health_score)} · DNA{Math.round(r.creative_dna_score)} · W{Math.round(r.winner_score)} · n={r.sample_size}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}