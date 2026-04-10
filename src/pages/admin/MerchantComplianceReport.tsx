/**
 * Merchant Compliance Report — Admin page showing export readiness,
 * image compliance status, and blocked/deprioritized products.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Image,
  TrendingUp, Package, RefreshCw,
} from 'lucide-react';

interface ComplianceProduct {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  category: string | null;
  description: string | null;
}

interface ImageCompliance {
  product_id: string;
  image_url: string;
  quality_score: string;
  is_compliant: boolean;
}

export default function MerchantComplianceReport() {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['compliance-products', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, image_url, price, stock, is_active, category, description')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as ComplianceProduct[];
    },
  });

  const { data: imageCompliance, isLoading: complianceLoading } = useQuery({
    queryKey: ['image-compliance-all', refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_image_compliance')
        .select('product_id, image_url, quality_score, is_compliant');
      if (error) throw error;
      return (data || []) as ImageCompliance[];
    },
  });

  const isLoading = productsLoading || complianceLoading;

  // Build compliance map
  const complianceMap = new Map<string, ImageCompliance[]>();
  if (imageCompliance) {
    for (const ic of imageCompliance) {
      const existing = complianceMap.get(ic.product_id) || [];
      existing.push(ic);
      complianceMap.set(ic.product_id, existing);
    }
  }

  // Categorize products
  const MAX_EXPORT = 290;

  const categorized = (products || []).map((p) => {
    const compliance = complianceMap.get(p.id) || [];
    const primaryCompliance = compliance.find(c => c.image_url === p.image_url);

    const issues: string[] = [];
    let exportBlocked = false;

    // Image checks
    if (!p.image_url) {
      issues.push('Missing primary image');
      exportBlocked = true;
    }
    if (primaryCompliance?.quality_score === 'low') {
      const hasAlt = compliance.some(c => c.quality_score !== 'low' && c.image_url !== p.image_url);
      if (hasAlt) {
        issues.push('Low-quality primary image (auto-swap available)');
      } else {
        issues.push('Low-quality primary image (no clean alternative)');
        exportBlocked = true;
      }
    }

    // Stock check
    if (!p.stock || p.stock <= 0) {
      issues.push('Out of stock');
      exportBlocked = true;
    }

    // Price check
    if (!p.price || p.price <= 0) {
      issues.push('Missing or zero price');
      exportBlocked = true;
    }

    // Slug check
    if (!p.slug) {
      issues.push('Missing product slug');
      exportBlocked = true;
    }

    // Description check
    if (!p.description || p.description.trim().length < 20) {
      issues.push('Thin or missing description');
    }

    return {
      ...p,
      issues,
      exportBlocked,
      imageScore: primaryCompliance?.quality_score || 'unscanned',
      hasCompliance: compliance.length > 0,
    };
  });

  const blocked = categorized.filter(p => p.exportBlocked);
  const exportReady = categorized.filter(p => !p.exportBlocked);
  const exported = exportReady.slice(0, MAX_EXPORT);
  const deprioritized = exportReady.slice(MAX_EXPORT);
  const lowImageProducts = categorized.filter(p => p.imageScore === 'low');
  const unscannedProducts = categorized.filter(p => !p.hasCompliance && !p.exportBlocked);

  return (
    <Layout>
      <Helmet>
        <title>Merchant Compliance Report | Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="container px-4 md:px-6 py-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Merchant Compliance Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Export readiness, image compliance, and product health overview
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Total Active</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{categorized.length}</p>
          </div>
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">Export Ready</span>
            </div>
            <p className="text-3xl font-bold text-green-600">{exported.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Cap: {MAX_EXPORT}</p>
          </div>
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-sm font-medium text-muted-foreground">Blocked</span>
            </div>
            <p className="text-3xl font-bold text-destructive">{blocked.length}</p>
          </div>
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <Image className="w-5 h-5 text-orange-500" />
              <span className="text-sm font-medium text-muted-foreground">Image Issues</span>
            </div>
            <p className="text-3xl font-bold text-orange-500">{lowImageProducts.length}</p>
          </div>
        </div>

        {/* Deprioritized */}
        {deprioritized.length > 0 && (
          <div className="bg-card border rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">
                Deprioritized ({deprioritized.length} products over cap)
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              These products are eligible but exceed the {MAX_EXPORT}-product export limit.
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {deprioritized.map(p => (
                <div key={p.id} className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Over cap</Badge>
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blocked Products */}
        {blocked.length > 0 && (
          <div className="bg-card border border-destructive/30 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h2 className="font-semibold text-foreground">
                Blocked from Export ({blocked.length})
              </h2>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {blocked.map(p => (
                <div key={p.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Image className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.issues.map((issue, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Image Compliance Issues */}
        {lowImageProducts.length > 0 && (
          <div className="bg-card border border-orange-300/50 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Image className="w-5 h-5 text-orange-500" />
              <h2 className="font-semibold text-foreground">
                Low-Quality Images ({lowImageProducts.length})
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Products with primary images flagged as low quality. Auto-swap may be available during export.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {lowImageProducts.map(p => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  {p.image_url && (
                    <img src={p.image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 border border-orange-300" />
                  )}
                  <span className="truncate">{p.name}</span>
                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 ml-auto flex-shrink-0">
                    Low quality
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Unscanned Products */}
        {unscannedProducts.length > 0 && (
          <div className="bg-card border rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">
                Not Yet Scanned ({unscannedProducts.length})
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              These products have not been scanned for image compliance yet. Run the image compliance scanner to evaluate them.
            </p>
          </div>
        )}

        {/* Storefront Trust Fixes Applied */}
        <div className="bg-card border rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h2 className="font-semibold text-foreground">Storefront Compliance Fixes Applied</h2>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Removed "Expert Vetted", "4.8/5 Rating", and unverifiable social proof claims</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Replaced "US Shipping" with factual "US Delivery 5–10 Business Days"</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Removed "Ships from US" and "Premium Quality" claims from spotlights</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Replaced "Happiness Guarantee" with "30-Day Return Policy"</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Removed "No questions asked" refund claims</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Removed "Safety Certified", "CPS-Tested" unverifiable badges</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Replaced "Most Stable Design in Category" with factual copy</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Export prioritization now uses quality signals instead of random sort</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" /> Image compliance auto-swap: tries clean alternate before blocking product</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
