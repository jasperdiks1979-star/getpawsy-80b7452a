import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, Rocket, Download } from "lucide-react";

type RepairRow = {
  id: string;
  pin_queue_id: string | null;
  pinterest_pin_id: string | null;
  product_slug: string | null;
  category_key: string | null;
  board_name: string | null;
  overlay_text: string | null;
  pin_title: string | null;
  destination_link: string | null;
  severity: string;
  status: string;
  violation_types: string[] | null;
  details: any;
  updated_at: string;
};

type DraftRow = {
  id: string;
  pin_title: string;
  overlay_text: string | null;
  category_key: string | null;
  board_name: string;
  hook_group: string | null;
  destination_link: string;
  meta: any;
};

function escapeCsv(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function PinterestLivePinRepair() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [drafts, setDrafts] = useState<Map<string, DraftRow>>(new Map());
  const [stats, setStats] = useState({ done: 0, pending: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execReport, setExecReport] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    const { data: q } = await supabase
      .from("pinterest_live_pin_repair_queue")
      .select("id, pin_queue_id, pinterest_pin_id, product_slug, category_key, board_name, overlay_text, pin_title, destination_link, severity, status, violation_types, details, updated_at")
      .eq("recommended_action", "replace")
      .order("updated_at", { ascending: false })
      .limit(400);

    const queueRows = (q ?? []) as RepairRow[];
    setRows(queueRows);

    const draftIds = queueRows
      .map((r) => r.details?.replacement_draft_id)
      .filter(Boolean) as string[];

    if (draftIds.length) {
      const { data: d } = await supabase
        .from("pinterest_pin_queue")
        .select("id, pin_title, overlay_text, category_key, board_name, hook_group, destination_link, meta")
        .in("id", draftIds);
      const map = new Map<string, DraftRow>();
      (d ?? []).forEach((row) => map.set(row.id, row as DraftRow));
      setDrafts(map);
    }

    const done = queueRows.filter((r) => r.status === "done").length;
    const pending = queueRows.filter((r) => r.status === "pending").length;
    setStats({ done, pending, total: queueRows.length });
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runGenerator() {
    setRunning(true);
    try {
      await supabase.functions.invoke("pinterest-live-pin-repair-generate", { body: { limit: 300 } });
      await load();
    } finally {
      setRunning(false);
    }
  }

  async function runExecute() {
    if (!confirm("Publish 25 replacement pins, verify them, then DELETE the 25 mismatched live pins? This is live Pinterest activity.")) return;
    setExecuting(true);
    setExecReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-live-pin-repair-execute", { body: { limit: 25 } });
      if (error) {
        setExecReport({ ok: false, error: error.message });
      } else {
        setExecReport(data);
      }
      await load();
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Live Pin Repair Queue</h1>
          <p className="text-muted-foreground mt-1">Category-correct replacement drafts for category-mismatch live pins. Publishing remains paused.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runGenerator} disabled={running || executing}>
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Generate Drafts
          </Button>
          <Button onClick={runExecute} disabled={executing || running}>
            {executing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
            Execute First 25 (Publish + Delete)
          </Button>
        </div>
      </div>

      {execReport && (
        <Card>
          <CardHeader>
            <CardTitle>Execution Report {execReport.paused ? <Badge className="ml-2">Paused for approval</Badge> : null}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div><div className="text-muted-foreground">Processed</div><div className="text-2xl font-bold">{execReport.processed ?? 0}</div></div>
              <div><div className="text-muted-foreground">Published</div><div className="text-2xl font-bold text-green-600">{execReport.succeeded ?? 0}</div></div>
              <div><div className="text-muted-foreground">Deleted</div><div className="text-2xl font-bold text-amber-600">{execReport.deleted ?? 0}</div></div>
              <div><div className="text-muted-foreground">Failed</div><div className="text-2xl font-bold text-destructive">{execReport.failed ?? 0}</div></div>
              <div><div className="text-muted-foreground">Cap</div><div className="text-2xl font-bold">{execReport.cap ?? 25}</div></div>
            </div>
            {execReport.error && <div className="text-destructive text-sm">{execReport.error}</div>}
            {Array.isArray(execReport.report) && execReport.report.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="p-2">Status</th>
                      <th className="p-2">Old Pin ID</th>
                      <th className="p-2">New Pin ID</th>
                      <th className="p-2">Category</th>
                      <th className="p-2">Old Headline → New Headline</th>
                      <th className="p-2">Old Overlay → New Overlay</th>
                      <th className="p-2">Destination</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execReport.report.map((r: any, i: number) => (
                      <tr key={i} className="border-b align-top">
                        <td className="p-2">
                          <Badge variant={r.status === "complete" ? "default" : r.status === "published_not_deleted" ? "secondary" : "destructive"}>
                            {r.status}
                          </Badge>
                          {r.error && <div className="text-destructive text-[10px] mt-1">{r.error}</div>}
                        </td>
                        <td className="p-2 font-mono">{r.old_pin_id}</td>
                        <td className="p-2 font-mono">{r.new_pin_id || "—"}</td>
                        <td className="p-2"><Badge variant="outline">{r.category}</Badge></td>
                        <td className="p-2 max-w-[260px]">
                          <div className="line-through text-muted-foreground truncate">{r.old_headline}</div>
                          <div className="font-medium truncate">{r.new_headline}</div>
                        </td>
                        <td className="p-2 max-w-[220px]">
                          <div className="line-through text-muted-foreground truncate">{r.old_overlay}</div>
                          <div className="font-medium truncate">{r.new_overlay}</div>
                        </td>
                        <td className="p-2 max-w-[200px] truncate"><a href={r.destination_url} target="_blank" rel="noreferrer" className="underline">link</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Total Replace</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{stats.total}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Drafts Generated</CardTitle></CardHeader><CardContent className="text-3xl font-bold text-green-600">{stats.done}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Still Pending</CardTitle></CardHeader><CardContent className="text-3xl font-bold text-amber-600">{stats.pending}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Publishing</CardTitle></CardHeader><CardContent className="text-xl font-semibold text-muted-foreground">Paused</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Repair rows ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Severity</th>
                    <th className="p-2">Original</th>
                    <th className="p-2">Replacement Draft</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Variety</th>
                    <th className="p-2">Reason</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const draftId = r.details?.replacement_draft_id as string | undefined;
                    const draft = draftId ? drafts.get(draftId) : undefined;
                    return (
                      <tr key={r.id} className="border-b align-top">
                        <td className="p-2">
                          <Badge variant={r.severity === "critical" ? "destructive" : r.severity === "high" ? "default" : "secondary"}>
                            {r.severity}
                          </Badge>
                        </td>
                        <td className="p-2 max-w-[280px]">
                          <div className="font-medium truncate" title={r.pin_title ?? ""}>{r.pin_title || "—"}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.product_slug}</div>
                        </td>
                        <td className="p-2 max-w-[300px]">
                          {draft ? (
                            <>
                              <div className="font-medium truncate" title={draft.pin_title}>{draft.pin_title}</div>
                              <div className="text-xs text-muted-foreground truncate">{draft.overlay_text}</div>
                            </>
                          ) : <span className="text-muted-foreground text-xs">— not yet drafted —</span>}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline">{draft?.category_key || r.details?.replacement_category || r.category_key || "?"}</Badge>
                        </td>
                        <td className="p-2 font-mono">{r.details?.replacement_variety_score ?? "—"}</td>
                        <td className="p-2 text-xs">{(r.violation_types || []).join(", ")}</td>
                        <td className="p-2">
                          <Badge variant={r.status === "done" ? "default" : "secondary"}>{r.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}