import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, RefreshCw } from "lucide-react";

type Row = {
  amount_minor: number;
  currency: string;
  paid_at: string | null;
  supplier_id: string | null;
  metadata: any;
};
type Supplier = { id: string; name: string; category: string | null };

const BUCKET_RULES: Array<{ bucket: string; match: (name: string, cat: string) => boolean }> = [
  { bucket: "Marketing · Pinterest", match: (n) => /pinterest/i.test(n) },
  { bucket: "Marketing · TikTok",    match: (n) => /tiktok/i.test(n) },
  { bucket: "Marketing · Meta",      match: (n) => /(meta|facebook|instagram)/i.test(n) },
  { bucket: "Marketing · Google",    match: (n) => /google\s*ads/i.test(n) },
  { bucket: "AI · OpenAI",           match: (n) => /openai/i.test(n) },
  { bucket: "AI · Lovable",          match: (n) => /lovable/i.test(n) },
  { bucket: "AI · Other",            match: (n, c) => /(anthropic|replicate|runway|elevenlabs|gemini)/i.test(n) || /^ai/i.test(c) },
  { bucket: "Payments · Stripe",     match: (n) => /stripe/i.test(n) },
  { bucket: "Commerce · Shopify",    match: (n) => /shopify/i.test(n) },
  { bucket: "Fulfillment · CJ",      match: (n) => /(cj\s*drop|cjdrop)/i.test(n) },
  { bucket: "Hosting · Cloudflare/Vercel", match: (n) => /(cloudflare|vercel|render|netlify)/i.test(n) },
  { bucket: "Software · SaaS",       match: (_, c) => /software|saas|subscription/i.test(c) },
  { bucket: "Telecom · Odido",       match: (n) => /odido/i.test(n) },
  { bucket: "Devices · Apple",       match: (n) => /apple/i.test(n) },
];

function bucketOf(name: string, cat: string | null): string {
  const c = cat ?? "";
  for (const r of BUCKET_RULES) if (r.match(name, c)) return r.bucket;
  if (c) return `Other · ${c}`;
  return "Other";
}

const fmtEUR = (m: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(m / 100);

export function ChannelCostIntelligencePanel({ entityId }: { entityId: string | null }) {
  const [payments, setPayments] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    const [p, s] = await Promise.all([
      supabase.from("evidence_payments")
        .select("amount_minor,currency,paid_at,supplier_id,metadata")
        .gte("paid_at", since)
        .limit(2000),
      supabase.from("evidence_suppliers").select("id,name,category").limit(500),
    ]);
    setPayments((p.data ?? []) as Row[]);
    const map: Record<string, Supplier> = {};
    for (const r of (s.data ?? []) as Supplier[]) map[r.id] = r;
    setSuppliers(map);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, entityId]);

  const buckets = useMemo(() => {
    const agg = new Map<string, { total: number; count: number; hasSupplier: boolean }>();
    for (const p of payments) {
      const sup = p.supplier_id ? suppliers[p.supplier_id] : null;
      const name = sup?.name ?? (p.metadata?.supplier_name as string) ?? "Unknown";
      const b = bucketOf(name, sup?.category ?? null);
      const cur = agg.get(b) ?? { total: 0, count: 0, hasSupplier: false };
      cur.total += p.amount_minor;
      cur.count += 1;
      cur.hasSupplier = cur.hasSupplier || !!sup;
      agg.set(b, cur);
    }
    return Array.from(agg.entries())
      .map(([bucket, v]) => ({ bucket, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [payments, suppliers]);

  const grandTotal = buckets.reduce((s, b) => s + b.total, 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Channel Cost Intelligence (90d)</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : buckets.length === 0 ? (
          <div className="text-sm text-muted-foreground">No payments in window.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Total spend (90d): <span className="font-medium text-foreground">{fmtEUR(grandTotal)}</span></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Bucket</th>
                    <th className="py-1 pr-3 text-right">Spend</th>
                    <th className="py-1 pr-3 text-right">% of total</th>
                    <th className="py-1 pr-3 text-right">Payments</th>
                    <th className="py-1">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => {
                    const pct = grandTotal > 0 ? (b.total / grandTotal) * 100 : 0;
                    const conf = b.hasSupplier ? { text: "Verified", v: "default" as const } : { text: "Estimated", v: "secondary" as const };
                    return (
                      <tr key={b.bucket} className="border-t">
                        <td className="py-1 pr-3 font-medium">{b.bucket}</td>
                        <td className="py-1 pr-3 text-right">{fmtEUR(b.total)}</td>
                        <td className="py-1 pr-3 text-right">{pct.toFixed(1)}%</td>
                        <td className="py-1 pr-3 text-right">{b.count}</td>
                        <td className="py-1"><Badge variant={conf.v}>{conf.text}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Buckets derived from supplier name + category. Rows without a matched supplier show as <em>Estimated</em>. ROAS / CAC live in Channel ROI table above.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}