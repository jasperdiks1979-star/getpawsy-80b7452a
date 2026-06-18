import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Row = {
  queue_id: string;
  pin_id: string | null;
  external_url: string | null;
  status: string;
  created_at: string;
  asset_id: string;
  video_product_slug: string;
  destination_url: string;
  verdict: "MATCH" | "MISMATCH";
  storyboard_product_slug: string | null;
};

export default function PinterestVideoDestinationAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  async function scan() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pinterest-video-destination-audit", {
      body: { action: "scan", days },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows(data?.rows ?? []);
    toast.success(`${data?.mismatch ?? 0} mismatches found (${data?.published_mismatch ?? 0} already on Pinterest)`);
  }

  async function repair() {
    if (!confirm("Repair all mismatched pins via Pinterest PATCH? Unpatchable pins will be flagged for recreation.")) return;
    setRepairing(true);
    const { data, error } = await supabase.functions.invoke("pinterest-video-destination-audit", {
      body: { action: "repair", days },
    });
    setRepairing(false);
    if (error) return toast.error(error.message);
    toast.success(`Attempted ${data?.attempted ?? 0} pins`);
    scan();
  }

  useEffect(() => { scan(); /* eslint-disable-next-line */ }, []);

  const mismatch = rows.filter((r) => r.verdict === "MISMATCH");
  const publishedMismatch = mismatch.filter((r) => r.pin_id);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest Video → Destination Audit</h1>
          <p className="text-sm text-muted-foreground">
            Verifies every Pinterest video pin links to the same product shown in the video.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>last {d}d</option>)}
          </select>
          <Button onClick={scan} disabled={loading} variant="outline">{loading ? "Scanning…" : "Re-scan"}</Button>
          <Button onClick={repair} disabled={repairing || publishedMismatch.length === 0}>
            {repairing ? "Repairing…" : `Repair ${publishedMismatch.length}`}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-semibold">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Match</div><div className="text-2xl font-semibold text-green-600">{rows.length - mismatch.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Mismatch</div><div className="text-2xl font-semibold text-amber-600">{mismatch.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Published mismatch</div><div className="text-2xl font-semibold text-red-600">{publishedMismatch.length}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left">
            <tr>
              <th className="px-3 py-2">Verdict</th>
              <th className="px-3 py-2">Pin</th>
              <th className="px-3 py-2">Video product (slug)</th>
              <th className="px-3 py-2">Destination URL</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.queue_id} className="border-t align-top">
                <td className="px-3 py-2">
                  <Badge variant={r.verdict === "MATCH" ? "secondary" : "destructive"}>{r.verdict}</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {r.pin_id ? (
                    <a className="underline" target="_blank" rel="noreferrer" href={`https://www.pinterest.com/pin/${r.pin_id}/`}>{r.pin_id}</a>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.video_product_slug}</td>
                <td className="px-3 py-2 font-mono text-xs break-all max-w-[480px]">{r.destination_url}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}