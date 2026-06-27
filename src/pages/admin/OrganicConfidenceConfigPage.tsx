import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

type Model = {
  id: string; version: number; name: string; description: string | null;
  reason: string | null; status: "draft" | "active" | "archived" | "experimental";
  weights: Record<string, number>;
  negative_weights: Record<string, number>;
  thresholds: any;
  market_demand_boost: number;
  parent_version: number | null;
  activated_at: string | null;
  archived_at: string | null;
  created_at: string;
};

const POSITIVE_SIGNALS = [
  "organic_visitors","organic_engagement","organic_conversion","organic_revenue",
  "returning_quality","paid_independence","organic_pinterest_clicks","organic_saves",
  "organic_product_views","organic_add_to_cart","organic_checkout","organic_purchases",
  "organic_revenue_per_visitor","organic_conversion_trend","historical_stability",
  "trend_strength","pinterest_trend_alignment","pinterest_predicts_alignment",
  "google_trend_alignment","seasonality","inventory_health","review_quality",
  "customer_satisfaction","us_availability","brand_consistency","content_quality",
  "creative_diversity","category_health","product_age","growth_velocity","confidence_stability",
];
const NEGATIVE_SIGNALS = [
  "bounce_rate","high_paid_dependence","declining_organic_trend","low_scroll_depth",
  "weak_conversion","inventory_risk","shipping_risk","high_refund_risk","low_trust",
  "creative_fatigue","content_saturation",
];

async function call(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("organic-confidence-config", {
    body: { action, ...body },
  });
  if (error) throw error;
  return data as any;
}

function weightsForm(values: Record<string, number>, setValues: (v: Record<string, number>) => void, keys: string[]) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {keys.map((k) => {
        const v = Number(values[k] ?? 0);
        return (
          <div key={k} className="flex items-center gap-3 border rounded-md p-2">
            <div className="w-56 text-sm font-mono">{k}</div>
            <Slider min={0} max={1} step={0.01} value={[v]}
              onValueChange={([nv]) => setValues({ ...values, [k]: Number(nv.toFixed(2)) })}
              className="flex-1" />
            <Input type="number" step="0.01" min={0} max={1} value={v}
              onChange={(e) => setValues({ ...values, [k]: Number(e.target.value) })}
              className="w-24" />
          </div>
        );
      })}
    </div>
  );
}

export default function OrganicConfidenceConfigPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [active, setActive] = useState<Model | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Model | null>(null);
  const [reason, setReason] = useState("");
  const [changeLog, setChangeLog] = useState<any[]>([]);
  const [accuracy, setAccuracy] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [simulation, setSimulation] = useState<any>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [list, act, log, acc, sug] = await Promise.all([
        call("list"), call("active"), call("change_log", { limit: 50 }),
        call("accuracy", { days: 30 }), call("suggest"),
      ]);
      setModels(list.models ?? []);
      setActive(act.model ?? null);
      setChangeLog(log.entries ?? []);
      setAccuracy(acc.accuracy ?? null);
      setSuggestions(sug.suggestions ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const positiveKeys = useMemo(() => {
    const fromActive = Object.keys(active?.weights ?? {});
    return Array.from(new Set([...POSITIVE_SIGNALS, ...fromActive]));
  }, [active]);
  const negativeKeys = useMemo(() => {
    const fromActive = Object.keys(active?.negative_weights ?? {});
    return Array.from(new Set([...NEGATIVE_SIGNALS, ...fromActive]));
  }, [active]);

  const cloneActiveAsDraft = () => {
    if (!active) return;
    setDraft({
      ...active, id: "", version: 0, status: "draft",
      weights: { ...active.weights },
      negative_weights: { ...active.negative_weights },
      name: `Draft based on v${active.version}`,
      description: null, reason: null, parent_version: active.version,
      activated_at: null, archived_at: null, created_at: new Date().toISOString(),
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    try {
      const body = {
        name: draft.name, description: draft.description, reason: reason || draft.reason,
        weights: draft.weights, negative_weights: draft.negative_weights,
        thresholds: draft.thresholds, market_demand_boost: draft.market_demand_boost,
        parent_version: draft.parent_version,
      };
      const res = draft.id
        ? await call("update_draft", { id: draft.id, ...body })
        : await call("create_draft", body);
      setDraft(res.model);
      toast.success(`Draft v${res.model.version} saved`);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const activateDraft = async () => {
    if (!draft?.id) { toast.error("Save the draft first"); return; }
    if (!confirm(`Activate model v${draft.version}? Current active model will be archived.`)) return;
    try {
      await call("activate", { id: draft.id, reason });
      toast.success(`Model v${draft.version} activated`);
      setDraft(null); setReason(""); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const rollbackTo = async (m: Model) => {
    if (!confirm(`Rollback to v${m.version}?`)) return;
    try { await call("rollback", { to_version: m.version, reason: reason || "operator rollback" });
      toast.success(`Rolled back to v${m.version}`); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const simulate = async () => {
    if (!draft) return;
    try {
      const res = await call("simulate", { model: {
        weights: draft.weights, negative_weights: draft.negative_weights,
        thresholds: draft.thresholds, market_demand_boost: draft.market_demand_boost,
      }, days: 30 });
      setSimulation(res.simulation);
      toast.success("Simulation complete (not persisted)");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <Helmet><title>Organic Confidence Config · Admin</title></Helmet>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Organic Confidence Engine</h1>
            <p className="text-sm text-muted-foreground">Configurable · Versioned · Self-learning · Single source of truth.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>Refresh</Button>
            <Button onClick={cloneActiveAsDraft} disabled={!active}>New draft from active</Button>
          </div>
        </div>

        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active Model</TabsTrigger>
            <TabsTrigger value="draft">Editor / Simulation</TabsTrigger>
            <TabsTrigger value="history">Versions</TabsTrigger>
            <TabsTrigger value="accuracy">Accuracy &amp; Learning</TabsTrigger>
            <TabsTrigger value="log">Change Log</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {active ? <>Model v{active.version} — {active.name}</> : "No active model"}
                  {active && <Badge variant="default">active</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {active && (
                  <>
                    <div className="text-sm text-muted-foreground">{active.description ?? "—"}</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(active.weights).map(([k, v]) => (
                        <div key={k} className="border rounded-md p-2 text-sm flex justify-between">
                          <span className="font-mono">{k}</span><span className="font-semibold">{Number(v).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    {active.negative_weights && Object.keys(active.negative_weights).length > 0 && (
                      <>
                        <Separator />
                        <div className="text-sm font-semibold">Negative signals</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(active.negative_weights).map(([k, v]) => (
                            <div key={k} className="border rounded-md p-2 text-sm flex justify-between">
                              <span className="font-mono">{k}</span><span className="font-semibold text-destructive">-{Number(v).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="text-xs text-muted-foreground">
                      market_demand_boost = {active.market_demand_boost} · activated_at = {active.activated_at ?? "—"}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="draft" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{draft ? `Editing ${draft.id ? `v${draft.version}` : "new draft"}` : "No draft loaded"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!draft && (
                  <Button onClick={cloneActiveAsDraft} disabled={!active}>Start from active model</Button>
                )}
                {draft && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Name</Label>
                        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Market demand boost</Label>
                        <Input type="number" step="0.5" value={draft.market_demand_boost}
                          onChange={(e) => setDraft({ ...draft, market_demand_boost: Number(e.target.value) })} />
                      </div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                    </div>
                    <div>
                      <Label>Reason for this version (audit trail)</Label>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. boost conversion weight after Q4 analysis" />
                    </div>

                    <Separator />
                    <div className="text-sm font-semibold">Positive signal weights (0..1)</div>
                    {weightsForm(draft.weights, (w) => setDraft({ ...draft, weights: w }), positiveKeys)}

                    <Separator />
                    <div className="text-sm font-semibold">Negative signal weights (0..1, subtracted)</div>
                    {weightsForm(draft.negative_weights ?? {}, (w) => setDraft({ ...draft, negative_weights: w }), negativeKeys)}

                    <div className="flex gap-2 pt-2">
                      <Button onClick={saveDraft}>Save draft</Button>
                      <Button variant="outline" onClick={simulate}>Simulate (30d)</Button>
                      <Button variant="default" onClick={activateDraft} disabled={!draft.id}>Activate</Button>
                      <Button variant="ghost" onClick={() => { setDraft(null); setSimulation(null); }}>Discard</Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {simulation && (
              <Card>
                <CardHeader><CardTitle>Simulation (not persisted)</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-sm">
                    Global score: <span className="font-semibold">{simulation?.global?.confidence?.score ?? simulation?.global?.score ?? "—"}</span>
                    {" "}vs active model. Recommendations are unchanged until activation.
                  </div>
                  <ScrollArea className="h-64 mt-3">
                    <pre className="text-xs">{JSON.stringify(simulation, null, 2)}</pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {models.map((m) => (
              <Card key={m.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">v{m.version}</span> — {m.name}
                      <Badge variant={m.status === "active" ? "default" : m.status === "draft" ? "secondary" : "outline"}>{m.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.description ?? "—"} · created {new Date(m.created_at).toLocaleString()}
                      {m.parent_version != null && ` · parent v${m.parent_version}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDraft({ ...m, id: "", status: "draft", parent_version: m.version, name: `Draft based on v${m.version}` })}>Fork</Button>
                    {m.status !== "active" && (
                      <Button variant="outline" size="sm" onClick={() => rollbackTo(m)}>Activate</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="accuracy" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Prediction accuracy (30d)</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div>Samples: <span className="font-semibold">{accuracy?.samples ?? 0}</span></div>
                <div>MAE: <span className="font-semibold">{accuracy?.mean_absolute_error?.toFixed?.(2) ?? "—"}</span></div>
                <div>Bias: <span className="font-semibold">{accuracy?.bias?.toFixed?.(2) ?? "—"}</span> (positive = overestimating)</div>
                {accuracy?.by_entity && (
                  <pre className="text-xs bg-muted rounded p-2">{JSON.stringify(accuracy.by_entity, null, 2)}</pre>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Suggested weight adjustments</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {suggestions.length === 0 && <div className="text-muted-foreground">No suggestions — bias within tolerance.</div>}
                {suggestions.map((s, i) => (
                  <div key={i} className="border rounded p-2 mb-2">
                    <div className="font-mono">{s.key}: {Number(s.from).toFixed(2)} → {Number(s.to).toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">{s.reason}</div>
                  </div>
                ))}
                <div className="text-xs text-muted-foreground mt-2">Suggestions are never auto-applied. Operator approval required.</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="log">
            <Card>
              <CardHeader><CardTitle>Change log</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[480px]">
                  {changeLog.map((e) => (
                    <div key={e.id} className="border-b py-2 text-sm">
                      <div className="flex justify-between">
                        <span><Badge variant="outline">{e.action}</Badge> v{e.model_version ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                      </div>
                      {e.reason && <div className="text-xs text-muted-foreground">reason: {e.reason}</div>}
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}