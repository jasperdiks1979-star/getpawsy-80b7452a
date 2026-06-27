import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// ISO-8601 timestamp (nullable) — validated at runtime so the timeline never
// renders unparseable values from the database.
const TimestampField = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional()
  .catch(null);

const FunnelWaterfallSchema = z
  .object({
    session_id: z.string().optional().nullable(),
    utm_source: z.string().nullable().optional().catch(null),
    utm_medium: z.string().nullable().optional().catch(null),
    utm_campaign: z.string().nullable().optional().catch(null),
    landing_page: z.string().nullable().optional().catch(null),
    furthest_step: z.string().nullable().optional().catch(null),
    traffic_type: z.string().nullable().optional().catch(null),
    click_at: TimestampField,
    redirect_at: TimestampField,
    landing_at: TimestampField,
    engagement_start_at: TimestampField,
    page_view_at: TimestampField,
    scroll_at: TimestampField,
    view_item_at: TimestampField,
    add_to_cart_at: TimestampField,
    begin_checkout_at: TimestampField,
    payment_at: TimestampField,
    purchase_at: TimestampField,
  })
  .passthrough();

export type FunnelWaterfallRow = z.infer<typeof FunnelWaterfallSchema>;

const STEP_FIELDS: ReadonlyArray<{ key: keyof FunnelWaterfallRow; label: string }> = [
  { key: "click_at", label: "Click" },
  { key: "redirect_at", label: "Redirect" },
  { key: "landing_at", label: "Landing" },
  { key: "engagement_start_at", label: "Engagement Start" },
  { key: "page_view_at", label: "Page View" },
  { key: "scroll_at", label: "Scroll" },
  { key: "view_item_at", label: "View Item" },
  { key: "add_to_cart_at", label: "Add To Cart" },
  { key: "begin_checkout_at", label: "Begin Checkout" },
  { key: "payment_at", label: "Payment" },
  { key: "purchase_at", label: "Purchase" },
];

type Event = { ts: string; label: string; detail?: string };

export default function VisitorTimelinePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [events, setEvents] = useState<Event[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [quality, setQuality] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setValidationError(null);
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
      const parsed = FunnelWaterfallSchema.safeParse(wf.data ?? {});
      const wfRow: FunnelWaterfallRow = parsed.success ? parsed.data : {};
      if (!parsed.success) {
        const summary = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        console.warn("[VisitorTimeline] waterfall schema validation failed", parsed.error.flatten());
        setValidationError(summary);
      }
      setMeta({ wf: wfRow, eng: eng.data, cls: cls.data });
      setQuality(sq.data);

      const evs: Event[] = STEP_FIELDS.flatMap(({ key, label }) => {
        const ts = wfRow[key];
        return typeof ts === "string" && ts ? [{ ts, label }] : [];
      }).sort((a, b) => a.ts.localeCompare(b.ts));
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

      {validationError && (
        <Alert variant="destructive" className="border-orange-500/50 text-orange-700 dark:text-orange-400 [&>svg]:text-orange-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Timeline data validation warning</AlertTitle>
          <AlertDescription className="text-xs break-words">
            This session&apos;s waterfall row could not be fully validated against the expected schema. The timeline below may show incomplete or fallback values.
            <br className="mb-2" />
            <span className="font-mono text-[11px] opacity-90">{validationError}</span>
          </AlertDescription>
        </Alert>
      )}


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