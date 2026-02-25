// Layout removed — AdminLayout provides admin shell
import { Helmet } from "react-helmet-async";
import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TriageRow {
  url: string;
  source: string;
  status: number | null;
  redirectTo: string | null;
  existsInDb: boolean;
  fixAction: string;
}

interface TriageSummary {
  total: number;
  ok: number;
  redirects: number;
  errors4xx: number;
  errors5xx: number;
  fetchErrors: number;
  productsChecked: number;
  blogsChecked: number;
  categoriesChecked: number;
}

export default function Gsc4xxTriagePage() {
  const [results, setResults] = useState<TriageRow[]>([]);
  const [summary, setSummary] = useState<TriageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "issues">("all");

  const runTriage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("url-triage");

      if (fnError) {
        setError(fnError.message);
        setLoading(false);
        return;
      }

      setResults(data.results ?? []);
      setSummary(data.summary ?? null);
      setCheckedAt(data.checkedAt);
    } catch (err: any) {
      setError(err.message);
    }

    setLoading(false);
  }, []);

  const filtered = filter === "issues"
    ? results.filter(r => r.fixAction !== "ok" && r.fixAction !== "301-ok")
    : results;

  const statusBadgeVariant = (status: number | null, action: string) => {
    if (status === 200 && action === "ok") return "default" as const;
    if (status === 301) return "outline" as const;
    return "destructive" as const;
  };

  return (
    <>
      <Helmet>
        <title>GSC 4xx URL Triage | GetPawsy Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="container py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">GSC 4xx URL Triage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Server-side triage: validates all product, blog, category, and bestseller URLs
            from the database plus legacy Shopify patterns. Detects 404s, 302s, and missing routes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Server-Side URL Triage</span>
              <Button size="sm" onClick={runTriage} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Run Triage
              </Button>
            </CardTitle>
            {checkedAt && (
              <p className="text-xs text-muted-foreground">
                Last checked: {new Date(checkedAt).toLocaleString()}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {error && (
              <div className="text-sm text-destructive mb-4 p-3 bg-destructive/10 rounded">
                Error: {error}
              </div>
            )}

            {summary && (
              <div className="flex gap-2 mb-4 flex-wrap">
                <Badge variant="default" className="font-mono">200: {summary.ok}</Badge>
                <Badge variant="outline" className="font-mono">3xx: {summary.redirects}</Badge>
                <Badge variant={summary.errors4xx > 0 ? "destructive" : "outline"} className="font-mono">
                  4xx: {summary.errors4xx}
                </Badge>
                <Badge variant={summary.errors5xx > 0 ? "destructive" : "outline"} className="font-mono">
                  5xx: {summary.errors5xx}
                </Badge>
                <span className="text-xs text-muted-foreground self-center ml-2">
                  ({summary.productsChecked} products, {summary.blogsChecked} blogs, {summary.categoriesChecked} categories)
                </span>
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant={filter === "all" ? "default" : "outline"}
                    onClick={() => setFilter("all")}
                  >
                    All ({results.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={filter === "issues" ? "default" : "outline"}
                    onClick={() => setFilter("issues")}
                  >
                    Issues Only ({results.filter(r => r.fixAction !== "ok" && r.fixAction !== "301-ok").length})
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="p-2">Status</th>
                        <th className="p-2">URL</th>
                        <th className="p-2">Source</th>
                        <th className="p-2">Redirect</th>
                        <th className="p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2">
                            <Badge
                              variant={statusBadgeVariant(r.status, r.fixAction)}
                              className="font-mono text-[10px]"
                            >
                              {r.status ?? "ERR"}
                            </Badge>
                          </td>
                          <td className="p-2 font-mono max-w-[300px] truncate">{r.url}</td>
                          <td className="p-2 text-muted-foreground">{r.source}</td>
                          <td className="p-2 font-mono text-muted-foreground max-w-[200px] truncate">
                            {r.redirectTo || "—"}
                          </td>
                          <td className="p-2">
                            {r.fixAction === "ok" ? (
                              <span className="flex items-center gap-1 text-primary">
                                <CheckCircle2 className="w-3 h-3" /> OK
                              </span>
                            ) : r.fixAction === "301-ok" ? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <CheckCircle2 className="w-3 h-3" /> 301
                              </span>
                            ) : r.fixAction === "upgrade-to-301" ? (
                              <span className="flex items-center gap-1 text-destructive/70">
                                <AlertTriangle className="w-3 h-3" /> 302→301
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-destructive">
                                <XCircle className="w-3 h-3" /> {r.fixAction}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {results.length === 0 && !loading && !error && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Klik "Run Triage" om server-side URL validatie uit te voeren op alle database slugs.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hoe GSC 4xx URLs ontstaan</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>
              <strong>1. Legacy Shopify URLs:</strong> /shop/*, /pages/*, /collections/* zijn nog
              geïndexeerd of gelinkt door externe sites. Fix: 301 redirect naar relevante SPA-route.
            </p>
            <p>
              <strong>2. /products/* vs /product/*:</strong> Sommige links gebruiken
              /products/slug i.p.v. /product/slug. Fix: normaliseer naar /product/slug.
            </p>
            <p>
              <strong>3. Trailing slash:</strong> SPA behandelt /blog en /blog/ anders.
              Fix: nginx trailing-slash strip of React Router redirect.
            </p>
            <p>
              <strong>4. Deleted products:</strong> Producten die uit de database zijn verwijderd
              maar nog in Google's index staan. Fix: 410 Gone of redirect naar categorie.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
