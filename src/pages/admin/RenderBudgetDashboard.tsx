import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type BudgetRow = {
  product_slug: string;
  last_expensive_render_at: string;
  render_count_24h: number;
  force_override_count: number;
  last_force_at: string | null;
  last_force_by: string | null;
  updated_at: string;
  reset_at: string;
  seconds_until_reset: number;
  currently_blocked: boolean;
};

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "unlocked";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function RenderBudgetDashboard() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cinematic_ad_render_budget_status" as any)
      .select("*")
      .order("last_expensive_render_at", { ascending: false });
    if (error) toast.error(`Failed to load: ${error.message}`);
    setRows((data as any as BudgetRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearBudget(slug: string) {
    if (!confirm(`Clear the 24h render budget for "${slug}"?\n\nThis lets a new expensive render run immediately for this product. The override is logged.`)) return;
    setClearing(slug);
    const { error } = await supabase.rpc("cinematic_clear_render_budget" as any, {
      p_product_slug: slug,
      p_reason: "admin_dashboard_manual_clear",
    });
    setClearing(null);
    if (error) { toast.error(`Clear failed: ${error.message}`); return; }
    toast.success(`Budget cleared for ${slug}`);
    load();
  }

  const blocked = rows.filter((r) => r.currently_blocked);
  const free = rows.filter((r) => !r.currently_blocked);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Helmet><title>Render Budget — Admin</title></Helmet>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cinematic Render Budget</h1>
        <p className="text-sm text-muted-foreground">
          1 expensive render per product per 24h. Override per-run from{" "}
          <Link to="/admin/pinterest-ad-studio" className="text-primary hover:underline">Pinterest Ad Studio</Link>,
          or clear a product's budget here.
        </p>
      </header>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> {blocked.length} currently blocked</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> {free.length} unlocked</span>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Currently blocked ({blocked.length})</CardTitle></CardHeader>
        <CardContent>
          {blocked.length === 0 ? (
            <div className="text-sm text-muted-foreground">No products are currently inside the 24h cap.</div>
          ) : (
            <div className="space-y-2">
              {blocked.map((r) => (
                <div key={r.product_slug} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-amber-500/5">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.product_slug}</div>
                    <div className="text-xs text-muted-foreground">
                      Last render {formatTimestamp(r.last_expensive_render_at)} · resets at{" "}
                      <span className="text-amber-700 dark:text-amber-400 font-medium">{formatTimestamp(r.reset_at)}</span>{" "}
                      ({formatCountdown(r.seconds_until_reset)} left)
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      24h count: {r.render_count_24h} · force overrides: {r.force_override_count}
                      {r.last_force_at ? ` · last force ${formatTimestamp(r.last_force_at)}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clearing === r.product_slug}
                    onClick={() => clearBudget(r.product_slug)}
                  >
                    {clearing === r.product_slug ? <Loader2 className="w-3 h-3 animate-spin" /> : "Clear budget"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Unlocked / past 24h ({free.length})</CardTitle></CardHeader>
        <CardContent>
          {free.length === 0 ? (
            <div className="text-sm text-muted-foreground">No history yet.</div>
          ) : (
            <div className="space-y-1 text-xs">
              {free.map((r) => (
                <div key={r.product_slug} className="flex items-center justify-between p-2 rounded border">
                  <span className="font-medium truncate">{r.product_slug}</span>
                  <span className="text-muted-foreground">
                    Last {formatTimestamp(r.last_expensive_render_at)} · {r.render_count_24h} renders · {r.force_override_count} forced
                  </span>
                  <Badge variant="outline" className="text-[10px]">unlocked</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}