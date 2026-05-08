import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Product = { id: string; slug: string; name: string; category: string | null };

export function PinterestDominationCard() {
  const [domination, setDomination] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perProduct, setPerProduct] = useState(6);
  const [running, setRunning] = useState(false);
  const [lastReport, setLastReport] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: rs } = await supabase
        .from("pinterest_runtime_settings")
        .select("domination_mode")
        .eq("id", 1)
        .maybeSingle();
      setDomination(!!(rs as any)?.domination_mode);

      const { data: pr } = await supabase
        .from("products_public")
        .select("id, slug, name, category")
        .eq("active", true)
        .order("name", { ascending: true })
        .limit(60);
      setProducts((pr || []) as Product[]);
    })();
  }, []);

  const toggleDomination = async (next: boolean) => {
    setSavingFlag(true);
    const { error } = await supabase
      .from("pinterest_runtime_settings")
      .update({ domination_mode: next } as any)
      .eq("id", 1);
    setSavingFlag(false);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    setDomination(next);
    toast.success(next ? "Domination Mode ON — catalog-wide publishing unlocked" : "Domination Mode OFF — back to allowlist");
  };

  const toggleProduct = (slug: string) => {
    const next = new Set(selected);
    next.has(slug) ? next.delete(slug) : next.add(slug);
    setSelected(next);
  };

  const runBatch = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one product");
      return;
    }
    setRunning(true);
    setLastReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: {
          productSlugs: Array.from(selected),
          maxPins: perProduct,
          dominationMode: true,
          dryRun: false,
        },
      });
      if (error) throw error;
      setLastReport(data);
      if ((data as any)?.ok) {
        toast.success(`Queued ${((data as any).pins?.length) ?? 0} viral pins`);
      } else {
        toast.error((data as any)?.message || "Batch failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Batch failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" /> Pinterest Domination Mode
          <Badge variant={domination ? "default" : "secondary"} className="ml-2">
            {domination ? "ACTIVE" : "OFF"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="text-sm">
            <div className="font-medium">Catalog-wide publishing</div>
            <div className="text-xs text-muted-foreground">
              Bypass the single-product allowlist. Enables 6-style viral pin generation across selected products.
            </div>
          </div>
          <Switch checked={domination} onCheckedChange={toggleDomination} disabled={savingFlag} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Pick products for the next batch</div>
            <div className="text-xs text-muted-foreground">{selected.size} selected</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-56 overflow-auto rounded-md border p-2">
            {products.map((p) => (
              <label key={p.slug} className="flex items-center gap-2 text-xs cursor-pointer rounded p-1 hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.has(p.slug)}
                  onChange={() => toggleProduct(p.slug)}
                />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
            {products.length === 0 && <div className="text-xs text-muted-foreground p-2">No products loaded.</div>}
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Pins per product</div>
            <input
              type="number"
              min={1}
              max={8}
              value={perProduct}
              onChange={(e) => setPerProduct(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
              className="w-20 rounded border bg-background px-2 py-1 text-sm"
            />
          </div>
          <Button onClick={runBatch} disabled={running || selected.size === 0}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate Viral Batch (drafts)
          </Button>
        </div>

        {lastReport && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            <div className="font-medium">Last run</div>
            <div>Status: {(lastReport as any).ok ? "OK" : (lastReport as any).code || "ERROR"}</div>
            <div>Pins queued: {(lastReport as any).pins?.length ?? 0}</div>
            {(lastReport as any).message && <div className="text-muted-foreground">{(lastReport as any).message}</div>}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Pins land as <span className="font-mono">draft</span> and require approval before the cron worker publishes.
          Warm-up cap (4/day, ≥90 min gap) and US-audience score threshold remain active.
        </p>
      </CardContent>
    </Card>
  );
}
