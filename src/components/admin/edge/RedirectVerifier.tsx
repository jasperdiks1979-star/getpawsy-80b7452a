import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";

interface RedirectResult {
  variant: string;
  finalUrl: string | null;
  status: number | null;
  hops: number;
  is301: boolean;
  singleHop: boolean;
  pass: boolean;
  error?: string;
}

const VARIANTS = [
  { label: "http://getpawsy.pet", url: "http://getpawsy.pet" },
  { label: "http://www.getpawsy.pet", url: "http://www.getpawsy.pet" },
  { label: "https://www.getpawsy.pet", url: "https://www.getpawsy.pet" },
  { label: "https://getpawsy.pet (apex)", url: "https://getpawsy.pet" },
];

/**
 * Browser-based redirect verifier.
 * NOTE: Due to CORS/opaque-redirect limitations, browsers cannot inspect
 * the actual 301/302 status of cross-origin redirects. This tool uses
 * fetch(redirect:'manual') which returns opaqueredirect type for cross-origin.
 * For accurate status codes, use curl from a terminal.
 * The tool still verifies the final landing URL via follow mode.
 */
export function RedirectVerifier() {
  const [results, setResults] = useState<RedirectResult[]>([]);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const probes: RedirectResult[] = [];

    for (const v of VARIANTS) {
      try {
        // Use follow mode to get final URL
        const res = await fetch(v.url, {
          method: "HEAD",
          redirect: "follow",
          cache: "no-store",
        });
        const finalUrl = res.url;
        const isApex = finalUrl.startsWith("https://getpawsy.pet");
        const status = res.status;

        // For same-origin requests we can check; cross-origin will show 200 after redirect
        const isSameOrigin = v.url.startsWith(window.location.origin);

        probes.push({
          variant: v.label,
          finalUrl,
          status,
          hops: finalUrl === v.url ? 0 : 1, // Approximate; browser hides intermediate hops
          is301: true, // Cannot verify from browser; assume if landing is correct
          singleHop: true,
          pass: isApex && status === 200,
          error: !isApex ? `Final URL is not apex: ${finalUrl}` : undefined,
        });
      } catch (err) {
        // Cross-origin fetches may fail — try with no-cors
        try {
          const res = await fetch(v.url, {
            method: "HEAD",
            redirect: "follow",
            mode: "no-cors",
            cache: "no-store",
          });
          probes.push({
            variant: v.label,
            finalUrl: "(opaque — cross-origin)",
            status: null,
            hops: -1,
            is301: false,
            singleHop: false,
            pass: false,
            error: "Cross-origin: cannot inspect redirect chain from browser. Use curl to verify 301 status.",
          });
        } catch (e2) {
          probes.push({
            variant: v.label,
            finalUrl: null,
            status: null,
            hops: -1,
            is301: false,
            singleHop: false,
            pass: false,
            error: `Fetch failed: ${e2 instanceof Error ? e2.message : String(e2)}`,
          });
        }
      }
    }

    setResults(probes);
    setLoading(false);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>WWW → Apex Redirect Verifier</span>
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Verify
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tests all host variants resolve to https://getpawsy.pet.
          For exact 301/302 status, run <code>curl -sI URL</code> from terminal.
        </p>
      </CardHeader>
      <CardContent>
        {results.length > 0 && (
          <div className="overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Variant</th>
                  <th className="text-left p-2">Final URL</th>
                  <th className="text-left p-2 w-16">Status</th>
                  <th className="text-left p-2 w-16">Result</th>
                  <th className="text-left p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={r.pass ? "" : "bg-destructive/5"}>
                    <td className="p-2 font-mono text-xs">{r.variant}</td>
                    <td className="p-2 font-mono text-xs max-w-[300px] truncate">{r.finalUrl || "—"}</td>
                    <td className="p-2">
                      {r.status ? (
                        <Badge variant={r.status === 200 ? "default" : "destructive"}>{r.status}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      {r.pass ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{r.error || "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 p-3 bg-muted rounded text-xs space-y-1">
          <p><strong>Expected:</strong> All variants → https://getpawsy.pet (301, single hop)</p>
          <p><strong>Platform note:</strong> Lovable edge (Cloudflare) handles www→apex redirects.
            If you see 302 instead of 301, set getpawsy.pet as <strong>Primary</strong> and www as <strong>Alias</strong> in Project Settings → Domains.</p>
          <p><strong>DNS:</strong> Both @ and www A records must point to 185.158.133.1 with DNS-only (grey cloud) in Cloudflare.</p>
        </div>
      </CardContent>
    </Card>
  );
}
