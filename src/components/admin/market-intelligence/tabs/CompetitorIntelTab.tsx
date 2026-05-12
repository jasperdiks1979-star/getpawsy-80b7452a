import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert, Plus, ExternalLink } from "lucide-react";

type Competitor = { id: string; name: string; domain: string | null; category: string | null };
type Observation = {
  id: string; competitor_id: string | null; url: string; platform: string | null;
  hook_type: string | null; cta_type: string | null; visual_style: string | null;
  product_category: string | null; aesthetic_category: string | null;
  trust_signals: string | null; lp_notes: string | null; observed_at: string;
};

export function CompetitorIntelTab({ onChange }: { onChange?: () => void }) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [newComp, setNewComp] = useState({ name: "", domain: "", category: "" });
  const [obs, setObs] = useState({
    competitor_id: "", url: "", platform: "pinterest",
    hook_type: "", cta_type: "", visual_style: "",
    product_category: "", aesthetic_category: "",
    trust_signals: "", lp_notes: "",
  });

  useEffect(() => { void load(); }, []);

  async function load() {
    const [c, o] = await Promise.all([
      supabase.from("mi_competitors").select("*").order("name"),
      supabase.from("mi_competitor_observations").select("*").order("observed_at", { ascending: false }).limit(100),
    ]);
    setCompetitors((c.data ?? []) as Competitor[]);
    setObservations((o.data ?? []) as Observation[]);
  }

  async function addCompetitor() {
    if (!newComp.name.trim()) return toast.error("Name required");
    const { error } = await supabase.from("mi_competitors").insert({
      name: newComp.name.trim(),
      domain: newComp.domain || null,
      category: newComp.category || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Competitor added");
    setNewComp({ name: "", domain: "", category: "" });
    void load();
  }

  async function addObservation() {
    if (!obs.url.trim()) return toast.error("URL required");
    const { error } = await supabase.from("mi_competitor_observations").insert({
      competitor_id: obs.competitor_id || null,
      url: obs.url.trim(),
      platform: obs.platform || null,
      hook_type: obs.hook_type || null,
      cta_type: obs.cta_type || null,
      visual_style: obs.visual_style || null,
      product_category: obs.product_category || null,
      aesthetic_category: obs.aesthetic_category || null,
      trust_signals: obs.trust_signals || null,
      lp_notes: obs.lp_notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Observation logged");
    setObs({ ...obs, url: "", hook_type: "", cta_type: "", visual_style: "", trust_signals: "", lp_notes: "" });
    void load(); onChange?.();
  }

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Compliant observation only</AlertTitle>
        <AlertDescription>
          Log <strong>public URLs and pattern descriptions only</strong>. Never download competitor assets.
          Never copy reviews. Never clone exact creatives.
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add competitor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Name</Label><Input value={newComp.name} onChange={e => setNewComp({ ...newComp, name: e.target.value })} /></div>
            <div><Label>Domain</Label><Input value={newComp.domain} onChange={e => setNewComp({ ...newComp, domain: e.target.value })} placeholder="example.com" /></div>
            <div><Label>Category</Label><Input value={newComp.category} onChange={e => setNewComp({ ...newComp, category: e.target.value })} placeholder="cat-trees / dog-beds" /></div>
            <Button onClick={addCompetitor}>Add</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Log observation</CardTitle>
            <CardDescription>Pattern notes, never asset copies.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Competitor</Label>
              <Select value={obs.competitor_id} onValueChange={v => setObs({ ...obs, competitor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{competitors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Public URL</Label><Input value={obs.url} onChange={e => setObs({ ...obs, url: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Platform</Label><Input value={obs.platform} onChange={e => setObs({ ...obs, platform: e.target.value })} /></div>
              <div><Label>Hook type</Label><Input value={obs.hook_type} onChange={e => setObs({ ...obs, hook_type: e.target.value })} placeholder="curiosity / pain-relief" /></div>
              <div><Label>CTA type</Label><Input value={obs.cta_type} onChange={e => setObs({ ...obs, cta_type: e.target.value })} placeholder="shop now / learn more" /></div>
              <div><Label>Visual style</Label><Input value={obs.visual_style} onChange={e => setObs({ ...obs, visual_style: e.target.value })} placeholder="lifestyle / studio" /></div>
              <div><Label>Product cat.</Label><Input value={obs.product_category} onChange={e => setObs({ ...obs, product_category: e.target.value })} /></div>
              <div><Label>Aesthetic</Label><Input value={obs.aesthetic_category} onChange={e => setObs({ ...obs, aesthetic_category: e.target.value })} placeholder="warm beige / minimal" /></div>
            </div>
            <div><Label>Trust signals</Label><Input value={obs.trust_signals} onChange={e => setObs({ ...obs, trust_signals: e.target.value })} placeholder="badges, guarantees" /></div>
            <div><Label>LP notes</Label><Textarea rows={2} value={obs.lp_notes} onChange={e => setObs({ ...obs, lp_notes: e.target.value })} /></div>
            <Button onClick={addObservation}>Log observation</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent observations</CardTitle></CardHeader>
        <CardContent>
          {observations.length === 0 ? <p className="text-sm text-muted-foreground">No observations yet.</p> :
            <div className="space-y-2">
              {observations.map(o => (
                <div key={o.id} className="p-3 rounded-md border text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium hover:underline flex items-center gap-1">
                      {o.url.length > 70 ? o.url.slice(0, 70) + "…" : o.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <span className="text-xs text-muted-foreground">{new Date(o.observed_at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {[o.platform, o.hook_type, o.cta_type, o.visual_style, o.aesthetic_category].filter(Boolean).join(" · ")}
                  </div>
                  {o.lp_notes && <div className="text-xs mt-1">{o.lp_notes}</div>}
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </div>
  );
}