import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Copy, Loader2, Play, Pause, RefreshCw, Rocket, Target } from "lucide-react";
import { toast } from "sonner";

type Campaign = {
  id: string;
  name: string;
  channel: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  landing_page: string | null;
  daily_budget_usd: number;
  status: string;
  notes: string | null;
  launched_at: string | null;
  paused_at: string | null;
};

type MetricsRow = {
  campaign: Campaign;
  qualified_us_sessions: number;
  atc: number;
  checkout_started: number;
  purchases: number;
  revenue: number;
  planned_spend_usd: number;
  checkout_cvr_pct: number;
  cost_per_session_usd: number;
};

type MetricsResp = {
  ok: boolean;
  window_days: number;
  totals: {
    qualified_us_sessions: number;
    atc: number;
    checkout_started: number;
    purchases: number;
    revenue: number;
    planned_spend_usd: number;
    checkout_cvr_pct: number;
    cost_per_session_usd: number;
  };
  campaigns: MetricsRow[];
};

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://getpawsy.pet";

function buildUtmLink(c: Campaign) {
  const path = c.landing_page || "/";
  const params = new URLSearchParams({
    utm_source: c.utm_source,
    utm_medium: c.utm_medium,
    utm_campaign: c.utm_campaign,
  });
  return `${ORIGIN}${path}?${params.toString()}`;
}

export default function UsTrafficCampaignPage() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState<MetricsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    channel: "google_ads",
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "",
    landing_page: "/",
    daily_budget_usd: 25,
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<MetricsResp>(
        `us-traffic-campaign-metrics?days=${days}`,
        { method: "GET" as any },
      );
      if (error) throw error;
      setData(data ?? null);
    } catch (e) {
      toast.error(`Failed to load metrics: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = data?.totals;

  const createCampaign = async () => {
    if (!form.name || !form.utm_campaign) {
      toast.error("Name and utm_campaign are required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("us_traffic_campaigns").insert({
        name: form.name,
        channel: form.channel,
        utm_source: form.utm_source,
        utm_medium: form.utm_medium,
        utm_campaign: form.utm_campaign.trim().toLowerCase().replace(/\s+/g, "_"),
        landing_page: form.landing_page,
        daily_budget_usd: form.daily_budget_usd,
        notes: form.notes || null,
        status: "draft",
      });
      if (error) throw error;
      toast.success("Campaign created");
      setForm({ ...form, name: "", utm_campaign: "", notes: "" });
      await load();
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (c: Campaign, status: "live" | "paused" | "draft") => {
    try {
      const patch: Record<string, unknown> = { status };
      if (status === "live" && !c.launched_at) patch.launched_at = new Date().toISOString();
      if (status === "paused") patch.paused_at = new Date().toISOString();
      const { error } = await supabase.from("us_traffic_campaigns").update(patch).eq("id", c.id);
      if (error) throw error;
      toast.success(`Marked ${status}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const copyLink = (c: Campaign) => {
    navigator.clipboard.writeText(buildUtmLink(c));
    toast.success("UTM link copied");
  };

  const rowsSorted = useMemo(
    () => (data?.campaigns ?? []).slice().sort((a, b) => b.qualified_us_sessions - a.qualified_us_sessions),
    [data],
  );

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      <Helmet>
        <title>US Traffic Campaigns — Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to admin
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 mt-1">
            <Target className="w-6 h-6 text-primary" /> US Traffic Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">
            Qualified US paid-traffic attribution — spend, sessions, ATC, checkout starts, purchases, CVR.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value={7}>Last 7d</option>
            <option value={14}>Last 14d</option>
            <option value={30}>Last 30d</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard label="Qualified US sessions" value={totals?.qualified_us_sessions ?? 0} />
        <StatCard label="Add to cart" value={totals?.atc ?? 0} />
        <StatCard label="Checkout starts" value={totals?.checkout_started ?? 0} />
        <StatCard label="Purchases" value={totals?.purchases ?? 0} />
        <StatCard label="Checkout CVR" value={`${(totals?.checkout_cvr_pct ?? 0).toFixed(2)}%`} />
        <StatCard label="Planned spend" value={`$${(totals?.planned_spend_usd ?? 0).toFixed(0)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Rocket className="w-5 h-5" /> Campaigns
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">ATC</TableHead>
                <TableHead className="text-right">Checkout</TableHead>
                <TableHead className="text-right">Purchases</TableHead>
                <TableHead className="text-right">CVR</TableHead>
                <TableHead className="text-right">$/session</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowsSorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">
                    No campaigns yet — create one below.
                  </TableCell>
                </TableRow>
              )}
              {rowsSorted.map((r) => (
                <TableRow key={r.campaign.id}>
                  <TableCell>
                    <div className="font-medium">{r.campaign.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.campaign.channel} · {r.campaign.utm_campaign}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.campaign.status === "live"
                          ? "default"
                          : r.campaign.status === "paused"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {r.campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.qualified_us_sessions}</TableCell>
                  <TableCell className="text-right">{r.atc}</TableCell>
                  <TableCell className="text-right">{r.checkout_started}</TableCell>
                  <TableCell className="text-right">{r.purchases}</TableCell>
                  <TableCell className="text-right">{r.checkout_cvr_pct.toFixed(2)}%</TableCell>
                  <TableCell className="text-right">
                    {r.cost_per_session_usd ? `$${r.cost_per_session_usd.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => copyLink(r.campaign)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                  <TableCell>
                    {r.campaign.status !== "live" ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.campaign, "live")}>
                        <Play className="w-3.5 h-3.5 mr-1" /> Live
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.campaign, "paused")}>
                        <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Launch checklist — Google Ads US Search</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="list-decimal pl-5 space-y-1">
            <li>Copy the UTM link for a seeded draft campaign above (Copy icon).</li>
            <li>In Google Ads, create a Search campaign. Location: <strong>United States only</strong>. Language: English.</li>
            <li>Budget: match the daily budget in this table. Bidding: Manual CPC $0.40–$0.80.</li>
            <li>
              Use ad copy from <code>public/data/google-ads-copy.json</code> and paste the UTM link as the Final URL.
            </li>
            <li>Enable conversion import for GA4 <code>purchase</code>, <code>begin_checkout</code>, <code>add_to_cart</code>.</li>
            <li>Set the campaign status to <strong>Live</strong> here once activated in Google Ads.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Only US sessions with a matching UTM campaign, non-internal, and populated in the journey table are counted.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create campaign</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Channel</Label>
            <Input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} />
          </div>
          <div>
            <Label>utm_source</Label>
            <Input value={form.utm_source} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} />
          </div>
          <div>
            <Label>utm_medium</Label>
            <Input value={form.utm_medium} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} />
          </div>
          <div>
            <Label>utm_campaign (unique)</Label>
            <Input
              value={form.utm_campaign}
              onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })}
              placeholder="us_litter_box_search"
            />
          </div>
          <div>
            <Label>Landing page</Label>
            <Input value={form.landing_page} onChange={(e) => setForm({ ...form, landing_page: e.target.value })} />
          </div>
          <div>
            <Label>Daily budget (USD)</Label>
            <Input
              type="number"
              value={form.daily_budget_usd}
              onChange={(e) => setForm({ ...form, daily_budget_usd: Number(e.target.value) })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={createCampaign} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Create draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}