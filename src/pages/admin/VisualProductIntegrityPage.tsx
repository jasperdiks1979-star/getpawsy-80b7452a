/**
 * Phase 19 — Visual Product Integrity Center
 *
 * Command surface for the Visual Product Identity (VPI) engine. Shows the
 * same-product certification state across every published, scheduled, queued
 * and video pin; lets an admin trigger inventory-only, score, or full sweeps;
 * and surfaces the pins that need repair or replacement.
 *
 * Reuses:
 *   - pinterest-visual-identity-audit  (Layer A + Layer B)
 *   - pinterest_visual_identity_runs   (per-sweep ledger)
 *   - pinterest_visual_identity_audits (per-pin evidence)
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldCheck, Wrench, Image as ImageIcon } from "lucide-react";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  mode: string;
  scope: string;
  pins_total: number;
  pins_scored: number;
  pins_pass: number;
  pins_fail: number;
  pins_repaired: number;
  pins_replace_required: number;
  ai_calls: number;
  ai_lane: string;
  summary: Record<string, unknown>;
  notes: string | null;
};

type Audit = {
  id: string;
  created_at: string;
  source: string;
  product_slug: string;
  pinterest_pin_id: string | null;
  pin_image_url: string;
  destination_link: string | null;
  identity_score: number;
  same_product: boolean;
  passed: boolean;
  wrong_product_kind: string;
  recommended_action: string;
  best_reference_image: string | null;
  differences: string[];
  repair_status: string;
};

const ACTION_BADGE: Record<string, "secondary" | "destructive" | "outline" | "default"> = {
  certify: "secondary",
  repair_destination: "outline",
  sync_hero: "outline",
  replace_pin: "destructive",
  manual_review: "outline",
};

export default function VisualProductIntegrityPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from("pinterest_visual_identity_runs")
        .select("*").order("started_at", { ascending: false }).limit(20),
      supabase.from("pinterest_visual_identity_audits")
        .select("id, created_at, source, product_slug, pinterest_pin_id, pin_image_url, destination_link, identity_score, same_product, passed, wrong_product_kind, recommended_action, best_reference_image, differences, repair_status")
        .order("created_at", { ascending: false }).limit(200),
    ]);
    setRuns((r ?? []) as Run[]);
    setAudits((a ?? []) as Audit[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function trigger(mode: "inventory" | "score" | "full", extra: Record<string, string> = {}) {
    setRunning(mode);
    try {
      const params = new URLSearchParams({ mode, ...extra });
      const { data, error } = await supabase.functions.invoke(
        `pinterest-visual-identity-audit?${params.toString()}`,
        { method: "POST" },
      );
      if (error) throw error;
      toast.success(`VPI ${mode} complete`, { description: JSON.stringify((data as any)?.totals ?? (data as any)?.candidates ?? {}) });
      await load();
    } catch (e) {
      toast.error(`VPI ${mode} failed: ${(e as Error).message}`);
    } finally { setRunning(null); }
  }

  const stats = useMemo(() => {
    const s = {
      total: audits.length,
      certified: 0, wrongProduct: 0, wrongVariant: 0, wrongColor: 0, wrongPlatform: 0,
      replaceRequired: 0, repairQueued: 0,
      lowest: 100, highest: 0, avg: 0,
    };
    if (!audits.length) return s;
    let sum = 0;
    for (const a of audits) {
      sum += a.identity_score;
      s.lowest = Math.min(s.lowest, a.identity_score);
      s.highest = Math.max(s.highest, a.identity_score);
      if (a.passed) s.certified++;
      else {
        if (a.wrong_product_kind === "different_model" || a.wrong_product_kind === "different_family" || a.wrong_product_kind === "unknown_object") s.wrongProduct++;
        if (a.wrong_product_kind === "different_variant" || a.wrong_product_kind === "different_sku") s.wrongVariant++;
        if (a.wrong_product_kind === "different_color") s.wrongColor++;
        if (a.wrong_product_kind === "different_platform_count") s.wrongPlatform++;
      }
      if (a.repair_status === "replace_required") s.replaceRequired++;
      if (a.repair_status === "queued") s.repairQueued++;
    }
    s.avg = Math.round(sum / audits.length);
    return s;
  }, [audits]);

  const failing = useMemo(() => audits.filter((a) => !a.passed).slice(0, 100), [audits]);

  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldCheck className="h-6 w-6"/> Visual Product Integrity Center</h1>
          <p className="text-sm text-muted-foreground">
            Same-product certification: every Pinterest visitor must land on the identical commercial product shown in the pin.
            Fail-closed. Extends PRE + Integrity Guard — no duplicate systems.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>} Reload</Button>
          <Button variant="outline" disabled={!!running} onClick={() => trigger("inventory")}>{running === "inventory" ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Inventory</Button>
          <Button variant="outline" disabled={!!running} onClick={() => trigger("score", { limit: "20" })}>{running === "score" ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Score 20</Button>
          <Button disabled={!!running} onClick={() => trigger("full", { limit: "40" })}>{running === "full" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wrench className="h-4 w-4"/>} Full sweep (40)</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Pins audited</div><div className="text-2xl font-semibold">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Certified</div><div className="text-2xl font-semibold text-green-600">{stats.certified}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Wrong product</div><div className="text-2xl font-semibold text-red-600">{stats.wrongProduct}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Wrong variant/SKU</div><div className="text-2xl font-semibold text-amber-600">{stats.wrongVariant}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Wrong color</div><div className="text-2xl font-semibold">{stats.wrongColor}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Wrong platform count</div><div className="text-2xl font-semibold">{stats.wrongPlatform}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Repair queued</div><div className="text-2xl font-semibold">{stats.repairQueued}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Replace required</div><div className="text-2xl font-semibold text-red-600">{stats.replaceRequired}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Avg identity</div><div className="text-2xl font-semibold">{stats.avg}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Lowest</div><div className="text-2xl font-semibold">{stats.lowest === 100 && !stats.total ? "—" : stats.lowest}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Highest</div><div className="text-2xl font-semibold">{stats.highest || "—"}</div></Card>
      </div>

      <Card>
        <div className="p-4 border-b font-medium">Recent runs</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">AI lane</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Pass</th>
                <th className="px-3 py-2">Fail</th>
                <th className="px-3 py-2">Repaired</th>
                <th className="px-3 py-2">Replace</th>
                <th className="px-3 py-2">AI calls</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.mode}</td>
                  <td className="px-3 py-2"><Badge variant={r.ai_lane === "available" ? "secondary" : "outline"}>{r.ai_lane}</Badge></td>
                  <td className="px-3 py-2">{r.pins_total}</td>
                  <td className="px-3 py-2 text-green-600">{r.pins_pass}</td>
                  <td className="px-3 py-2 text-red-600">{r.pins_fail}</td>
                  <td className="px-3 py-2">{r.pins_repaired}</td>
                  <td className="px-3 py-2">{r.pins_replace_required}</td>
                  <td className="px-3 py-2">{r.ai_calls}</td>
                </tr>
              ))}
              {!runs.length && (<tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No runs yet. Trigger a sweep to begin.</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b font-medium flex items-center gap-2"><ImageIcon className="h-4 w-4"/> Failing pins (evidence)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2">Pin image</th>
                <th className="px-3 py-2">PDP hero</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Repair</th>
                <th className="px-3 py-2">Differences</th>
              </tr>
            </thead>
            <tbody>
              {failing.map((a) => (
                <tr key={a.id} className="border-t align-top">
                  <td className="px-3 py-2"><img src={a.pin_image_url} alt="" className="w-24 rounded"/></td>
                  <td className="px-3 py-2">{a.best_reference_image ? <img src={a.best_reference_image} alt="" className="w-24 rounded"/> : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{a.product_slug}</div>
                    {a.pinterest_pin_id && (
                      <a className="text-xs underline" target="_blank" rel="noreferrer" href={`https://www.pinterest.com/pin/${a.pinterest_pin_id}/`}>pin</a>
                    )}
                    <div className="text-xs text-muted-foreground">{a.source}</div>
                  </td>
                  <td className="px-3 py-2 font-semibold">{a.identity_score}</td>
                  <td className="px-3 py-2 text-xs">{a.wrong_product_kind}</td>
                  <td className="px-3 py-2"><Badge variant={ACTION_BADGE[a.recommended_action] ?? "outline"}>{a.recommended_action}</Badge></td>
                  <td className="px-3 py-2 text-xs">{a.repair_status}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[380px]">{(a.differences ?? []).slice(0, 3).join("; ")}</td>
                </tr>
              ))}
              {!failing.length && (<tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No failing pins. Every audited pin is certified.</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Layer A (deterministic inventory + repair queue) runs even when AI credits are exhausted.
        Layer B (Gemini vision scoring) is required for certification; when it's paused, pins remain uncertified and the Integrity Guard fails closed on new publishes.
      </p>
    </div>
  );
}