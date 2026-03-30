import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, CheckCircle, AlertTriangle, XCircle, RefreshCw, Bot, Globe } from 'lucide-react';
import { PRICING_DISPLAY_MODE, ALLOW_VARIANT_PRICE_OVERRIDE } from '@/config/pricing-policy';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  PROCESSING_TIME,
  RETURN_WINDOW_DAYS,
  SITE_LAST_UPDATED,
  SUPPORT_EMAIL,
  BUSINESS_NAME,
  BUSINESS_OPERATOR,
} from '@/lib/shipping-constants';
import { BANNED_TERMS, APPROVED_SHIPPING_LINE } from '@/config/merchant-policy';
import { supabase } from '@/integrations/supabase/client';

interface AuditCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'pending';
  detail: string;
}

interface GooglebotResult {
  url: string;
  verdict: string;
  issues: string[];
  normal: { jsonLdPrice: string | null; statusCode: number };
  googlebot: { jsonLdPrice: string | null; statusCode: number };
  matches: Record<string, boolean>;
}

export default function MerchantSafePage() {
  const [checks, setChecks] = useState<AuditCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [googlebotResults, setGooglebotResults] = useState<GooglebotResult[]>([]);
  const [googlebotRunning, setGooglebotRunning] = useState(false);
  const [googlebotVerdict, setGooglebotVerdict] = useState<string | null>(null);

  const runAudit = async () => {
    setRunning(true);
    const results: AuditCheck[] = [];

    try {
      const { data, error } = await supabase
        .from('products_public')
        .select('id, name, price, slug')
        .eq('is_active', true)
        .limit(5);
      results.push(error
        ? { name: 'Public Product Access', status: 'fail', detail: error.message }
        : { name: 'Public Product Access', status: 'pass', detail: `${data?.length || 0} products accessible` }
      );
    } catch {
      results.push({ name: 'Public Product Access', status: 'fail', detail: 'Network error' });
    }

    try {
      const { data, error } = await supabase
        .from('bestsellers')
        .select('id, slug, product:products_public!bestsellers_product_id_fkey(id, name, price)')
        .eq('is_active', true)
        .limit(3);
      results.push(error
        ? { name: 'Bestsellers Access', status: 'fail', detail: error.message }
        : { name: 'Bestsellers Access', status: 'pass', detail: `${data?.length || 0} bestsellers accessible` }
      );
    } catch {
      results.push({ name: 'Bestsellers Access', status: 'fail', detail: 'Network error' });
    }

    results.push({
      name: 'Pricing Policy Mode',
      status: 'pass',
      detail: `Mode: ${PRICING_DISPLAY_MODE}, Variant override: ${ALLOW_VARIANT_PRICE_OVERRIDE}`,
    });

    results.push({
      name: 'Shipping Constants',
      status: 'pass',
      detail: `Threshold: $${FREE_SHIPPING_THRESHOLD}, Rate: $${FLAT_SHIPPING_RATE}, Delivery: ${DELIVERY_TIME_STANDARD}`,
    });

    results.push({
      name: 'Returns Policy',
      status: 'pass',
      detail: `${RETURN_WINDOW_DAYS}-day return window configured`,
    });

    results.push({
      name: 'Site Freshness',
      status: 'pass',
      detail: `Last updated: ${SITE_LAST_UPDATED}`,
    });

    setChecks(results);
    setRunning(false);
  };

  const runGooglebotValidation = async () => {
    setGooglebotRunning(true);
    setGooglebotResults([]);
    setGooglebotVerdict(null);

    try {
      // Get some product URLs to test
      const { data: products } = await supabase
        .from('products_public')
        .select('slug')
        .eq('is_active', true)
        .limit(5);

      const baseUrl = 'https://getpawsy.pet';
      const urls = [
        `${baseUrl}/`,
        `${baseUrl}/bestsellers`,
        ...(products || []).slice(0, 3).map(p => `${baseUrl}/product/${p.slug}`),
      ];

      const { data, error } = await supabase.functions.invoke('googlebot-validate', {
        body: { urls },
      });

      if (error) {
        setGooglebotVerdict('ERROR');
        setGooglebotResults([]);
        return;
      }

      setGooglebotResults(data.results || []);
      setGooglebotVerdict(data.summary?.overallVerdict || 'UNKNOWN');
    } catch {
      setGooglebotVerdict('ERROR');
    } finally {
      setGooglebotRunning(false);
    }
  };

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;

  return (
    <Layout>
      <Helmet>
        <title>Merchant Safe Diagnostics | Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Merchant Safe System</h1>
            <p className="text-sm text-muted-foreground">Google Merchant Center compliance diagnostics</p>
          </div>
        </div>

        {/* Policy Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Pricing Mode</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary" className="text-sm">{PRICING_DISPLAY_MODE}</Badge>
              <p className="text-xs text-muted-foreground mt-1">
                Variant override: {ALLOW_VARIANT_PRICE_OVERRIDE ? 'Allowed' : 'Blocked'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Shipping Policy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-foreground">{APPROVED_SHIPPING_LINE}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Free over ${FREE_SHIPPING_THRESHOLD} · Processing: {PROCESSING_TIME}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Business Info</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium text-foreground">{BUSINESS_NAME} ({BUSINESS_OPERATOR})</p>
              <p className="text-xs text-muted-foreground mt-1">{SUPPORT_EMAIL}</p>
            </CardContent>
          </Card>
        </div>

        {/* Standard Audit Runner */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <CardTitle className="text-lg">Data Access Audit</CardTitle>
            </div>
            <Button onClick={runAudit} disabled={running} size="sm" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
              {running ? 'Running...' : 'Run Audit'}
            </Button>
          </CardHeader>
          <CardContent>
            {checks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Click "Run Audit" to check compliance status</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-4 mb-4">
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="w-3 h-3" /> {passCount} passed
                  </Badge>
                  {failCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="w-3 h-3" /> {failCount} failed
                    </Badge>
                  )}
                </div>
                {checks.map((check) => (
                  <div key={check.name} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/40">
                    {check.status === 'pass' ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    ) : check.status === 'fail' ? (
                      <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{check.name}</p>
                      <p className="text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Googlebot Validation */}
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Googlebot Validation</CardTitle>
                <p className="text-xs text-muted-foreground">Fetches pages as Googlebot and compares HTML, JSON-LD, and pricing</p>
              </div>
            </div>
            <Button onClick={runGooglebotValidation} disabled={googlebotRunning} size="sm" className="gap-2">
              <RefreshCw className={`w-4 h-4 ${googlebotRunning ? 'animate-spin' : ''}`} />
              {googlebotRunning ? 'Validating...' : 'Run Googlebot Check'}
            </Button>
          </CardHeader>
          <CardContent>
            {!googlebotVerdict && !googlebotRunning && (
              <p className="text-sm text-muted-foreground">
                Click "Run Googlebot Check" to validate what Google actually sees vs normal browsing
              </p>
            )}

            {googlebotVerdict && (
              <div className="space-y-4">
                <Badge variant={googlebotVerdict === 'PASS' ? 'default' : 'destructive'} className="text-sm">
                  Overall: {googlebotVerdict}
                </Badge>

                {googlebotResults.map((result, i) => (
                  <div key={i} className="p-4 rounded-lg bg-muted/30 border border-border/40 space-y-2">
                    <div className="flex items-center gap-2">
                      {result.verdict === 'PASS' ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : result.verdict === 'FAIL' ? (
                        <XCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                      )}
                      <span className="text-sm font-medium text-foreground break-all">{result.url}</span>
                      <Badge variant={result.verdict === 'PASS' ? 'outline' : 'destructive'} className="ml-auto text-xs">
                        {result.verdict}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-muted-foreground">
                        Normal: status {result.normal?.statusCode}, JSON-LD price: {result.normal?.jsonLdPrice || 'none'}
                      </div>
                      <div className="text-muted-foreground">
                        Googlebot: status {result.googlebot?.statusCode}, JSON-LD price: {result.googlebot?.jsonLdPrice || 'none'}
                      </div>
                    </div>

                    {result.matches && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(result.matches).map(([key, val]) => (
                          <Badge key={key} variant={val ? 'outline' : 'destructive'} className="text-xs">
                            {val ? '✓' : '✗'} {key.replace(/([A-Z])/g, ' $1').trim()}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {result.issues?.length > 0 && (
                      <div className="space-y-1">
                        {result.issues.map((issue, j) => (
                          <p key={j} className="text-xs text-destructive">⚠ {issue}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Banned Terms Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Banned Terms ({BANNED_TERMS.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {BANNED_TERMS.map((term) => (
                <Badge key={term} variant="outline" className="text-xs text-destructive border-destructive/30">
                  {term}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
