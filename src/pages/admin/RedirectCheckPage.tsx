import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, Loader2, Globe, Shield } from "lucide-react";

const SEO_ENDPOINTS = [
  { url: "/robots.txt", label: "Robots.txt", expectedContentType: "text/plain" },
  { url: "/sitemap.xml", label: "Sitemap XML", expectedContentType: "text/xml" },
  { url: "/sitemap-static.xml", label: "Sitemap Static", expectedContentType: "text/xml" },
  { url: "/merchant-feed.xml", label: "Merchant Feed", expectedContentType: "text/xml" },
  { url: "/merchant-diagnostics.xml", label: "Merchant Diagnostics", expectedContentType: "text/xml" },
];

interface RedirectResult {
  status: number | null;
  location: string | null;
  is301: boolean;
  error?: string;
}

interface CacheResult {
  url: string;
  status: number | null;
  contentType: string | null;
  cacheControl: string | null;
  xContentTypeOptions: string | null;
  ok: boolean;
  error?: string;
}

export default function RedirectCheckPage() {
  const { isAdmin } = useAuth();
  const [redirectResult, setRedirectResult] = useState<RedirectResult | null>(null);
  const [checkingRedirect, setCheckingRedirect] = useState(false);
  const [cacheResults, setCacheResults] = useState<CacheResult[]>([]);
  const [checkingCache, setCheckingCache] = useState(false);

  if (!isAdmin) return <Navigate to="/" replace />;

  const checkRedirect = async () => {
    setCheckingRedirect(true);
    try {
      // Client-side we can't do redirect:manual to external origin easily
      // We'll check via the full-diagnostics edge function which already does this
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const res = await fetch(`${supabaseUrl}/functions/v1/full-diagnostics`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const diag = await res.json();
      const wwwStatus = diag.crawlConfig?.wwwRedirectStatus;
      
      setRedirectResult({
        status: typeof wwwStatus === "number" ? wwwStatus : null,
        location: "https://getpawsy.pet/sitemap.xml",
        is301: wwwStatus === 301,
        error: typeof wwwStatus === "string" && wwwStatus.startsWith("error") ? wwwStatus : undefined,
      });
    } catch (err: any) {
      setRedirectResult({ status: null, location: null, is301: false, error: err.message });
    }
    setCheckingRedirect(false);
  };

  const checkCacheHeaders = async () => {
    setCheckingCache(true);
    const results: CacheResult[] = [];
    await Promise.all(
      SEO_ENDPOINTS.map(async (ep) => {
        try {
          const res = await fetch(ep.url, { method: "HEAD", cache: "no-store" });
          results.push({
            url: ep.url,
            status: res.status,
            contentType: res.headers.get("content-type"),
            cacheControl: res.headers.get("cache-control"),
            xContentTypeOptions: res.headers.get("x-content-type-options"),
            ok: res.status === 200,
          });
        } catch (err: any) {
          results.push({
            url: ep.url,
            status: null,
            contentType: null,
            cacheControl: null,
            xContentTypeOptions: null,
            ok: false,
            error: err.message,
          });
        }
      })
    );
    setCacheResults(results.sort((a, b) => a.url.localeCompare(b.url)));
    setCheckingCache(false);
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/diagnostics">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">Redirect & Cache Verification</h1>
      </div>

      {/* WWW Redirect Check */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            WWW → Apex Redirect Check
          </CardTitle>
          <Button size="sm" onClick={checkRedirect} disabled={checkingRedirect}>
            {checkingRedirect ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Check
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Verifies that <code>https://www.getpawsy.pet</code> returns HTTP 301 → <code>https://getpawsy.pet</code>
          </p>
          {redirectResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                {redirectResult.is301 ? (
                  <CheckCircle className="h-5 w-5 text-primary" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-medium">
                  {redirectResult.is301 ? "✅ 301 Redirect Active" : "❌ NOT a 301 redirect"}
                </span>
              </div>
              <div className="text-xs space-y-1 text-muted-foreground">
                <p>Status: <Badge variant={redirectResult.is301 ? "default" : "destructive"}>{redirectResult.status ?? "error"}</Badge></p>
                {redirectResult.error && <p className="text-destructive">Error: {redirectResult.error}</p>}
              </div>
              {!redirectResult.is301 && (
                <div className="bg-destructive/10 rounded-lg p-3 mt-2">
                  <p className="text-sm font-medium text-destructive">
                    CRITICAL: www redirect is not 301 (SEO consolidation risk)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Link equity from www.getpawsy.pet is not being permanently consolidated to the apex domain.
                    Check nginx config and Lovable domain settings.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cache Header Check */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            SEO Endpoint Cache Headers
          </CardTitle>
          <Button size="sm" onClick={checkCacheHeaders} disabled={checkingCache}>
            {checkingCache ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Check All
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Verifies Cache-Control, Content-Type, and X-Content-Type-Options for SEO-critical endpoints.
          </p>
          {cacheResults.length > 0 && (
            <div className="space-y-2">
              {cacheResults.map((r) => (
                <div key={r.url} className="border rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <code className="font-medium">{r.url}</code>
                    <Badge variant={r.ok ? "default" : "destructive"}>{r.status ?? "err"}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 text-muted-foreground">
                    <span>Content-Type: <code>{r.contentType || "—"}</code></span>
                    <span>Cache-Control: <code>{r.cacheControl || "—"}</code></span>
                    <span>X-Content-Type-Options: <code>{r.xContentTypeOptions || "—"}</code></span>
                  </div>
                  {r.error && <p className="text-destructive mt-1">Error: {r.error}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
