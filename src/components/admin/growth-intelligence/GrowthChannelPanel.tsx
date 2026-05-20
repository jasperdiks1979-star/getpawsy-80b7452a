import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type BudgetRow = {
  channel: "pinterest" | "tiktok" | "google_ads";
  daily_budget: number;
  allocated: number;
  share_pct: number;
  autopilot: boolean;
  last_allocation_at: string | null;
  meta: any;
};

const LABEL: Record<string, string> = {
  pinterest: "Pinterest",
  tiktok: "TikTok (organic)",
  google_ads: "Google Ads",
};

export function GrowthChannelPanel() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("growth_channel_budget" as any)
      .select("*")
      .order("channel");
    setRows((data as any as BudgetRow[]) ?? []);
  }

  useEffect(() => { void load(); }, []);

  async function callFn(name: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(name);
      if (error) throw error;
      toast.success(`${name} ok`, { description: JSON.stringify(data).slice(0, 140) });
      await load();
    } catch (e: any) {
      toast.error(name, { description: e.message ?? String(e) });
    } finally { setLoading(false); }
  }

  async function saveRow(r: BudgetRow, patch: Partial<BudgetRow>) {
    const next = { ...r, ...patch };
    setRows((prev) => prev.map((p) => (p.channel === r.channel ? next : p)));
    const { error } = await supabase
      .from("growth_channel_budget" as any)
      .update({ daily_budget: next.daily_budget, autopilot: next.autopilot })
      .eq("channel", r.channel);
    if (error) toast.error("save failed", { description: error.message });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Multi-Channel Routing</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={loading} onClick={() => callFn("growth-channel-ingest")}>
            Ingest signals
          </Button>
          <Button size="sm" disabled={loading} onClick={() => callFn("growth-channel-allocator")}>
            Re-allocate budget
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {rows.map((r) => {
            const perf = r.meta?.perf ?? {};
            const roas = perf.spend > 0 ? (perf.rev / perf.spend).toFixed(2) : "—";
            return (
              <div key={r.channel} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{LABEL[r.channel]}</h3>
                  <Badge variant={r.autopilot ? "default" : "secondary"}>
                    {(r.share_pct * 100).toFixed(0)}%
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                  <span>Imp: {perf.imp ?? 0}</span>
                  <span>Clk: {perf.clk ?? 0}</span>
                  <span>Conv: {perf.conv ?? 0}</span>
                  <span>ROAS: {roas}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs">Daily $</label>
                  <Input
                    type="number"
                    className="h-8 w-24"
                    value={r.daily_budget}
                    onChange={(e) => saveRow(r, { daily_budget: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs">Autopilot</label>
                  <Switch
                    checked={r.autopilot}
                    onCheckedChange={(v) => saveRow(r, { autopilot: !!v })}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Allocated: <span className="font-mono">${r.allocated.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">No channels configured yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default GrowthChannelPanel;