import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Play, RefreshCw, Plane, Pause, Ban, Star, Info, CheckCircle2, XCircle, Download } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";

type Settings = {
  id: number;
  enabled: boolean;
  mode: "conservative" | "balanced" | "aggressive";
  max_pins_per_product_per_week: number;
  preferred_category: string | null;
  min_quality_score: number;
  updated_at: string;
};

type Decision = {
  id: string;
  product_id: string;
  product_slug: string | null;
  product_name: string | null;
  product_category: string | null;
  total_score: number;
  score_breakdown: Record<string, unknown>;
  selected_hook_category: string | null;
  selected_board_name: string | null;
  expected_fit: number | null;
  status: string;
  action: string;
  reason: string | null;
  created_at: string;
};

type Override = {
  id: string;
  product_id: string;
  action: "exclude" | "force_promote" | "paused";
  reason: string | null;
  expires_at: string | null;
  created_at: string;
};

function actionBadge(action: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    normal: { variant: "default", label: "Selected" },
    scale: { variant: "default", label: "Scale" },
    pause: { variant: "destructive", label: "Pause" },
    skip: { variant: "outline", label: "Skip" },
  };
  const cfg = map[action] ?? { variant: "outline" as const, label: action };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/**
 * Score factor weights — must mirror pinterest-autopilot edge function.
 * Used to render normalized progress bars in the "Why?" panel.
 */
const FACTOR_MAX: Record<string, { max: number; label: string; description: string }> = {
  image: { max: 20, label: "Image quality", description: "Number of valid HTTPS images" },
  margin: { max: 15, label: "Margin potential", description: "Cost-vs-price spread or price tier" },
  category_fit: { max: 10, label: "Category fit", description: "Matches preferred niche or money category" },
  visual_appeal: { max: 10, label: "Pinterest visual appeal", description: "Cozy / lifestyle-friendly product type" },
  shipping: { max: 10, label: "US shipping suitability", description: "Active + shippable" },
  performance: { max: 25, label: "Historical performance", description: "CTR, saves, clicks from prior pins" },
  forced: { max: 20, label: "Force-promote bonus", description: "Manual override boost" },
};

/**
 * Compute the 1–2 most decisive drivers behind a verdict.
 * Returns a set of factor keys (matching FACTOR_MAX) and/or safety-check labels
 * that the UI should highlight.
 */
function computeDecisiveDrivers(
  action: string,
  breakdown: Record<string, unknown>,
): { factorKeys: Set<string>; checkLabels: Set<string>; summary: string } {
  const num = (k: string) => Number(breakdown[k] ?? 0);
  const factorKeys = new Set<string>();
  const checkLabels = new Set<string>();
  let summary = "";

  if (action === "scale") {
    // Performance is the trigger; the gate is saves≥10 + perf≥18.
    factorKeys.add("performance");
    checkLabels.add("Has measured Pinterest history");
    summary = `Strong winner signal: ${num("saves")} saves, ${num("clicks")} clicks at ${num("impressions")} imp.`;
  } else if (action === "pause") {
    // Trigger: imp≥500 with saves≤1 & clicks≤1 → engagement collapse.
    factorKeys.add("performance");
    checkLabels.add("Has measured Pinterest history");
    summary = `Low engagement: ${num("saves")} saves & ${num("clicks")} clicks after ${num("impressions")} impressions.`;
  } else if (action === "skip") {
    // Two skip paths: weekly cap, or below quality threshold.
    if (num("weekly_count") > 0 && num("weekly_count") >= 3) {
      checkLabels.add("Within weekly cap");
      summary = `Hit weekly cap (${num("weekly_count")} pins this week).`;
    } else {
      // Find the 1–2 weakest contributing factors (lowest fill ratio).
      const ranked = Object.entries(FACTOR_MAX)
        .filter(([k]) => k !== "forced") // bonus factors don't drive skips
        .map(([k, m]) => ({ k, ratio: num(k) / m.max, raw: num(k) }))
        .sort((a, b) => a.ratio - b.ratio);
      ranked.slice(0, 2).forEach((r) => factorKeys.add(r.k));
      const worst = ranked[0];
      summary = worst
        ? `Below quality threshold — weakest: ${FACTOR_MAX[worst.k].label} (${worst.raw}/${FACTOR_MAX[worst.k].max}).`
        : "Below quality threshold.";
    }
  } else {
    // normal/selected → highlight the 1–2 strongest *non-bonus* contributors.
    const ranked = Object.entries(FACTOR_MAX)
      .filter(([k]) => k !== "forced")
      .map(([k, m]) => ({ k, ratio: num(k) / m.max, raw: num(k) }))
      .filter((r) => r.raw > 0)
      .sort((a, b) => b.ratio - a.ratio);
    ranked.slice(0, 2).forEach((r) => factorKeys.add(r.k));
    if (num("forced") > 0) {
      factorKeys.add("forced");
      summary = "Manual force-promote override.";
    } else {
      const top = ranked[0];
      summary = top
        ? `Top driver: ${FACTOR_MAX[top.k].label} (${top.raw}/${FACTOR_MAX[top.k].max}).`
        : "Selected on composite score.";
    }
  }

  return { factorKeys, checkLabels, summary };
}

function DecisiveBadge() {
  return (
    <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
      decisive
    </Badge>
  );
}

/** Derive safety checks from the score breakdown for human-readable explanation. */
function deriveSafetyChecks(breakdown: Record<string, unknown>) {
  const num = (k: string) => Number(breakdown[k] ?? 0);
  return [
    {
      label: "Image quality acceptable",
      passed: num("image") >= 8,
      detail: `score ${num("image")}/20`,
    },
    {
      label: "Active and US-shippable",
      passed: num("shipping") > 0,
      detail: num("shipping") > 0 ? "is_active=true" : "product disabled",
    },
    {
      label: "Within weekly cap",
      passed: num("weekly_count") < 99,
      detail: `${num("weekly_count")} pins this week`,
    },
    {
      label: "Has visual appeal for Pinterest",
      passed: num("visual_appeal") >= 5,
      detail: `score ${num("visual_appeal")}/10`,
    },
    {
      label: "Margin viable",
      passed: num("margin") >= 3,
      detail: `score ${num("margin")}/15`,
    },
    {
      label: "Has measured Pinterest history",
      passed: num("impressions") > 0,
      detail:
        num("impressions") > 0
          ? `${num("impressions")} imp · ${num("saves")} saves · ${num("clicks")} clicks`
          : "cold start (no history yet)",
    },
  ];
}

function buildExplanation(d: Decision) {
  const breakdown = (d.score_breakdown ?? {}) as Record<string, unknown>;
  const drivers = computeDecisiveDrivers(d.action, breakdown);
  const checks = deriveSafetyChecks(breakdown);
  const factors = Object.entries(FACTOR_MAX).map(([key, meta]) => {
    const raw = Number((breakdown as Record<string, unknown>)[key] ?? 0);
    return {
      key,
      label: meta.label,
      score: raw,
      max: meta.max,
      decisive: drivers.factorKeys.has(key),
    };
  });
  return {
    id: d.id,
    created_at: d.created_at,
    product_id: d.product_id,
    product_slug: d.product_slug,
    product_name: d.product_name,
    product_category: d.product_category,
    total_score: d.total_score,
    action: d.action,
    status: d.status,
    selected_hook_category: d.selected_hook_category,
    selected_board_name: d.selected_board_name,
    expected_fit: d.expected_fit,
    reason: d.reason,
    decisive_summary: drivers.summary,
    factors,
    safety_checks: checks.map((c) => ({
      label: c.label,
      passed: c.passed,
      detail: c.detail,
      decisive: drivers.checkLabels.has(c.label),
    })),
    raw_breakdown: breakdown,
  };
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportDecisions(decisions: Decision[], format: "csv" | "json") {
  if (!decisions.length) {
    toast.error("No decisions to export");
    return;
  }
  const rows = decisions.map(buildExplanation);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  if (format === "json") {
    downloadBlob(
      JSON.stringify(rows, null, 2),
      "application/json",
      `pinterest-autopilot-why-${stamp}.json`,
    );
    toast.success(`Exported ${rows.length} decisions (JSON)`);
    return;
  }
  const headers = [
    "id",
    "created_at",
    "product_name",
    "product_slug",
    "product_category",
    "action",
    "status",
    "total_score",
    "selected_hook_category",
    "selected_board_name",
    "expected_fit",
    "reason",
    "decisive_summary",
    ...Object.keys(FACTOR_MAX).flatMap((k) => [`factor_${k}`, `factor_${k}_decisive`]),
    "safety_checks_passed",
    "safety_checks_failed",
    "safety_checks_decisive",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const factorMap = new Map(r.factors.map((f) => [f.key, f]));
    const passed = r.safety_checks.filter((c) => c.passed).map((c) => c.label);
    const failed = r.safety_checks.filter((c) => !c.passed).map((c) => `${c.label} (${c.detail})`);
    const decisive = r.safety_checks.filter((c) => c.decisive).map((c) => c.label);
    const row: unknown[] = [
      r.id,
      r.created_at,
      r.product_name,
      r.product_slug,
      r.product_category,
      r.action,
      r.status,
      r.total_score,
      r.selected_hook_category,
      r.selected_board_name,
      r.expected_fit,
      r.reason,
      r.decisive_summary,
      ...Object.keys(FACTOR_MAX).flatMap((k) => {
        const f = factorMap.get(k);
        return [f ? `${f.score}/${f.max}` : "", f?.decisive ? "yes" : ""];
      }),
      passed.join(" | "),
      failed.join(" | "),
      decisive.join(" | "),
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  downloadBlob(lines.join("\n"), "text/csv", `pinterest-autopilot-why-${stamp}.csv`);
  toast.success(`Exported ${rows.length} decisions (CSV)`);
}

export default function PinterestAutoPilotPage() {
  const qc = useQueryClient();
  const [overrideProductId, setOverrideProductId] = useState("");
  const [overrideAction, setOverrideAction] = useState<Override["action"]>("force_promote");
  const [overrideReason, setOverrideReason] = useState("");
  const [openDecision, setOpenDecision] = useState<Decision | null>(null);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["autopilot-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_autopilot_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });

  const { data: decisions, refetch: refetchDecisions } = useQuery({
    queryKey: ["autopilot-decisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_autopilot_decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Decision[];
    },
  });

  const { data: overrides, refetch: refetchOverrides } = useQuery({
    queryKey: ["autopilot-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_autopilot_overrides")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Override[];
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { error } = await supabase
        .from("pinterest_autopilot_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autopilot-settings"] });
      toast.success("Auto-Pilot settings updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const runAutopilot = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pinterest-autopilot", {
        body: { action: "score", limit: 20 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      toast.success(`Evaluated ${d?.total_evaluated ?? 0} products, kept ${d?.total_returned ?? 0}`);
      refetchDecisions();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addOverride = useMutation({
    mutationFn: async () => {
      if (!overrideProductId) throw new Error("Product ID required");
      const { error } = await supabase.from("pinterest_autopilot_overrides").upsert(
        {
          product_id: overrideProductId.trim(),
          action: overrideAction,
          reason: overrideReason.trim() || null,
        },
        { onConflict: "product_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override saved");
      setOverrideProductId("");
      setOverrideReason("");
      refetchOverrides();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pinterest_autopilot_overrides")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override removed");
      refetchOverrides();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Pinterest Auto-Pilot</title>
      </Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Plane className="w-7 h-7" /> Pinterest Auto-Pilot
          </h1>
          <p className="text-muted-foreground">
            Autonomous product, hook, and board selection. Drafts only — human approves publishing.
          </p>
        </div>
        <Button
          onClick={() => runAutopilot.mutate()}
          disabled={runAutopilot.isPending}
          size="lg"
        >
          {runAutopilot.isPending ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run Auto-Pilot
        </Button>
      </div>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Strategy controls</CardTitle>
          <CardDescription>
            Conservative = strict thresholds, fewer drafts. Aggressive = looser thresholds, broader exploration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsLoading || !settings ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label htmlFor="ap-enabled" className="font-medium">
                  Auto-Pilot enabled
                </Label>
                <Switch
                  id="ap-enabled"
                  checked={settings.enabled}
                  onCheckedChange={(v) => updateSettings.mutate({ enabled: v })}
                />
              </div>
              <div className="space-y-1">
                <Label>Mode</Label>
                <Select
                  value={settings.mode}
                  onValueChange={(v) =>
                    updateSettings.mutate({ mode: v as Settings["mode"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="aggressive">Aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Min quality score (0–100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={settings.min_quality_score}
                  onBlur={(e) =>
                    updateSettings.mutate({
                      min_quality_score: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Max pins / product / week</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={settings.max_pins_per_product_per_week}
                  onBlur={(e) =>
                    updateSettings.mutate({
                      max_pins_per_product_per_week: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Preferred category (optional)</Label>
                <Input
                  placeholder="e.g. Cat Trees"
                  defaultValue={settings.preferred_category ?? ""}
                  onBlur={(e) =>
                    updateSettings.mutate({
                      preferred_category: e.target.value.trim() || null,
                    })
                  }
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Manual overrides</CardTitle>
          <CardDescription>
            Force-promote winners, exclude losers, or pause products without deleting them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_1fr_auto]">
            <Input
              placeholder="Product ID (uuid)"
              value={overrideProductId}
              onChange={(e) => setOverrideProductId(e.target.value)}
            />
            <Select
              value={overrideAction}
              onValueChange={(v) => setOverrideAction(v as Override["action"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="force_promote">
                  <div className="flex items-center gap-2">
                    <Star className="w-3 h-3" /> Force promote
                  </div>
                </SelectItem>
                <SelectItem value="paused">
                  <div className="flex items-center gap-2">
                    <Pause className="w-3 h-3" /> Paused
                  </div>
                </SelectItem>
                <SelectItem value="exclude">
                  <div className="flex items-center gap-2">
                    <Ban className="w-3 h-3" /> Exclude
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Reason (optional)"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
            <Button
              onClick={() => addOverride.mutate()}
              disabled={addOverride.isPending || !overrideProductId}
            >
              Save override
            </Button>
          </div>

          {overrides && overrides.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.product_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{o.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {o.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOverride.mutate(o.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No overrides yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Decisions log */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Recent decisions</CardTitle>
              <CardDescription>
                Latest 50 Auto-Pilot evaluations. Score is composite (0 ≈ low, 100 ≈ elite Pinterest fit).
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!decisions || decisions.length === 0}
                onClick={() => exportDecisions(decisions ?? [], "csv")}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!decisions || decisions.length === 0}
                onClick={() => exportDecisions(decisions ?? [], "json")}
              >
                <Download className="w-3.5 h-3.5 mr-1" /> Export JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {decisions && decisions.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Hook</TableHead>
                    <TableHead>Board</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decisions.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium text-sm">{d.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.product_category ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {Number(d.total_score).toFixed(0)}
                      </TableCell>
                      <TableCell>
                        {d.selected_hook_category ? (
                          <Badge variant="secondary">{d.selected_hook_category}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.selected_board_name ?? "—"}
                      </TableCell>
                      <TableCell>{actionBadge(d.action)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                        {d.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(d.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOpenDecision(d)}
                        >
                          <Info className="w-3.5 h-3.5 mr-1" /> Why?
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No decisions yet — click "Run Auto-Pilot" to evaluate the catalog.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Why-was-this-chosen explanation panel */}
      <Sheet open={!!openDecision} onOpenChange={(o) => !o && setOpenDecision(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {openDecision && (() => {
            const d = openDecision;
            const breakdown = (d.score_breakdown ?? {}) as Record<string, unknown>;
            const checks = deriveSafetyChecks(breakdown);
            const niche = String(breakdown.niche ?? "—");
            const passedChecks = checks.filter((c) => c.passed).length;
            const drivers = computeDecisiveDrivers(d.action, breakdown);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="text-left">{d.product_name}</SheetTitle>
                  <SheetDescription className="text-left">
                    {d.product_category ?? "—"} · niche: <span className="font-mono">{niche}</span>
                  </SheetDescription>
                </SheetHeader>

                {/* Verdict */}
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div>
                      <div className="text-3xl font-bold font-mono">
                        {Number(d.total_score).toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">composite score</div>
                    </div>
                    <div className="text-right space-y-1">
                      {actionBadge(d.action)}
                      {d.reason && (
                        <div className="text-xs text-muted-foreground max-w-[200px]">
                          {d.reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Decisive driver summary */}
                  <div className="p-3 rounded-lg border-l-4 border-primary bg-primary/5 text-sm">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Most decisive
                    </div>
                    {drivers.summary}
                  </div>

                  {/* Hook + Board picks */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 border rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Hook family</div>
                      <div className="font-medium">
                        {d.selected_hook_category ? (
                          <Badge variant="secondary">{d.selected_hook_category}</Badge>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Board</div>
                      <div className="font-medium text-sm">
                        {d.selected_board_name ?? "—"}
                      </div>
                      {d.expected_fit !== null && (
                        <div className="text-xs text-muted-foreground mt-1">
                          expected fit {Number(d.expected_fit).toFixed(0)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score factors */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Score factors</h3>
                    <div className="space-y-3">
                      {Object.entries(FACTOR_MAX).map(([key, meta]) => {
                        const raw = Number(breakdown[key] ?? 0);
                        const pct = Math.min(100, (raw / meta.max) * 100);
                        const isDecisive = drivers.factorKeys.has(key);
                        return (
                          <div
                            key={key}
                            className={
                              isDecisive
                                ? "p-2 -mx-2 rounded-md bg-primary/5 ring-1 ring-primary/30"
                                : ""
                            }
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-medium flex items-center">
                                {meta.label}
                                {isDecisive && <DecisiveBadge />}
                              </span>
                              <span className="font-mono text-muted-foreground">
                                {raw}/{meta.max}
                              </span>
                            </div>
                            <Progress value={pct} className="h-2" />
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {meta.description}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Safety checks */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">
                      Safety checks{" "}
                      <span className="font-normal text-xs text-muted-foreground">
                        ({passedChecks}/{checks.length} passed)
                      </span>
                    </h3>
                    <ul className="space-y-1.5">
                      {checks.map((c, i) => (
                        <li
                          key={i}
                          className={
                            "flex items-start gap-2 text-sm " +
                            (drivers.checkLabels.has(c.label)
                              ? "p-1.5 -mx-1.5 rounded-md bg-primary/5 ring-1 ring-primary/30"
                              : "")
                          }
                        >
                          {c.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <div className={"flex items-center " + (c.passed ? "" : "text-muted-foreground line-through")}>
                              {c.label}
                              {drivers.checkLabels.has(c.label) && <DecisiveBadge />}
                            </div>
                            <div className="text-xs text-muted-foreground">{c.detail}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Raw breakdown for power users */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Raw breakdown JSON
                    </summary>
                    <pre className="mt-2 p-3 bg-muted rounded-lg overflow-x-auto text-[11px]">
                      {JSON.stringify(breakdown, null, 2)}
                    </pre>
                  </details>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}