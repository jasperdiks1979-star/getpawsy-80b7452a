import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Copy, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Helmet } from 'react-helmet-async';

interface PreflightCheck {
  path: string;
  status: number | null;
  accessible: boolean;
  missing: string[];
  present: string[];
  pass: boolean;
  businessSignalsFound: string[];
}

interface PreflightResult {
  ok: boolean;
  ready_for_review: boolean;
  failures: string[];
  pages: PreflightCheck[];
  footerLinks: { found: string[]; missing: string[] };
  shippingClaims: { found: string[]; missing: string[] };
  feedAvailability: { ok: boolean; activeWithNoStock: Array<{ id: string; name: string; stock: number | null }> };
  productPageCheck: { slug: string | null; ok: boolean };
}

export default function MerchantReadinessPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreflight = async () => {
    setLoading(true);
    setError(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/merchant-audit?action=preflight`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Preflight failed');
      setResult(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyChecklist = () => {
    if (!result) return;
    const lines = [
      '# Google Merchant Center Review Checklist',
      `Date: ${new Date().toISOString().split('T')[0]}`,
      `Ready for Review: ${result.ready_for_review ? 'YES ✅' : 'NO ❌'}`,
      '',
      '## Policy Pages',
      ...result.pages.map(p => `- [${p.pass ? '✅' : '❌'}] ${p.path} (HTTP ${p.status})${p.missing.length > 0 ? ` — missing: ${p.missing.join(', ')}` : ''}`),
      '',
      '## Footer Links',
      `- Found: ${result.footerLinks.found.join(', ') || 'none'}`,
      `- Missing: ${result.footerLinks.missing.join(', ') || 'none'}`,
      '',
      '## Shipping Claims',
      `- Found: ${result.shippingClaims?.found?.join(', ') || 'none'}`,
      `- Missing: ${result.shippingClaims?.missing?.join(', ') || 'none'}`,
      '',
      '## Feed Availability',
      `- ${result.feedAvailability?.ok ? '✅ All active products have stock' : `❌ ${result.feedAvailability?.activeWithNoStock?.length || 0} active product(s) with no stock`}`,
      '',
      '## Product Page',
      `- [${result.productPageCheck.ok ? '✅' : '❌'}] /product/${result.productPageCheck.slug}`,
      '',
      result.failures.length > 0 ? '## Failures\n' + result.failures.map(f => `- ${f}`).join('\n') : '## No failures detected',
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Checklist copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Merchant Center Readiness</h1>
          <p className="text-muted-foreground text-sm">Run preflight checks before requesting Google review</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runPreflight} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Run Preflight
          </Button>
          {result && (
            <Button variant="outline" onClick={copyChecklist}>
              <Copy className="w-4 h-4 mr-2" /> Copy Checklist
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Overall Status */}
          <div className={`rounded-xl p-6 border-2 ${result.ready_for_review ? 'bg-green-50 dark:bg-green-950/20 border-green-300' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300'}`}>
            <div className="flex items-center gap-3">
              {result.ready_for_review ? (
                <ShieldCheck className="w-8 h-8 text-green-600" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              )}
              <div>
                <h2 className="text-lg font-bold">{result.ready_for_review ? 'Ready for Google Review' : 'Not Ready — Issues Found'}</h2>
                <p className="text-sm text-muted-foreground">
                  {result.failures.length === 0 ? 'All checks passed.' : `${result.failures.length} issue(s) need attention.`}
                </p>
              </div>
            </div>
          </div>

          {/* Page Checks */}
          <div className="bg-card rounded-xl border p-4">
            <h3 className="font-semibold mb-3">Policy & Trust Pages</h3>
            <div className="space-y-2">
              {result.pages.map(page => (
                <div key={page.path} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    {page.pass ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-destructive" />}
                    <code className="text-sm">{page.path}</code>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>HTTP {page.status || '—'}</span>
                    {page.missing.length > 0 && <span className="text-destructive">Missing: {page.missing.join(', ')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping Claims */}
          {result.shippingClaims && (
            <div className="bg-card rounded-xl border p-4">
              <h3 className="font-semibold mb-3">Shipping Claims Detection</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ...result.shippingClaims.found.map(l => ({ label: l, ok: true })),
                  ...result.shippingClaims.missing.map(l => ({ label: l, ok: false })),
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    {item.ok ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                    <span className={item.ok ? '' : 'text-destructive'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feed Availability */}
          {result.feedAvailability && (
            <div className="bg-card rounded-xl border p-4">
              <h3 className="font-semibold mb-3">Feed Availability</h3>
              {result.feedAvailability.ok ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  All active products have stock &gt; 0
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <XCircle className="w-4 h-4" />
                    {result.feedAvailability.activeWithNoStock.length} active product(s) with no stock
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 ml-6">
                    {result.feedAvailability.activeWithNoStock.slice(0, 5).map(p => (
                      <div key={p.id}>{p.name} (stock: {p.stock ?? 'null'})</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Links */}
          <div className="bg-card rounded-xl border p-4">
            <h3 className="font-semibold mb-3">Footer Link Presence</h3>
            <div className="grid grid-cols-2 gap-2">
              {[...result.footerLinks.found.map(l => ({ path: l, ok: true })), ...result.footerLinks.missing.map(l => ({ path: l, ok: false }))].map(item => (
                <div key={item.path} className="flex items-center gap-2 text-sm">
                  {item.ok ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                  <code>{item.path}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Product Page */}
          <div className="bg-card rounded-xl border p-4">
            <h3 className="font-semibold mb-3">Sample Product Page</h3>
            <div className="flex items-center gap-2">
              {result.productPageCheck.ok ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-destructive" />}
              <code className="text-sm">/product/{result.productPageCheck.slug}</code>
            </div>
          </div>

          {/* Failures */}
          {result.failures.length > 0 && (
            <div className="bg-card rounded-xl border p-4">
              <h3 className="font-semibold mb-3 text-destructive">Issues to Fix</h3>
              <ul className="space-y-1.5">
                {result.failures.map((f, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
