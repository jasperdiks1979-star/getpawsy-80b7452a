import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Brain } from "lucide-react";

type Snap = {
  mode: "first_sale" | "growth";
  mode_set_at?: string | null;
  briefing?: any;
  directors?: { key: string; advisors: any[] }[];
};

const LABELS: Record<string,string> = {
  ceo:"CEO", cmo:"CMO", creative:"Creative Director", pinterest:"Pinterest Director",
  merchandising:"Merchandising", conversion:"Conversion", customer:"Customer Intelligence",
  market:"Market Intelligence", revenue:"Revenue Director", learning:"Learning Director",
};

export function ExecutiveOSCard() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.functions.invoke("gv4-executive-os?action=snapshot");
    if (data?.ok) setSnap(data as Snap);
  };
  useEffect(() => { load(); }, []);

  const runCycle = async () => {
    setBusy(true);
    try {
      await supabase.functions.invoke("gv4-executive-os?action=cycle", { body: {} });
      await load();
    } finally { setBusy(false); }
  };

  if (!snap) return (
    <Card><CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/> Loading Executive OS…</CardContent></Card>
  );

  const b = snap.briefing;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <CardTitle>Genesis V4 — Executive OS</CardTitle>
          <Badge variant={snap.mode === "growth" ? "default" : "secondary"}>
            {snap.mode === "growth" ? "GROWTH MODE" : "FIRST SALE MODE"}
          </Badge>
        </div>
        <Button size="sm" onClick={runCycle} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4"/>}
          <span className="ml-1">Run cycle</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {snap.directors?.map(d => {
            const reliab = d.advisors.length ? (d.advisors.reduce((s,a)=>s+(a.reliability_score||0),0)/d.advisors.length) : 0;
            return (
              <div key={d.key} className="border rounded p-2">
                <div className="text-xs font-medium">{LABELS[d.key] ?? d.key}</div>
                <div className="text-[11px] text-muted-foreground">{d.advisors.length} advisor(s)</div>
                <div className="text-[11px]">reliability {Math.round(reliab*100)}%</div>
              </div>
            );
          })}
        </div>
        {b ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Briefing for {b.for_date}</div>
            <ul className="text-sm list-disc pl-5 space-y-1">
              {(b.bullets ?? []).slice(0,10).map((x:string,i:number)=><li key={i}>{x}</li>)}
            </ul>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
              <span>Expected revenue (window): ${(((b.estimated_monthly_revenue_cents||0)/100)).toLocaleString()}</span>
              <span>Council confidence: {Math.round((b.estimated_confidence||0)*100)}%</span>
              <span>Founder action: {b.required_founder_action || "None"}</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No briefing yet — click <em>Run cycle</em>.</div>
        )}
      </CardContent>
    </Card>
  );
}