import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  job_id: string;
  product_slug: string;
  mp4_url: string;
  safe_area_ok: boolean;
  caption_clipped: boolean;
  supplier_collage: boolean;
  low_res_source: boolean;
  zoom_pan_only: boolean;
  hook_present: boolean;
  benefit_present: boolean;
  cta_present: boolean;
  branding_ok: boolean;
  quality_score: number;
  verdict: string;
  issues: { code: string; message?: string; severity?: string }[];
  audited_at: string;
};

export default function CinematicV3QualityAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("cinematic_v3_quality_audit")
      .select("*")
      .order("quality_score", { ascending: false });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runAudit = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke("cinematic-v3-quality-audit", { body: {} });
      await load();
    } finally { setRunning(false); }
  };

  const approved = rows.filter(r => r.verdict === "approved").length;
  const review = rows.filter(r => r.verdict === "review").length;
  const rejected = rows.filter(r => r.verdict === "rejected").length;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.quality_score, 0) / rows.length) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">V3 Quality Audit</h1>
          <p className="text-sm text-muted-foreground">Scores the 30 approved V3 videos against the V4 quality bar.</p>
        </div>
        <Button onClick={runAudit} disabled={running}>{running ? "Auditing…" : "Run audit"}</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Audited" value={rows.length} />
        <Stat label="Approved (≥90)" value={approved} tone="ok" />
        <Stat label="Review (70-89)" value={review} tone="warn" />
        <Stat label="Rejected (<70)" value={rejected} tone="bad" />
      </div>
      <div className="text-sm text-muted-foreground">Average score: <strong>{avg}</strong> / 100</div>

      {loading ? (
        <div>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-8 border rounded-lg text-center text-muted-foreground">
          No audit rows yet. Click "Run audit".
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3">Slug</th>
                <th className="text-left p-3">Score</th>
                <th className="text-left p-3">Verdict</th>
                <th className="text-left p-3">Issues</th>
                <th className="text-left p-3">Preview</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-mono text-xs">{r.product_slug}</td>
                  <td className="p-3 font-bold">{r.quality_score}</td>
                  <td className="p-3">
                    <Badge tone={r.verdict === "approved" ? "ok" : r.verdict === "review" ? "warn" : "bad"}>
                      {r.verdict}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {r.issues.map((i, k) => (
                        <span key={k} className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">{i.code}</span>
                      ))}
                      {r.issues.length === 0 && <span className="text-xs text-muted-foreground">clean</span>}
                    </div>
                  </td>
                  <td className="p-3">
                    {r.mp4_url ? (
                      <a href={r.mp4_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">open mp4</a>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "bad" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
function Badge({ children, tone }: { children: React.ReactNode; tone: "ok" | "warn" | "bad" }) {
  const cls = tone === "ok" ? "bg-emerald-100 text-emerald-700" : tone === "warn" ? "bg-amber-100 text-amber-700" : "bg-destructive/10 text-destructive";
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{children}</span>;
}