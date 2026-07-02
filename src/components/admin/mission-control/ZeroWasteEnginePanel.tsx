import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, ShieldCheck, Zap, RefreshCw } from "lucide-react";

type Row = {
  pins_today: number; rejects_today: number; total_today: number;
  pins_7d: number; rejects_7d: number; total_7d: number;
  reject_pct_7d: number; reject_pct_today: number;
  images_today: number; credits_per_pin_estimate: number | null;
  pre_gen_blocks: number; dna_blocks: number; prompt_blocks: number; budget_blocks: number;
  credits_saved: number;
  gateway_state: string | null; paused: boolean | null;
  credits_remaining: number | null; daily_cap_hard: number | null;
  rolling_reject_rate_100: number | null; projected_waste_pct: number | null;
  zero_waste_v2_shadow: boolean | null;
};

function Tile({ label, value, hint, tone = "default" }: {
  label: string; value: string | number; hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const cls = tone === "good" ? "text-emerald-600"
    : tone === "warn" ? "text-amber-600"
    : tone === "bad" ? "text-red-600"
    : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}

export default function ZeroWasteEnginePanel() {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("v_zero_waste_dashboard").select("*").maybeSingle();
    setRow((data as Row) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 60_000); return () => clearInterval(iv); }, [load]);

  const reject7d = row?.reject_pct_7d ?? 0;
  const rejectToday = row?.reject_pct_today ?? 0;
  const cpp = row?.credits_per_pin_estimate;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Zero-Waste Pinterest AI Engine V2
          {row?.zero_waste_v2_shadow ? (
            <Badge variant="outline" className="ml-2">SHADOW</Badge>
          ) : (
            <Badge className="ml-2 bg-emerald-600">ENFORCING</Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Tile label="Reject % 7d" value={`${reject7d}%`}
            tone={reject7d < 10 ? "good" : reject7d < 30 ? "warn" : "bad"}
            hint={`Target <10% · today ${rejectToday}%`} />
          <Tile label="Credits / pin" value={cpp ?? "—"}
            tone={cpp == null ? "default" : cpp < 2 ? "good" : cpp < 5 ? "warn" : "bad"}
            hint="Target <2" />
          <Tile label="Pins today" value={row?.pins_today ?? 0} hint={`${row?.pins_7d ?? 0} in 7d`} />
          <Tile label="Images today" value={row?.images_today ?? 0}
            hint={`cap ${row?.daily_cap_hard ?? "—"}`} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Tile label="Credits saved 7d" value={(row?.credits_saved ?? 0).toFixed(2)} tone="good"
            hint="from V2 blocks" />
          <Tile label="Pre-gen blocks" value={row?.pre_gen_blocks ?? 0}
            hint="Success prob <95" />
          <Tile label="DNA blocks" value={row?.dna_blocks ?? 0} hint=">20% match" />
          <Tile label="Budget blocks" value={row?.budget_blocks ?? 0} hint="Buffer/gateway" />
        </div>
        <div className="flex flex-wrap gap-4 items-center text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            Gateway: <span className="font-medium text-foreground">{row?.gateway_state ?? "—"}</span>
            {row?.paused ? <Badge variant="destructive" className="ml-1">PAUSED</Badge> : null}
          </div>
          <div className="flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            Credits remaining: <span className="font-medium text-foreground">{row?.credits_remaining ?? "—"}</span>
          </div>
          <div>Rolling reject (100): {row?.rolling_reject_rate_100 ?? 0}%</div>
          <div>Projected waste: {row?.projected_waste_pct ?? 0}%</div>
        </div>
      </CardContent>
    </Card>
  );
}