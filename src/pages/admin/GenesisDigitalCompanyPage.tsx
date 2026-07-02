// GENESIS Ω∞ — Digital Company
// Executive Board, daily meetings, ranked decisions, shareholder letters, and Ω∞ certification.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Building2, ShieldCheck, FileText, Loader2, RefreshCw, Award } from "lucide-react";

type Exec = { id: string; role_code: string; role_name: string; reports_to: string; readiness_score: number; last_meeting_at: string | null; responsibilities: string[] };
type Meeting = { id: string; meeting_date: string; consensus: any; north_star_alignment: number; first_100_alignment: number; constitution_compliance: number; reports: any[]; created_at: string };
type Decision = { id: string; executive_role: string; title: string; expected_revenue: number; expected_profit: number; confidence: number; priority_score: number; first_100_impact: boolean; status: string };
type Cert = { id: string; certified_at: string; overall_score: number; company_intelligence_score: number; business_maturity_score: number; executive_governance_score: number; fingerprint: string; executive_readiness: number; financial_readiness: number; security_readiness: number; growth_readiness: number };
type Letter = { id: string; period_month: string; headline: string; body_markdown: string; created_at: string; sha256: string };

export default function GenesisDigitalCompanyPage() {
  const [execs, setExecs] = useState<Exec[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [e, m, d, c, l] = await Promise.all([
      supabase.from("genesis_digital_executives").select("*").order("role_code"),
      supabase.from("genesis_board_meetings").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("genesis_executive_decisions").select("*").order("priority_score", { ascending: false }).limit(25),
      supabase.from("genesis_omega_infinity_certifications").select("*").order("certified_at", { ascending: false }).limit(5),
      supabase.from("genesis_shareholder_letters").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    setExecs((e.data as any) ?? []);
    setMeetings((m.data as any) ?? []);
    setDecisions((d.data as any) ?? []);
    setCerts((c.data as any) ?? []);
    setLetters((l.data as any) ?? []);
  }
  useEffect(() => { load(); }, []);

  async function invoke(action: "board-meeting" | "certify" | "shareholder-letter") {
    setBusy(action);
    try {
      await supabase.functions.invoke("genesis-omega-infinity", { body: { action } });
      await load();
    } finally { setBusy(null); }
  }

  const latestCert = certs[0];
  const latestMeeting = meetings[0];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="w-7 h-7" /> Genesis Ω∞ — Digital Company</h1>
          <p className="text-muted-foreground">Permanent autonomous executive board. Unified Truth. Constitution-compliant.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => invoke("board-meeting")} disabled={!!busy}>
            {busy === "board-meeting" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
            Run Board Meeting
          </Button>
          <Button variant="secondary" onClick={() => invoke("certify")} disabled={!!busy}>
            {busy === "certify" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Certify Ω∞
          </Button>
          <Button variant="outline" onClick={() => invoke("shareholder-letter")} disabled={!!busy}>
            {busy === "shareholder-letter" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Generate Shareholder Letter
          </Button>
          <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overall Score</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{latestCert?.overall_score ?? "—"}</div><p className="text-xs text-muted-foreground">Digital Company Certification</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Executives</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{execs.length}</div><p className="text-xs text-muted-foreground">Autonomous roles active</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">First 100 Alignment</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{latestMeeting?.first_100_alignment ?? "—"}</div><p className="text-xs text-muted-foreground">% of decisions supporting directive</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Constitution Compliance</CardTitle></CardHeader>
          <CardContent><div className="text-4xl font-bold">{latestMeeting?.constitution_compliance ?? "—"}</div><p className="text-xs text-muted-foreground">Revenue Constitution alignment</p></CardContent></Card>
      </div>

      <Tabs defaultValue="executives">
        <TabsList>
          <TabsTrigger value="executives">Executive Board</TabsTrigger>
          <TabsTrigger value="meetings">Board Meetings</TabsTrigger>
          <TabsTrigger value="decisions">Ranked Decisions</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
          <TabsTrigger value="letters">Shareholder Letters</TabsTrigger>
        </TabsList>

        <TabsContent value="executives" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {execs.map((e) => (
            <Card key={e.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {e.role_name}
                  <Badge variant="outline">{e.role_code}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">Reports to: {e.reports_to}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {(e.responsibilities ?? []).slice(0, 6).map((r, i) => (<Badge key={i} variant="secondary" className="text-[10px]">{r}</Badge>))}
                </div>
                <p className="text-xs text-muted-foreground">Last meeting: {e.last_meeting_at ? new Date(e.last_meeting_at).toLocaleString() : "never"}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="meetings" className="space-y-3">
          {meetings.map((m) => (
            <Card key={m.id}>
              <CardHeader><CardTitle className="text-base">Board Meeting — {new Date(m.created_at).toLocaleString()}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge>North Star: {m.north_star_alignment}</Badge>
                  <Badge variant="secondary">First 100: {m.first_100_alignment}</Badge>
                  <Badge variant="outline">Constitution: {m.constitution_compliance}</Badge>
                </div>
                <p className="text-muted-foreground">Top Priority: {m.consensus?.top_priority ?? "—"} ({m.consensus?.agreement_pct ?? 0}% agreement)</p>
                <p className="text-xs text-muted-foreground">{m.reports?.length ?? 0} executive reports recorded</p>
              </CardContent>
            </Card>
          ))}
          {!meetings.length && <p className="text-muted-foreground text-sm">No board meetings yet. Run one above.</p>}
        </TabsContent>

        <TabsContent value="decisions" className="space-y-2">
          {decisions.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{d.executive_role}</Badge>
                    {d.first_100_impact && <Badge className="bg-primary/20 text-primary">First 100</Badge>}
                    <span className="font-medium">{d.title}</span>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-bold">Priority {Math.round(d.priority_score)}</div>
                  <div className="text-muted-foreground text-xs">Rev ${d.expected_revenue} · Profit ${d.expected_profit} · Conf {d.confidence}</div>
                </div>
              </CardContent>
            </Card>
          ))}
          {!decisions.length && <p className="text-muted-foreground text-sm">No decisions ranked. Run a board meeting.</p>}
        </TabsContent>

        <TabsContent value="certifications" className="space-y-3">
          {certs.map((c) => (
            <Card key={c.id}>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="w-4 h-4" /> Certification — {new Date(c.certified_at).toLocaleString()}</CardTitle></CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-4 text-sm">
                <Stat label="Overall" v={c.overall_score} />
                <Stat label="Intelligence" v={c.company_intelligence_score} />
                <Stat label="Maturity" v={c.business_maturity_score} />
                <Stat label="Governance" v={c.executive_governance_score} />
                <Stat label="Executive" v={c.executive_readiness} />
                <Stat label="Financial" v={c.financial_readiness} />
                <Stat label="Security" v={c.security_readiness} />
                <Stat label="Growth" v={c.growth_readiness} />
                <div className="md:col-span-4 text-xs text-muted-foreground font-mono truncate">SHA-256: {c.fingerprint}</div>
              </CardContent>
            </Card>
          ))}
          {!certs.length && <p className="text-muted-foreground text-sm">No certifications yet.</p>}
        </TabsContent>

        <TabsContent value="letters" className="space-y-3">
          {letters.map((l) => (
            <Card key={l.id}>
              <CardHeader><CardTitle className="text-base">{l.headline}</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground">{l.body_markdown}</pre>
                <p className="text-[10px] text-muted-foreground mt-2 font-mono">SHA-256: {l.sha256}</p>
              </CardContent>
            </Card>
          ))}
          {!letters.length && <p className="text-muted-foreground text-sm">No shareholder letters yet.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{v}</div>
    </div>
  );
}