import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, Video, Layers, Home, MessageCircle, Image as ImageIcon } from "lucide-react";

// PinterestContentEnginePanel
// ---------------------------------------------------------------------------
// Surfaces the new multi-archetype rotation (spotlight / compilation /
// lifestyle / ugc / slideshow), shows today's queue, the 7-day mix vs target,
// and lets the admin force-generate the next pin per archetype.
// ---------------------------------------------------------------------------

type Archetype =
  | "product_spotlight"
  | "multi_product_compilation"
  | "lifestyle_scene"
  | "ugc_pov"
  | "animated_slideshow";

const ARCHETYPES: { key: Archetype; label: string; target: number; Icon: typeof Video }[] = [
  { key: "product_spotlight", label: "Spotlight", target: 0.4, Icon: Video },
  { key: "multi_product_compilation", label: "Compilation", target: 0.2, Icon: Layers },
  { key: "lifestyle_scene", label: "Lifestyle", target: 0.15, Icon: Home },
  { key: "ugc_pov", label: "UGC POV", target: 0.15, Icon: MessageCircle },
  { key: "animated_slideshow", label: "Slideshow", target: 0.1, Icon: ImageIcon },
];

type Row = {
  id: string;
  content_type: Archetype | null;
  hook_archetype: string | null;
  product_slug: string;
  product_ids: string[] | null;
  output_thumbnail_url: string | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  predicted_engagement: number | null;
  status: string;
  publish_blocked_reason: string | null;
};

const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

export function PinterestContentEnginePanel() {
  const [queue, setQueue] = useState<Row[]>([]);
  const [weekly, setWeekly] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastDirector, setLastDirector] = useState<string>("");

  const load = async () => {
    setBusy(true);
    try {
      const [{ data: q }, { data: w }] = await Promise.all([
        supabase
          .from("cinematic_ad_jobs")
          .select("id, content_type, hook_archetype, product_slug, product_ids, output_thumbnail_url, scheduled_publish_at, published_at, predicted_engagement, status, publish_blocked_reason")
          .or("status.eq.publishable,status.eq.approved,scheduled_publish_at.not.is.null")
          .order("scheduled_publish_at", { ascending: true, nullsFirst: false })
          .limit(25),
        supabase
          .from("cinematic_ad_jobs")
          .select("id, content_type, hook_archetype, product_slug, product_ids, output_thumbnail_url, scheduled_publish_at, published_at, predicted_engagement, status, publish_blocked_reason")
          .not("published_at", "is", null)
          .gte("published_at", new Date(Date.now() - 7 * 86400000).toISOString())
          .limit(200),
      ]);
      setQueue((q ?? []) as Row[]);
      setWeekly((w ?? []) as Row[]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const mix = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of weekly) counts[r.content_type ?? "unknown"] = (counts[r.content_type ?? "unknown"] ?? 0) + 1;
    const total = Math.max(1, weekly.length);
    return ARCHETYPES.map((a) => ({
      ...a,
      count: counts[a.key] ?? 0,
      actual: (counts[a.key] ?? 0) / total,
    }));
  }, [weekly]);

  const forceArchetype = async (a: Archetype) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-content-director", {
        body: { force_archetype: a },
      });
      setLastDirector(error ? `Error: ${error.message}` : JSON.stringify(data, null, 2));
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Pinterest Content Engine
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 7-day archetype mix vs target */}
        <div>
          <div className="text-sm font-semibold mb-2">7-day mix (target vs actual)</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {mix.map(({ key, label, Icon, target, actual, count }) => {
              const tone = actual >= target * 0.7 ? "default" : "destructive";
              return (
                <div key={key} className="border rounded-md p-2 space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <Icon className="h-3 w-3" /> {label}
                  </div>
                  <div className="text-lg font-semibold">{count}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtPct(actual)} / target {fmtPct(target)}
                  </div>
                  <Badge variant={tone} className="text-[10px]">
                    {tone === "default" ? "on track" : "under target"}
                  </Badge>
                  <Button size="sm" variant="ghost" className="w-full text-[11px] h-7"
                    onClick={() => forceArchetype(key)} disabled={busy}>
                    Generate
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Last director response */}
        {lastDirector && (
          <pre className="text-[10px] bg-muted p-2 rounded max-h-40 overflow-auto">{lastDirector}</pre>
        )}

        {/* Today's queue */}
        <div>
          <div className="text-sm font-semibold mb-2">Upcoming queue ({queue.length})</div>
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {queue.length === 0 && (
              <div className="text-sm text-muted-foreground p-4 border rounded">
                Nothing scheduled. Use "Generate" above to seed the queue.
              </div>
            )}
            {queue.map((r) => (
              <div key={r.id} className="flex gap-3 border rounded-md p-2">
                {r.output_thumbnail_url ? (
                  <img src={r.output_thumbnail_url} alt="" className="h-16 w-16 object-cover rounded" loading="lazy" />
                ) : (
                  <div className="h-16 w-16 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">no media</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{r.content_type ?? "unknown"}</Badge>
                    {r.hook_archetype && <Badge variant="secondary">{r.hook_archetype}</Badge>}
                    <span className="text-muted-foreground truncate">{r.product_slug}</span>
                  </div>
                  {r.product_ids && r.product_ids.length > 1 && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">+{r.product_ids.length - 1} more products</div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span>status: {r.status}</span>
                    {r.scheduled_publish_at && (
                      <span>scheduled: {new Date(r.scheduled_publish_at).toLocaleString()}</span>
                    )}
                    {r.predicted_engagement != null && <span>est. {r.predicted_engagement}</span>}
                  </div>
                  {r.publish_blocked_reason && (
                    <div className="text-[11px] text-destructive mt-0.5">blocked: {r.publish_blocked_reason}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PinterestContentEnginePanel;
