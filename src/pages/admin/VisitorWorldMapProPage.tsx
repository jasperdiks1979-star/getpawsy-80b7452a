import { useCallback, useEffect, useMemo, useState } from "react";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisitorWorldMapV2 } from "@/components/admin/visitor-world-map-v2";
import {
  ProToolbar,
  type ProToolbarState,
  proHoursForRange,
} from "@/components/admin/visitor-world-map-v2/ProToolbar";
import { ProKpiHeader } from "@/components/admin/visitor-world-map-v2/ProKpiHeader";
import { LiveVisitorFeed } from "@/components/admin/visitor-world-map-v2/LiveVisitorFeed";
import { LiveVisitorDrawer } from "@/components/admin/visitor-world-map-v2/LiveVisitorDrawer";
import { LiveDiagnosticsPanel } from "@/components/admin/visitor-world-map-v2/LiveDiagnosticsPanel";
import { useLivePresence } from "@/hooks/useLivePresence";
import { useAnalyticsTruth } from "@/hooks/useAnalyticsTruth";
import { computeLiveCanonicalOverlap } from "@/lib/liveMapLayer";

const STORAGE_KEY = "vwm-pro-toolbar-v1";

const DEFAULT_STATE: ProToolbarState = {
  timeRange: "24h",
  source: "all",
  activity: "all",
  usOnly: false,
  excludeInternal: true,
};

function loadInitialState(): ProToolbarState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ProToolbarState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function proTimeRangeToMapTimeRange(t: ProToolbarState["timeRange"]) {
  // The underlying VisitorWorldMap uses the same tokens except "30m" is not
  // in its enum — fall back to "15m" (closest short-window value it accepts).
  return t === "30m" ? "15m" : t;
}

/**
 * Visitor World Map Pro — Stage 2 shell.
 *
 * This page renders the SAME `VisitorWorldMapV2` component that the compact
 * widget and `/live-map` already use — there is no parallel implementation
 * and no new data source. Stage 2 only introduces the desktop layout shell
 * (KPI header slot, left filter slot, map area, right feed slot, lower
 * diagnostics slot). Every slot is currently a placeholder except the KPI
 * header (which reuses the existing canonical strip) and the map area
 * (which mounts the existing component).
 *
 * Filters, live-feed rows, and diagnostic panels move into their slots in
 * later stages under their own reviews. Do NOT add analytics logic here.
 */
export default function VisitorWorldMapProPage() {
  const [state, setState] = useState<ProToolbarState>(loadInitialState);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [followSelected, setFollowSelected] = useState(false);
  const [mapDiagnostics, setMapDiagnostics] = useState({
    liveMarkersRendered: 0,
    liveClusters: 0,
    selectedLiveSessionId: null as string | null,
    followMode: false,
  });

  const isLive = state.timeRange === "live";
  const livePresence = useLivePresence({
    enabled: isLive,
    usOnly: state.usOnly,
    excludeInternal: state.excludeInternal,
    source: state.source,
    activity: state.activity,
  });

  // Canonical truth set for live↔canonical overlap. Read-only; never
  // contributes to KPI counters (those are owned by ProKpiHeader/useAnalyticsTruth).
  const truth = useAnalyticsTruth({
    hours: 24,
    geo: state.usOnly ? "US" : "all",
    enabled: isLive,
    refetchIntervalMs: 60_000,
  });

  const overlap = useMemo(() => {
    if (!isLive) return { liveSessions: 0, overlapSession: 0, overlapVisitor: 0, overlapAny: 0 };
    const sessionIds = new Set((truth.data?.sessions ?? []).map((s) => s.session_id));
    const visitorIds = new Set(
      (truth.data?.sessions ?? [])
        .map((s) => s.visitor_id)
        .filter((v): v is string => !!v),
    );
    return computeLiveCanonicalOverlap(livePresence.rows, sessionIds, visitorIds);
  }, [isLive, truth.data, livePresence.rows]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore quota errors */ }
  }, [state]);

  const handleChange = useCallback((next: ProToolbarState) => setState(next), []);

  // Re-key the map when toolbar state changes so its internal state re-seeds
  // from the new initial props. This is a real, evidence-verifiable wiring:
  // the map fully re-mounts with the toolbar's current selections. Not
  // elegant, but honest — a full controlled refactor of the 2970-line
  // component belongs in its own stage.
  const mapKey = `${state.timeRange}|${state.source}|${state.activity}|${state.usOnly}|${state.excludeInternal}`;

  const openVisitor = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setDrawerOpen(true);
  }, []);

  const handleMapDiagnostics = useCallback(
    (d: {
      liveMarkersRendered: number;
      liveClusters: number;
      selectedLiveSessionId: string | null;
      followMode: boolean;
    }) => setMapDiagnostics(d),
    [],
  );

  return (
    <HelmetProvider>
      <Helmet>
        <title>Visitor World Map Pro — GetPawsy Admin</title>
        <meta name="robots" content="noindex, follow" />
        <meta
          name="description"
          content="Enterprise-grade operational view of visitor activity, powered by the canonical analytics truth source."
        />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Admin
                </Link>
              </Button>
              <h1 className="text-sm font-semibold sm:text-base">
                Visitor World Map Pro
              </h1>
              <span className="hidden rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                Stage 2 shell
              </span>
            </div>
            <span className="hidden text-xs text-muted-foreground md:inline">
              Business KPIs: analytics-canonical · Live presence: diagnostic only
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1800px] px-4 py-4">
          <div className="mb-3">
            <ProToolbar state={state} onChange={handleChange} />
          </div>

          <div className="mb-4">
            <ProKpiHeader state={state} />
          </div>

          {/* Desktop grid: left filters | map | right feed.
              On <lg the columns collapse to a single stack so the mobile
              experience is unchanged. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
            <aside
              aria-label="Filter sidebar (Stage 3 placeholder)"
              className="hidden rounded-lg border bg-card p-3 text-xs text-muted-foreground lg:block"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                Filters
              </div>
              Primary filters live in the toolbar above. Advanced faceted
              filters (device, browser, campaign) move here in a later stage.
            </aside>

            <section aria-label="Map area" data-testid="vwm-pro-map-slot" className="min-h-[600px]">
              <VisitorWorldMapV2
                key={mapKey}
                initialTimeRange={proTimeRangeToMapTimeRange(state.timeRange)}
                initialSourceFilter={state.source}
                initialActivityFilter={state.activity}
                initialUsOnly={state.usOnly}
                initialExcludeInternal={state.excludeInternal}
                selectedLiveSessionId={isLive ? selectedSessionId : null}
                followSelectedLiveSession={isLive && followSelected}
                onLiveVisitorSelect={isLive ? openVisitor : undefined}
                onLiveMapDiagnostics={isLive ? handleMapDiagnostics : undefined}
              />
            </section>

            <aside
              aria-label="Live visitor feed (Stage 5 placeholder)"
              className="hidden lg:block"
            >
              {isLive ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-[11px]">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={followSelected}
                        onChange={(e) => setFollowSelected(e.target.checked)}
                        disabled={!selectedSessionId}
                      />
                      <span>Follow selected visitor</span>
                    </label>
                    {selectedSessionId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSessionId(null);
                          setFollowSelected(false);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <LiveVisitorFeed
                    rows={livePresence.rows}
                    selectedSessionId={selectedSessionId}
                    onSelect={openVisitor}
                  />
                </div>
              ) : (
                <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                    Live visitor feed
                  </div>
                  Switch the period selector to <strong>Live now</strong> to see
                  active visitors in real time. Presence is diagnostic only and
                  never contributes to canonical KPIs.
                </div>
              )}
            </aside>
          </div>

          {/* Lower diagnostics slot — panels remain inside the map component
              today; Stage 6+ groups them here under collapsible sections. */}
          <section
            aria-label="Diagnostics (Stage 6+ placeholder)"
            className="mt-4"
          >
            {isLive ? (
              <LiveDiagnosticsPanel
                diagnostics={livePresence.diagnostics}
                activeSessions={new Set(livePresence.rows.map((r) => r.session_id)).size}
                sessionsWithGeo={livePresence.rows.filter((r) => r.latitude != null && r.longitude != null).length}
                liveMarkers={mapDiagnostics.liveMarkersRendered || livePresence.rows.filter((r) => r.latitude != null && r.longitude != null).length}
                liveCanonicalOverlap={overlap.overlapAny}
                liveClusters={mapDiagnostics.liveClusters}
                selectedLiveSessionId={selectedSessionId}
                followMode={followSelected}
              />
            ) : (
              <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  Diagnostics
                </div>
                Canonical / geo / Pinterest / delivery / developer diagnostic
                panels stay inside the map component. Live-presence diagnostics
                appear here when the period selector is set to <strong>Live now</strong>.
              </div>
            )}
          </section>
        </main>

        <LiveVisitorDrawer
          sessionId={selectedSessionId}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      </div>
    </HelmetProvider>
  );
}
