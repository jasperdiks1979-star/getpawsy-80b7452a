import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Flame, Pause, Rocket, RefreshCw, DollarSign, Target, Zap } from "lucide-react";

type Settings = {
  blended_margin_pct: number;
  target_roas: number;
  min_impressions_kill: number;
  ctr_kill_pct: number;
  ctr_scale_pct: number;
  scale_budget_pct: number;
};

type PinPerf = {
  pin_id: string;
  product_id: string;
  pin_title: string | null;
  hook_angle: string | null;
  impressions: number;
  clicks: number;
  saves: number;
  ctr: number;
};

type Spend = {
  id: string;
  pin_id: string | null;
  product_id: string | null;
  campaign: string | null;
  spend: number;
  clicks: number;
  impressions: number;
  add_to_cart: number;
  purchases: number;
  revenue: number;
  entry_date: string;
};

type Verdict = "kill" | "pause" | "scale" | "watch";

function verdictFor(opts: {
  ctr: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  beCpc: number | null;
  hasAtc: boolean;
  s: Settings;
}): Verdict {
  const { ctr, impressions, clicks, cpc, beCpc, hasAtc, s } = opts;
  if (impressions >= s.min_impressions_kill && clicks === 0) return "kill";
  if (impressions >= s.min_impressions_kill && ctr * 100 < s.ctr_kill_pct) return "kill";
  if (cpc != null && beCpc != null && cpc > beCpc) return "pause";
  if (ctr * 100 > s.ctr_scale_pct && hasAtc) return "scale";
  return "watch";
}

const verdictMeta: Record<Verdict, { label: string; cls: string; icon: any }> = {
  kill: { label: "Kill", cls: "bg-red-600 text-white", icon: Flame },
  pause: { label: "Pause", cls: "bg-amber-500 text-white", icon: Pause },
  scale: { label: "Scale", cls: "bg-emerald-600 text-white", icon: Rocket },
  watch: { label: "Watch", cls: "bg-muted text-foreground", icon: Target },
};

export default function ProfitEnginePage() {
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ["profit-engine-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profit_engine_settings")
        .select("blended_margin_pct,target_roas,min_impressions_kill,ctr_kill_pct,ctr_scale_pct,scale_budget_pct")
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        blended_margin_pct: 35,
        target_roas: 2,
        min_impressions_kill: 500,
        ctr_kill_pct: 1,
        ctr_scale_pct: 2,
        scale_budget_pct: 75,
      }) as Settings;
    },
  });

  const pinsQ = useQuery({
    queryKey: ["pin-performance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_pin_performance")
        .select("pin_id,product_id,pin_title,hook_angle,impressions,clicks,saves,ctr")
        .order("impressions", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PinPerf[];
    },
  });

  const productsQ = useQuery({
    queryKey: ["pe-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,price,cost_price")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const spendQ = useQuery({
    queryKey: ["ad-spend"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_spend_entries")
        .select("*")
        .order("entry_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Spend[];
    },
  });

  const productMap = useMemo(() => {
    const m = new Map<string, { name: string; price: number; cost_price: number | null }>();
    (productsQ.data ?? []).forEach((p: any) =>
      m.set(p.id, { name: p.name, price: Number(p.price), cost_price: p.cost_price != null ? Number(p.cost_price) : null }),
    );
    return m;
  }, [productsQ.data]);

  const settings = settingsQ.data;

  // group spend by pin_id
  const spendByPin = useMemo(() => {
    const m = new Map<string, { spend: number; clicks: number; impressions: number; atc: number; purchases: number; revenue: number }>();
    (spendQ.data ?? []).forEach((s) => {
      if (!s.pin_id) return;
      const cur = m.get(s.pin_id) ?? { spend: 0, clicks: 0, impressions: 0, atc: 0, purchases: 0, revenue: 0 };
      cur.spend += Number(s.spend);
      cur.clicks += s.clicks;
      cur.impressions += s.impressions;
      cur.atc += s.add_to_cart;
      cur.purchases += s.purchases;
      cur.revenue += Number(s.revenue);
      m.set(s.pin_id, cur);
    });
    return m;
  }, [spendQ.data]);

  const rows = useMemo(() => {
    if (!settings) return [];
    return (pinsQ.data ?? []).map((p) => {
      const prod = productMap.get(p.product_id);
      const price = prod?.price ?? 0;
      const cost = prod?.cost_price ?? null;
      const marginUsd =
        price > 0 && cost != null
          ? price - cost
          : price * (settings.blended_margin_pct / 100);
      const beCpa = marginUsd > 0 ? marginUsd / settings.target_roas : null;
      // estimate CR from spend data if any, else fallback 1.5%
      const sp = spendByPin.get(p.pin_id);
      const cr = sp && sp.clicks > 0 ? sp.purchases / sp.clicks : 0.015;
      const beCpc = beCpa != null ? beCpa * cr : null;
      const cpc = sp && sp.clicks > 0 ? sp.spend / sp.clicks : null;
      const hasAtc = (sp?.atc ?? 0) > 0;
      const v = verdictFor({
        ctr: p.ctr,
        impressions: p.impressions,
        clicks: p.clicks,
        cpc,
        beCpc,
        hasAtc,
        s: settings,
      });
      return {
        ...p,
        productName: prod?.name ?? p.product_id,
        marginUsd,
        beCpa,
        beCpc,
        cpc,
        spend: sp?.spend ?? 0,
        revenue: sp?.revenue ?? 0,
        roas: sp && sp.spend > 0 ? sp.revenue / sp.spend : null,
        verdict: v,
      };
    });
  }, [pinsQ.data, productMap, settings, spendByPin]);

  const summary = useMemo(() => {
    const counts = { kill: 0, pause: 0, scale: 0, watch: 0 } as Record<Verdict, number>;
    let spend = 0, revenue = 0;
    rows.forEach((r) => {
      counts[r.verdict]++;
      spend += r.spend;
      revenue += r.revenue;
    });
    return { counts, spend, revenue, roas: spend > 0 ? revenue / spend : null };
  }, [rows]);

  const syncMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("profit-engine-sync");
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success(`Synced ${d?.updated ?? 0} pins (${d?.failed ?? 0} failed)`);
      qc.invalidateQueries({ queryKey: ["pin-performance"] });
    },
    onError: (e: any) => toast.error(`Sync failed: ${e.message ?? e}`),
  });

  const decideMut = useMutation({
    mutationFn: async (apply: boolean) => {
      const { data, error } = await supabase.functions.invoke("profit-engine-decide", {
        body: { apply },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      const c = d?.counts ?? {};
      toast.success(
        `Decided ${d?.message ?? ""} — kill ${c.kill ?? 0} · pause ${c.pause ?? 0} · scale ${c.scale ?? 0}`,
      );
      qc.invalidateQueries({ queryKey: ["profit-decisions"] });
    },
    onError: (e: any) => toast.error(`Decision run failed: ${e.message ?? e}`),
  });

  const decisionsQ = useQuery({
    queryKey: ["profit-decisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profit_engine_decisions")
        .select("*")
        .order("decided_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Helmet>
        <title>Profit Engine — GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profit Engine</h1>
          <p className="text-muted-foreground">Kill / pause / scale ads using break-even math.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMut.isPending ? "animate-spin" : ""}`} />
            Sync analytics
          </Button>
          <Button onClick={() => decideMut.mutate(true)} disabled={decideMut.isPending}>
            <Zap className={`h-4 w-4 mr-2 ${decideMut.isPending ? "animate-pulse" : ""}`} />
            Run decision engine
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Scale" value={summary.counts.scale} cls="text-emerald-600" />
        <SummaryCard label="Pause" value={summary.counts.pause} cls="text-amber-600" />
        <SummaryCard label="Kill" value={summary.counts.kill} cls="text-red-600" />
        <SummaryCard
          label="Blended ROAS"
          value={summary.roas != null ? `${summary.roas.toFixed(2)}x` : "—"}
          cls="text-foreground"
        />
      </div>

      <Tabs defaultValue="ads">
        <TabsList>
          <TabsTrigger value="ads">Ad decisions</TabsTrigger>
          <TabsTrigger value="log">Decision log</TabsTrigger>
          <TabsTrigger value="spend">Spend entry</TabsTrigger>
          <TabsTrigger value="settings">Break-even settings</TabsTrigger>
        </TabsList>

        <TabsContent value="ads" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" />Pin verdicts</CardTitle>
              <CardDescription>
                Per-pin CTR vs thresholds, with break-even CPC vs your actual CPC where spend exists.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Pin / Product</TableHead>
                    <TableHead className="text-right">Impr</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">BE CPC</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No pin analytics yet. Click "Sync Pinterest analytics".
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => {
                    const meta = verdictMeta[r.verdict];
                    const Icon = meta.icon;
                    return (
                      <TableRow key={r.pin_id}>
                        <TableCell>
                          <Badge className={meta.cls}>
                            <Icon className="h-3 w-3 mr-1" />{meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="font-medium truncate">{r.pin_title ?? r.pin_id}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.productName} {r.hook_angle ? `· ${r.hook_angle}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{r.impressions.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{r.clicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{(r.ctr * 100).toFixed(2)}%</TableCell>
                        <TableCell className="text-right">${r.marginUsd.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{r.beCpc != null ? `$${r.beCpc.toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right">{r.cpc != null ? `$${r.cpc.toFixed(2)}` : "—"}</TableCell>
                        <TableCell className="text-right">{r.roas != null ? `${r.roas.toFixed(2)}x` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent decisions</CardTitle>
              <CardDescription>
                Each run logs verdicts here. "Applied" means the queue row was annotated (kill = skipped, scale = boosted).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Verdict</TableHead>
                    <TableHead>Pin</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Δ Budget</TableHead>
                    <TableHead>Applied</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(decisionsQ.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No decisions yet. Click "Run decision engine".
                      </TableCell>
                    </TableRow>
                  )}
                  {(decisionsQ.data ?? []).map((d: any) => {
                    const meta = verdictMeta[d.verdict as Verdict] ?? verdictMeta.watch;
                    const Icon = meta.icon;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs">{new Date(d.decided_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={meta.cls}>
                            <Icon className="h-3 w-3 mr-1" />{meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{d.pin_id}</TableCell>
                        <TableCell className="max-w-[320px] truncate" title={d.reason}>{d.reason}</TableCell>
                        <TableCell className="text-right">{(Number(d.ctr) * 100).toFixed(2)}%</TableCell>
                        <TableCell className="text-right">
                          {d.recommended_budget_delta_pct > 0 ? "+" : ""}{d.recommended_budget_delta_pct}%
                        </TableCell>
                        <TableCell>{d.applied ? "✓" : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spend" className="mt-4">
          <SpendForm onSaved={() => qc.invalidateQueries({ queryKey: ["ad-spend"] })} />
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Recent spend entries</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Pin</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">ATC</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(spendQ.data ?? []).slice(0, 30).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.entry_date}</TableCell>
                      <TableCell className="font-mono text-xs">{s.pin_id ?? "—"}</TableCell>
                      <TableCell>{s.campaign ?? "—"}</TableCell>
                      <TableCell className="text-right">${Number(s.spend).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{s.clicks}</TableCell>
                      <TableCell className="text-right">{s.add_to_cart}</TableCell>
                      <TableCell className="text-right">{s.purchases}</TableCell>
                      <TableCell className="text-right">${Number(s.revenue).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          {settings && <SettingsForm initial={settings} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, cls }: { label: string; value: number | string; cls: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const qc = useQueryClient();
  useEffect(() => setS(initial), [initial]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profit_engine_settings")
        .update(s)
        .eq("singleton", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["profit-engine-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? String(e)),
  });

  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS({ ...s, [k]: Number(e.target.value) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Break-even & decision rules</CardTitle>
        <CardDescription>Per-SKU margin uses price − cost_price; missing SKUs fall back to blended margin %.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 max-w-2xl">
        <Field label="Blended margin %"><Input type="number" step="0.5" value={s.blended_margin_pct} onChange={num("blended_margin_pct")} /></Field>
        <Field label="Target ROAS"><Input type="number" step="0.1" value={s.target_roas} onChange={num("target_roas")} /></Field>
        <Field label="Min impressions before kill"><Input type="number" value={s.min_impressions_kill} onChange={num("min_impressions_kill")} /></Field>
        <Field label="Kill if CTR < (%)"><Input type="number" step="0.1" value={s.ctr_kill_pct} onChange={num("ctr_kill_pct")} /></Field>
        <Field label="Scale if CTR > (%)"><Input type="number" step="0.1" value={s.ctr_scale_pct} onChange={num("ctr_scale_pct")} /></Field>
        <Field label="Scale budget bump (%)"><Input type="number" value={s.scale_budget_pct} onChange={num("scale_budget_pct")} /></Field>
        <div className="md:col-span-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SpendForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    pin_id: "",
    campaign: "",
    spend: 0,
    clicks: 0,
    impressions: 0,
    add_to_cart: 0,
    purchases: 0,
    revenue: 0,
    entry_date: new Date().toISOString().slice(0, 10),
  });
  const [csv, setCsv] = useState("");

  const saveOne = async () => {
    const { error } = await supabase.from("ad_spend_entries").insert({
      ...form,
      pin_id: form.pin_id || null,
      campaign: form.campaign || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Saved"); onSaved(); }
  };

  const importCsv = async () => {
    // expects headers: date,pin_id,campaign,impressions,clicks,spend,add_to_cart,purchases,revenue
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return toast.error("CSV needs header + at least one row");
    const head = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const idx = (k: string) => head.indexOf(k);
    const rows = lines.slice(1).map((l) => {
      const c = l.split(",");
      return {
        entry_date: c[idx("date")] || new Date().toISOString().slice(0, 10),
        pin_id: c[idx("pin_id")] || null,
        campaign: c[idx("campaign")] || null,
        impressions: Number(c[idx("impressions")] || 0),
        clicks: Number(c[idx("clicks")] || 0),
        spend: Number(c[idx("spend")] || 0),
        add_to_cart: Number(c[idx("add_to_cart")] || 0),
        purchases: Number(c[idx("purchases")] || 0),
        revenue: Number(c[idx("revenue")] || 0),
      };
    });
    const { error } = await supabase.from("ad_spend_entries").insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`Imported ${rows.length} rows`); setCsv(""); onSaved(); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add ad spend</CardTitle>
        <CardDescription>Manual entry or CSV paste. Use the Pinterest pin ID to map spend to a pin's verdict.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Date"><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></Field>
          <Field label="Pin ID"><Input value={form.pin_id} onChange={(e) => setForm({ ...form, pin_id: e.target.value })} /></Field>
          <Field label="Campaign"><Input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} /></Field>
          <Field label="Impressions"><Input type="number" value={form.impressions} onChange={(e) => setForm({ ...form, impressions: Number(e.target.value) })} /></Field>
          <Field label="Clicks"><Input type="number" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: Number(e.target.value) })} /></Field>
          <Field label="Spend $"><Input type="number" step="0.01" value={form.spend} onChange={(e) => setForm({ ...form, spend: Number(e.target.value) })} /></Field>
          <Field label="Add to cart"><Input type="number" value={form.add_to_cart} onChange={(e) => setForm({ ...form, add_to_cart: Number(e.target.value) })} /></Field>
          <Field label="Purchases"><Input type="number" value={form.purchases} onChange={(e) => setForm({ ...form, purchases: Number(e.target.value) })} /></Field>
          <Field label="Revenue $"><Input type="number" step="0.01" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: Number(e.target.value) })} /></Field>
        </div>
        <Button onClick={saveOne}>Save entry</Button>

        <div className="space-y-2 pt-4 border-t">
          <Label>CSV paste (date,pin_id,campaign,impressions,clicks,spend,add_to_cart,purchases,revenue)</Label>
          <textarea
            className="w-full h-32 rounded-md border border-input bg-background p-2 font-mono text-xs"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"date,pin_id,campaign,impressions,clicks,spend,add_to_cart,purchases,revenue\n2026-05-04,123456,launch,1200,30,5.40,3,1,49.99"}
          />
          <Button variant="secondary" onClick={importCsv}>Import CSV</Button>
        </div>
      </CardContent>
    </Card>
  );
}