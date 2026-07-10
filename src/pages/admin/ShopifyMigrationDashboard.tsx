import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Helmet } from "react-helmet-async";

interface Wave {
  wave: string;
  title: string;
  status: string;
  dry_run: boolean;
  item_count: number;
  success_count: number;
  failure_count: number;
  notes: string | null;
  updated_at: string;
}

interface Mapping {
  source_entity: string;
  source_field: string;
  shopify_entity: string;
  shopify_field: string;
  transformer: string | null;
  required: boolean;
}

interface IdMapRow {
  source_type: string;
  status: string;
  count: number;
}

const statusVariant = (s: string) => {
  switch (s) {
    case "completed": return "default";
    case "in_progress": return "secondary";
    case "blocked": return "destructive";
    case "rolled_back": return "destructive";
    default: return "outline";
  }
};

export default function ShopifyMigrationDashboard() {
  const [waves, setWaves] = useState<Wave[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [idMapStats, setIdMapStats] = useState<IdMapRow[]>([]);
  const [conflictsCount, setConflictsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [wavesRes, mappingRes, idMapRes, conflictsRes] = await Promise.all([
          supabase.from("shopify_migration_waves").select("*").order("wave"),
          supabase.from("shopify_field_mapping").select("*").order("source_entity"),
          supabase.from("shopify_id_map").select("source_type,status"),
          supabase.from("shopify_migration_conflicts").select("id", { count: "exact", head: true }).is("resolved_at", null),
        ]);
        if (cancelled) return;
        if (wavesRes.error) throw wavesRes.error;
        if (mappingRes.error) throw mappingRes.error;
        if (idMapRes.error) throw idMapRes.error;
        setWaves(wavesRes.data as Wave[]);
        setMappings(mappingRes.data as Mapping[]);
        // aggregate id_map counts by (source_type,status)
        const bucket = new Map<string, number>();
        (idMapRes.data ?? []).forEach((r: { source_type: string; status: string }) => {
          const k = `${r.source_type}|${r.status}`;
          bucket.set(k, (bucket.get(k) ?? 0) + 1);
        });
        setIdMapStats(
          [...bucket.entries()].map(([k, count]) => {
            const [source_type, status] = k.split("|");
            return { source_type, status, count };
          }),
        );
        setConflictsCount(conflictsRes.count ?? 0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Helmet>
        <title>Shopify Migration Dashboard — GetPawsy Admin</title>
        <meta name="description" content="Wave-by-wave GetPawsy → Shopify migration status, mapping rules, and conflict tracker." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header>
        <h1 className="text-3xl font-bold tracking-tight">Shopify Migration Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Read-only oversight for the GetPawsy → Shopify migration. No writes to Shopify happen from this view.
        </p>
      </header>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">Failed to load: {error}</CardContent>
        </Card>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Waves</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{waves.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Field Mapping Rules</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{mappings.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ID Map Rows</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">
            {idMapStats.reduce((a, r) => a + r.count, 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unresolved Conflicts</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{conflictsCount}</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Wave Roster</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p>Loading…</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Wave</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">OK</TableHead>
                  <TableHead className="text-right">Fail</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waves.map((w) => (
                  <TableRow key={w.wave}>
                    <TableCell className="font-mono">{w.wave}</TableCell>
                    <TableCell>{w.title}</TableCell>
                    <TableCell><Badge variant={statusVariant(w.status)}>{w.status}</Badge></TableCell>
                    <TableCell>{w.dry_run ? <Badge variant="outline">dry-run</Badge> : <Badge>live</Badge>}</TableCell>
                    <TableCell className="text-right">{w.item_count}</TableCell>
                    <TableCell className="text-right">{w.success_count}</TableCell>
                    <TableCell className="text-right">{w.failure_count}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{w.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Field Mapping Rules</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p>Loading…</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source Entity</TableHead>
                  <TableHead>Source Field</TableHead>
                  <TableHead>Shopify Entity</TableHead>
                  <TableHead>Shopify Field</TableHead>
                  <TableHead>Transformer</TableHead>
                  <TableHead>Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{m.source_entity}</TableCell>
                    <TableCell className="font-mono text-xs">{m.source_field}</TableCell>
                    <TableCell className="font-mono text-xs">{m.shopify_entity}</TableCell>
                    <TableCell className="font-mono text-xs">{m.shopify_field}</TableCell>
                    <TableCell className="font-mono text-xs">{m.transformer ?? "—"}</TableCell>
                    <TableCell>{m.required ? <Badge>req</Badge> : <span className="text-muted-foreground">opt</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ID Map Coverage (by entity × status)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p>Loading…</p> : idMapStats.length === 0 ? (
            <p className="text-muted-foreground">Empty — no items planned or migrated yet. This is expected in Wave 1.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {idMapStats.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{r.source_type}</TableCell>
                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
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
