import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, RefreshCw, CheckCircle, XCircle, Loader2, Globe, Shield, Link2, FileText, Copy } from "lucide-react";
import { SITE_URL } from "@/lib/constants";
import { toast } from "sonner";

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

interface CanonicalAuditResult {
  canonicalHost: string;
  wwwRedirectStatus: number | string;
  sitemapUrls: string[];
  allApex: boolean;
  merchantFeedHost: string | null;
  robotsSitemapRef: string | null;
  warnings: string[];
}

export default function RedirectCheckPage() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [redirectResult, setRedirectResult] = useState<RedirectResult | null>(null);
  const [checkingRedirect, setCheckingRedirect] = useState(false);
  const [cacheResults, setCacheResults] = useState<CacheResult[]>([]);
  const [checkingCache, setCheckingCache] = useState(false);
  const [canonicalAudit, setCanonicalAudit] = useState<CanonicalAuditResult | null>(null);
  const [checkingCanonical, setCheckingCanonical] = useState(false);

  if (!isAdmin) return <Navigate to="/" replace />;

  const checkRedirect = async () => {
    setCheckingRedirect(true);
    try {
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
        location: `${SITE_URL}/sitemap.xml`,
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
          results.push({ url: ep.url, status: null, contentType: null, cacheControl: null, xContentTypeOptions: null, ok: false, error: err.message });
        }
      })
    );
    setCacheResults(results.sort((a, b) => a.url.localeCompare(b.url)));
    setCheckingCache(false);
  };

  const runCanonicalAudit = async () => {
    setCheckingCanonical(true);
    const warnings: string[] = [];
    let wwwRedirectStatus: number | string = "unknown";
    const sitemapUrls: string[] = [];
    let merchantFeedHost: string | null = null;
    let robotsSitemapRef: string | null = null;

    try {
      // 1. Get full diagnostics for www redirect status
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const diagRes = await fetch(`${supabaseUrl}/functions/v1/full-diagnostics`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (diagRes.ok) {
        const diag = await diagRes.json();
        wwwRedirectStatus = diag.crawlConfig?.wwwRedirectStatus ?? "unknown";
        if (wwwRedirectStatus !== 301) {
          warnings.push(`CRITICAL: www redirect returns ${wwwRedirectStatus} instead of required 301 — fix Cloudflare redirect rules before submission.`);
        }
      }

      // 2. Check sitemap for non-apex URLs
      try {
        const sitemapRes = await fetch("/sitemap.xml", { cache: "no-store" });
        const sitemapText = await sitemapRes.text();
        const locMatches = sitemapText.match(/<loc>([^<]+)<\/loc>/g) || [];
        locMatches.slice(0, 10).forEach(m => {
          const url = m.replace(/<\/?loc>/g, "");
          sitemapUrls.push(url);
          if (!url.startsWith(SITE_URL)) {
            warnings.push(`Sitemap contains non-apex URL: ${url}`);
          }
        });
      } catch { warnings.push("Could not fetch /sitemap.xml"); }

      // 3. Check merchant feed for non-apex host
      try {
        const feedRes = await fetch("/merchant-feed.xml", { cache: "no-store" });
        const feedText = await feedRes.text();
        const linkMatch = feedText.match(/<link>([^<]+)<\/link>/);
        if (linkMatch) {
          const feedUrl = new URL(linkMatch[1]);
          merchantFeedHost = feedUrl.host;
          if (feedUrl.host !== "getpawsy.pet") {
            warnings.push(`Merchant feed <link> uses non-apex host: ${feedUrl.host}`);
          }
        }
      } catch { warnings.push("Could not fetch /merchant-feed.xml"); }

      // 4. Check robots.txt sitemap reference
      try {
        const robotsRes = await fetch("/robots.txt", { cache: "no-store" });
        const robotsText = await robotsRes.text();
        const sitemapMatch = robotsText.match(/Sitemap:\s*(.+)/i);
        if (sitemapMatch) {
          robotsSitemapRef = sitemapMatch[1].trim();
          if (!robotsSitemapRef.startsWith(SITE_URL)) {
            warnings.push(`robots.txt Sitemap reference is not apex: ${robotsSitemapRef}`);
          }
        } else {
          warnings.push("robots.txt has no Sitemap directive");
        }
      } catch { warnings.push("Could not fetch /robots.txt"); }

      // 5. Check current page canonical tag
      const canonicalEl = document.querySelector('link[rel="canonical"]');
      const canonicalHref = canonicalEl?.getAttribute("href") || "";
      if (canonicalHref && !canonicalHref.startsWith(SITE_URL) && !canonicalHref.startsWith("/")) {
        warnings.push(`Current page canonical is not apex: ${canonicalHref}`);
      }

    } catch (err: any) {
      warnings.push(`Audit error: ${err.message}`);
    }

    setCanonicalAudit({
      canonicalHost: "getpawsy.pet",
      wwwRedirectStatus,
      sitemapUrls,
      allApex: sitemapUrls.length > 0 && sitemapUrls.every(u => u.startsWith(SITE_URL)),
      merchantFeedHost,
      robotsSitemapRef,
      warnings,
    });
    setCheckingCanonical(false);
  };

  const gscChecklist = `Google Search Console Verification Checklist
============================================
1. URL Inspection: https://getpawsy.pet/
   → Should show "URL is on Google" with canonical = https://getpawsy.pet/
   
2. Sitemaps: Only https://getpawsy.pet/sitemap.xml submitted
   → Remove any www or lovable.app sitemaps
   
3. No "www" property needed — apex property covers all
   → If www property exists, verify it shows apex as canonical

4. Coverage: Check "Duplicate without user-selected canonical"
   → Should be 0 or decreasing

5. www redirect: must return 301 (not 302)
   → If it returns 302, fix the Cloudflare redirect rule and remove conflicting edge rules
   → Re-test with curl until the response is permanent`;

  return (
    <div className="min-h-screen bg-background p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/diagnostics">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">Redirect & Canonical Audit</h1>
      </div>

      {/* Canonical Audit */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Full Canonical Audit
            </CardTitle>
            <CardDescription>Verifies all URLs point to apex domain ({SITE_URL})</CardDescription>
          </div>
          <Button size="sm" onClick={runCanonicalAudit} disabled={checkingCanonical}>
            {checkingCanonical ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Run Audit
          </Button>
        </CardHeader>
        <CardContent>
          {canonicalAudit && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Canonical Host</p>
                  <code className="text-sm font-medium">{canonicalAudit.canonicalHost}</code>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">www → Apex Status</p>
                  <Badge variant={canonicalAudit.wwwRedirectStatus === 301 ? "default" : "secondary"}>
                    {String(canonicalAudit.wwwRedirectStatus)}
                  </Badge>
                  {canonicalAudit.wwwRedirectStatus !== 301 && (
                    <span className="ml-2 text-xs text-destructive">(blocking issue — must be 301)</span>
                  )}
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Sitemap URLs (sample)</p>
                  <Badge variant={canonicalAudit.allApex ? "default" : "destructive"}>
                    {canonicalAudit.allApex ? "All Apex ✓" : "Non-apex found ✗"}
                  </Badge>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Merchant Feed Host</p>
                  <code className="text-sm">{canonicalAudit.merchantFeedHost || "—"}</code>
                </div>
                <div className="border rounded-lg p-3 col-span-full">
                  <p className="text-xs text-muted-foreground mb-1">robots.txt Sitemap Ref</p>
                  <code className="text-sm">{canonicalAudit.robotsSitemapRef || "—"}</code>
                </div>
              </div>

              {canonicalAudit.sitemapUrls.length > 0 && (
                <div className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">First {Math.min(5, canonicalAudit.sitemapUrls.length)} sitemap URLs:</p>
                  <div className="space-y-1">
                    {canonicalAudit.sitemapUrls.slice(0, 5).map((u, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-mono">
                        {u.startsWith(SITE_URL) ? (
                          <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                        ) : (
                          <XCircle className="h-3 w-3 text-destructive shrink-0" />
                        )}
                        <span className="truncate">{u}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canonicalAudit.warnings.length > 0 && (
                <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-destructive">Warnings ({canonicalAudit.warnings.length})</p>
                  {canonicalAudit.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-muted-foreground">• {w}</p>
                  ))}
                </div>
              )}
              {canonicalAudit.warnings.length === 0 && (
                <div className="bg-primary/10 rounded-lg p-3">
                  <p className="text-sm font-medium text-primary flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" /> All canonical signals point to apex domain
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
            Verifies that <code>https://www.getpawsy.pet</code> redirects → <code>{SITE_URL}</code>
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
                  {redirectResult.is301 ? "✅ 301 Redirect Active" : `⚠️ Returns ${redirectResult.status ?? 'error'} (platform constraint)`}
                </span>
              </div>
              {redirectResult.error && <p className="text-xs text-destructive">Error: {redirectResult.error}</p>}
              {!redirectResult.is301 && redirectResult.status === 302 && (
                <div className="bg-muted rounded-lg p-3 mt-2">
                  <p className="text-sm font-medium">Platform-level constraint</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    The Lovable hosting edge returns 302 for www→apex. This cannot be changed per-project.
                    Mitigation is in place: all canonical tags, sitemaps, OG URLs, structured data, and internal links
                    consistently point to <code>{SITE_URL}</code>. Google treats consistent 302 as 301 when canonical signals align.
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

      {/* GSC Checklist */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            GSC Verification Checklist
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(gscChecklist);
              toast.success("Checklist copied!");
            }}
          >
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted rounded-lg p-4 whitespace-pre-wrap font-mono">{gscChecklist}</pre>
        </CardContent>
      </Card>

      {/* Current Route Debug */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Route Debug</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Current pathname</p>
              <code>{location.pathname}</code>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Expected canonical</p>
              <code>{SITE_URL}{location.pathname === "/" ? "" : location.pathname}</code>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">SITE_URL constant</p>
              <code>{SITE_URL}</code>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">window.location.host</p>
              <code>{typeof window !== "undefined" ? window.location.host : "—"}</code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
