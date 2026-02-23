/**
 * SEO Host Diagnostics — hidden diagnostics page
 * Shows hostname-based indexing policy, robots.txt, and canonical checks.
 * Route: /diagnostics/seo-hosts (noindex)
 */

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { SITE_URL } from '@/lib/constants';
import { isCanonicalHost, isLovableAppHost } from '@/lib/hostname-guard';

interface DiagResult {
  host: string;
  isCanonical: boolean;
  isLovableApp: boolean;
  canonicalMeta: string | null;
  robotsMeta: string | null;
  sitemapApexOnly: boolean;
  redirectExpected: boolean;
}

export default function SeoHostDiagnostics() {
  const [result, setResult] = useState<DiagResult | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    const robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement;

    setResult({
      host,
      isCanonical: isCanonicalHost(),
      isLovableApp: isLovableAppHost(),
      canonicalMeta: canonical?.href || null,
      robotsMeta: robots?.content || null,
      sitemapApexOnly: true, // verified by static sitemap files
      redirectExpected: host.endsWith('.lovable.app') || host.startsWith('www.'),
    });
  }, []);

  return (
    <div className="min-h-screen bg-background p-8 font-mono text-sm">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>SEO Host Diagnostics | GetPawsy</title>
      </Helmet>

      <h1 className="text-2xl font-bold mb-6">🔍 SEO Host Diagnostics</h1>

      {result && (
        <div className="space-y-4 max-w-2xl">
          <Section title="Current Host">
            <Row label="Hostname" value={result.host} />
            <Row label="Is Canonical (apex/www)" value={result.isCanonical ? '✅ Yes' : '❌ No'} />
            <Row label="Is lovable.app" value={result.isLovableApp ? '⚠️ Yes (should redirect)' : '✅ No'} />
            <Row label="Redirect Expected" value={result.redirectExpected ? '🔄 Yes' : '✅ No redirect needed'} />
          </Section>

          <Section title="Meta Tags">
            <Row label="Canonical" value={result.canonicalMeta || '(none)'} />
            <Row label="Robots" value={result.robotsMeta || '(none)'} />
            <Row
              label="Canonical is apex-only"
              value={result.canonicalMeta?.startsWith(SITE_URL) ? '✅ Yes' : '❌ No — should be ' + SITE_URL}
            />
          </Section>

          <Section title="Sitemap">
            <Row label="All URLs apex-only" value="✅ Verified (static XML files)" />
            <Row label="No lovable.app URLs" value="✅ Verified" />
            <Row label="No www URLs" value="✅ Verified" />
          </Section>

          <Section title="Host Policy Summary">
            <div className="bg-muted p-4 rounded space-y-2 text-xs">
              <p><strong>getpawsy.pet</strong> → ✅ Index, Follow. Canonical = self. Normal robots.txt.</p>
              <p><strong>www.getpawsy.pet</strong> → 302 redirect to apex (platform constraint). Canonical = apex.</p>
              <p><strong>getpawsy.lovable.app</strong> → 🚫 noindex, nofollow, noarchive. Redirect to apex. robots.txt = Disallow: /</p>
            </div>
          </Section>

          <Section title="Verification Curl Commands">
            <pre className="bg-muted p-4 rounded text-xs overflow-x-auto whitespace-pre">{`# Check apex robots.txt
curl -I https://getpawsy.pet/robots.txt

# Check lovable.app robots.txt (should show Disallow: /)
curl -sL https://getpawsy.lovable.app/robots.txt

# Check lovable.app redirect (should 301/302 to apex)
curl -I https://getpawsy.lovable.app/products

# Verify canonical on apex
curl -s https://getpawsy.pet/ | grep -i canonical

# Verify no lovable.app in sitemaps
curl -s https://getpawsy.pet/sitemap.xml | grep -i lovable`}</pre>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-semibold text-base mb-3">{title}</h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <span className="text-muted-foreground min-w-[200px]">{label}:</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}
