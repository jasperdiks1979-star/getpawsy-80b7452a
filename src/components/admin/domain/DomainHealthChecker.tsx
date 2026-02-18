import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Hop {
  status: number;
  url: string;
  location: string | null;
  server: string | null;
  cfRay: string | null;
  cacheControl: string | null;
  cfCacheStatus: string | null;
}

interface CheckResult {
  target: string;
  label: string;
  hops: Hop[];
  finalUrl: string;
  finalStatus: number;
  pass: boolean;
  failReason: string | null;
  checkedAt: string;
}

interface HealthResponse {
  results: CheckResult[];
  timestamp: string;
}

export function DomainHealthChecker() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const runChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "domain-health-check",
        { method: "POST" }
      );
      if (fnError) throw fnError;
      setData(result as HealthResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run checks");
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleRow = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Results card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Redirect Chain Checks</span>
            <Button size="sm" onClick={runChecks} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Run Checks
            </Button>
          </CardTitle>
          {data && (
            <p className="text-xs text-muted-foreground">
              Last checked: {new Date(data.timestamp).toLocaleString()}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive rounded text-sm mb-4">
              {error}
            </div>
          )}

          {data && (
            <div className="space-y-3">
              {data.results.map((check, idx) => (
                <div key={idx} className="border rounded overflow-hidden">
                  {/* Summary row */}
                  <button
                    onClick={() => toggleRow(idx)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {check.pass ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-destructive shrink-0" />
                      )}
                      <div>
                        <span className="font-medium text-sm">{check.label}</span>
                        <span className="text-xs text-muted-foreground ml-2 font-mono">
                          {check.target}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={check.pass ? "default" : "destructive"}>
                        {check.pass ? "PASS" : "FAIL"}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-xs">
                        {check.hops.length} hop{check.hops.length !== 1 ? "s" : ""}
                      </Badge>
                      {expandedRows.has(idx) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expandedRows.has(idx) && (
                    <div className="border-t bg-muted/30 p-3 space-y-2">
                      {check.failReason && (
                        <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-sm">
                          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          <span className="text-destructive">{check.failReason}</span>
                        </div>
                      )}

                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Redirect Chain:
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-1.5 w-8">#</th>
                              <th className="text-left p-1.5 w-14">Status</th>
                              <th className="text-left p-1.5">URL</th>
                              <th className="text-left p-1.5">Location</th>
                              <th className="text-left p-1.5">Server</th>
                              <th className="text-left p-1.5">Cache</th>
                            </tr>
                          </thead>
                          <tbody>
                            {check.hops.map((hop, hi) => (
                              <tr key={hi} className="border-b last:border-0">
                                <td className="p-1.5 text-muted-foreground">{hi + 1}</td>
                                <td className="p-1.5">
                                  <Badge
                                    variant={
                                      hop.status === 301
                                        ? "default"
                                        : hop.status === 200
                                        ? "default"
                                        : "destructive"
                                    }
                                    className="text-[10px] px-1.5"
                                  >
                                    {hop.status || "ERR"}
                                  </Badge>
                                </td>
                                <td className="p-1.5 font-mono max-w-[200px] truncate">
                                  {hop.url}
                                </td>
                                <td className="p-1.5 font-mono max-w-[200px] truncate text-muted-foreground">
                                  {hop.location || "—"}
                                </td>
                                <td className="p-1.5 text-muted-foreground">
                                  {hop.server || "—"}
                                  {hop.cfRay && (
                                    <span className="ml-1 opacity-60">({hop.cfRay})</span>
                                  )}
                                </td>
                                <td className="p-1.5 text-muted-foreground">
                                  {hop.cacheControl || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!data && !loading && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Klik "Run Checks" om de domein-redirects server-side te verifiëren.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Configuration checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">1</span>
              <div>
                <strong>getpawsy.pet</strong> moet als <strong>Primary</strong> staan
                in Project Settings → Domains.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">2</span>
              <div>
                <strong>www.getpawsy.pet</strong> moet als <strong>Alias</strong> staan
                (redirect target: apex).
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">3</span>
              <div>
                DNS: Zowel <code>@</code> als <code>www</code> A-records → <code>185.158.133.1</code>.
                Gebruik <strong>DNS-only</strong> (grey cloud) in Cloudflare om 302 te voorkomen.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">4</span>
              <div>
                <code>getpawsy.lovable.app</code> moet automatisch redirecten naar apex.
                Controleer via nginx <code>server_name</code> block.
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Als hop 1 een 302 toont van de edge</strong> (server: cloudflare),
                fix dit in Lovable Project Settings → Domains door getpawsy.pet als Primary
                en www als Alias in te stellen. DNS moet op grey cloud (DNS-only) staan.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
