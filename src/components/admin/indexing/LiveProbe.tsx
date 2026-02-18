import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { probeSingleUrl } from "@/lib/admin/url-crawler";
import { Loader2 } from "lucide-react";

type ProbeResult = Awaited<ReturnType<typeof probeSingleUrl>>;

export function LiveProbe() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleProbe = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    try {
      const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
      const r = await probeSingleUrl(fullUrl);
      setResult(r);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live URL Probe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="https://getpawsy.pet/product/... or /product/..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleProbe()}
          />
          <Button onClick={handleProbe} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Probe'}
          </Button>
        </div>

        {result && (
          <div className="border rounded p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <Badge variant={result.status && result.status >= 400 ? 'destructive' : 'default'}>
                  {result.status ?? 'Error'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Severity:</span>{' '}
                <Badge variant={result.severity === 'critical' ? 'destructive' : 'secondary'}>
                  {result.severity}
                </Badge>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Final URL:</span>{' '}
                <span className="font-mono text-xs">{result.finalUrl}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Canonical:</span>{' '}
                <span className="font-mono text-xs">{result.canonical || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Content-Type:</span>{' '}
                <span className="text-xs">{result.contentType || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cache-Control:</span>{' '}
                <span className="text-xs">{result.cacheControl || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">SPA Shell:</span>{' '}
                <span>{result.isSpaShell ? '⚠️ Yes' : '✓ No'}</span>
              </div>
              {result.issue && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Issue:</span>{' '}
                  <span className="text-destructive font-medium">{result.issue}</span>
                </div>
              )}
              {result.redirectChain.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Redirect Chain:</span>
                  <div className="mt-1 space-y-1">
                    {result.redirectChain.map((hop, i) => (
                      <div key={i} className="text-xs font-mono">
                        {hop.status} → {hop.url}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
