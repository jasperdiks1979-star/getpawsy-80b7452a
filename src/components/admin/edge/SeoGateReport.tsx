import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RedirectResult {
  target: string;
  label: string;
  hops: Array<{
    status: number;
    url: string;
    location: string | null;
    server: string | null;
    cacheControl: string | null;
  }>;
  finalUrl: string;
  finalStatus: number;
  pass: boolean;
  failReason: string | null;
  severity: "ok" | "warning" | "critical";
}

interface HeaderCheck {
  url: string;
  label: string;
  status: number;
  cacheControl: string | null;
  contentType: string | null;
  expectedCacheControl: string;
  pass: boolean;
  failReason: string | null;
}

interface SeoGate {
  pass: boolean;
  redirectsPass: boolean;
  headersPass: boolean;
  has302Warning: boolean;
  failingSummary: string[];
}

interface HealthReport {
  redirectResults: RedirectResult[];
  headerChecks: HeaderCheck[];
  seoGate: SeoGate;
  timestamp: string;
}

export function SeoGateReport() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("domain-health-check");
      if (fnErr) throw fnErr;
      setReport(data as HealthReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, []);

  const gate = report?.seoGate;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            SEO Gate — Production Health
          </span>
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Run Audit
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Server-side verification of redirect status codes (301 vs 302), cache headers, and path preservation.
          Results come from edge function calls — accurate status codes, not browser-limited.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded p-3 text-sm text-destructive">{error}</div>
        )}

        {gate && (
          <div className={`rounded-lg p-4 border-2 ${gate.pass ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20" : "border-destructive/30 bg-destructive/5"}`}>
            <div className="flex items-center gap-2 mb-2">
              {gate.pass ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              <span className="font-semibold text-sm">
                {gate.pass ? "SEO Gate: PASS" : "SEO Gate: FAIL"}
              </span>
              {gate.has302Warning && (
                <Badge variant="destructive" className="text-xs">302 Detected</Badge>
              )}
            </div>
            {gate.failingSummary.length > 0 && (
              <ul className="text-xs space-y-1 mt-2">
                {gate.failingSummary.map((f, i) => (
                  <li key={i} className="text-destructive">• {f}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Redirect Results */}
        {report?.redirectResults && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Redirect Checks</h3>
            <div className="overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Test</th>
                    <th className="text-left p-2 w-20">1st Hop</th>
                    <th className="text-left p-2 w-16">Hops</th>
                    <th className="text-left p-2">Final URL</th>
                    <th className="text-left p-2 w-20">Severity</th>
                    <th className="text-left p-2 w-12">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {report.redirectResults.map((r, i) => (
                    <tr key={i} className={r.pass ? "" : "bg-destructive/5"}>
                      <td className="p-2 text-xs font-medium">{r.label}</td>
                      <td className="p-2">
                        <Badge variant={r.hops[0]?.status === 301 || r.hops[0]?.status === 200 ? "default" : "destructive"}>
                          {r.hops[0]?.status || "—"}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">{r.hops.length}</td>
                      <td className="p-2 font-mono text-xs max-w-[250px] truncate">{r.finalUrl}</td>
                      <td className="p-2">
                        <Badge variant={r.severity === "ok" ? "default" : r.severity === "warning" ? "secondary" : "destructive"}>
                          {r.severity}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {r.pass ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-destructive" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.redirectResults.filter(r => r.failReason).length > 0 && (
              <div className="mt-2 space-y-1">
                {report.redirectResults.filter(r => r.failReason).map((r, i) => (
                  <p key={i} className="text-xs text-destructive">⚠️ {r.label}: {r.failReason}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Header Checks */}
        {report?.headerChecks && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Response Headers</h3>
            <div className="overflow-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Resource</th>
                    <th className="text-left p-2 w-16">Status</th>
                    <th className="text-left p-2">Cache-Control</th>
                    <th className="text-left p-2">Expected</th>
                    <th className="text-left p-2 w-12">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {report.headerChecks.map((h, i) => (
                    <tr key={i} className={h.pass ? "" : "bg-destructive/5"}>
                      <td className="p-2 text-xs font-medium">{h.label}</td>
                      <td className="p-2">
                        <Badge variant={h.status === 200 ? "default" : "destructive"}>{h.status || "—"}</Badge>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {h.cacheControl || <span className="text-destructive font-bold">NULL</span>}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{h.expectedCacheControl}</td>
                      <td className="p-2">
                        {h.pass ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-destructive" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {report && (
          <p className="text-xs text-muted-foreground">
            Checked at: {new Date(report.timestamp).toLocaleString()}
          </p>
        )}

        {!report && !loading && (
          <div className="p-4 bg-muted rounded text-xs space-y-1">
            <p><strong>What this checks:</strong></p>
            <p>• www.getpawsy.pet → getpawsy.pet: must be 301 (not 302)</p>
            <p>• getpawsy.lovable.app → getpawsy.pet: must be 301</p>
            <p>• Deep path + query string preservation on redirect</p>
            <p>• Cache-Control headers for robots.txt, sitemaps, merchant feed</p>
            <p>• SEO Gate: fails pipeline if any 302 detected where 301 intended</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
