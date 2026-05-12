import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Skull } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function GuardrailsTab() {
  const [busy, setBusy] = useState(false);
  const [minTrials, setMinTrials] = useState(200);
  const [killCtr, setKillCtr] = useState(0.005);
  const [maxPin, setMaxPin] = useState(8);
  const [maxTt, setMaxTt] = useState(6);
  const [result, setResult] = useState<any>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-arm-guardrails", {
        body: { dry_run: dryRun, min_trials: minTrials, kill_ctr: killCtr, max_pinterest_per_day: maxPin, max_tiktok_per_day: maxTt },
      });
      if (error) throw error;
      setResult(data);
      toast.success(dryRun ? "Preview ready" : "Guardrails applied");
    } catch (e: any) { toast.error(`Guardrails failed: ${e?.message ?? e}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> Arm guardrails &amp; daily caps</CardTitle>
          <CardDescription>
            Auto-pause hook arms with too few wins after N trials, and enforce per-channel daily publish caps.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Min trials</Label><Input type="number" value={minTrials} onChange={(e) => setMinTrials(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Kill if E[CTR] &lt;</Label><Input type="number" step="0.001" value={killCtr} onChange={(e) => setKillCtr(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Max Pinterest / day</Label><Input type="number" value={maxPin} onChange={(e) => setMaxPin(Number(e.target.value))} /></div>
          <div><Label className="text-xs">Max TikTok / day</Label><Input type="number" value={maxTt} onChange={(e) => setMaxTt(Number(e.target.value))} /></div>
          <div className="col-span-full flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => run(true)} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview</Button>
            <Button size="sm" onClick={() => run(false)} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Skull className="h-3 w-3 mr-1" />} Apply</Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Verdicts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(result.verdicts ?? []).map((v: any) => (
                <div key={v.hook} className="flex items-center gap-3 text-sm border rounded-md p-2">
                  <span className="font-medium flex-1 truncate">{v.hook}</span>
                  <Badge variant="outline">{v.trials} trials</Badge>
                  <Badge variant="secondary">{(v.expected_ctr * 100).toFixed(2)}% E[CTR]</Badge>
                  <Badge variant={v.verdict === "kill" ? "destructive" : v.verdict === "watch" ? "secondary" : "default"}>{v.verdict}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Daily caps (UTC)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="border rounded-md p-3">
                <div className="font-medium mb-1">Pinterest</div>
                <div>{result.caps?.pinterest?.total ?? 0} / {result.caps?.pinterest?.max} scheduled · {result.caps?.pinterest?.paused ?? 0} paused</div>
              </div>
              <div className="border rounded-md p-3">
                <div className="font-medium mb-1">TikTok</div>
                <div>{result.caps?.tiktok?.total ?? 0} / {result.caps?.tiktok?.max} scheduled · {result.caps?.tiktok?.paused ?? 0} paused</div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}