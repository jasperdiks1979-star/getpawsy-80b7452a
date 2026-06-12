import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, Archive, RotateCw } from "lucide-react";
import { toast } from "sonner";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger: string;
  pins_scanned: number;
  pins_archived: number;
  pins_deleted: number;
  pins_replaced: number;
  pins_kept: number;
  pins_errored: number;
  overused_overlays: number;
  dry_run: boolean;
  summary: any;
  error_message: string | null;
};

type ProtectionRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  pins_audited: number;
  safe_to_remove_count: number;
  replace_first_count: number;
  keep_count: number;
  unknown_count: number;
  review_count: number;
  estimated_impressions_at_risk: number;
  estimated_clicks_at_risk: number;
  estimated_saves_at_risk: number;
};

type ProtectionPin = {
  id: string;
  bucket: string;
  product_slug: string | null;
  board_name: string | null;
  destination_link: string | null;
  impressions: number;
  outbound_clicks: number;
  saves: number;
  ctr: number | null;
  age_days: number | null;
  pinterest_pin_id: string | null;
};

type FreqRow = {
  id: string;
  overlay_text_sample: string;
  frequency: number;
  overused: boolean;
};

type OcrRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  pins_total: number;
  pins_already_cached: number;
  pins_ocr_processed: number;
  pins_ocr_failed: number;
  top_phrases: Array<{ phrase: string; normalized: string; count: number }> | null;
  stop_scooping_count: number;
  stop_scooping_pin_ids: string[] | null;
  engine_failed: boolean;
  error_message: string | null;
  summary: any;
};

export default function PinterestCleanup() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [latest, setLatest] = useState<Run | null>(null);
  const [freq, setFreq] = useState<FreqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [ocrRun, setOcrRun] = useState<OcrRun | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [protectionRun, setProtectionRun] = useState<ProtectionRun | null>(null);
  const [replaceFirstPins, setReplaceFirstPins] = useState<ProtectionPin[]>([]);
  const [keepPins, setKeepPins] = useState<ProtectionPin[]>([]);
  const [protectionRunning, setProtectionRunning] = useState(false);

  async function load() {
    setLoading(true);
    const { data: r } = await supabase
      .from("pinterest_historical_cleanup_runs")
      .select("*").order("started_at", { ascending: false }).limit(20);
    const list = (r || []) as Run[];
    setRuns(list);
    const top = list[0] || null;
    setLatest(top);
    if (top) {
      const { data: f } = await supabase
        .from("pinterest_overlay_frequency")
        .select("id, overlay_text_sample, frequency, overused")
        .eq("run_id", top.id)
        .order("frequency", { ascending: false })
        .limit(50);
      setFreq((f || []) as FreqRow[]);
    } else {
      setFreq([]);
    }
    const { data: ocr } = await supabase
      .from("pinterest_ocr_cleanup_runs" as any)
      .select("*").order("started_at", { ascending: false }).limit(1);
    setOcrRun(((ocr || [])[0] as any) || null);
    const { data: prot } = await supabase
      .from("pinterest_protection_audit_runs" as any)
      .select("*").order("started_at", { ascending: false }).limit(1);
    const protLatest = ((prot || [])[0] as any) || null;
    setProtectionRun(protLatest);
    if (protLatest) {
      const { data: rf } = await supabase
        .from("pinterest_protection_audit_pins" as any)
        .select("id, bucket, product_slug, board_name, destination_link, impressions, outbound_clicks, saves, ctr, age_days, pinterest_pin_id")
        .eq("run_id", protLatest.id).eq("bucket", "REPLACE_FIRST")
        .order("impressions", { ascending: false }).limit(50);
      setReplaceFirstPins((rf || []) as any);
      const { data: kp } = await supabase
        .from("pinterest_protection_audit_pins" as any)
        .select("id, bucket, product_slug, board_name, destination_link, impressions, outbound_clicks, saves, ctr, age_days, pinterest_pin_id")
        .eq("run_id", protLatest.id).eq("bucket", "KEEP")
        .order("outbound_clicks", { ascending: false }).limit(50);
      setKeepPins((kp || []) as any);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runNow(dryRun: boolean) {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-historical-cleanup", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      toast.success(`Cleanup ${dryRun ? "dry-run" : "run"} completed`, {
        description: `Scanned ${data?.pins_scanned ?? 0} • Deleted ${data?.pins_deleted ?? 0} • Archived ${data?.pins_archived ?? 0} • Replaced ${data?.pins_replaced ?? 0}`,
      });
      await load();
    } catch (e: any) {
      toast.error("Cleanup failed", { description: e?.message });
    } finally {
      setRunning(false);
    }
  }

  async function runOcrAudit() {
    setOcrRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-ocr-cleanup-audit", { body: {} });
      if (error) throw error;
      toast.success("OCR audit complete", {
        description: `Total ${data?.pins_total ?? 0} • OCR'd ${data?.pins_ocr_processed ?? 0} • "Stop scooping": ${data?.stop_scooping_every_day?.count ?? 0}`,
      });
      await load();
    } catch (e: any) {
      toast.error("OCR audit failed", { description: e?.message });
    } finally {
      setOcrRunning(false);
    }
  }

  async function runProtectionAudit() {
    setProtectionRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-protection-audit", { body: {} });
      if (error) throw error;
      toast.success("Protection audit complete", {
        description: `SAFE ${data?.groups?.SAFE_TO_REMOVE ?? 0} • REPLACE ${data?.groups?.REPLACE_FIRST ?? 0} • KEEP ${data?.groups?.KEEP ?? 0} • UNKNOWN ${data?.groups?.UNKNOWN_NO_ANALYTICS ?? 0}`,
      });
      await load();
    } catch (e: any) {
      toast.error("Protection audit failed", { description: e?.message });
    } finally {
      setProtectionRunning(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet><title>Pinterest Cleanup • Admin</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Historical Cleanup</h1>
          <p className="text-muted-foreground">Removes overused, repetitive or low-performing posted pins. Runs nightly.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={runProtectionAudit} disabled={protectionRunning}>
            {protectionRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run protection audit
          </Button>
          <Button variant="secondary" onClick={runOcrAudit} disabled={ocrRunning}>
            {ocrRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run OCR audit
          </Button>
          <Button variant="outline" onClick={() => runNow(true)} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Dry run
          </Button>
          <Button onClick={() => runNow(false)} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
            Run cleanup now
          </Button>
        </div>
      </div>

      {protectionRun && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Performance protection audit
              <Badge variant={protectionRun.status === "completed" ? "default" : "destructive"}>
                {protectionRun.status}
              </Badge>
              <span className="text-xs text-muted-foreground font-normal">
                {new Date(protectionRun.started_at).toLocaleString()}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Pins audited" value={protectionRun.pins_audited} />
              <Stat label="SAFE_TO_REMOVE" value={protectionRun.safe_to_remove_count} />
              <Stat label="REPLACE_FIRST" value={protectionRun.replace_first_count} />
              <Stat label="KEEP" value={protectionRun.keep_count} />
              <Stat label="Unknown (no analytics)" value={protectionRun.unknown_count} />
            </div>
            <div className="rounded border bg-muted/40 p-3 text-sm">
              <div className="font-semibold mb-1">Estimated traffic at risk if cleanup ran unprotected</div>
              <div className="grid grid-cols-3 gap-2">
                <div><span className="text-muted-foreground">Impressions:</span> <span className="font-mono">{protectionRun.estimated_impressions_at_risk.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Outbound clicks:</span> <span className="font-mono">{protectionRun.estimated_clicks_at_risk.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Saves:</span> <span className="font-mono">{protectionRun.estimated_saves_at_risk.toLocaleString()}</span></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Cleanup engine MUST only delete <code>SAFE_TO_REMOVE</code> pins. REPLACE_FIRST pins require a published + indexed replacement before archive. KEEP pins are never touched.
              </p>
            </div>
            <ProtectionTable title="REPLACE_FIRST (publish replacement before archive)" rows={replaceFirstPins} />
            <ProtectionTable title="KEEP (top performers — never touch)" rows={keepPins} />
          </CardContent>
        </Card>
      )}

      {ocrRun && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              OCR-based overlay audit
              {ocrRun.engine_failed
                ? <Badge variant="destructive">ENGINE FAILED</Badge>
                : <Badge variant="default">PASS</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Pins total" value={ocrRun.pins_total} />
              <Stat label="Already cached" value={ocrRun.pins_already_cached} />
              <Stat label="OCR processed" value={ocrRun.pins_ocr_processed} />
              <Stat label="OCR failed" value={ocrRun.pins_ocr_failed} />
              <Stat label='"Stop scooping" pins' value={ocrRun.stop_scooping_count} />
            </div>
            {ocrRun.stop_scooping_count > 0 && (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="font-semibold mb-1">Pins containing "Stop scooping every day":</div>
                <div className="font-mono text-xs break-all">
                  {(ocrRun.stop_scooping_pin_ids || []).join(", ")}
                </div>
              </div>
            )}
            <div>
              <div className="font-semibold mb-2">Top 50 OCR phrases</div>
              {(!ocrRun.top_phrases || ocrRun.top_phrases.length === 0) ? (
                <p className="text-sm text-muted-foreground">No phrases yet — run OCR audit.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="py-2">Phrase</th><th>Count</th></tr>
                  </thead>
                  <tbody>
                    {ocrRun.top_phrases.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1 pr-4 max-w-xl truncate" title={p.phrase}>{p.phrase}</td>
                        <td className="font-mono">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : !latest ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No runs yet. Click <strong>Run cleanup now</strong> to start.</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Stat label="Pins scanned" value={latest.pins_scanned} />
            <Stat label="Deleted" value={latest.pins_deleted} icon={<Trash2 className="h-4 w-4" />} />
            <Stat label="Archived" value={latest.pins_archived} icon={<Archive className="h-4 w-4" />} />
            <Stat label="Replaced" value={latest.pins_replaced} icon={<RotateCw className="h-4 w-4" />} />
            <Stat label="Kept" value={latest.pins_kept} />
            <Stat label="Overused overlays" value={latest.overused_overlays} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Overlay frequency (most recent 90 posted pins)</CardTitle>
            </CardHeader>
            <CardContent>
              {freq.length === 0 ? (
                <p className="text-sm text-muted-foreground">No overlays detected this run.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr><th className="py-2">Overlay</th><th>Frequency</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {freq.map(f => (
                      <tr key={f.id} className="border-t">
                        <td className="py-2 pr-4 max-w-md truncate" title={f.overlay_text_sample}>{f.overlay_text_sample}</td>
                        <td className="font-mono">{f.frequency}</td>
                        <td>
                          {f.overused
                            ? <Badge variant="destructive">OVERUSED</Badge>
                            : <Badge variant="secondary">OK</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2">Started</th><th>Trigger</th><th>Status</th>
                    <th>Scanned</th><th>Del</th><th>Arch</th><th>Repl</th><th>Err</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-4">{new Date(r.started_at).toLocaleString()}</td>
                      <td>{r.trigger}{r.dry_run ? " (dry)" : ""}</td>
                      <td>
                        <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="font-mono">{r.pins_scanned}</td>
                      <td className="font-mono">{r.pins_deleted}</td>
                      <td className="font-mono">{r.pins_archived}</td>
                      <td className="font-mono">{r.pins_replaced}</td>
                      <td className="font-mono">{r.pins_errored}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function ProtectionTable({ title, rows }: { title: string; rows: ProtectionPin[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div>
        <div className="font-semibold mb-2">{title}</div>
        <p className="text-sm text-muted-foreground">No pins in this bucket.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="font-semibold mb-2">{title} <span className="text-xs text-muted-foreground font-normal">({rows.length})</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2">Pin</th>
              <th>Product</th>
              <th>Board</th>
              <th className="text-right pr-2">Impr</th>
              <th className="text-right pr-2">Clicks</th>
              <th className="text-right pr-2">Saves</th>
              <th className="text-right pr-2">CTR</th>
              <th className="text-right">Age (d)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-1 pr-2 font-mono">{p.pinterest_pin_id?.slice(-8) ?? "—"}</td>
                <td className="pr-2 max-w-[16ch] truncate" title={p.product_slug ?? ""}>{p.product_slug ?? "—"}</td>
                <td className="pr-2 max-w-[16ch] truncate" title={p.board_name ?? ""}>{p.board_name ?? "—"}</td>
                <td className="text-right font-mono pr-2">{p.impressions}</td>
                <td className="text-right font-mono pr-2">{p.outbound_clicks}</td>
                <td className="text-right font-mono pr-2">{p.saves}</td>
                <td className="text-right font-mono pr-2">{p.ctr != null ? (p.ctr * 100).toFixed(2) + "%" : "—"}</td>
                <td className="text-right font-mono">{p.age_days ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}