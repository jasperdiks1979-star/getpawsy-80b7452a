import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldX, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Audit = {
  id: string;
  title: string;
  status?: string;
  pass: boolean;
  reasons: string[];
};

export function ComplianceGateTab() {
  const [loading, setLoading] = useState(false);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [stats, setStats] = useState<{ evaluated: number; passed: number; blocked: number } | null>(null);

  async function run() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-compliance-gate", { body: { limit: 30 } });
      if (error) throw error;
      setAudits(data?.audits ?? []);
      setStats({ evaluated: data?.evaluated ?? 0, passed: data?.passed ?? 0, blocked: data?.blocked ?? 0 });
      toast.success(`Audited ${data?.evaluated} candidates · ${data?.blocked} blocked`);
    } catch (e: any) {
      toast.error(`Audit failed: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Compliance &amp; QA gate</CardTitle>
              <CardDescription>
                Pre-promotion check: banned terminology, image validity, fingerprint dedup &amp; product status.
              </CardDescription>
            </div>
            <Button onClick={run} disabled={loading} size="sm" className="gap-1">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanLine className="h-3 w-3" />}
              {loading ? "Auditing…" : "Run audit"}
            </Button>
          </div>
        </CardHeader>
        {stats && (
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Evaluated" value={stats.evaluated} />
              <Stat label="Passed" value={stats.passed} tone="ok" />
              <Stat label="Blocked" value={stats.blocked} tone="bad" />
            </div>
          </CardContent>
        )}
      </Card>

      <div className="space-y-2">
        {audits.map((a) => (
          <Card key={a.id}>
            <CardContent className="py-3 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {a.pass
                    ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    : <ShieldX className="h-4 w-4 text-destructive" />}
                  <div className="font-medium truncate">{a.title}</div>
                  {a.status && <Badge variant="outline" className="text-xs">{a.status}</Badge>}
                </div>
                {a.reasons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.reasons.map((r, i) => (
                      <Badge key={i} variant={a.pass ? "secondary" : "destructive"} className="text-xs font-mono">{r}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <Badge variant={a.pass ? "default" : "destructive"}>{a.pass ? "PASS" : "BLOCK"}</Badge>
            </CardContent>
          </Card>
        ))}
        {!loading && audits.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">Click "Run audit" to evaluate pending recommendations.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "bad" ? "text-destructive" : "";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}