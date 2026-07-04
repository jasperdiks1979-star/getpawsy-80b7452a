import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  buildLiveTimeline,
  buildLiveVisitorProfile,
  type LiveVisitorActivityRow,
  type LiveTimelineStep,
  type LiveVisitorProfile,
} from "@/lib/liveVisitorTimeline";

export interface LiveVisitorDrawerProps {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional pre-loaded rows (used by tests / storybook). */
  preloadedRows?: LiveVisitorActivityRow[];
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-1.5 text-xs last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] truncate text-right font-medium text-foreground">
        {value ?? "—"}
      </dd>
    </div>
  );
}

function TimelineList({ steps }: { steps: LiveTimelineStep[] }) {
  if (steps.length === 0) {
    return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ol data-testid="live-visitor-timeline" className="space-y-2">
      {steps.map((step, idx) => (
        <li key={`${step.timestamp}-${idx}`} className="flex gap-3 text-xs">
          <time className="w-20 flex-shrink-0 font-mono text-[10px] text-muted-foreground">
            {new Date(step.timestamp).toLocaleTimeString()}
          </time>
          <div className="flex-1">
            <div className="font-medium text-foreground">{step.label}</div>
            {step.page_path && step.label !== step.page_path && (
              <div className="truncate text-[10px] text-muted-foreground">{step.page_path}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function LiveVisitorDrawer({ sessionId, open, onOpenChange, preloadedRows }: LiveVisitorDrawerProps) {
  const query = useQuery<LiveVisitorActivityRow[]>({
    queryKey: ["live-visitor-detail", sessionId],
    enabled: open && !!sessionId && !preloadedRows,
    staleTime: 5_000,
    refetchInterval: open ? 5_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visitor_activity")
        .select(
          "id,session_id,visitor_id,activity_type,page_path,product_name,product_id,product_category,order_id,order_value,country,city,device_type,browser,screen_width,screen_height,referrer,referrer_category,utm_source,utm_medium,utm_campaign,utm_term,utm_content,is_bot_suspect,bot_suspect_reason,traffic_quality,geo_confidence,latitude,longitude,is_internal,created_at,last_seen_at",
        )
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as LiveVisitorActivityRow[];
    },
  });

  const rows = preloadedRows ?? query.data ?? [];
  const profile = useMemo<LiveVisitorProfile | null>(() => buildLiveVisitorProfile(rows), [rows]);
  const timeline = useMemo(() => buildLiveTimeline(rows), [rows]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Live visitor</SheetTitle>
          <SheetDescription>
            {sessionId ? `Session ${sessionId.slice(0, 8)}…` : "No session selected"}
          </SheetDescription>
        </SheetHeader>

        {!sessionId && (
          <p className="mt-4 text-xs text-muted-foreground">Select a visitor to inspect.</p>
        )}

        {sessionId && !profile && (
          <p className="mt-4 text-xs text-muted-foreground">
            {query.isLoading ? "Loading…" : "No activity for this session."}
          </p>
        )}

        {profile && (
          <div data-testid="live-visitor-drawer" className="mt-4 space-y-4">
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Identity
              </h3>
              <dl>
                <StatRow label="Visitor" value={profile.visitor_id ?? "—"} />
                <StatRow label="Session" value={profile.session_id} />
                <StatRow label="Location" value={[profile.city, profile.country].filter(Boolean).join(", ") || "—"} />
                <StatRow label="Device" value={profile.device ?? "—"} />
                <StatRow label="Browser" value={profile.browser ?? "—"} />
                <StatRow label="Screen" value={profile.screen ?? "—"} />
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Navigation
              </h3>
              <dl>
                <StatRow label="Landing" value={profile.landing_page ?? "—"} />
                <StatRow label="Previous" value={profile.previous_page ?? "—"} />
                <StatRow label="Current page" value={profile.current_page ?? "—"} />
                <StatRow label="Current product" value={profile.current_product ?? "—"} />
                <StatRow label="Current category" value={profile.current_category ?? "—"} />
                <StatRow label="Page views" value={profile.page_view_count} />
                <StatRow label="Interactions" value={profile.interaction_count} />
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Attribution
              </h3>
              <dl>
                <StatRow label="Source" value={profile.traffic_source} />
                <StatRow label="Campaign" value={profile.campaign ?? "—"} />
                <StatRow label="UTM source" value={profile.utm.source ?? "—"} />
                <StatRow label="UTM medium" value={profile.utm.medium ?? "—"} />
                <StatRow label="UTM campaign" value={profile.utm.campaign ?? "—"} />
                <StatRow label="UTM term" value={profile.utm.term ?? "—"} />
                <StatRow label="UTM content" value={profile.utm.content ?? "—"} />
                <StatRow label="Referrer" value={profile.referrer ?? "—"} />
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Session
              </h3>
              <dl>
                <StatRow label="Duration" value={`${profile.session_duration_seconds}s`} />
                <StatRow label="Heartbeat age" value={`${profile.heartbeat_age_seconds}s`} />
                <StatRow label="Cart" value={profile.cart_status} />
                <StatRow label="Checkout" value={profile.checkout_status} />
                <StatRow label="Purchase" value={profile.purchase_status} />
                <StatRow label="Revenue" value={profile.current_revenue ? profile.current_revenue.toFixed(2) : "0.00"} />
                <StatRow label="Bot suspect" value={profile.bot_suspect ? "yes" : "no"} />
                <StatRow label="Traffic quality" value={profile.traffic_quality ?? "—"} />
                <StatRow label="Geo confidence" value={profile.geo_confidence ?? "—"} />
              </dl>
            </section>

            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Timeline
              </h3>
              <TimelineList steps={timeline} />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}