import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

type Rec = { id: string; title: string; body: string; category: string | null; confidence: number; status: string; created_at: string };

export function RecommendedNextTab({ onChange }: { onChange?: () => void }) {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [form, setForm] = useState({ title: "", body: "", category: "", confidence: 60 });

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data } = await supabase.from("mi_recommendations").select("*")
      .eq("market", "US").order("created_at", { ascending: false }).limit(100);
    setRecs((data ?? []) as Rec[]);
  }

  async function add() {
    if (!form.title.trim() || !form.body.trim()) return toast.error("Title + body required");
    const { error } = await supabase.from("mi_recommendations").insert({
      title: form.title.trim(), body: form.body.trim(),
      category: form.category || null, market: "US",
      confidence: Number(form.confidence) || 0, status: "new",
    });
    if (error) return toast.error(error.message);
    toast.success("Recommendation added");
    setForm({ title: "", body: "", category: "", confidence: 60 });
    void load(); onChange?.();
  }

  async function setStatus(id: string, status: string) {
    await supabase.from("mi_recommendations").update({ status }).eq("id", id);
    void load(); onChange?.();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Add recommendation</CardTitle>
          <CardDescription>Plain-English actionable next step. Phase 4 will generate these automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder='e.g. "Create 5 more Pinterest video pins for automatic litter box"' /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="pinterest / hooks / styling" /></div>
          </div>
          <div><Label>Body</Label><Textarea rows={3} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Confidence (0–100)</Label><Input type="number" value={form.confidence} onChange={e => setForm({ ...form, confidence: Number(e.target.value) })} /></div>
          </div>
          <Button onClick={add}>Add</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommended next creatives (US)</CardTitle>
        </CardHeader>
        <CardContent>
          {recs.length === 0 ? <p className="text-sm text-muted-foreground">No recommendations yet.</p> :
            <div className="space-y-2">
              {recs.map(r => (
                <div key={r.id} className="p-3 rounded-md border">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{r.title}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{Number(r.confidence).toFixed(0)}%</Badge>
                      <Badge variant={r.status === "new" ? "default" : "secondary"}>{r.status}</Badge>
                    </div>
                  </div>
                  {r.category && <div className="text-xs text-muted-foreground mt-1">{r.category}</div>}
                  <p className="text-sm mt-2 whitespace-pre-wrap">{r.body}</p>
                  <div className="flex gap-2 mt-2">
                    {r.status !== "applied" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "applied")}>Mark applied</Button>}
                    {r.status !== "dismissed" && <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "dismissed")}>Dismiss</Button>}
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