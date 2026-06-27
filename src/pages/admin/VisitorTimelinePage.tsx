import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Event = { ts: string; label: string; detail?: string };

export default function VisitorTimelinePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [events, setEvents] = useState<Event[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [quality, setQuality] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!sessionId) {
        // show recent sessions instead
        const { data } = await supabase
          .from("analytics_funnel_waterfall")
          .select("session_id,utm_source,furthest_step,traffic_type,updated_at,landing_page")
          .order("updated_at", { ascending: false })
          .limit(50);
        setRecent(data || []);
        setLoading(false);
        return;
      }
      const [wf, eng, cls, sq] = await Promise.all([
        supabase.from("analytics_funnel_waterfall").select("*").eq("session_id", sessionId).maybeSingle(),
        supabase.from("analytics_engagement_starts").select("*").eq("session_id", sessionId).maybeSingle(),
        supabase.from("analytics_traffic_classification").select("*").eq("session_id", sessionId).maybeSingle(),
        supabase.from("analytics_session_quality").select("*").eq("session_id", sessionId).maybeSingle(),
      ]);
      setMeta({ wf: wf.data, eng: eng.data, cls: cls.data });
      setQuality(sq.data);

      const w = wf.data || {};
      const evs: Event[] = [];
      const push = (ts: string | null | undefined, label: string) => { if (ts) evs.push({ ts, label }); };
      push(w.click_at, "Click");
      push(w.redirect_at, "Redirect");
      push(w.landing_at, "Landing");
      push(w.engagement_start_at, "Engagement Start");
      push(w.page_view_at, "Page View");
      push(w.scroll_at, "Scroll");
      push(w.view_item_at, "View Item");
      push(w.add_to_cart_at, "Add To Cart");
      push(w.begin_checkout_at, "Begin Checkout");
      push(w.payment_at, "Payment");
      push(w.purchase_at, "Purchase");
      evs.sort((a, b) => a.ts.localeCompare(b.ts));
      setEvents(evs);
      setLoading(false);
    })();
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Visitor Timelines</h1>
        <p className="text-sm text-muted-foreground">Pick a session:</p>
        {loading ? <div>Loading…</div> : (
          <table className="min-w-full text-sm border border-border rounded-lg">
            <thead className="bg-muted"><tr>
              <th className="text-left p-2">Session</th><th className="text-left p-2">Source</th>
              <th className="text-left p-2">Furthest step</th><th className="text-left p-2">Type</th>
              <th className="text-left p-2">Updated</th>
            </tr></thead>
            <tbody>{recent.map((r) => (
              <tr key={r.session_id} className="border-t border-border">
                <td className="p-2"><Link className="text-primary underline" to={`/admin/visitor-timeline/${encodeURIComponent(r.session_id)}`}>{r.session_id.slice(0,12)}…</Link></td>
                <td className="p-2">{r.utm_source || "—"}</td>
                <td className="p-2">{r.furthest_step || "—"}</td>
                <td className="p-2">{r.traffic_type || "—"}</td>
                <td className="p-2">{new Date(r.updated_at).toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Visitor Timeline</h1>
        <p className="text-xs text-muted-foreground break-all">{sessionId}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4">
          <h2 className="font-semibold mb-2">Classification</h2>
          <div className="text-sm space-y-1">
            <div>Type: <span className="font-medium">{meta?.cls?.traffic_type || "—"}</span></div>
            <div>Reason: {meta?.cls?.reason || "—"}</div>
            <div className="text-xs break-all text-muted-foreground">{meta?.cls?.user_agent || ""}</div>
          </div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <h2 className="font-semibold mb-2">Attribution</h2>
          <div className="text-sm space-y-1">
            <div>UTM source: {meta?.wf?.utm_source || "—"}</div>
            <div>UTM medium: {meta?.wf?.utm_medium || "—"}</div>
            <div>UTM campaign: {meta?.wf?.utm_campaign || "—"}</div>
            <div className="text-xs">Landing: {meta?.wf?.landing_page || "—"}</div>
          </div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <h2 className="font-semibold mb-2">Quality</h2>
          <div className="text-sm space-y-1">
            <div>Score: <span className="font-medium">{quality?.score ?? "—"}</span></div>
            <div>Class: {quality?.classification || "—"}</div>
            <div>Time: {quality?.time_on_page_ms ? Math.round(quality.time_on_page_ms/1000)+"s" : "—"}</div>
            <div>Scroll: {quality?.max_scroll_pct ?? "—"}%</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <div className="p-3 font-semibold border-b border-border">Timeline</div>
        <ol className="divide-y divide-border">
          {events.length === 0 && <li className="p-4 text-sm text-muted-foreground">No funnel events recorded for this session.</li>}
          {events.map((e, i) => (
            <li key={i} className="p-3 flex justify-between text-sm">
              <span className="font-mono text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</span>
              <span className="font-medium">{e.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}