/**
 * Phase 2 regression suite for /admin/funnel-health (FunnelHealthCenter).
 *
 * Locks the canonical contract for the dashboard:
 *  - all canonical ecommerce events are visible (incl. view_cart / remove_from_cart)
 *  - legacy aliases are resolved server-side and never rendered as labels
 *  - empty states render correctly
 *  - health status changes correctly from GREEN -> WARNING/RED
 *  - QA/bot rows are never counted as production traffic
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import fs from "fs";
import {
  CANONICAL_ECOMMERCE_EVENTS,
  EVENT_ALIASES,
} from "@/lib/analytics-canonical-events";

type Row = Record<string, any>;
type TableData = Row[];

const tables: Record<string, TableData> = {
  analytics_funnel_waterfall: [],
  lp_funnel_events: [],
  checkout_funnel_events: [],
  visitor_activity: [],
  orders: [],
  utm_session_log: [],
};

function setTables(next: Partial<Record<keyof typeof tables, TableData>>) {
  for (const k of Object.keys(tables) as (keyof typeof tables)[]) {
    tables[k] = next[k] ?? [];
  }
}

vi.mock("@/integrations/supabase/client", () => {
  function makeBuilder(table: string) {
    const builder: any = {
      select: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (v: { data: TableData; error: null }) => void) =>
        resolve({ data: tables[table] ?? [], error: null }),
    };
    return builder;
  }
  return { supabase: { from: (t: string) => makeBuilder(t) } };
});

async function renderPage() {
  const { default: FunnelHealthCenter } = await import("@/pages/admin/FunnelHealthCenter");
  return render(
    <HelmetProvider>
      <FunnelHealthCenter />
    </HelmetProvider>,
  );
}

beforeEach(() => {
  setTables({});
  vi.resetModules();
});

describe("FunnelHealthCenter — static contract", () => {
  const src = fs.readFileSync("src/pages/admin/FunnelHealthCenter.tsx", "utf-8");

  it("is routed at /admin/funnel-health via App.tsx", () => {
    const app = fs.readFileSync("src/App.tsx", "utf-8");
    expect(app).toContain('import("./pages/admin/FunnelHealthCenter")');
    expect(app).toMatch(/path="funnel-health"/);
  });

  it("imports the canonical registry as its sole event source", () => {
    expect(src).toContain('from "@/lib/analytics-canonical-events"');
    expect(src).toContain("CANONICAL_ECOMMERCE_EVENTS");
    expect(src).toContain("resolveCanonicalEvent");
  });

  it("does not hardcode any legacy alias as a label", () => {
    // Allow alias keys to appear only inside the read-only contract panel
    // copy ("legacy aliases such as …"). Forbid them anywhere they could be
    // rendered as a metric label.
    const forbidden = Object.keys(EVENT_ALIASES);
    for (const name of forbidden) {
      const re = new RegExp(`label=\\\"${name}\\\"`);
      expect(src).not.toMatch(re);
    }
  });

  it("includes view_cart and remove_from_cart KPI labels", () => {
    expect(src).toMatch(/label=\"view_cart\"/);
    expect(src).toMatch(/label=\"remove_from_cart\"/);
  });
});

describe("FunnelHealthCenter — empty state", () => {
  it("renders the empty-state when no production events exist", async () => {
    setTables({});
    await renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("funnel-empty-state")).toBeInTheDocument();
    });
    // GREEN status badge appears in header
    expect(screen.getAllByTestId("status-green").length).toBeGreaterThan(0);
  });
});

describe("FunnelHealthCenter — canonical visibility", () => {
  it("renders every canonical ecommerce event in the contract panel", async () => {
    await renderPage();
    const panel = await screen.findByTestId("canonical-contract");
    for (const ev of CANONICAL_ECOMMERCE_EVENTS) {
      expect(within(panel).getByText(ev)).toBeInTheDocument();
    }
  });

  it("renders all six funnel KPI labels", async () => {
    await renderPage();
    const kpis = await screen.findByTestId("funnel-kpis");
    for (const lbl of [
      "view_item",
      "add_to_cart",
      "view_cart",
      "remove_from_cart",
      "begin_checkout",
      "purchase",
    ]) {
      expect(within(kpis).getByText(lbl)).toBeInTheDocument();
    }
  });
});

describe("FunnelHealthCenter — alias resolution + QA exclusion", () => {
  it("resolves legacy aliases (cart, pdp_view) into canonical buckets and never renders the alias text inside delivery rows", async () => {
    const now = new Date().toISOString();
    setTables({
      lp_funnel_events: [
        { id: "1", created_at: now, event_name: "pdp_view", session_id: "s1", raw_payload: { currency: "USD", value: 10, items: [] } },
        { id: "2", created_at: now, event_name: "cart", session_id: "s1", raw_payload: { currency: "USD", value: 10, items: [] } },
        // QA / bot rows must NOT count as production traffic
        { id: "qa", created_at: now, event_name: "add_to_cart", session_id: "sQA", qa: true, raw_payload: {} },
        { id: "bot", created_at: now, event_name: "add_to_cart", session_id: "sBot", is_bot: true, raw_payload: {} },
      ],
      visitor_activity: [
        { id: "v1", created_at: now, activity_type: "browsing", session_id: "s1" },
      ],
    });

    await renderPage();
    const table = await screen.findByTestId("delivery-table");

    // No legacy alias text leaks into the rendered delivery rows
    expect(within(table).queryByText("pdp_view")).toBeNull();
    expect(within(table).queryByText("cart")).toBeNull();
    expect(within(table).queryByText("cart_open")).toBeNull();

    // Canonical buckets must exist as rows
    expect(within(table).getByText("view_item")).toBeInTheDocument();
    expect(within(table).getByText("view_cart")).toBeInTheDocument();
    expect(within(table).getByText("add_to_cart")).toBeInTheDocument();

    // QA/bot exclusion: add_to_cart row must show 0 in the lp_funnel_events column
    const rows = within(table).getAllByRole("row");
    const addRow = rows.find(r => within(r).queryByText("add_to_cart"));
    expect(addRow).toBeTruthy();
    // first cell after the event name is GA4; lp_funnel_events is the 4th data col
    const cells = addRow!.querySelectorAll("td");
    // event(0) ga4(1) internal(2) lp(3) va(4) waterfall(5) attribution(6)
    expect(cells[3]?.textContent?.trim()).toBe("0");
  });
});

describe("FunnelHealthCenter — status escalation", () => {
  it("escalates to WARNING when visitors exist but a canonical event has zero rows", async () => {
    const now = new Date().toISOString();
    // Seed > 20 visitors via visitor_activity so the warning threshold trips,
    // but provide no view_item / add_to_cart events.
    const visitors = Array.from({ length: 40 }, (_, i) => ({
      id: `v${i}`,
      created_at: now,
      activity_type: "browsing",
      session_id: `s${i}`,
    }));
    setTables({ visitor_activity: visitors });

    await renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("status-warning").length).toBeGreaterThan(0);
    });
  });
});