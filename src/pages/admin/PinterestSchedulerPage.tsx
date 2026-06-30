import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarClock } from "lucide-react";

type Row = {
  id: string;
  status: string;
  scheduled_at: string | null;
  effective_publish_at: string | null;
  is_due_now: boolean | null;
  board_id: string | null;
  product_id: string | null;
  product_slug: string | null;
  pin_title: string | null;
  destination_link: string | null;
  pin_image_url: string | null;
  priority: string | null;
};

export default function PinterestSchedulerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("pinterest_publishable_queue")
          .select("id,status,scheduled_at,effective_publish_at,is_due_now,board_id,product_id,product_slug,pin_title,destination_link,pin_image_url,priority")
          .order("priority", { ascending: true })
          .order("effective_publish_at", { ascending: true, nullsFirst: false })
          .limit(200);
        if (error) throw error;
        setRows((data || []) as Row[]);
      } catch (err: any) {
        setErrorMessage(err?.message ?? String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups: Record<string, Row[]> = {};
  for (const r of rows) {
    const day = r.effective_publish_at ? new Date(r.effective_publish_at).toISOString().slice(0, 10) : "unscheduled";
    (groups[day] ||= []).push(r);
  }
  const days = Object.keys(groups).sort();
  const dueNow = rows.filter((r) => r.is_due_now).length;

  return (
    <div className="p-6 space-y-4">
      <Helmet><title>Pinterest Scheduler — Admin</title></Helmet>
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Pinterest Scheduler</h1>
        <p className="text-sm text-muted-foreground">Read-only canonical view of the same publishable queue used by the automatic Pinterest publisher.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Scheduler queue count</div><div className="text-3xl font-semibold">{rows.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Due now</div><div className="text-3xl font-semibold">{dueNow}</div></CardContent></Card>
      </div>
      {errorMessage && (
        <div className="border border-destructive/40 bg-destructive/5 text-destructive p-3 rounded text-sm">
          {errorMessage}
        </div>
      )}
      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading queue…</div>
      ) : days.length === 0 ? (
        <div className="text-sm text-muted-foreground">No publishable pins match the canonical publisher query.</div>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <Card key={day}>
              <CardContent className="p-0">
                <div className="px-4 py-2 border-b bg-muted/40 flex items-center justify-between">
                  <div className="font-semibold">{day === "unscheduled" ? "Unscheduled" : day}</div>
                  <Badge variant="outline">{groups[day].length} pins</Badge>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2 w-24">Time</th>
                      <th className="p-2">Title</th>
                      <th className="p-2">Product</th>
                      <th className="p-2">Board</th>
                      <th className="p-2 w-24">Due</th>
                      <th className="p-2 w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups[day].map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 text-xs text-muted-foreground">
                          {r.effective_publish_at ? new Date(r.effective_publish_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "—"}
                        </td>
                        <td className="p-2">{r.pin_title || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 text-xs font-mono">{r.product_slug || r.product_id?.slice(0, 8) || "—"}</td>
                        <td className="p-2 text-xs font-mono">{r.board_id?.slice(0, 8) || "—"}</td>
                        <td className="p-2"><Badge variant={r.is_due_now ? "default" : "outline"}>{r.is_due_now ? "now" : "later"}</Badge></td>
                        <td className="p-2">
                          <Badge variant={r.status === "posted" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}