import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TruthResponse, TruthSession } from "@/hooks/useAnalyticsTruth";
import { countersFromSessions } from "@/hooks/useAnalyticsTruth";
import { ProToolbar, type ProToolbarState } from "@/components/admin/visitor-world-map-v2/ProToolbar";
import { ProKpiHeader } from "@/components/admin/visitor-world-map-v2/ProKpiHeader";
import { useState } from "react";

// -- Fixture helpers -------------------------------------------------------

function session(o: Partial<TruthSession>): TruthSession {
  return {
    session_id: o.session_id ?? Math.random().toString(36).slice(2),
    visitor_id: null,
    country: "United States",
    city: null,
    latitude: null,
    longitude: null,
    first_seen_at: "2026-07-04T10:00:00.000Z",
    last_seen_at: "2026-07-04T10:05:00.000Z",
    page_views: 1,
    source: "direct",
    device: "desktop",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: null,
    page_path: "/",
    has_product_view: false,
    has_add_to_cart: false,
    has_view_cart: false,
    has_checkout: false,
    has_purchase: false,
    order_value: 0,
    is_internal: false,
    ...o,
  };
}

const FIXTURE_SESSIONS: TruthSession[] = [
  session({ session_id: "a", source: "pinterest", page_views: 3 }),
  session({ session_id: "b", source: "pinterest", page_views: 2, has_add_to_cart: true }),
  session({ session_id: "c", source: "google",    page_views: 5, has_add_to_cart: true, has_checkout: true, order_value: 42.5 }),
  session({ session_id: "d", source: "direct",    page_views: 1, is_internal: true }),
];

const FIXTURE_RESPONSE: TruthResponse = {
  ok: true,
  window: { hours: 24, since: "2026-07-03T00:00:00.000Z", until: "2026-07-04T00:00:00.000Z" },
  filter: { geo: "all", clean: true, source: "all" },
  totals: {
    visitors: 4, sessions: 4, page_views: 11, product_views: 0,
    add_to_cart: 2, view_cart: 0, checkout_started: 1, purchases: 0,
    revenue: 42.5, currency: "USD", conversion_rate: 0,
  },
  funnel: [],
  countries: [],
  sources: [],
  sessions: FIXTURE_SESSIONS,
  sample_event: null,
  generated_at: "2026-07-04T10:00:00.000Z",
};

// Stub the Supabase edge invoke so `useAnalyticsTruth` resolves synchronously.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async () => ({ data: FIXTURE_RESPONSE, error: null })),
    },
  },
}));

function withQuery(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// -- Toolbar state ---------------------------------------------------------

function ToolbarHarness({ initial }: { initial: ProToolbarState }) {
  const [s, setS] = useState<ProToolbarState>(initial);
  return (
    <div>
      <ProToolbar state={s} onChange={setS} />
      <pre data-testid="dump">{JSON.stringify(s)}</pre>
    </div>
  );
}

describe("Visitor World Map Pro — ProToolbar", () => {
  beforeEach(() => localStorage.clear());

  it("renders period, source, activity selectors and quick filters", () => {
    render(
      <ToolbarHarness
        initial={{ timeRange: "24h", source: "all", activity: "all", usOnly: false, excludeInternal: true }}
      />,
    );
    expect(screen.getByTestId("vwm-pro-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("vwm-pro-period")).toBeInTheDocument();
    expect(screen.getByTestId("vwm-pro-source")).toBeInTheDocument();
    expect(screen.getByTestId("vwm-pro-activity")).toBeInTheDocument();
    expect(screen.getByTestId("vwm-pro-us-only")).toBeInTheDocument();
    expect(screen.getByTestId("vwm-pro-exclude-internal")).toBeInTheDocument();
  });

  it("shows the Live-mode banner when period is 'live' and hides it otherwise", () => {
    const { rerender } = render(
      <ToolbarHarness
        initial={{ timeRange: "live", source: "all", activity: "all", usOnly: false, excludeInternal: true }}
      />,
    );
    expect(screen.getByTestId("vwm-pro-live-banner")).toBeInTheDocument();

    rerender(
      <ToolbarHarness
        initial={{ timeRange: "24h", source: "all", activity: "all", usOnly: false, excludeInternal: true }}
      />,
    );
    expect(screen.queryByTestId("vwm-pro-live-banner")).not.toBeInTheDocument();
  });

  it("toggles US-only and exclude-internal quick filters into state", () => {
    render(
      <ToolbarHarness
        initial={{ timeRange: "24h", source: "all", activity: "all", usOnly: false, excludeInternal: true }}
      />,
    );
    fireEvent.click(screen.getByTestId("vwm-pro-us-only"));
    fireEvent.click(screen.getByTestId("vwm-pro-exclude-internal"));
    const dump = JSON.parse(screen.getByTestId("dump").textContent || "{}");
    expect(dump.usOnly).toBe(true);
    expect(dump.excludeInternal).toBe(false);
  });
});

// -- KPI canonical parity --------------------------------------------------

describe("Visitor World Map Pro — ProKpiHeader canonical parity", () => {
  it("renders KPI values equal to countersFromSessions() over the canonical truth set", async () => {
    const state: ProToolbarState = {
      timeRange: "24h", source: "all", activity: "all", usOnly: false, excludeInternal: true,
    };
    render(withQuery(<ProKpiHeader state={state} />));

    // Baseline: excludeInternal=true drops the internal fixture session, so
    // parity is asserted against the same filtered set.
    const expected = countersFromSessions(FIXTURE_SESSIONS.filter((s) => !s.is_internal));

    await waitFor(() => expect(screen.getByTestId("kpi-visitors")).toBeInTheDocument());

    expect(screen.getByTestId("kpi-visitors")).toHaveTextContent(String(expected.visitors));
    expect(screen.getByTestId("kpi-sessions")).toHaveTextContent(String(expected.sessions));
    expect(screen.getByTestId("kpi-pageviews")).toHaveTextContent(String(expected.page_views));
    expect(screen.getByTestId("kpi-atc")).toHaveTextContent(String(expected.add_to_cart));
    expect(screen.getByTestId("kpi-checkout")).toHaveTextContent(String(expected.checkout_started));
    expect(screen.getByTestId("kpi-purchases")).toHaveTextContent(String(expected.purchases));
    expect(screen.getByTestId("kpi-revenue")).toHaveTextContent("42.50");
  });

  it("hides all business KPIs and shows the Live-blocked notice in Live mode", async () => {
    const state: ProToolbarState = {
      timeRange: "live", source: "all", activity: "all", usOnly: false, excludeInternal: true,
    };
    render(withQuery(<ProKpiHeader state={state} />));
    await waitFor(() =>
      expect(screen.getByTestId("vwm-pro-kpi-live-blocked")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("kpi-visitors")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kpi-revenue")).not.toBeInTheDocument();
  });

  it("filters KPIs when a source is selected — matches the same filter applied to the truth set", async () => {
    const state: ProToolbarState = {
      timeRange: "24h", source: "pinterest", activity: "all", usOnly: false, excludeInternal: true,
    };
    render(withQuery(<ProKpiHeader state={state} />));
    const expected = countersFromSessions(
      FIXTURE_SESSIONS.filter((s) => !s.is_internal && s.source === "pinterest"),
    );
    await waitFor(() => expect(screen.getByTestId("kpi-sessions")).toBeInTheDocument());
    expect(screen.getByTestId("kpi-sessions")).toHaveTextContent(String(expected.sessions));
    expect(screen.getByTestId("kpi-pageviews")).toHaveTextContent(String(expected.page_views));
    expect(screen.getByTestId("kpi-atc")).toHaveTextContent(String(expected.add_to_cart));
  });
});
