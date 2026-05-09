import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Save, Trash2, Play, RefreshCw } from "lucide-react";
import { classifyWithRules, type RuntimeRule } from "@/lib/niche-rules-runtime";

type RuleRow = RuntimeRule & {
  id: string;
  notes: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  product_type: string | null;
};

type RunResult = {
  totals: Record<string, number>;
  total: number;
  perProduct: Array<{ product: ProductRow; niche: string; ruleId: string | null }>;
};

const splitTerms = (s: string) =>
  s
    .split(/[\n,]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

const joinTerms = (arr: string[] | null | undefined) => (arr ?? []).join(", ");

function emptyRule(): RuleRow {
  return {
    id: "",
    rule_id: "",
    niche: "generic_pet",
    priority: 1000,
    enabled: true,
    primary_terms: [],
    require_any: [],
    forbid_all: [],
    notes: "",
  };
}

export default function PinterestNicheRulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState<RuleRow>(emptyRule());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [resultFilter, setResultFilter] = useState("");
  const [scanLimit, setScanLimit] = useState(2000);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pinterest_niche_rules")
      .select("*")
      .order("priority", { ascending: true });
    if (error) {
      toast({ title: "Failed to load rules", description: error.message, variant: "destructive" });
    } else {
      setRules((data ?? []) as RuleRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.rule_id.toLowerCase().includes(q) ||
        r.niche.toLowerCase().includes(q) ||
        r.primary_terms.some((t) => t.toLowerCase().includes(q)),
    );
  }, [rules, filter]);

  async function saveRule(rule: RuleRow) {
    setSaving(rule.id || rule.rule_id);
    try {
      const payload = {
        rule_id: rule.rule_id.trim(),
        niche: rule.niche.trim(),
        priority: Number(rule.priority) || 1000,
        enabled: !!rule.enabled,
        primary_terms: rule.primary_terms,
        require_any: rule.require_any,
        forbid_all: rule.forbid_all,
        notes: rule.notes ?? null,
      };
      if (!payload.rule_id || !payload.niche || payload.primary_terms.length === 0) {
        toast({
          title: "Invalid rule",
          description: "rule_id, niche, and at least one primary term are required.",
          variant: "destructive",
        });
        return;
      }
      const { error } = rule.id
        ? await supabase.from("pinterest_niche_rules").update(payload).eq("id", rule.id)
        : await supabase.from("pinterest_niche_rules").insert(payload);
      if (error) throw error;
      toast({ title: rule.id ? "Rule updated" : "Rule created" });
      if (!rule.id) setDraft(emptyRule());
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function deleteRule(rule: RuleRow) {
    if (!confirm(`Delete rule "${rule.rule_id}"?`)) return;
    const { error } = await supabase.from("pinterest_niche_rules").delete().eq("id", rule.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rule deleted" });
      await load();
    }
  }

  async function runDetection() {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, category, product_type")
        .eq("active", true)
        .limit(scanLimit);
      if (error) throw error;
      const products = (data ?? []) as ProductRow[];
      const totals: Record<string, number> = {};
      const perProduct: RunResult["perProduct"] = [];
      for (const p of products) {
        const trace = classifyWithRules(p, rules);
        totals[trace.niche] = (totals[trace.niche] ?? 0) + 1;
        perProduct.push({
          product: p,
          niche: trace.niche,
          ruleId: trace.matchedRule?.rule_id ?? null,
        });
      }
      setResult({ totals, total: products.length, perProduct });
      toast({ title: `Classified ${products.length} products` });
    } catch (e) {
      toast({ title: "Run failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const sortedTotals = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.totals).sort((a, b) => b[1] - a[1]);
  }, [result]);

  const filteredResults = useMemo(() => {
    if (!result) return [];
    const q = resultFilter.trim().toLowerCase();
    if (!q) return result.perProduct.slice(0, 200);
    return result.perProduct
      .filter(
        (r) =>
          r.niche.toLowerCase().includes(q) ||
          r.product.name.toLowerCase().includes(q) ||
          r.product.slug.toLowerCase().includes(q) ||
          (r.ruleId ?? "").toLowerCase().includes(q),
      )
      .slice(0, 200);
  }, [result, resultFilter]);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Niche Rules Editor</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Edit keyword rules that classify products into Pinterest niches. Changes apply
            immediately to the in-app detector when you click <em>Run detection</em>; no
            redeploy required.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/pinterest-niche-coverage">Coverage dashboard</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/pinterest-generic-niche">Generic review</Link>
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Reload
          </Button>
        </div>
      </header>

      {/* Run detection panel */}
      <Card>
        <CardHeader>
          <CardTitle>Run detection against live catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-sm text-muted-foreground">Scan limit</label>
              <Input
                type="number"
                value={scanLimit}
                min={50}
                max={5000}
                onChange={(e) => setScanLimit(Number(e.target.value) || 2000)}
                className="w-32"
              />
            </div>
            <Button onClick={runDetection} disabled={running || rules.length === 0}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run detection
            </Button>
            <span className="text-sm text-muted-foreground">
              {rules.filter((r) => r.enabled).length}/{rules.length} rules enabled
            </span>
          </div>

          {result && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {sortedTotals.map(([niche, n]) => {
                  const pct = ((n / result.total) * 100).toFixed(1);
                  const isGeneric = niche === "generic_pet";
                  return (
                    <Badge
                      key={niche}
                      variant={isGeneric && Number(pct) > 20 ? "destructive" : "secondary"}
                    >
                      {niche}: {n} ({pct}%)
                    </Badge>
                  );
                })}
              </div>
              <div>
                <Input
                  placeholder="Filter results by niche / name / slug / rule_id…"
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                />
              </div>
              <div className="border rounded-md divide-y max-h-[480px] overflow-auto">
                {filteredResults.map((r) => (
                  <div key={r.product.id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.product.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.product.slug} · {r.product.category ?? "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={r.niche === "generic_pet" ? "destructive" : "secondary"}>
                        {r.niche}
                      </Badge>
                      <code className="text-xs text-muted-foreground">{r.ruleId ?? "—"}</code>
                    </div>
                  </div>
                ))}
                {filteredResults.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New rule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New rule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RuleEditor
            rule={draft}
            onChange={setDraft}
            onSave={() => saveRule(draft)}
            saving={saving === draft.rule_id}
          />
        </CardContent>
      </Card>

      {/* Existing rules */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Rules ({rules.length})</CardTitle>
          <Input
            placeholder="Search rule_id / niche / term…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            filtered.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                saving={saving === rule.id}
                onSave={(r) => saveRule({ ...r, id: rule.id })}
                onDelete={() => deleteRule(rule)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleCard({
  rule,
  saving,
  onSave,
  onDelete,
}: {
  rule: RuleRow;
  saving: boolean;
  onSave: (r: RuleRow) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState<RuleRow>(rule);
  useEffect(() => setLocal(rule), [rule]);

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <code className="font-semibold">{rule.rule_id}</code>
          <Badge variant="outline">{rule.niche}</Badge>
          <Badge variant="secondary">priority {rule.priority}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={local.enabled}
              onCheckedChange={(v) => setLocal({ ...local, enabled: v })}
            />
            Enabled
          </label>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={saving}
            aria-label="Delete rule"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <RuleEditor rule={local} onChange={setLocal} onSave={() => onSave(local)} saving={saving} />
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onSave,
  saving,
}: {
  rule: RuleRow;
  onChange: (r: RuleRow) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className="text-xs text-muted-foreground">rule_id</label>
        <Input
          value={rule.rule_id}
          onChange={(e) => onChange({ ...rule, rule_id: e.target.value })}
          placeholder="cat_litter.smart"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">niche</label>
        <Input
          value={rule.niche}
          onChange={(e) => onChange({ ...rule, niche: e.target.value })}
          placeholder="cat_litter"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">priority (lower = checked first)</label>
        <Input
          type="number"
          value={rule.priority}
          onChange={(e) => onChange({ ...rule, priority: Number(e.target.value) || 0 })}
        />
      </div>
      <div className="flex items-end gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
      </div>
      <div className="md:col-span-2">
        <label className="text-xs text-muted-foreground">
          primary terms (comma or newline separated, OR-matched)
        </label>
        <Textarea
          value={joinTerms(rule.primary_terms)}
          onChange={(e) => onChange({ ...rule, primary_terms: splitTerms(e.target.value) })}
          rows={2}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">require_any (AND gate, optional)</label>
        <Textarea
          value={joinTerms(rule.require_any)}
          onChange={(e) => onChange({ ...rule, require_any: splitTerms(e.target.value) })}
          rows={2}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">forbid_all (disqualifiers, optional)</label>
        <Textarea
          value={joinTerms(rule.forbid_all)}
          onChange={(e) => onChange({ ...rule, forbid_all: splitTerms(e.target.value) })}
          rows={2}
        />
      </div>
      <div className="md:col-span-2">
        <label className="text-xs text-muted-foreground">notes</label>
        <Input
          value={rule.notes ?? ""}
          onChange={(e) => onChange({ ...rule, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
