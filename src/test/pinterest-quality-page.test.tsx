/**
 * Integration test for the PinterestQualityPage Simulate / Apply controls.
 * Verifies that:
 *  - Both pre-publish gate and Editor-in-Chief simulate buttons invoke the
 *    corresponding edge functions with dryRun=true.
 *  - The apply buttons invoke with dryRun=false.
 *  - Response payloads are surfaced into the rendered summary cards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock supabase client BEFORE importing the page.
vi.mock("@/integrations/supabase/client", () => {
  const invoke = vi.fn();
  const headFalse = () => Promise.resolve({ count: 0, data: [], error: null });
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => headFalse()),
    then: (res: any) => headFalse().then(res),
  };
  // Make terminal awaits resolve to empty datasets.
  Object.defineProperty(builder, Symbol.toPrimitive, { value: () => "" });
  const from = vi.fn(() => ({
    select: () => ({
      eq: () => ({ gte: () => headFalse(), in: () => headFalse() }),
      in: () => headFalse(),
      order: () => ({ limit: () => headFalse() }),
      gte: () => ({ limit: () => headFalse() }),
      limit: () => headFalse(),
    }),
  }));
  return {
    supabase: {
      from,
      functions: { invoke },
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import PinterestQualityPage from "@/pages/admin/PinterestQualityPage";

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

const gatePayload = {
  ok: true, traceId: "abc", dryRun: true, sampleSize: 300, minScore: 55,
  avgNativeScore: 47,
  mix: {
    lifestyle: { share: 0.10, target: 0.30, over: false },
    product_showcase: { share: 0.62, target: 0.05, over: true },
  },
  overCategories: { cat_tree: 60 },
  drafts: 25,
  counts: { reject: 8, downrank: 12, keep: 5 },
  applied: { rejects: 0, downranks: 0 },
  actions: [],
};

const editorPayload = {
  ok: true, traceId: "edt-1", dryRun: true, minScore: 70, maxIter: 2,
  feed: { used: true },
  summary: { evaluated: 25, approved: 9, downranked: 10, rejected: 6, improved: 4, iterations: 7 },
  decisions: [
    {
      draft_id: "d1", action: "approve", composite: 78, iterations: 1,
      axes: { save: 80 }, expected: { save_rate_pct: 1.6, discovery_lift_x: 2.4 },
      pass_reasons: [], fail_reasons: [],
    },
  ],
};

beforeEach(() => {
  invoke.mockReset();
});

describe("PinterestQualityPage Simulate / Apply", () => {
  it("Simulate triggers the pre-publish gate with dryRun=true and renders the mix", async () => {
    invoke.mockResolvedValue({ data: gatePayload, error: null });
    render(<PinterestQualityPage />);

    // First "Simulate (dry-run)" button = gate card; second = editor card.
    const simButtons = screen.getAllByRole("button", { name: /Simulate \(dry-run\)/i });
    fireEvent.click(simButtons[0]);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith(
      "pinterest-native-prepublish-gate",
      expect.objectContaining({ body: expect.objectContaining({ dryRun: true, sampleSize: 300 }) }),
    );
    await waitFor(() => {
      expect(screen.getByText(/Avg native score/i)).toBeInTheDocument();
      expect(screen.getByText("47")).toBeInTheDocument();
      expect(screen.getByText(/Planned reject: 8/)).toBeInTheDocument();
    });
  });

  it("Apply rebalance calls the gate with dryRun=false", async () => {
    invoke.mockResolvedValue({
      data: { ...gatePayload, dryRun: false, applied: { rejects: 8, downranks: 12 } },
      error: null,
    });
    render(<PinterestQualityPage />);

    fireEvent.click(screen.getByRole("button", { name: /Apply rebalance/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith(
      "pinterest-native-prepublish-gate",
      expect.objectContaining({ body: expect.objectContaining({ dryRun: false }) }),
    );
  });

  it("Editor Simulate calls editor-in-chief with dryRun and renders summary", async () => {
    invoke.mockResolvedValue({ data: editorPayload, error: null });
    render(<PinterestQualityPage />);

    // The editor card has its own Simulate button; both gate and editor buttons share label text.
    const simButtons = screen.getAllByRole("button", { name: /Simulate \(dry-run\)/i });
    // The 2nd Simulate button belongs to the editor card.
    fireEvent.click(simButtons[simButtons.length - 1]);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith(
      "pinterest-editor-in-chief",
      expect.objectContaining({
        body: expect.objectContaining({ dryRun: true, limit: 25, minScore: 70, maxIterations: 2 }),
      }),
    );
    await waitFor(() => {
      expect(screen.getByText(/Evaluated:/i)).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText(/Improved \(auto\):/i)).toBeInTheDocument();
    });
  });

  it("Editor apply triggers editor-in-chief with dryRun=false", async () => {
    invoke.mockResolvedValue({ data: { ...editorPayload, dryRun: false }, error: null });
    render(<PinterestQualityPage />);

    fireEvent.click(screen.getByRole("button", { name: /Run editor on next 25 drafts/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith(
      "pinterest-editor-in-chief",
      expect.objectContaining({ body: expect.objectContaining({ dryRun: false }) }),
    );
  });
});