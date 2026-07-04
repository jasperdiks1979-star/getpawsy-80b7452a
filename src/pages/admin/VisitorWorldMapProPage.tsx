import { HelmetProvider, Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisitorWorldMapV2 } from "@/components/admin/visitor-world-map-v2";
import { CanonicalKpiStrip } from "@/components/admin/CanonicalKpiStrip";

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
          {/* KPI header slot — reuses the existing canonical KPI strip. */}
          <section aria-label="Canonical KPI header" className="mb-4">
            <CanonicalKpiStrip defaultRange="24h" />
          </section>

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
              Advanced filters (source, activity, geo, device) will move here
              in Stage 3. The existing in-map filters remain active for now.
            </aside>

            <section aria-label="Map area" className="min-h-[600px]">
              <VisitorWorldMapV2 />
            </section>

            <aside
              aria-label="Live visitor feed (Stage 5 placeholder)"
              className="hidden rounded-lg border bg-card p-3 text-xs text-muted-foreground lg:block"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground">
                Live visitor feed
              </div>
              Right-hand realtime feed lands in Stage 5. No parallel data
              pipeline will be introduced — it will read the same canonical
              sessions and the isolated live-presence source already in use.
            </aside>
          </div>

          {/* Lower diagnostics slot — panels remain inside the map component
              today; Stage 6+ groups them here under collapsible sections. */}
          <section
            aria-label="Diagnostics (Stage 6+ placeholder)"
            className="mt-4 rounded-lg border bg-card p-3 text-xs text-muted-foreground"
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
              Diagnostics
            </div>
            Canonical / geo / Pinterest / delivery / developer diagnostic
            panels stay inside the map component for now and will be lifted
            into collapsible groups here in a later stage.
          </section>
        </main>
      </div>
    </HelmetProvider>
  );
}
