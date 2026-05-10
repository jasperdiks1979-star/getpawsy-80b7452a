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
import { Play, RefreshCw, Plane, Pause, Ban, Star } from "lucide-react";
import { useState } from "react";

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

export default function PinterestAutoPilotPage() {
  const qc = useQueryClient();
  const [overrideProductId, setOverrideProductId] = useState("");
  const [overrideAction, setOverrideAction] = useState<Override["action"]>("force_promote");
  const [overrideReason, setOverrideReason] = useState("");

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
          <CardTitle>Recent decisions</CardTitle>
          <CardDescription>
            Latest 50 Auto-Pilot evaluations. Score is composite (0 ≈ low, 100 ≈ elite Pinterest fit).
          </CardDescription>
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
    </div>
  );
}