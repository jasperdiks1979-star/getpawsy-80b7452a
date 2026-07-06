import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListChecks, Check, SkipForward } from "lucide-react";

type Task = {
  id: string; supplier_slug: string; period_label: string; expected_type: string;
  status: string; instructions: string | null; expected_amount_minor: number | null;
  currency: string | null; due_at: string | null; created_at: string;
};

const fmt = (m: number | null, cur = "EUR") =>
  m == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: cur }).format(m / 100);

export function OpenFinanceTasksPanel({ entityId }: { entityId: string | null }) {
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("finance_import_tasks")
      .select("id,supplier_slug,period_label,expected_type,status,instructions,expected_amount_minor,currency,due_at,created_at")
      .in("status", ["open", "uploaded", "failed"])
      .order("created_at", { ascending: false })
      .limit(80);
    if (entityId && entityId !== "all") q = q.eq("entity_id", entityId);
    const { data } = await q;
    setRows((data ?? []) as Task[]);
    setLoading(false);
  }, [entityId]);
  useEffect(() => { void load(); }, [load]);

  const mark = useCallback(async (id: string, status: "processed" | "skipped") => {
    await supabase.from("finance_import_tasks").update({ status }).eq("id", id);
    await load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Open Finance Tasks
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-sm text-muted-foreground">Loading…</div>
         : rows.length === 0 ? <div className="text-sm text-muted-foreground">No open tasks — everything is reconciled.</div>
         : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Type</th>
                <th className="py-1 pr-3">Supplier</th>
                <th className="py-1 pr-3">Period</th>
                <th className="py-1 pr-3 text-right">Amount</th>
                <th className="py-1 pr-3">Instructions</th>
                <th className="py-1">Status</th>
                <th className="py-1"></th>
              </tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="py-1 pr-3">{r.expected_type}</td>
                  <td className="py-1 pr-3">{r.supplier_slug}</td>
                  <td className="py-1 pr-3">{r.period_label}</td>
                  <td className="py-1 pr-3 text-right">{fmt(r.expected_amount_minor, r.currency ?? "EUR")}</td>
                  <td className="py-1 pr-3 text-xs text-muted-foreground max-w-[420px]">{r.instructions ?? "—"}</td>
                  <td className="py-1"><Badge variant={r.status === "open" ? "secondary" : "outline"}>{r.status}</Badge></td>
                  <td className="py-1 whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => mark(r.id, "processed")}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => mark(r.id, "skipped")}><SkipForward className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}