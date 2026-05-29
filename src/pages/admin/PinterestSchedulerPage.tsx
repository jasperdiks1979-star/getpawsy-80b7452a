import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarClock } from "lucide-react";

type Row = {
  id: string;
  status: string;
  scheduled_for: string | null;
  board_id: string | null;
  product_id: string | null;
  title: string | null;
};

export default function PinterestSchedulerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("pinterest_pin_queue")
          .select("id, status, scheduled_for, board_id, product_id, title")
          .order("scheduled_for", { ascending: true, nullsFirst: false })
          .limit(200);
        if (error) throw error;
        setRows((data || []) as Row[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const groups: Record<string, Row[]> = {};
  for (const r of rows) {
    const day = r.scheduled_for ? new Date(r.scheduled_for).toISOString().slice(0, 10) : "unscheduled";
    (groups[day] ||= []).push(r);
  }
  const days = Object.keys(groups).sort();

  return (
    <div className="p-6 space-y-4">
      <Helmet><title>Pinterest Scheduler — Admin</title></Helmet>
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Pinterest Scheduler</h1>
        <p className="text-sm text-muted-foreground">Read-only view of the publishing queue. Worker enforces 4/day cap, ≥90 min gap, US peak windows.</p>
      </header>
      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading queue…</div>
      ) : days.length === 0 ? (
        <div className="text-sm text-muted-foreground">Queue is empty.</div>
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
                      <th className="p-2 w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups[day].map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 text-xs text-muted-foreground">
                          {r.scheduled_for ? new Date(r.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "—"}
                        </td>
                        <td className="p-2">{r.title || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 text-xs font-mono">{r.product_id?.slice(0, 8) || "—"}</td>
                        <td className="p-2 text-xs font-mono">{r.board_id?.slice(0, 8) || "—"}</td>
                        <td className="p-2">
                          <Badge variant={r.status === "published" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
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