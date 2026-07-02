import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ROOM_RULES: Array<{ room: string; test: (n: string) => boolean }> = [
  { room: "Pinterest", test: (n) => /^pinterest|^pin[_-]|paip|pcie|cinematic/.test(n) },
  { room: "Stripe", test: (n) => /stripe|checkout|order|refund|dispute|payout/.test(n) },
  { room: "Finance", test: (n) => /finance|vat|invoice|expense|payout|belastingdienst|accountant|cfo|evidence/.test(n) },
  { room: "AI", test: (n) => /^ai[_-]|^ee[_-]|^cpe[_-]|creative|director|golden|prompt|generation|llm/.test(n) },
  { room: "Revenue", test: (n) => /revenue|conversion|war-room|cci|arie|priority|first_sale|first-sale|monetiz/.test(n) },
  { room: "Analytics", test: (n) => /analytics|canonical|ga4|tracking|attribution|funnel|session|visitor|traffic/.test(n) },
  { room: "Products", test: (n) => /product|catalog|cj[_-]|cj-|bestseller|categor|collection|inventory|stock/.test(n) },
  { room: "Customers", test: (n) => /customer|newsletter|profile|dispute|order|cart|email/.test(n) },
  { room: "Security", test: (n) => /security|admin_guard|role|passkey|oauth|secret|guard/.test(n) },
  { room: "Infrastructure", test: (n) => /cron|monitoring|health|worker|deploy|monitor|scan|sync|repair/.test(n) },
  { room: "Governance", test: (n) => /genesis|governance|constitution|omega|ceo|architect|commander|executive/.test(n) },
  { room: "Reports", test: (n) => /report|dashboard|snapshot|dossier|certification|manual/.test(n) },
];

function roomFor(name: string): string {
  const lower = name.toLowerCase();
  for (const r of ROOM_RULES) if (r.test(lower)) return r.room;
  return "Other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthenticated" }, 401);
  const { data: userRes } = await admin.auth.getUser(jwt);
  const uid = userRes?.user?.id;
  if (!uid) return json({ error: "unauthenticated" }, 401);
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const edgeFunctions: string[] = Array.isArray(body.edge_functions) ? body.edge_functions : [];
  const adminPages: string[] = Array.isArray(body.admin_pages) ? body.admin_pages : [];
  const tables: string[] = Array.isArray(body.tables) ? body.tables : [];

  const externals = [
    "Stripe", "Pinterest", "TikTok", "CJ Dropshipping", "Supabase", "Lovable AI",
    "OpenAI", "Google Analytics", "Google Search Console", "Google Merchant Center",
    "Mapbox", "Resend", "Belastingdienst",
  ];

  type Node = { key: string; kind: string; room: string; label: string; meta?: Record<string, unknown> };
  type Edge = { from: string; to: string; kind: string };

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const n of edgeFunctions) nodes.push({ key: `fn:${n}`, kind: "edge_function", room: roomFor(n), label: n });
  for (const n of adminPages) nodes.push({ key: `pg:${n}`, kind: "admin_page", room: roomFor(n), label: n });
  for (const n of tables) nodes.push({ key: `tb:${n}`, kind: "table", room: roomFor(n), label: n });
  for (const n of externals) nodes.push({ key: `ex:${n}`, kind: "external", room: n.includes("Stripe") ? "Stripe" : n.includes("Pinterest") ? "Pinterest" : "Infrastructure", label: n });

  // Heuristic edges: function name prefix → matching table prefix
  const tableSet = new Set(tables);
  for (const fn of edgeFunctions) {
    const prefix = fn.split("-").slice(0, 2).join("_");
    for (const t of tableSet) {
      if (t.startsWith(prefix)) edges.push({ from: `fn:${fn}`, to: `tb:${t}`, kind: "writes" });
    }
    if (/stripe/i.test(fn)) edges.push({ from: `fn:${fn}`, to: `ex:Stripe`, kind: "calls" });
    if (/pinterest|paip|pcie/i.test(fn)) edges.push({ from: `fn:${fn}`, to: `ex:Pinterest`, kind: "calls" });
    if (/tiktok/i.test(fn)) edges.push({ from: `fn:${fn}`, to: `ex:TikTok`, kind: "calls" });
    if (/cj[-_]/i.test(fn)) edges.push({ from: `fn:${fn}`, to: `ex:CJ Dropshipping`, kind: "calls" });
    if (/ga4|analytics|canonical/i.test(fn)) edges.push({ from: `fn:${fn}`, to: `ex:Google Analytics`, kind: "reports" });
  }
  // Admin page → its inferred room's top functions
  for (const pg of adminPages) {
    const r = roomFor(pg);
    const peers = edgeFunctions.filter((f) => roomFor(f) === r).slice(0, 3);
    for (const f of peers) edges.push({ from: `pg:${pg}`, to: `fn:${f}`, kind: "invokes" });
  }

  // Rooms summary
  const rooms: Record<string, { functions: number; pages: number; tables: number; externals: number }> = {};
  for (const n of nodes) {
    const r = (rooms[n.room] ||= { functions: 0, pages: 0, tables: 0, externals: 0 });
    if (n.kind === "edge_function") r.functions++;
    else if (n.kind === "admin_page") r.pages++;
    else if (n.kind === "table") r.tables++;
    else r.externals++;
  }

  // Completeness: does every room have at least fn + page + table coverage?
  const roomKeys = Object.keys(rooms);
  const covered = roomKeys.filter((r) => rooms[r].functions > 0 && rooms[r].tables > 0).length;
  const completeness = roomKeys.length ? Math.round((covered / roomKeys.length) * 100) : 0;

  // Health: penalize orphans and oversized rooms
  const orphanTables = tables.filter((t) => !edgeFunctions.some((f) => t.startsWith(f.split("-").slice(0, 2).join("_")))).length;
  const orphanPenalty = Math.min(30, Math.round((orphanTables / Math.max(1, tables.length)) * 40));
  const health_score = Math.max(40, 100 - orphanPenalty - (roomKeys.length > 20 ? 5 : 0));

  const summary = `Genome mapped: ${nodes.length} nodes, ${edges.length} edges across ${roomKeys.length} rooms. ` +
    `Completeness ${completeness}%, health ${health_score}/100. Orphan tables: ${orphanTables}.`;

  const { data: snap, error } = await admin.from("genesis_genome_snapshots").insert({
    node_count: nodes.length,
    edge_count: edges.length,
    completeness,
    health_score,
    rooms,
    nodes: nodes.slice(0, 5000),
    edges: edges.slice(0, 20000),
    summary,
  }).select().single();
  if (error) return json({ error: error.message }, 500);

  // Index nodes for search (best-effort, chunked)
  const rows = nodes.map((n) => ({
    snapshot_id: snap!.id,
    node_key: n.key,
    kind: n.kind,
    room: n.room,
    label: n.label,
    meta: n.meta ?? {},
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await admin.from("genesis_genome_nodes").insert(rows.slice(i, i + 500));
  }

  return json({ ok: true, snapshot_id: snap!.id, summary });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}