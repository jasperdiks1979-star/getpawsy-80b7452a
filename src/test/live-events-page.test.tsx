import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import LiveEventsPage from "@/pages/admin/LiveEventsPage";

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b: any = {};
    b.select = vi.fn(() => b);
    b.gte = vi.fn(() => b);
    b.order = vi.fn(() => b);
    b.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return b;
  };
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn((cb?: any) => { cb?.("SUBSCRIBED"); return channel; }) };
  return {
    supabase: {
      from: vi.fn(() => builder()),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

describe("LiveEventsPage", () => {
  it("renders core panels and transport status", async () => {
    render(
      <HelmetProvider>
        <LiveEventsPage />
      </HelmetProvider>,
    );
    expect(screen.getByText(/Live Events/i)).toBeInTheDocument();
    expect(screen.getByText(/Stream/i)).toBeInTheDocument();
    expect(screen.getByText(/Funnel/i)).toBeInTheDocument();
    expect(screen.getByText(/Sources/i)).toBeInTheDocument();
    expect(screen.getByText(/Alerts/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Realtime|Polling/)).toBeInTheDocument());
  });
});