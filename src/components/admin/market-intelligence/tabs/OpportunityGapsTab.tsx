import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Target, Sparkles } from "lucide-react";

type Opp = { id: string; type: string; title: string; score: number; status: string; evidence: unknown; created_at: string };

const TYPES = ["niche_gap","weak_competitor","low_comp_topic","content_gap","viral_hook","seasonal"];

export function OpportunityGapsTab({ onChange }: { onChange?: () => void }) {
  const [opps, setOpps] = useState<Opp[]>([]);
  const [form, setForm] = useState({ type: "niche_gap", title: "", score: 50, evidence: "" });
  const [detecting, setDetecting] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data } = await supabase.from("mi_opportunities").select("*")
      .eq("market", "US").order("score", { ascending: false }).limit(100);
    setOpps((data ?? []) as Opp[]);
  }

  async function add() {
    if (!form.title.trim()) return toast.error("Title required");
    let evidence: unknown = {};
    if (form.evidence.trim()) {
      try { evidence = JSON.parse(form.evidence); } catch { evidence = { note: form.evidence }; }
    }
    const { error } = await supabase.from("mi_opportunities").insert([{
      type: form.type, title: form.title.trim(), market: "US",
      score: Number(form.score) || 0, evidence: evidence as never, status: "open",
    }]);
    if (error) return toast.error(error.message);
    toast.success("Opportunity logged");
    setForm({ ...form, title: "", evidence: "" });
    void load(); onChange?.();
  }

  async function setStatus(id: string, status: string) {
    await supabase.from("mi_opportunities").update({ status }).eq("id", id);
    void load(); onChange?.();
  }

  async function detect() {
    setDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-detect-opportunities", { body: {} });
      if (error) throw error;
      const stats = (data as { stats?: Record<string, number> })?.stats ?? {};
      toast.success(`Detected ${stats.opportunities_inserted ?? 0} opps · ${stats.recommendations_inserted ?? 0} recs`);
      void load(); onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detect failed");
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={detect} disabled={detecting} variant="default" className="gap-2">
          <Sparkles className="h-4 w-4" />
          {detecting ? "Detecting…" : "Detect opportunities"}
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Add opportunity</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Score</Label><Input type="number" value={form.score} onChange={e => setForm({ ...form, score: Number(e.target.value) })} /></div>
          <div className="md:col-span-4"><Label>Evidence (text or JSON)</Label><Textarea rows={2} value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} /></div>
          <div className="md:col-span-4"><Button onClick={add}>Add</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4" /> US opportunity gaps</CardTitle>
          <CardDescription>Open opportunities ranked by score.</CardDescription>
        </CardHeader>
        <CardContent>
          {opps.length === 0 ? <p className="text-sm text-muted-foreground">No opportunities logged yet.</p> :
            <div className="space-y-2">
              {opps.map(o => (
                <div key={o.id} className="flex items-center justify-between p-3 rounded-md border">
                  <div>
                    <div className="font-medium">{o.title}</div>
                    <div className="text-xs text-muted-foreground"><Badge variant="secondary">{o.type}</Badge> · {o.status}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{Number(o.score).toFixed(0)}</Badge>
                    {o.status === "open" ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(o.id, "actioned")}>Mark actioned</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(o.id, "open")}>Reopen</Button>
                    )}
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