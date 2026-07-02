import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import GridLayout, { WidthProvider, Layout as RGLLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  Plus, Save, RotateCcw, Trash2, Download, Search, Sun, Moon, Sparkles,
  Layout as LayoutIcon, Star, X, Copy, ShieldCheck, Loader2, Command,
} from "lucide-react";

const ReactGrid = WidthProvider(GridLayout);

/* -------------------------------------------------------------------------- */
/*  Ω.5 Boardroom Layout Manager                                              */
/* -------------------------------------------------------------------------- */

type Widget = { i: string; key: string };
type LayoutItem = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };
type Workspace = {
  id: string; name: string; profile: string; theme: string;
  layout: LayoutItem[]; widgets: Widget[]; is_default: boolean; is_pinned: boolean;
};
type RegistryEntry = {
  widget_key: string; title: string; category: string; description: string | null;
  truth_source: string | null; default_w: number; default_h: number; min_w: number; min_h: number;
};

const PROFILES = ["ceo","revenue","finance","tax","pinterest","marketing","ai","operations","products","developer","investor","presentation","mobile","custom"] as const;
const THEMES = ["dark","light","midnight","executive","minimal","presentation","high-contrast"] as const;

/* -------- Widget renderers (thin wrappers that pull from canonical tables) - */

function useMetric<T = any>(fn: () => Promise<T>, deps: any[] = []) {
  const [d, setD] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((x) => { if (live) { setD(x); setLoading(false); } }).catch(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { d, loading };
}

const fmt$ = (n: number) => `$${(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function StatShell({ title, value, sub, loading }: any) {
  return (
    <div className="h-full flex flex-col justify-center px-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="text-3xl font-semibold mt-1">{loading ? "…" : value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function RevenueTodayWidget() {
  const { d, loading } = useMetric(async () => {
    const start = new Date(); start.setHours(0,0,0,0);
    const { data } = await supabase.from("orders").select("total_amount,currency").gte("created_at", start.toISOString()).eq("status","paid");
    return (data ?? []).reduce((a: number, r: any) => a + Number(r.total_amount || 0), 0);
  });
  return <StatShell title="Revenue Today" value={fmt$(Number(d ?? 0))} sub="canonical • orders" loading={loading} />;
}
function OrdersTodayWidget() {
  const { d, loading } = useMetric(async () => {
    const start = new Date(); start.setHours(0,0,0,0);
    const { count } = await supabase.from("orders").select("id",{count:"exact",head:true}).gte("created_at", start.toISOString());
    return count ?? 0;
  });
  return <StatShell title="Orders Today" value={d ?? 0} loading={loading} />;
}
function Visitors24hWidget() {
  const { d, loading } = useMetric(async () => {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabase.from("canonical_sessions").select("id",{count:"exact",head:true}).gte("started_at", since);
    return count ?? 0;
  });
  return <StatShell title="Visitors 24h" value={d ?? 0} sub="canonical_sessions" loading={loading} />;
}
function Atc24hWidget() {
  const { d, loading } = useMetric(async () => {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabase.from("canonical_events").select("id",{count:"exact",head:true}).eq("event_type","add_to_cart").gte("occurred_at", since);
    return count ?? 0;
  });
  return <StatShell title="Add-to-Cart 24h" value={d ?? 0} loading={loading} />;
}
function TruthScoreWidget() {
  const { d, loading } = useMetric(async () => {
    const { data } = await supabase.from("genesis_truth_snapshots").select("overall_truth_score,run_at").order("run_at",{ascending:false}).limit(1);
    return data?.[0] ?? null;
  });
  return <StatShell title="Ω.3 Truth Score" value={loading ? "…" : `${Math.round(Number((d as any)?.overall_truth_score ?? 0))}/100`} sub={(d as any)?.run_at ? new Date((d as any).run_at).toLocaleString() : "—"} loading={loading} />;
}
function TruthConflictsWidget() {
  const { d, loading } = useMetric(async () => {
    const { data } = await supabase.from("genesis_truth_conflicts").select("metric_key,severity,detected_at").order("detected_at",{ascending:false}).limit(6);
    return data ?? [];
  });
  return (
    <div className="h-full overflow-auto text-sm">
      {loading && <div className="text-muted-foreground">Loading…</div>}
      {!loading && (d as any[]).length === 0 && <div className="text-muted-foreground">No open conflicts.</div>}
      {(d as any[] | null)?.map((r, i) => (
        <div key={i} className="flex justify-between border-b border-border/40 py-1">
          <span className="truncate">{r.metric_key}</span>
          <Badge variant={r.severity === "high" ? "destructive" : "outline"}>{r.severity}</Badge>
        </div>
      ))}
    </div>
  );
}
function CanonicalRegistryWidget() {
  const { d, loading } = useMetric(async () => {
    const { data } = await supabase.from("genesis_truth_metrics").select("metric_key,display_name,domain,canonical_source").eq("status","canonical").limit(60);
    return data ?? [];
  });
  return (
    <div className="h-full overflow-auto text-xs">
      {loading && "…"}
      {(d as any[] | null)?.map((m, i) => (
        <div key={i} className="flex justify-between border-b border-border/30 py-1">
          <span>{m.display_name}</span>
          <span className="text-muted-foreground">{m.canonical_source}</span>
        </div>
      ))}
    </div>
  );
}
function RecentOrdersWidget() {
  const { d, loading } = useMetric(async () => {
    const { data } = await supabase.from("orders").select("id,total_amount,currency,status,created_at").order("created_at",{ascending:false}).limit(10);
    return data ?? [];
  });
  return (
    <div className="h-full overflow-auto text-xs">
      {loading && "…"}
      {(d as any[] | null)?.map((o) => (
        <div key={o.id} className="flex justify-between border-b border-border/30 py-1">
          <span>{new Date(o.created_at).toLocaleTimeString()}</span>
          <span>{fmt$(Number(o.total_amount))}</span>
          <Badge variant="outline">{o.status}</Badge>
        </div>
      ))}
    </div>
  );
}
function LinkWidget({ label, to }: { label: string; to: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <Link to={to}><Button variant="secondary">{label} →</Button></Link>
    </div>
  );
}
function CommandPaletteHelp({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <Command className="w-8 h-8 opacity-60" />
      <Button size="sm" variant="secondary" onClick={onOpen}>Open (Ctrl / ⌘ + K)</Button>
    </div>
  );
}

/* Registry of renderers keyed by widget_key */
const RENDERERS: Record<string, (ctx: { openPalette: () => void }) => JSX.Element> = {
  revenue_today: () => <RevenueTodayWidget />,
  orders_today: () => <OrdersTodayWidget />,
  visitors_24h: () => <Visitors24hWidget />,
  atc_24h: () => <Atc24hWidget />,
  truth_score: () => <TruthScoreWidget />,
  truth_conflicts: () => <TruthConflictsWidget />,
  canonical_registry: () => <CanonicalRegistryWidget />,
  recent_orders: () => <RecentOrdersWidget />,
  live_visitor_map: () => <LinkWidget label="Open Live Visitor Map" to="/live-map" />,
  checkout_funnel: () => <LinkWidget label="Checkout Funnel" to="/admin/conversion-commander" />,
  revenue_leaks: () => <LinkWidget label="Revenue Leak Board" to="/admin/revenue-command-center" />,
  pinterest_queue: () => <LinkWidget label="Pinterest Queue" to="/admin/pinterest-command-center" />,
  pinterest_health: () => <LinkWidget label="Pinterest Health" to="/admin/pinterest-command-center" />,
  stripe_health: () => <LinkWidget label="Stripe Health" to="/admin/payments" />,
  top_products: () => <LinkWidget label="Top Products" to="/admin/product-intelligence" />,
  bottom_products: () => <LinkWidget label="Bottom Products" to="/admin/product-intelligence" />,
  ceo_briefing: () => <LinkWidget label="CEO Briefing" to="/admin/ceo" />,
  ceo_alerts: () => <LinkWidget label="CEO Alerts" to="/admin/ceo" />,
  finance_cashflow: () => <LinkWidget label="Cashflow" to="/admin/finance" />,
  finance_vat: () => <LinkWidget label="VAT Summary" to="/admin/vault-v14" />,
  ai_credits: () => <LinkWidget label="AI Credits" to="/admin/ai-gateway-credits" />,
  genome_snapshot: () => <LinkWidget label="Genome Graph" to="/admin/genome" />,
  architecture_health: () => <LinkWidget label="Architecture Health" to="/admin/omega-architect" />,
  omega_board: () => <LinkWidget label="Autonomous CEO" to="/admin/omega" />,
  notifications: () => <LinkWidget label="Notification Center" to="/admin/ceo" />,
  executive_timeline: () => <LinkWidget label="Executive Timeline" to="/admin/ceo" />,
  command_palette_help: ({ openPalette }) => <CommandPaletteHelp onOpen={openPalette} />,
};

/* -------- Page ----------------------------------------------------------- */

function themeClass(theme: string) {
  switch (theme) {
    case "light": return "bg-white text-slate-900";
    case "midnight": return "bg-slate-950 text-slate-100";
    case "executive": return "bg-neutral-950 text-amber-50";
    case "minimal": return "bg-neutral-50 text-neutral-900";
    case "presentation": return "bg-black text-white";
    case "high-contrast": return "bg-black text-yellow-300";
    default: return "";
  }
}

export default function GenesisBoardroomV5Page() {
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [certLoading, setCertLoading] = useState(false);
  const [cert, setCert] = useState<any>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  /* load */
  useEffect(() => { void reload(); }, []);
  async function reload() {
    const [reg, ws, latestCert] = await Promise.all([
      supabase.from("genesis_boardroom_widgets_registry").select("*").order("category"),
      supabase.from("genesis_boardroom_workspaces").select("*").order("updated_at", { ascending: false }),
      supabase.from("genesis_boardroom_certifications").select("*").order("created_at",{ascending:false}).limit(1),
    ]);
    const regRows = ((reg.data as any[]) ?? []) as RegistryEntry[];
    const wsRows = ((ws.data as any[]) ?? []) as Workspace[];
    setRegistry(regRows);
    setWorkspaces(wsRows);
    setCert(latestCert.data?.[0] ?? null);
    if (!activeId && wsRows.length) setActiveId(wsRows[0].id);
    if (!wsRows.length) await createDefault(regRows);
  }

  async function createDefault(reg: RegistryEntry[]) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const defaults = ["revenue_today","orders_today","visitors_24h","atc_24h","truth_score","recent_orders","canonical_registry","command_palette_help"];
    const widgets: Widget[] = defaults.map((k, i) => ({ i: `${k}-${i}`, key: k }));
    const layout: LayoutItem[] = widgets.map((w, i) => {
      const meta = reg.find((r) => r.widget_key === w.key);
      return { i: w.i, x: (i * 3) % 12, y: Math.floor(i / 4) * 3, w: meta?.default_w ?? 3, h: meta?.default_h ?? 3, minW: meta?.min_w ?? 2, minH: meta?.min_h ?? 2 };
    });
    const { data } = await supabase.from("genesis_boardroom_workspaces").insert({
      user_id: auth.user.id, name: "CEO Workspace", profile: "ceo", theme: "dark",
      widgets: widgets as any, layout: layout as any, is_default: true,
    }).select().single();
    if (data) { setWorkspaces((w) => [data as any, ...w]); setActiveId((data as any).id); }
  }

  /* keyboard: Ctrl/Cmd + K */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function saveLayout(next: RGLLayout[]) {
    if (!active) return;
    const layout = next.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h, minW: l.minW, minH: l.minH }));
    setWorkspaces((ws) => ws.map((w) => (w.id === active.id ? { ...w, layout } : w)));
    // version snapshot
    await supabase.from("genesis_boardroom_workspace_versions").insert({
      workspace_id: active.id, user_id: (await supabase.auth.getUser()).data.user!.id,
      version: 0, layout: layout as any, widgets: active.widgets as any,
    });
    await supabase.from("genesis_boardroom_workspaces").update({ layout: layout as any }).eq("id", active.id);
  }

  async function addWidget(key: string) {
    if (!active) return;
    const meta = registry.find((r) => r.widget_key === key)!;
    const i = `${key}-${Date.now()}`;
    const widgets = [...active.widgets, { i, key }];
    const layout = [...active.layout, { i, x: 0, y: Infinity, w: meta.default_w, h: meta.default_h, minW: meta.min_w, minH: meta.min_h }];
    setWorkspaces((ws) => ws.map((w) => (w.id === active.id ? { ...w, widgets, layout } : w)));
    await supabase.from("genesis_boardroom_workspaces").update({ widgets: widgets as any, layout: layout as any }).eq("id", active.id);
    await supabase.from("genesis_boardroom_widget_usage").insert({ user_id: (await supabase.auth.getUser()).data.user!.id, widget_key: key, workspace_id: active.id, event: "add" });
    setLibraryOpen(false);
    toast.success(`Added ${meta.title}`);
  }

  async function removeWidget(i: string) {
    if (!active) return;
    const widgets = active.widgets.filter((w) => w.i !== i);
    const layout = active.layout.filter((l) => l.i !== i);
    setWorkspaces((ws) => ws.map((w) => (w.id === active.id ? { ...w, widgets, layout } : w)));
    await supabase.from("genesis_boardroom_workspaces").update({ widgets: widgets as any, layout: layout as any }).eq("id", active.id);
  }

  async function newWorkspace() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase.from("genesis_boardroom_workspaces").insert({
      user_id: auth.user.id, name: `Workspace ${workspaces.length + 1}`, profile: "custom", theme: "dark",
      widgets: [], layout: [],
    }).select().single();
    if (data) { setWorkspaces((w) => [data as any, ...w]); setActiveId((data as any).id); }
  }
  async function duplicateWorkspace() {
    if (!active) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data } = await supabase.from("genesis_boardroom_workspaces").insert({
      user_id: auth.user!.id, name: `${active.name} (copy)`, profile: active.profile, theme: active.theme,
      widgets: active.widgets as any, layout: active.layout as any,
    }).select().single();
    if (data) { setWorkspaces((w) => [data as any, ...w]); setActiveId((data as any).id); }
  }
  async function deleteWorkspace() {
    if (!active) return;
    if (!confirm(`Delete workspace "${active.name}"?`)) return;
    await supabase.from("genesis_boardroom_workspaces").delete().eq("id", active.id);
    const next = workspaces.filter((w) => w.id !== active.id);
    setWorkspaces(next); setActiveId(next[0]?.id ?? null);
  }
  async function updateMeta(patch: Partial<Workspace>) {
    if (!active) return;
    setWorkspaces((ws) => ws.map((w) => (w.id === active.id ? { ...w, ...patch } : w)));
    await supabase.from("genesis_boardroom_workspaces").update(patch as any).eq("id", active.id);
  }

  async function exportPdf() {
    if (!rootRef.current || !active) return;
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    pdf.setFontSize(18); pdf.text(`GetPawsy — ${active.name}`, 40, 40);
    pdf.setFontSize(10); pdf.text(new Date().toLocaleString(), 40, 58);
    pdf.setFontSize(12); pdf.text("Widgets:", 40, 90);
    active.widgets.forEach((w, i) => {
      const meta = registry.find((r) => r.widget_key === w.key);
      pdf.text(`• ${meta?.title ?? w.key} — ${meta?.category ?? ""}`, 60, 110 + i * 16);
    });
    pdf.save(`boardroom-${active.name.replace(/\s+/g,"-")}.pdf`);
  }
  function exportJson() {
    if (!active) return;
    const blob = new Blob([JSON.stringify({ name: active.name, profile: active.profile, theme: active.theme, widgets: active.widgets, layout: active.layout }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${active.name}.workspace.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function certify() {
    setCertLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("genesis-omega-boardroom-certify");
      if (error) throw error;
      setCert(data.certification ?? data);
      toast.success(`Certified: Overall ${data.payload?.overall_score ?? "?"}/100`);
    } catch (e: any) { toast.error(e.message ?? "Certification failed"); }
    finally { setCertLoading(false); }
  }

  const rglLayout = useMemo<RGLLayout[]>(() => (active?.layout ?? []).map((l) => ({ ...l })), [active?.layout]);

  return (
    <div ref={rootRef} className={`min-h-screen ${themeClass(active?.theme ?? "dark")}`}>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-xl font-semibold leading-tight">Genesis Ω.5 — Boardroom</h1>
              <p className="text-xs text-muted-foreground">Executive Workspace • Unified Truth only</p>
            </div>
          </div>

          <Select value={activeId ?? undefined} onValueChange={setActiveId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Workspace" /></SelectTrigger>
            <SelectContent>
              {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {active && (
            <>
              <Input value={active.name} onChange={(e) => updateMeta({ name: e.target.value })} className="w-[180px]" />
              <Select value={active.profile} onValueChange={(v) => updateMeta({ profile: v })}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>{PROFILES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={active.theme} onValueChange={(v) => updateMeta({ theme: v })}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>{THEMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </>
          )}

          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setPaletteOpen(true)}><Search className="w-4 h-4 mr-1" />Command (⌘K)</Button>
          <Button size="sm" variant="secondary" onClick={() => setLibraryOpen(true)}><Plus className="w-4 h-4 mr-1" />Widget</Button>
          <Button size="sm" variant="secondary" onClick={newWorkspace}><LayoutIcon className="w-4 h-4 mr-1" />New</Button>
          <Button size="sm" variant="secondary" onClick={duplicateWorkspace}><Copy className="w-4 h-4 mr-1" />Duplicate</Button>
          <Button size="sm" variant="secondary" onClick={exportJson}><Download className="w-4 h-4 mr-1" />JSON</Button>
          <Button size="sm" variant="secondary" onClick={exportPdf}><Download className="w-4 h-4 mr-1" />PDF</Button>
          <Button size="sm" variant="secondary" onClick={certify} disabled={certLoading}>
            {certLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-1" />}Certify
          </Button>
          <Button size="sm" variant="destructive" onClick={deleteWorkspace}><Trash2 className="w-4 h-4" /></Button>
        </div>

        {/* Cert bar */}
        {cert && (
          <div className="text-xs bg-muted/40 border border-border/40 rounded-md px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
            <span>Ω.5 Overall: <b>{cert.overall_score}/100</b></span>
            <span>Widgets: {cert.widgets_registered}</span>
            <span>Layouts: {cert.layouts_created}</span>
            <span>Profiles: {cert.profiles_count}</span>
            <span>Canonical: {cert.canonical_compliance}%</span>
            <span>Reuse: {cert.reuse_percentage}%</span>
            <span>Exec-Readiness: {cert.executive_readiness}</span>
            <span className="font-mono opacity-60">{String(cert.fingerprint).slice(0,12)}…</span>
          </div>
        )}

        {/* Grid */}
        {active ? (
          <ReactGrid
            className="layout"
            layout={rglLayout}
            cols={12}
            rowHeight={60}
            margin={[12, 12]}
            onLayoutChange={(l) => saveLayout(l)}
            draggableHandle=".drag-handle"
            compactType="vertical"
          >
            {active.widgets.map((w) => {
              const meta = registry.find((r) => r.widget_key === w.key);
              const Render = RENDERERS[w.key];
              return (
                <div key={w.i} className="bg-card border border-border/60 rounded-lg overflow-hidden shadow-sm">
                  <div className="drag-handle cursor-move flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/40">
                    <div className="text-xs font-medium truncate">{meta?.title ?? w.key}</div>
                    <div className="flex items-center gap-1">
                      {meta?.truth_source && meta.truth_source !== "static" && (
                        <Badge variant="outline" className="text-[10px] py-0 h-4">Ω.3</Badge>
                      )}
                      <button className="opacity-60 hover:opacity-100" onClick={() => removeWidget(w.i)}><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="p-3 h-[calc(100%-32px)] overflow-hidden">
                    {Render ? <Render openPalette={() => setPaletteOpen(true)} /> : <div className="text-xs text-muted-foreground">No renderer for {w.key}</div>}
                  </div>
                </div>
              );
            })}
          </ReactGrid>
        ) : (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Create your first workspace to begin.</CardContent></Card>
        )}
      </div>

      {/* Command Palette */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search workspaces, widgets, rooms…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Workspaces">
            {workspaces.map((w) => (
              <CommandItem key={w.id} onSelect={() => { setActiveId(w.id); setPaletteOpen(false); }}>
                <LayoutIcon className="w-4 h-4 mr-2" /> {w.name} <Badge variant="outline" className="ml-2">{w.profile}</Badge>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Add widget">
            {registry.map((r) => (
              <CommandItem key={r.widget_key} onSelect={() => { addWidget(r.widget_key); setPaletteOpen(false); }}>
                <Plus className="w-4 h-4 mr-2" /> {r.title} <span className="ml-2 text-xs text-muted-foreground">{r.category}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Rooms">
            {[
              ["CEO","/admin/ceo"],["Revenue","/admin/revenue-command-center"],["Live Map","/live-map"],
              ["Pinterest","/admin/pinterest-command-center"],["Finance","/admin/finance"],["Vault","/admin/vault-v14"],
              ["Truth","/admin/omega-truth"],["Genome","/admin/genome"],["Architecture","/admin/omega-architect"],
              ["Boardroom Ω.4","/admin/boardroom"],
            ].map(([label, to]) => (
              <CommandItem key={to} onSelect={() => (window.location.href = to)}>
                <Star className="w-4 h-4 mr-2" /> {label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Widget Library dialog */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Widget Library ({registry.length})</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[60vh] overflow-auto">
            {registry.map((r) => (
              <button key={r.widget_key} onClick={() => addWidget(r.widget_key)}
                className="text-left border border-border/50 rounded-md p-3 hover:bg-muted transition">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm">{r.title}</div>
                  <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
                {r.truth_source && <div className="text-[10px] mt-1 opacity-60">source: {r.truth_source}</div>}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}