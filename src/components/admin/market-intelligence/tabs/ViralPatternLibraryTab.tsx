import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BookOpen, Plus } from "lucide-react";

type Recipe = {
  id: string; name: string; hook_family: string | null; first_3s_structure: string | null;
  cta_timing: string | null; overlay_style: string | null; palette_category: string | null;
  emotional_angle: string | null; pacing: string | null; score: number; active: boolean;
};

const FIELDS = [
  ["hook_family", "Hook family"], ["first_3s_structure", "First 3s structure"],
  ["cta_timing", "CTA timing"], ["overlay_style", "Overlay style"],
  ["palette_category", "Palette"], ["emotional_angle", "Emotional angle"],
  ["curiosity_pattern", "Curiosity pattern"], ["pain_framing", "Pain framing"],
  ["benefit_framing", "Benefit framing"], ["social_proof_structure", "Social proof"],
  ["pacing", "Pacing"], ["scene_density", "Scene density"], ["product_positioning", "Product positioning"],
] as const;

export function ViralPatternLibraryTab({ onChange }: { onChange?: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [form, setForm] = useState<Record<string, string>>({ name: "", score: "50" });

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data } = await supabase.from("mi_creative_recipes").select("*").order("score", { ascending: false }).limit(100);
    setRecipes((data ?? []) as Recipe[]);
  }

  async function add() {
    if (!form.name?.trim()) return toast.error("Name required");
    const payload: Record<string, unknown> = { name: form.name.trim(), score: Number(form.score) || 0, active: true };
    for (const [k] of FIELDS) if (form[k]) payload[k] = form[k];
    const { error } = await supabase.from("mi_creative_recipes").insert([payload as never]);
    if (error) return toast.error(error.message);
    toast.success("Recipe added");
    setForm({ name: "", score: "50" });
    void load(); onChange?.();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add creative recipe</CardTitle>
          <CardDescription>Reusable pattern, not asset reuse. Original copy/visuals required at remix time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Score</Label><Input type="number" value={form.score || "50"} onChange={e => setForm({ ...form, score: e.target.value })} /></div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {FIELDS.map(([k, label]) => (
              <div key={k}>
                <Label>{label}</Label>
                <Textarea rows={1} value={form[k] || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <Button onClick={add}>Add recipe</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> Viral Pattern Library</CardTitle>
          <CardDescription>Top recipes by score. Used by the (Phase 3) Remix Engine.</CardDescription>
        </CardHeader>
        <CardContent>
          {recipes.length === 0 ? <p className="text-sm text-muted-foreground">No recipes yet.</p> :
            <div className="space-y-2">
              {recipes.map(r => (
                <div key={r.id} className="p-3 rounded-md border">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{r.name}</div>
                    <Badge>{Number(r.score).toFixed(0)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                    {[r.hook_family, r.pacing, r.palette_category, r.emotional_angle, r.cta_timing].filter(Boolean).map((v, i) => <Badge key={i} variant="outline">{v}</Badge>)}
                  </div>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}