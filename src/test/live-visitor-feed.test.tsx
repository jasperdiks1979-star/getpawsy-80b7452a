import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LiveVisitorFeed } from "@/components/admin/visitor-world-map-v2/LiveVisitorFeed";
import { LiveDiagnosticsPanel } from "@/components/admin/visitor-world-map-v2/LiveDiagnosticsPanel";
import type { LiveVisitorActivityRow, LiveConnectionDiagnostics } from "@/lib/liveVisitorTimeline";

const rows: LiveVisitorActivityRow[] = [
  {
    session_id: "sess-a",
    country: "US",
    city: "Austin",
    page_path: "/p/toy",
    activity_type: "product_view",
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    latitude: 30,
    longitude: -97,
  },
  {
    session_id: "sess-b",
    country: "US",
    city: "Denver",
    page_path: "/",
    activity_type: "browsing",
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    latitude: 39,
    longitude: -104,
  },
  // duplicate session — should be deduped
  {
    session_id: "sess-a",
    country: "US",
    city: "Austin",
    page_path: "/cart",
    activity_type: "add_to_cart",
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  },
];

describe("LiveVisitorFeed", () => {
  it("dedupes by session and calls onSelect", () => {
    const onSelect = vi.fn();
    render(<LiveVisitorFeed rows={rows} selectedSessionId={null} onSelect={onSelect} />);
    expect(screen.getByText("2 active")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("live-visitor-row-sess-a"));
    expect(onSelect).toHaveBeenCalledWith("sess-a");
  });

  it("shows empty state when no rows", () => {
    render(<LiveVisitorFeed rows={[]} selectedSessionId={null} onSelect={() => {}} />);
    expect(screen.getByText(/No live visitors/i)).toBeInTheDocument();
  });
});

describe("LiveDiagnosticsPanel", () => {
  const diagnostics: LiveConnectionDiagnostics = {
    transport: "websocket",
    websocketStatus: "open",
    lastHeartbeatAt: new Date().toISOString(),
    lastHeartbeatAgeMs: 1200,
    droppedHeartbeats: 3,
    reconnectAttempts: 1,
    latencyMs: 82,
    geoLookupFailures: 0,
  };

  it("renders transport, latency and counters", () => {
    render(
      <LiveDiagnosticsPanel
        diagnostics={diagnostics}
        activeSessions={5}
        sessionsWithGeo={4}
        liveMarkers={4}
        liveCanonicalOverlap={2}
      />,
    );
    expect(screen.getByTestId("live-diagnostics-panel")).toBeInTheDocument();
    expect(screen.getAllByText(/websocket/i).length).toBeGreaterThan(0);
    expect(screen.getByText("82ms")).toBeInTheDocument();
    expect(screen.getByText("Presence only. Canonical KPIs remain unaffected.")).toBeInTheDocument();
  });
});