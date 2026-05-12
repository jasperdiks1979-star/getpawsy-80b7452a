import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";

/**
 * Phase 22 — Visitor-level personalization preview.
 *
 * Lets ops simulate a visitor cohort (utm_source × landing_page) and see
 * which hook_family the resolver returns — used at runtime to render
 * cohort-aware CTA copy on the public site.
 */
export function VisitorPersonalizationTab() {
  const [utmSource, setUtmSource] = useState("pinterest");
  const [landingPage, setLandingPage] = useState("/products/cat-tree-deluxe");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function resolve() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-visitor-hook", {
        body: { utm_source: utmSource, landing_page: landingPage },
      });
      if (error) throw error;
      setResult(data);
      if (!data?.hook) toast.message("No cohort match — visitor would see default copy.");
    } catch (e: any) {
      toast.error(`Resolve failed: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Visitor cohort resolver</CardTitle>
          <CardDescription>
            Simulate a cohort and preview the hook_family the public site would render.
            Resolution order: exact cohort → channel fallback → global best.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">utm_source</Label>
              <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="pinterest / tiktok" />
            </div>
            <div>
              <Label className="text-xs">landing_page</Label>
              <Input value={landingPage} onChange={(e) => setLandingPage(e.target.value)} placeholder="/products/..." />
            </div>
          </div>
          <Button onClick={resolve} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            Resolve cohort
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resolved hook</CardTitle>
            <CardDescription>cohort_key: <code className="text-xs">{result.cohort_key ?? "—"}</code></CardDescription>
          </CardHeader>
          <CardContent>
            {result.hook ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge>channel: {result.hook.channel}</Badge>
                  <Badge variant="secondary">hook_family: {result.hook.hook_family}</Badge>
                  <Badge variant="outline">source: {result.hook.source}</Badge>
                  <Badge variant="outline">share: {(result.hook.share * 100).toFixed(1)}%</Badge>
                  <Badge variant="outline">conv: {result.hook.conversions}</Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No cohort match — visitor would see default CTA copy.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}