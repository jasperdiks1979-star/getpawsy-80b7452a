import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, ShieldAlert, Loader2 } from "lucide-react";

type Recipe = { id: string; name: string; score: number };
type Product = { id: string; name: string; slug: string };
type Draft = {
  id: string; recipe_id: string | null; product_id: string | null;
  generated_copy: string | null; generated_brief: string | null;
  status: string; compliance_flags: unknown; created_at: string;
};

export function RemixEngineTab() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [recipeId, setRecipeId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [productQuery, setProductQuery] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [r, d] = await Promise.all([
      supabase.from("mi_creative_recipes").select("id,name,score").eq("active", true).order("score", { ascending: false }).limit(50),
      supabase.from("mi_remix_drafts").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setRecipes((r.data ?? []) as Recipe[]);
    setDrafts((d.data ?? []) as Draft[]);
  }

  async function searchProducts() {
    const q = productQuery.trim();
    const query = supabase.from("products").select("id,name,slug").limit(20);
    const { data } = q ? await query.ilike("name", `%${q}%`) : await query;
    setProducts((data ?? []) as Product[]);
  }

  async function runRemix() {
    if (!recipeId) return toast.error("Select a recipe");
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-remix-draft", {
        body: { recipe_id: recipeId, product_id: productId || undefined },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "Remix failed");
      toast.success(data.message ?? "Draft created");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remix failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Drafts only · No auto-publish</AlertTitle>
        <AlertDescription>
          The Remix Engine produces fully original copy + a text-only visual brief from a recipe pattern.
          Nothing is published. Compliance flags surface when banned phrases appear.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Generate remix draft</CardTitle>
          <CardDescription>Pick an active recipe (and optional product) → AI produces an original draft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Recipe</Label>
            <Select value={recipeId} onValueChange={setRecipeId}>
              <SelectTrigger><SelectValue placeholder="Select a recipe…" /></SelectTrigger>
              <SelectContent>
                {recipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name} · {Number(r.score).toFixed(0)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid md:grid-cols-[1fr_auto] gap-2">
            <div>
              <Label>Product (optional)</Label>
              <div className="flex gap-2">
                <Input placeholder="Search by name…" value={productQuery} onChange={e => setProductQuery(e.target.value)} />
                <Button type="button" variant="outline" onClick={searchProducts}>Search</Button>
              </div>
            </div>
          </div>
          {products.length > 0 && (
            <div>
              <Label>Match</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Pick a product…" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={runRemix} disabled={running || !recipeId}>
            {running ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : <>Generate draft</>}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent drafts</CardTitle></CardHeader>
        <CardContent>
          {drafts.length === 0 ? <p className="text-sm text-muted-foreground">No drafts yet.</p> :
            <div className="space-y-3">
              {drafts.map(d => {
                const flags = Array.isArray(d.compliance_flags) ? d.compliance_flags as string[] : [];
                return (
                  <div key={d.id} className="p-3 rounded-md border space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Badge variant={d.status === "draft" ? "secondary" : "destructive"}>{d.status}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                    </div>
                    {d.generated_copy && <pre className="text-xs whitespace-pre-wrap">{d.generated_copy}</pre>}
                    {d.generated_brief && (
                      <div className="text-xs text-muted-foreground border-t pt-2">
                        <strong>Brief:</strong> {d.generated_brief}
                      </div>
                    )}
                    {flags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {flags.map((f, i) => <Badge key={i} variant="destructive" className="text-[10px]">{f}</Badge>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}