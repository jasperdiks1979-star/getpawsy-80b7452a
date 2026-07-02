import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { Loader2, Play, CheckCircle2, XCircle, Activity, TrendingUp, Brain, Shield } from 'lucide-react';
import { toast } from 'sonner';

type Decision = {
  id: string; title: string; subsystem: string; category: string | null;
  confidence: number | null; expected_revenue_cents: number; risk: string;
  status: string; created_at: string; deployment_sha: string | null;
};
type Outcome = {
  id: string; decision_id: string; horizon: string; verdict: string | null;
  prediction_accuracy: number | null; revenue_accuracy: number | null;
  confidence_accuracy: number | null; measured_at: string;
};
type Score = {
  subsystem: string; decisions_total: number; decisions_successful: number;
  prediction_accuracy: number | null; success_rate: number | null; average_roi: number | null;
};
type Cert = {
  generated_at: string; prediction_accuracy: number | null; recommendation_accuracy: number | null;
  revenue_accuracy: number | null; confidence_calibration: number | null;
  business_impact_cents: number; executive_summary: string | null; sha256: string | null;
};

export default function DecisionOutcomesPage() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>({});
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [certification, setCertification] = useState<Cert | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await invokeFunction<any>('genesis-v5-outcome-engine', {
      body: {}, method: 'GET' as any,
    });
    if (error || !data?.ok) {
      toast.error('Failed to load decision outcomes');
    } else {
      setSummary(data.summary || {});
      setDecisions(data.decisions || []);
      setOutcomes(data.outcomes || []);
      setScores(data.scores || []);
      setCertification(data.certification || null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function run(action: string, body?: any, label?: string) {
    setBusy(action);
    const { data, error } = await invokeFunction<any>(`genesis-v5-outcome-engine?action=${action}`, { body: body || {} });
    setBusy(null);
    if (error || !data?.ok) { toast.error(`${label || action} failed`); return; }
    toast.success(`${label || action} complete`);
    load();
  }

  const outcomeByDecision = new Map<string, Outcome>();
  outcomes.forEach((o) => { if (!outcomeByDecision.has(o.decision_id)) outcomeByDecision.set(o.decision_id, o); });

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Decision Outcome Engine…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Brain className="h-6 w-6" /> Decision Outcomes</h1>
          <p className="text-sm text-muted-foreground">Genesis Ω∞ V5 — every recommendation is measured, scored, and remembered.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => run('score', {}, 'Rescore')} disabled={!!busy}>
            {busy === 'score' ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />} Rescore
          </Button>
          <Button variant="default" size="sm" onClick={() => run('certify', {}, 'Certify')} disabled={!!busy}>
            {busy === 'certify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Certify V5
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric label="Open" value={summary.open ?? 0} />
        <Metric label="Executed" value={summary.executed ?? 0} />
        <Metric label="Successful" value={summary.successful ?? 0} tone="pos" />
        <Metric label="Failed" value={summary.failed ?? 0} tone="neg" />
        <Metric label="Total" value={summary.total ?? 0} />
      </section>

      {certification && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-4 w-4" /> Latest V5 Certification</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-muted-foreground">Prediction Accuracy</div><div className="text-xl font-semibold">{fmtPct(certification.prediction_accuracy)}</div></div>
            <div><div className="text-muted-foreground">Recommendation Accuracy</div><div className="text-xl font-semibold">{fmtPct(certification.recommendation_accuracy)}</div></div>
            <div><div className="text-muted-foreground">Revenue Accuracy</div><div className="text-xl font-semibold">{fmtPct(certification.revenue_accuracy)}</div></div>
            <div><div className="text-muted-foreground">Confidence Calibration</div><div className="text-xl font-semibold">{fmtPct(certification.confidence_calibration)}</div></div>
            <div className="md:col-span-4"><div className="text-muted-foreground">Executive Summary</div><div>{certification.executive_summary || '—'}</div></div>
            <div className="md:col-span-4 text-xs text-muted-foreground font-mono break-all">SHA-256: {certification.sha256 || '—'}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Recent Decisions</CardTitle></CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No decisions registered yet. Engines call <code>genesis-v5-outcome-engine?action=predict</code> to register.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subsystem</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Expected Rev</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Accuracy</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisions.map((d) => {
                  const o = outcomeByDecision.get(d.id);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-xs truncate">{d.title}</TableCell>
                      <TableCell><Badge variant="outline">{d.subsystem}</Badge></TableCell>
                      <TableCell>{d.confidence != null ? `${Math.round(d.confidence * 100)}%` : '—'}</TableCell>
                      <TableCell>${((d.expected_revenue_cents || 0) / 100).toFixed(0)}</TableCell>
                      <TableCell><StatusBadge status={d.status} /></TableCell>
                      <TableCell>{o ? <VerdictBadge v={o.verdict} /> : <span className="text-muted-foreground text-xs">unmeasured</span>}</TableCell>
                      <TableCell>{fmtPct(o?.prediction_accuracy)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" disabled={!!busy}
                          onClick={() => run('measure', { decision_id: d.id, horizon: '24h' }, 'Measure')}>
                          <Play className="h-3 w-3 mr-1" /> Measure
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Subsystem Scores (30d)</CardTitle></CardHeader>
        <CardContent>
          {scores.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No scores yet — click Rescore after outcomes exist.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Subsystem</TableHead><TableHead>Total</TableHead><TableHead>Success</TableHead>
                <TableHead>Success Rate</TableHead><TableHead>Prediction Acc.</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {scores.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell>{s.subsystem}</TableCell>
                    <TableCell>{s.decisions_total}</TableCell>
                    <TableCell>{s.decisions_successful}</TableCell>
                    <TableCell>{fmtPct(s.success_rate)}</TableCell>
                    <TableCell>{fmtPct(s.prediction_accuracy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: 'pos' | 'neg' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${tone === 'pos' ? 'text-green-600' : tone === 'neg' ? 'text-red-600' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { pending: 'bg-yellow-100 text-yellow-800', executed: 'bg-blue-100 text-blue-800', rolled_back: 'bg-red-100 text-red-800' };
  return <Badge className={map[status] || ''} variant="secondary">{status}</Badge>;
}
function VerdictBadge({ v }: { v: string | null }) {
  if (!v) return <span className="text-xs text-muted-foreground">—</span>;
  if (v === 'success') return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />success</Badge>;
  if (v === 'failure') return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />failure</Badge>;
  return <Badge variant="secondary">{v}</Badge>;
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return '—';
  return `${Number(n).toFixed(1)}%`;
}