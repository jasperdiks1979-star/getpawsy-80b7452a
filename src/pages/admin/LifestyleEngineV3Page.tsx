import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Config = {
  enabled: boolean;
  concepts_per_product: number;
  min_accepted_class: "A" | "B" | "C";
  max_attempts_per_concept: number;
  target_a_share: number;
  image_model: string;
  image_size: string;
  vision_model: string;
  daily_credit_budget: number;
  pilot_product_limit: number;
  estimated_credits_per_image: number;
  estimated_credits_per_vision: number;
  notes: string | null;
};

export default function LifestyleEngineV3Page() {
  const [config, setConfig] = useState<Config | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [counts, setCounts] = useState<{ A: number; B: number; C: number; total: number }>({
    A: 0, B: 0, C: 0, total: 0,
  });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [{ data: cfg }, { data: r }, { data: cls }] = await Promise.all([
      supabase.from("pinterest_lifestyle_engine_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("pinterest_lifestyle_runs").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("pinterest_lifestyle_concepts").select("quality_class"),
    ]);
    if (cfg) setConfig(cfg as any);
    setRuns(r ?? []);
    const tally = { A: 0, B: 0, C: 0, total: cls?.length ?? 0 };
    (cls ?? []).forEach((x: any) => {
      if (x.quality_class === "A") tally.A++;
      else if (x.quality_class === "B") tally.B++;
      else if (x.quality_class === "C") tally.C++;
    });
    setCounts(tally);
  }

  useEffect(() => { refresh(); }, []);

  async function saveConfig(patch: Partial<Config>) {
    if (!config) return;
    setBusy(true);
    const { error } = await supabase
      .from("pinterest_lifestyle_engine_config").update(patch).eq("id", 1);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Config saved"); refresh(); }
  }

  async function trigger(mode: "pilot" | "dry_run", force = false) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("lifestyle-engine-run", {
      body: { mode, dry_run: mode === "dry_run", force },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else if ((data as any)?.killed) toast.warning(`Killed: ${(data as any).reason}`);
    else toast.success(`Run ${(data as any)?.run_id?.slice(0, 8)} — ${(data as any)?.concepts_planned} concepts, est ${(data as any)?.estimated_credits} credits`);
    refresh();
  }

  if (!config) return <div className="p-6">Loading…</div>;

  const aShare = counts.total ? Math.round((counts.A / counts.total) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Premium Lifestyle Engine V3</h1>
        <p className="text-muted-foreground">
          Generates Pinterest-native lifestyle creatives. Disabled by default — flip the switch only after credit top-up.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Master switch
            <Badge variant={config.enabled ? "default" : "secondary"}>
              {config.enabled ? "ENABLED" : "DISABLED"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => saveConfig({ enabled: v })}
              disabled={busy}
            />
            <span className="text-sm">LIFESTYLE_ENGINE_ENABLED</span>
          </div>
          <p className="text-xs text-muted-foreground">
            While off, both orchestrator and render worker exit immediately with{" "}
            <code>killed:engine_disabled</code> and consume zero AI credits.
          </p>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Quality gate</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Concepts per product" value={config.concepts_per_product}
              onSave={(v) => saveConfig({ concepts_per_product: Number(v) })} />
            <Field label="Min accepted class (A/B/C)" value={config.min_accepted_class}
              onSave={(v) => saveConfig({ min_accepted_class: v as any })} />
            <Field label="Max attempts per concept" value={config.max_attempts_per_concept}
              onSave={(v) => saveConfig({ max_attempts_per_concept: Number(v) })} />
            <Field label="Target A share (0-1)" value={config.target_a_share}
              onSave={(v) => saveConfig({ target_a_share: Number(v) })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Models & budget</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Image model" value={config.image_model}
              onSave={(v) => saveConfig({ image_model: v })} />
            <Field label="Image size" value={config.image_size}
              onSave={(v) => saveConfig({ image_size: v })} />
            <Field label="Vision model" value={config.vision_model}
              onSave={(v) => saveConfig({ vision_model: v })} />
            <Field label="Daily credit budget" value={config.daily_credit_budget}
              onSave={(v) => saveConfig({ daily_credit_budget: Number(v) })} />
            <Field label="Pilot product limit" value={config.pilot_product_limit}
              onSave={(v) => saveConfig({ pilot_product_limit: Number(v) })} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Quality distribution</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-4">
          <Stat label="A (premium)" value={counts.A} accent="text-green-600" />
          <Stat label="B (acceptable)" value={counts.B} accent="text-amber-600" />
          <Stat label="C (catalog)" value={counts.C} accent="text-red-600" />
          <Stat label="A share" value={`${aShare}%`} accent={aShare >= 80 ? "text-green-600" : "text-red-600"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Trigger</CardTitle></CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button onClick={() => trigger("dry_run")} disabled={busy} variant="secondary">
            Dry run (no AI calls)
          </Button>
          <Button onClick={() => trigger("pilot")} disabled={busy || !config.enabled}>
            Run pilot ({config.pilot_product_limit} products)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground">
              <th>When</th><th>Mode</th><th>Status</th><th>Planned</th><th>Done</th><th>A/B/C</th><th>Credits</th>
            </tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.mode}</td>
                  <td>{r.status}</td>
                  <td>{r.concepts_planned}</td>
                  <td>{r.concepts_attempted}</td>
                  <td>{r.class_a_count}/{r.class_b_count}/{r.class_c_count}</td>
                  <td>{Number(r.credits_spent).toFixed(2)}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr><td colSpan={7} className="text-muted-foreground py-4">No runs yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onSave }: { label: string; value: any; onSave: (v: string) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Label className="text-xs">{label}</Label>
        <Input value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <Button size="sm" variant="outline" onClick={() => onSave(v)}>Save</Button>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div>
      <div className={`text-3xl font-bold ${accent ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
