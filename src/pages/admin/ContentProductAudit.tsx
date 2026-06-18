import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Row = {
  id: string;
  scan_id: string;
  pin_id: string | null;
  queue_id: string | null;
  asset_id: string | null;
  video_product_slug: string | null;
  linked_product_slug: string | null;
  destination_url: string | null;
  detected_product: string | null;
  confidence: number | null;
  verdict: "MATCH" | "POSSIBLE_MISMATCH" | "CONFIRMED_MISMATCH" | "ERROR";
  reasoning: string | null;
  frame_urls: string[];
  model: string | null;
  repair_status: string | null;
  created_at: string;
};

const VERDICT_COLOR: Record<Row["verdict"], "secondary" | "destructive" | "outline" | "default"> = {
  MATCH: "secondary",
  POSSIBLE_MISMATCH: "outline",
  CONFIRMED_MISMATCH: "destructive",
  ERROR: "outline",
};

export default function ContentProductAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    // Latest scan only
    const { data: scanRow } = await supabase
      .from("content_product_audit_runs")
      .select("scan_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!scanRow?.scan_id) { setRows([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("content_product_audit_runs")
      .select("*")
      .eq("scan_id", scanRow.scan_id)
      .order("verdict", { ascending: true });
    setLoading(false);
    if (error) return toast.error(error.message);
    const list = (data ?? []) as unknown as Row[];
    setRows(list);
    // pull video urls from pinterest_video_assets
    const assetIds = Array.from(new Set(list.map((r) => r.asset_id).filter(Boolean))) as string[];
    if (assetIds.length) {
      const { data: assets } = await supabase
        .from("pinterest_video_assets")
        .select("id, public_url, thumbnail_url")
        .in("id", assetIds);
      const map: Record<string, string> = {};
      (assets ?? []).forEach((a: any) => { map[a.id] = a.thumbnail_url || a.public_url; });
      setVideoUrls(map);
    }
  }

  useEffect(() => { load(); }, []);

  function exportCsv() {
    const headers = ["pin_id", "verdict", "detected_product", "video_slug", "linked_slug", "confidence", "destination_url", "reasoning"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        r.pin_id ?? "",
        r.verdict,
        JSON.stringify(r.detected_product ?? ""),
        r.video_product_slug ?? "",
        r.linked_product_slug ?? "",
        r.confidence ?? "",
        JSON.stringify(r.destination_url ?? ""),
        JSON.stringify(r.reasoning ?? ""),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `content-product-audit-${Date.now()}.csv`;
    a.click();
  }

  const summary = useMemo(() => {
    const s = { MATCH: 0, POSSIBLE_MISMATCH: 0, CONFIRMED_MISMATCH: 0, ERROR: 0 } as Record<Row["verdict"], number>;
    rows.forEach((r) => { s[r.verdict] = (s[r.verdict] || 0) + 1; });
    return s;
  }, [rows]);

  const sorted = useMemo(() => {
    const order = { CONFIRMED_MISMATCH: 0, POSSIBLE_MISMATCH: 1, ERROR: 2, MATCH: 3 } as Record<string, number>;
    return [...rows].sort((a, b) => (order[a.verdict] - order[b.verdict]) || ((b.confidence ?? 0) - (a.confidence ?? 0)));
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Content → Product Integrity Audit</h1>
          <p className="text-sm text-muted-foreground">AI vision verifies the actual video content matches the destination product. Database mapping is not trusted.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>{loading ? "Loading…" : "Reload latest scan"}</Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pins scanned</div><div className="text-2xl font-semibold">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Match</div><div className="text-2xl font-semibold text-green-600">{summary.MATCH}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Possible mismatch</div><div className="text-2xl font-semibold text-amber-600">{summary.POSSIBLE_MISMATCH}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Confirmed mismatch</div><div className="text-2xl font-semibold text-red-600">{summary.CONFIRMED_MISMATCH}{summary.ERROR ? ` (+${summary.ERROR} err)` : ""}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left">
            <tr>
              <th className="px-3 py-2">Preview</th>
              <th className="px-3 py-2">Verdict</th>
              <th className="px-3 py-2">Pin</th>
              <th className="px-3 py-2">Detected in video</th>
              <th className="px-3 py-2">Linked product</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-2">
                  {r.asset_id && videoUrls[r.asset_id] ? (
                    /\.mp4(\?|$)/i.test(videoUrls[r.asset_id]) ? (
                      <video src={videoUrls[r.asset_id]} className="w-32 rounded" muted playsInline preload="metadata" controls />
                    ) : (
                      <img src={videoUrls[r.asset_id]} alt="" className="w-32 rounded" />
                    )
                  ) : "—"}
                </td>
                <td className="px-3 py-2"><Badge variant={VERDICT_COLOR[r.verdict]}>{r.verdict}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.pin_id ? (
                    <a className="underline" target="_blank" rel="noreferrer" href={`https://www.pinterest.com/pin/${r.pin_id}/`}>{r.pin_id}</a>
                  ) : "—"}
                </td>
                <td className="px-3 py-2">{r.detected_product || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.linked_product_slug || "—"}</td>
                <td className="px-3 py-2">{r.confidence != null ? Number(r.confidence).toFixed(2) : "—"}</td>
                <td className="px-3 py-2 max-w-[420px] text-xs text-muted-foreground">{r.reasoning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Model: Lovable AI Gateway · google/gemini-3-flash-preview. Frames sampled at 0/25/50/75/95% via ffmpeg.
      </p>
    </div>
  );
}