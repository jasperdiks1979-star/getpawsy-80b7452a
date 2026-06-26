import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

type Verdict = "GREEN" | "YELLOW" | "RED";
interface ForensicResult {
  ok: boolean;
  generated_at: string;
  account: string;
  verdict: Verdict;
  sections: Record<string, any>;
  root_cause: { code: string; label: string; evidence: string } | null;
  secondary_causes: { code: string; label: string; evidence: string }[];
  action_plan: any[];
  manual_action_links: Record<string, string>;
  safety: Record<string, unknown>;
  message?: string;
}

const verdictColor: Record<Verdict, string> = {
  GREEN: "bg-green-600 text-white",
  YELLOW: "bg-yellow-500 text-black",
  RED: "bg-red-600 text-white",
};

export default function PinterestTrafficForensicsPage() {
  const [data, setData] = useState<ForensicResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    const { data: res, error: err } = await supabase.functions.invoke("pinterest-traffic-forensics");
    if (err) {
      setError(err.message);
    } else if (!(res as any)?.ok) {
      setError((res as any)?.message ?? "Unknown error");
    } else {
      setData(res as ForensicResult);
    }
    setLoading(false);
  }

  useEffect(() => { run(); }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Traffic &amp; Ads Forensics</h1>
          <p className="text-sm text-muted-foreground">
            Read-only investigation. Account: <strong>getpawsyshop</strong>. Mutates nothing.
          </p>
        </div>
        <Button onClick={run} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Re-run
        </Button>
      </div>

      {error && (
        <Card className="border-red-500">
          <CardContent className="p-4 text-red-600">{error}</CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle>Verdict</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Badge className={`text-lg px-4 py-2 ${verdictColor[data.verdict]}`}>{data.verdict}</Badge>
              {data.root_cause && (
                <div className="p-3 rounded border bg-muted">
                  <div className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Root cause [{data.root_cause.code}]: {data.root_cause.label}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{data.root_cause.evidence}</div>
                </div>
              )}
              {data.secondary_causes.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">Secondary causes ({data.secondary_causes.length})</summary>
                  <ul className="mt-2 space-y-1 pl-4 list-disc">
                    {data.secondary_causes.map((c, i) => (
                      <li key={i}>[{c.code}] {c.label} — <span className="text-muted-foreground">{c.evidence}</span></li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="text-xs text-muted-foreground">Generated {new Date(data.generated_at).toLocaleString()}</div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <SectionCard title="OAuth Health" section={data.sections.oauth} />
            <SectionCard title="Ads Account Health" section={data.sections.ads_account_health} />
            <SectionCard title="Billing" section={data.sections.billing} />
            <SectionCard title="Campaign Delivery" section={data.sections.campaign_delivery} />
            <SectionCard title="Organic Pinterest" section={data.sections.organic} />
            <SectionCard title="Website Attribution" section={data.sections.attribution} />
            <SectionCard title="Pinterest Tag + CAPI" section={data.sections.tag_capi} />
            <SectionCard title="Catalog / Merchant" section={data.sections.catalog} />
          </div>

          <Card>
            <CardHeader><CardTitle>Action Plan</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.action_plan.length === 0 && <p className="text-sm text-muted-foreground">No actions required.</p>}
              {data.action_plan.map((a, i) => (
                <div key={i} className="border rounded p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.priority === "P0" ? "destructive" : "secondary"}>{a.priority}</Badge>
                    <span className="font-medium">{a.problem}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1"><strong>Evidence:</strong> {a.evidence}</div>
                  <div className="text-sm mt-1"><strong>Fix:</strong> {a.fix}</div>
                  <div className="text-xs mt-1 flex gap-3 text-muted-foreground">
                    <span>Lovable can fix: {a.lovable_can_fix ? "yes" : "no"}</span>
                    <span>Manual: {a.manual ? "yes" : "no"}</span>
                    <span>Mutates: {a.mutates ? "yes" : "no"}</span>
                    <span>Risk: {a.risk}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Manual Action Links</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-2">
              {Object.entries(data.manual_action_links).map(([k, url]) => (
                <a key={k} href={url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-2 p-2 border rounded hover:bg-muted text-sm">
                  <ExternalLink className="h-4 w-4" />
                  <span className="capitalize">{k.replace(/_/g, " ")}</span>
                </a>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Safety
            </CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle2 className="h-4 w-4" /> Read-only run, 0 mutations performed.
              </div>
              <pre className="text-xs mt-2 bg-muted p-2 rounded overflow-auto">
                {JSON.stringify(data.safety, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SectionCard({ title, section }: { title: string; section: any }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-72">
          {JSON.stringify(section, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}