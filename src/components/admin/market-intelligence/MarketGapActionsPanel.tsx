import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Check, X } from "lucide-react";

interface Creative { channel: string; hook: string; angle: string }
interface Product { id: string; slug: string; title: string }
interface ActionItem {
  id: string;
  gap_id: string | null;
  title: string;
  rationale: string | null;
  suggested_products: Product[];
  target_keywords: string[];
  recommended_creatives: Creative[];
  recommended_channels: string[];
  priority_score: number;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  dismissed: "bg-muted text-muted-foreground",
  routed: "bg-blue-500/15 text-blue-700 border-blue-500/30",
};

export function MarketGapActionsPanel() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    let q = supabase
      .from("market_gap_action_items")
      .select("*")
      .order("priority_score", { ascending: false })
      .limit(50);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setItems(((data ?? []) as unknown) as ActionItem[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [filter]);

  async function generate() {
    try {
      const { data, error } = await supabase.functions.invoke("market-gap-actions-generate", { body: { limit: 10 } });
      if (error) throw error;
      toast.success((data as { message?: string })?.message ?? "Generated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function updateStatus(id: string, status: "approved" | "dismissed" | "routed") {
    const patch: Record<string, unknown> = { status };
    if (status === "approved") patch.approved_at = new Date().toISOString();
    if (status === "routed") patch.routed_at = new Date().toISOString();
    if (notes[id]) patch.admin_notes = notes[id];
    const { error } = await supabase.from("market_gap_action_items").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    await load();
  }

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Gap Action Items</h2>
          <p className="text-sm text-muted-foreground">Admin-controlled action plans from opportunity gaps — suggested products, target keywords, creatives.</p>
        </div>
        <div className="flex gap-2">
          {(["pending", "approved", "all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f}</Button>
          ))}
          <Button size="sm" onClick={generate} disabled={loading}>
            <Sparkles className="h-4 w-4 mr-1" /> Generate from gaps
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No action items. Click "Generate from gaps" to synthesize from open opportunity gaps.</p>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="border rounded-lg p-4 bg-card/40 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{it.title}</h3>
                    <Badge className={statusColors[it.status] ?? ""} variant="outline">{it.status}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">score {it.priority_score}</span>
                  </div>
                  {it.rationale && <p className="text-sm text-muted-foreground mt-1">{it.rationale}</p>}
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="font-semibold mb-1">Suggested products</div>
                  {it.suggested_products?.length ? (
                    <ul className="space-y-0.5">
                      {it.suggested_products.map((p) => (
                        <li key={p.id}>
                          <a href={`/products/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate block">{p.title}</a>
                        </li>
                      ))}
                    </ul>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div>
                  <div className="font-semibold mb-1">Target keywords</div>
                  <div className="flex flex-wrap gap-1">
                    {it.target_keywords?.map((k, i) => <Badge key={i} variant="secondary" className="text-[10px]">{k}</Badge>)}
                  </div>
                </div>
                <div>
                  <div className="font-semibold mb-1">Recommended creatives</div>
                  <ul className="space-y-1">
                    {it.recommended_creatives?.map((c, i) => (
                      <li key={i} className="border-l-2 border-primary/40 pl-2">
                        <span className="font-mono text-[10px] uppercase text-muted-foreground">{c.channel}</span>
                        <div>{c.hook}</div>
                        <div className="text-muted-foreground italic">{c.angle}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {it.status === "pending" && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Optional admin notes…"
                    value={notes[it.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))}
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateStatus(it.id, "approved")}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(it.id, "dismissed")}>
                      <X className="h-4 w-4 mr-1" /> Dismiss
                    </Button>
                  </div>
                </div>
              )}
              {it.status === "approved" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus(it.id, "routed")}>Mark routed</Button>
              )}
              {it.admin_notes && <p className="text-xs text-muted-foreground border-t pt-2">📝 {it.admin_notes}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}