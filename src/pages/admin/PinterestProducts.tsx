import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { ConfirmAiCostDialog } from "@/components/admin/ConfirmAiCostDialog";
import { assessCostAsync, estimatePipelineCredits, type CostAssessment } from "@/lib/aiPricing";

type Decision = {
  product_id: string;
  product_name?: string;
  product_slug?: string;
  action: string;
  total_score: number;
  hook?: string;
  board?: string;
  reason?: string;
  score_breakdown?: Record<string, number>;
};

export default function PinterestProducts() {
  const [rows, setRows] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<CostAssessment | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-autopilot", {
        body: { action: "score", limit: 25 },
      });
      if (error) throw error;
      const ranked: Decision[] = ((data as any)?.decisions || (data as any)?.results || [])
        .slice()
        .sort((a: any, b: any) => (b.total_score || 0) - (a.total_score || 0))
        .slice(0, 25);
      setRows(ranked);
    } catch (e: any) {
      toast.error(e?.message || "Failed to score products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const requestPromote = async (productId: string) => {
    const a = await assessCostAsync(estimatePipelineCredits("pinterest_creative_director", 1));
    setAssessment(a);
    setPendingId(productId);
    setConfirmOpen(true);
  };

  const promote = async (productId: string) => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("pinterest-creative-director", {
        body: { productId, dryRun: false },
      });
      if (error) throw error;
      toast.success("Promotion queued (drafts) — review in Pin Status");
    } catch (e: any) {
      toast.error(e?.message || "Promote failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <Helmet><title>Pinterest Top 25 Products — Admin</title></Helmet>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest Top 25 Products</h1>
          <p className="text-sm text-muted-foreground">Auto-scored by image, margin, category fit, performance.</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
          Rescore
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2 w-10">#</th>
                <th className="text-left p-2">Product</th>
                <th className="text-right p-2">Score</th>
                <th className="text-left p-2">Breakdown</th>
                <th className="text-left p-2">Hook · Board</th>
                <th className="text-left p-2">Action</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Scoring…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No products scored.</td></tr>
              ) : rows.map((d, i) => (
                <tr key={d.product_id} className="border-t hover:bg-muted/30">
                  <td className="p-2 text-muted-foreground">{i + 1}</td>
                  <td className="p-2">
                    <div className="font-medium">{d.product_name || d.product_slug || d.product_id}</div>
                    <div className="text-xs text-muted-foreground font-mono">{d.product_id}</div>
                  </td>
                  <td className="p-2 text-right font-semibold">{Math.round(d.total_score || 0)}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {d.score_breakdown
                      ? Object.entries(d.score_breakdown).map(([k, v]) => `${k}:${Math.round(v as number)}`).join(" · ")
                      : "—"}
                  </td>
                  <td className="p-2 text-xs">{d.hook || "—"} · {d.board || "—"}</td>
                  <td className="p-2">
                    <Badge variant={d.action === "scale" ? "default" : d.action === "pause" || d.action === "skip" ? "secondary" : "outline"}>
                      {d.action}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" disabled={running} onClick={() => requestPromote(d.product_id)}>
                      <Sparkles className="h-3 w-3 mr-1" /> Promote
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {assessment && (
        <ConfirmAiCostDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Promote product to Pinterest Creative Director"
          productCount={1}
          assessment={assessment}
          confirmLabel="Promote"
          onConfirm={() => {
            setConfirmOpen(false);
            if (pendingId) void promote(pendingId);
          }}
        />
      )}
    </div>
  );
}