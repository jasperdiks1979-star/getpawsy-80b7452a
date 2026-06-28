import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AICOS } from "@/lib/aicos/client";

export default function AiCompanyOsPage() {
  const [stats, setStats] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [memQ, setMemQ] = useState("");
  const [memHits, setMemHits] = useState<any[]>([]);

  const refresh = async () => {
    try {
      const [s, d, e, t, m, i, p, r] = await Promise.all([
        AICOS.stats(), AICOS.listDepartments(), AICOS.listEmployees(),
        AICOS.listTasks({ limit: 100 }), AICOS.listMessages({ limit: 100 }),
        AICOS.listIncidents(), AICOS.listPolicies(), AICOS.listResources(),
      ]);
      setStats(s); setDepartments(d); setEmployees(e); setTasks(t);
      setMessages(m); setIncidents(i); setPolicies(p); setResources(r);
    } catch (err: any) { toast.error(err.message ?? "load failed"); }
  };
  useEffect(() => { refresh(); }, []);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try { await fn(); toast.success(`${label} ✓`); await refresh(); }
    catch (e: any) { toast.error(`${label}: ${e.message ?? "failed"}`); }
    finally { setBusy(null); }
  };

  const activePolicy = policies.find(p => p.active);
  const overall = stats?.latest_health?.overall;

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">AI Company Operating System</h1>
          <p className="text-sm text-muted-foreground">
            Coordinates every intelligence layer. Departments collaborate, share knowledge, and execute work through one governed workflow.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("health", AICOS.computeHealth)}>Compute Health</Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("twin snapshot", () => AICOS.snapshotTwin({ horizon: "now" }))}>Snapshot Twin</Button>
          <Button size="sm" disabled={!!busy} onClick={refresh}>Refresh</Button>
        </div>
      </header>

      <div className="grid md:grid-cols-5 gap-3">
        <StatCard label="Overall Health" value={overall != null ? `${overall}` : "—"} />
        <StatCard label="Departments" value={stats?.departments ?? "—"} />
        <StatCard label="AI Employees" value={stats?.employees ?? "—"} />
        <StatCard label="Queued Tasks" value={stats?.tasks?.queued ?? 0} />
        <StatCard label="Open Incidents" value={stats?.open_incidents ?? 0} />
      </div>

      {activePolicy && (
        <Card>
          <CardHeader><CardTitle className="text-base">Active Execution Policy</CardTitle></CardHeader>
          <CardContent className="text-sm flex items-center gap-3 flex-wrap">
            <Badge>{activePolicy.code}</Badge>
            <span className="text-muted-foreground">{activePolicy.description}</span>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="organization">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="queue">Work Queue</TabsTrigger>
          <TabsTrigger value="bus">Inter-AI Bus</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="twin">Digital Twin</TabsTrigger>
          <TabsTrigger value="memory">Company Memory</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Departments</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-2 text-sm">
              {departments.map(d => (
                <div key={d.code} className="border rounded-md p-2">
                  <div className="font-medium flex items-center justify-between">
                    <span>{d.name}</span><Badge variant="outline">{d.code}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{d.mission}</div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">AI Employees</CardTitle></CardHeader>
            <CardContent className="text-sm overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Department</th><th className="p-2">Engine</th><th className="p-2">Health</th><th className="p-2">Confidence</th><th className="p-2">Status</th></tr>
                </thead>
                <tbody>
                  {employees.map(e => (
                    <tr key={e.code} className="border-t">
                      <td className="p-2 font-mono text-xs">{e.code}</td>
                      <td className="p-2">{e.display_name}</td>
                      <td className="p-2 text-xs">{e.department_code}</td>
                      <td className="p-2 font-mono text-xs">{e.engine}</td>
                      <td className="p-2">{Math.round(Number(e.health_score ?? 0))}</td>
                      <td className="p-2">{Number(e.confidence ?? 0).toFixed(2)}</td>
                      <td className="p-2"><Badge variant={e.status === "active" ? "default" : "outline"}>{e.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Global Work Queue (top 100 by priority)</CardTitle></CardHeader>
            <CardContent className="text-sm overflow-x-auto">
              {tasks.length === 0 ? <div className="text-muted-foreground">No tasks yet.</div> : (
                <table className="w-full text-left">
                  <thead className="text-xs text-muted-foreground"><tr><th className="p-2">Priority</th><th className="p-2">Title</th><th className="p-2">Dept</th><th className="p-2">Employee</th><th className="p-2">Status</th><th className="p-2">Created</th></tr></thead>
                  <tbody>
                    {tasks.map(t => (
                      <tr key={t.id} className="border-t">
                        <td className="p-2 font-mono">{Number(t.priority_score).toFixed(2)}</td>
                        <td className="p-2">{t.title}</td>
                        <td className="p-2 text-xs">{t.department_code}</td>
                        <td className="p-2 text-xs">{t.assigned_employee}</td>
                        <td className="p-2"><Badge variant="outline">{t.status}</Badge></td>
                        <td className="p-2 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bus" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Inter-AI Messages</CardTitle></CardHeader>
            <CardContent className="text-sm overflow-x-auto">
              {messages.length === 0 ? <div className="text-muted-foreground">No messages yet.</div> : (
                <table className="w-full text-left">
                  <thead className="text-xs text-muted-foreground"><tr><th className="p-2">When</th><th className="p-2">Sender</th><th className="p-2">Receiver</th><th className="p-2">Action</th><th className="p-2">Confidence</th><th className="p-2">Priority</th></tr></thead>
                  <tbody>
                    {messages.map(m => (
                      <tr key={m.id} className="border-t">
                        <td className="p-2 text-xs">{new Date(m.created_at).toLocaleString()}</td>
                        <td className="p-2 font-mono text-xs">{m.sender}</td>
                        <td className="p-2 font-mono text-xs">{m.receiver}</td>
                        <td className="p-2">{m.requested_action}</td>
                        <td className="p-2">{Number(m.confidence).toFixed(2)}</td>
                        <td className="p-2">{m.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Global Resource Scheduler</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3 text-sm">
              {resources.map(r => {
                const used = Number(r.used_today ?? 0);
                const budget = Number(r.daily_budget ?? 0);
                const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
                return (
                  <div key={r.resource} className="border rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{r.resource}</div>
                      <Badge variant={pct > 90 ? "destructive" : pct > 70 ? "secondary" : "outline"}>{pct}%</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{used.toLocaleString()} / {budget.toLocaleString()}</div>
                    <div className="h-1.5 bg-muted rounded mt-2 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Execution Policies</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
              {policies.map(p => (
                <div key={p.code} className={`border rounded-md p-3 ${p.active ? "border-primary" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{p.name}</div>
                    {p.active ? <Badge>Active</Badge> : (
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`activate ${p.code}`, () => AICOS.setPolicy(p.code))}>Activate</Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{p.description}</div>
                  <pre className="text-[10px] mt-2 bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(p.weights, null, 0)}</pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incidents" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Incident Command</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {incidents.length === 0 ? <div className="text-muted-foreground">No incidents recorded.</div> : incidents.map(i => (
                <div key={i.id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{i.title}</div>
                    <Badge variant={i.status === "open" ? "destructive" : "outline"}>{i.status} · {i.severity}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Departments: {(i.departments ?? []).join(", ") || "—"}</div>
                  {i.resolution && <div className="text-xs mt-1">Resolution: {i.resolution}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="twin" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Digital Twin</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {stats?.latest_twin ? (
                <>
                  <div className="text-xs text-muted-foreground">Taken: {new Date(stats.latest_twin.taken_at).toLocaleString()} · horizon {stats.latest_twin.horizon}</div>
                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">{JSON.stringify({ metrics: stats.latest_twin.metrics, predictions: stats.latest_twin.predictions }, null, 2)}</pre>
                </>
              ) : <div className="text-muted-foreground">No twin snapshot yet. Click "Snapshot Twin".</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memory" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Institutional Memory</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Input placeholder="Search projects, decisions, lessons…" value={memQ} onChange={e => setMemQ(e.target.value)} className="max-w-md" />
                <Button variant="outline" size="sm" onClick={async () => setMemHits(await AICOS.searchMemory(memQ))}>Search</Button>
              </div>
              {memHits.length === 0 ? <div className="text-muted-foreground">No results.</div> : (
                <ul className="space-y-2">
                  {memHits.map(m => (
                    <li key={m.id} className="border rounded-md p-2">
                      <div className="font-medium">{m.title} <Badge variant="outline" className="ml-2">{m.kind}</Badge></div>
                      <div className="text-xs text-muted-foreground">{m.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </CardContent></Card>
  );
}