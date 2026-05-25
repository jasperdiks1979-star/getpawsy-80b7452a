import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Video, Image as ImageIcon, Film, AlertTriangle } from "lucide-react";

type QualityJob = {
  id: string;
  product_slug: string;
  status: string;
  media_type: string | null;
  media_hash: string | null;
  hook_archetype: string | null;
  output_thumbnail_url: string | null;
  output_mp4_url: string | null;
  pushed_to_pinterest_at: string | null;
  publish_blocked_reason: string | null;
  qa_composite_score: number | null;
  pinterest_pin_url: string | null;
};

type CooldownRow = {
  product_slug: string;
  last_pushed_at: string | null;
  videos_last_7d: number | null;
  slideshows_last_7d: number | null;
  statics_last_7d: number | null;
};

type Filter = "all" | "video" | "slideshow" | "static" | "blocked";

const TYPE_ICON = {
  video: <Video className="h-3 w-3" />,
  slideshow: <Film className="h-3 w-3" />,
  static: <ImageIcon className="h-3 w-3" />,
  unknown: <AlertTriangle className="h-3 w-3" />,
};

function typeVariant(t: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (t === "video") return "default";
  if (t === "slideshow") return "secondary";
  if (t === "static") return "destructive";
  return "outline";
}

export default function PinterestQualityPanel() {
  const [jobs, setJobs] = useState<QualityJob[]>([]);
  const [cooldowns, setCooldowns] = useState<Record<string, CooldownRow>>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from("cinematic_ad_jobs")
        .select("id,product_slug,status,media_type,media_hash,hook_archetype,output_thumbnail_url,output_mp4_url,pushed_to_pinterest_at,publish_blocked_reason,qa_composite_score,pinterest_pin_url")
        .order("updated_at", { ascending: false })
        .limit(40);
      setJobs((rows ?? []) as QualityJob[]);
      const { data: cd } = await supabase
        .from("pinterest_product_cooldown_v" as any)
        .select("*")
        .limit(200);
      const map: Record<string, CooldownRow> = {};
      for (const r of ((cd ?? []) as unknown as CooldownRow[])) map[r.product_slug] = r;
      setCooldowns(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = jobs.filter((j) => {
    if (filter === "all") return true;
    if (filter === "blocked") return !!j.publish_blocked_reason;
    return (j.media_type ?? "video") === filter;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Pinterest Creative Quality</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {(["all", "video", "slideshow", "static", "blocked"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-2">Preview</th>
                <th className="text-left p-2">Slug</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Hook</th>
                <th className="text-left p-2">QA</th>
                <th className="text-left p-2">7d (v/s/i)</th>
                <th className="text-left p-2">Blocked</th>
                <th className="text-left p-2">Pin</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => {
                const cd = cooldowns[j.product_slug];
                const t = j.media_type ?? (j.output_mp4_url ? "video" : "unknown");
                return (
                  <tr key={j.id} className="border-t">
                    <td className="p-2">
                      {j.output_thumbnail_url ? (
                        <img src={j.output_thumbnail_url} alt="" className="w-12 h-20 object-cover rounded" loading="lazy" />
                      ) : (
                        <div className="w-12 h-20 bg-muted rounded" />
                      )}
                    </td>
                    <td className="p-2 max-w-[180px] truncate">{j.product_slug}</td>
                    <td className="p-2">
                      <Badge variant={typeVariant(t)} className="gap-1">
                        {TYPE_ICON[t as keyof typeof TYPE_ICON] ?? TYPE_ICON.unknown}
                        {t}
                      </Badge>
                    </td>
                    <td className="p-2">{j.hook_archetype ?? "—"}</td>
                    <td className="p-2">{j.qa_composite_score ?? "—"}</td>
                    <td className="p-2 tabular-nums">
                      {cd ? `${cd.videos_last_7d}/${cd.slideshows_last_7d}/${cd.statics_last_7d}` : "—"}
                    </td>
                    <td className="p-2 text-destructive max-w-[180px] truncate">
                      {j.publish_blocked_reason ?? "—"}
                    </td>
                    <td className="p-2">
                      {j.pinterest_pin_url ? (
                        <a href={j.pinterest_pin_url} target="_blank" rel="noreferrer" className="underline">open</a>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No jobs match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}