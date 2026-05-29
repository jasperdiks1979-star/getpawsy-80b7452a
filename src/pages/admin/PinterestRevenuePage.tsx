import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, DollarSign } from "lucide-react";

export default function PinterestRevenuePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("pinterest-intelligence-api", {
          body: { panel: "revenue" },
        });
        if (error) throw error;
        setData(res);
      } catch (e: any) {
        setErr(e?.message || "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byProduct: any[] = data?.byProduct || data?.by_product || [];
  const byBoard: any[] = data?.byBoard || data?.by_board || [];
  const total = data?.total || data?.totalRevenue || 0;

  return (
    <div className="p-6 space-y-4">
      <Helmet><title>Pinterest Revenue — Admin</title></Helmet>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><DollarSign className="h-5 w-5" /> Pinterest Revenue</h1>
          <p className="text-sm text-muted-foreground">Attribution last 30 days.</p>
        </div>
        <div className="text-2xl font-semibold">${Number(total).toFixed(2)}</div>
      </header>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading revenue…</div>
      ) : err ? (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-2 border-b font-semibold bg-muted/40">Revenue by product</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th className="p-2">Product</th><th className="p-2 text-right">Revenue</th><th className="p-2 text-right">Orders</th></tr></thead>
                <tbody>
                  {byProduct.length === 0 ? (
                    <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No attributed revenue yet.</td></tr>
                  ) : byProduct.slice(0, 20).map((r: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 text-xs font-mono">{r.product_id || r.product_name || r.name}</td>
                      <td className="p-2 text-right">${Number(r.revenue || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{r.orders || r.count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-2 border-b font-semibold bg-muted/40">Revenue by board</div>
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th className="p-2">Board</th><th className="p-2 text-right">Revenue</th></tr></thead>
                <tbody>
                  {byBoard.length === 0 ? (
                    <tr><td colSpan={2} className="p-4 text-center text-muted-foreground">No board-level attribution yet.</td></tr>
                  ) : byBoard.slice(0, 20).map((r: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.board_name || r.board_id}</td>
                      <td className="p-2 text-right">${Number(r.revenue || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}