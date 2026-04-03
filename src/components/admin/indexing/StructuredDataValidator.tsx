import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, CheckCircle2, XCircle } from "lucide-react";

interface ValidationCheck {
  label: string;
  pass: boolean;
  detail?: string;
}

export function StructuredDataValidator() {
  const [url, setUrl] = useState("");
  const [jsonLd, setJsonLd] = useState<any>(null);
  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setJsonLd(null);
    setChecks([]);

    try {
      const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
      const res = await fetch(fullUrl, { cache: 'no-store' });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }

      const html = await res.text();
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
      const schemas = scripts.map(m => {
        try { return JSON.parse(m[1]); } catch { return null; }
      }).filter(Boolean);

      const productSchema = schemas.find(s => s['@type'] === 'Product');

      if (!productSchema) {
        setError('No Product JSON-LD found on this page');
        return;
      }

      setJsonLd(productSchema);

      // Run validation checks
      const c: ValidationCheck[] = [];
      c.push({ label: 'Has name', pass: !!productSchema.name });
      c.push({ label: 'Has description', pass: !!productSchema.description });
      c.push({ label: 'Has image (array)', pass: Array.isArray(productSchema.image) && productSchema.image.length > 0 });
      c.push({
        label: 'Images are absolute URLs',
        pass: Array.isArray(productSchema.image) && productSchema.image.every((u: string) => u.startsWith('http')),
      });
      c.push({ label: 'Has sku', pass: !!productSchema.sku });
      c.push({
        label: 'Brand is object format',
        pass: typeof productSchema.brand === 'object' && productSchema.brand?.['@type'] === 'Brand' && !!productSchema.brand?.name,
        detail: typeof productSchema.brand === 'string' ? 'ERROR: brand is a string — must be {"@type":"Brand","name":"..."}' : undefined,
      });
      c.push({ label: 'Has offers', pass: !!productSchema.offers });
      c.push({
        label: 'Has price (numeric string)',
        pass: !!productSchema.offers?.price && Number(productSchema.offers.price) > 0,
        detail: productSchema.offers?.price ? `price="${productSchema.offers.price}"` : 'MISSING',
      });
      c.push({ label: 'Has priceCurrency USD', pass: productSchema.offers?.priceCurrency === 'USD' });
      c.push({ label: 'Has availability', pass: !!productSchema.offers?.availability });
      c.push({ label: 'Has itemCondition', pass: !!productSchema.offers?.itemCondition });
      c.push({ label: 'Has offer URL', pass: !!productSchema.offers?.url });
      c.push({
        label: 'No fake reviews (aggregateRating only with real data)',
        pass: !productSchema.aggregateRating || (productSchema.aggregateRating.reviewCount > 0),
        detail: productSchema.aggregateRating
          ? `ratingValue=${productSchema.aggregateRating.ratingValue}, count=${productSchema.aggregateRating.reviewCount}`
          : 'No aggregateRating (correct if 0 reviews)',
      });
      c.push({
        label: 'No placeholder reviews',
        pass: !productSchema.review || (Array.isArray(productSchema.review) && productSchema.review.length > 0),
      });

      setChecks(c);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadJsonLd = () => {
    if (!jsonLd) return;
    const blob = new Blob([JSON.stringify(jsonLd, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'product-jsonld.json';
    a.click();
  };

  const allPass = checks.length > 0 && checks.every(c => c.pass);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Structured Data Validator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="/product/some-product-slug"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleValidate()}
          />
          <Button onClick={handleValidate} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Validate'}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {checks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={allPass ? 'default' : 'destructive'}>
                {allPass ? '✓ All Checks Pass' : '✗ Issues Found'}
              </Badge>
              {jsonLd && (
                <Button variant="outline" size="sm" onClick={downloadJsonLd}>
                  <Download className="w-4 h-4 mr-1" /> Download JSON-LD
                </Button>
              )}
            </div>

            <div className="space-y-1">
              {checks.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {c.pass ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <XCircle className="w-4 h-4 text-destructive" />}
                  <span>{c.label}</span>
                  {c.detail && <span className="text-xs text-muted-foreground ml-2">({c.detail})</span>}
                </div>
              ))}
            </div>

            {jsonLd && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium">View Raw JSON-LD</summary>
                <pre className="mt-2 bg-muted p-3 rounded text-xs overflow-auto max-h-[400px]">
                  {JSON.stringify(jsonLd, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
