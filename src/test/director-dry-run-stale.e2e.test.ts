import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateCjStockGate } from "@/utils/cjStockGate";

// End-to-end style test for the Pinterest Ad Studio "director dry-run"
// CJ-inventory freshness gate. We exercise the exact decision branch used by
// PinterestAdStudio.handleDirector via the shared `evaluateCjStockGate`
// helper, and assert the resulting toast + API behavior matches the
// non-blocking warn-on-dry-run contract.

type Toast = ReturnType<typeof makeToast>;
function makeToast() {
  return {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  };
}

function makeSupabase() {
  return {
    functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true, run_id: "run_1", concepts: [] }, error: null }) },
    from: vi.fn(),
  };
}

/**
 * Minimal port of PinterestAdStudio.handleDirector's CJ stock gate +
 * subsequent director-decide invocation, expressed against the shared
 * helper so we can drive it from a test without mounting the full page.
 */
async function runDirector(opts: {
  product: { slug: string; last_inventory_sync_at: string | null };
  dryRun: boolean;
  toast: Toast;
  supabase: ReturnType<typeof makeSupabase>;
  now: number;
}): Promise<{ blocked: boolean; warned: boolean }> {
  const gate = evaluateCjStockGate({
    lastSyncAt: opts.product.last_inventory_sync_at,
    dryRun: opts.dryRun,
    now: opts.now,
  });
  let warned = false;
  if (gate.action === "block") {
    opts.toast.error("CJ stock data is stale", {
      description: `Last CJ inventory sync: ${gate.label}. Refreshing now — retry after it finishes.`,
    });
    return { blocked: true, warned: false };
  }
  if (gate.action === "warn") {
    opts.toast.warning("CJ stock data is stale", {
      description: `Last sync: ${gate.label}. Dry-run will proceed but preflight may use outdated stock.`,
    });
    warned = true;
  }
  // Not blocked — proceed to invoke the director (this is the API call the UI
  // would make next).
  await opts.supabase.functions.invoke("cinematic-director-decide", {
    body: { product_slug: opts.product.slug, persist: true },
  });
  return { blocked: false, warned };
}

const NOW = new Date("2026-06-02T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("Pinterest Ad Studio · director dry-run · stale CJ inventory", () => {
  let toast: Toast;
  let supabase: ReturnType<typeof makeSupabase>;

  beforeEach(() => {
    toast = makeToast();
    supabase = makeSupabase();
  });

  it("dry-run with stale stock shows a warning toast but does not block the director call", async () => {
    const result = await runDirector({
      product: { slug: "smart-litter-box", last_inventory_sync_at: hoursAgo(24) },
      dryRun: true,
      toast,
      supabase,
      now: NOW,
    });

    // Contract: warning surfaced, paid-error suppressed, director invoked.
    expect(result.blocked).toBe(false);
    expect(result.warned).toBe(true);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [title, payload] = toast.warning.mock.calls[0];
    expect(title).toBe("CJ stock data is stale");
    expect(payload.description).toMatch(/24h old/);
    expect(payload.description).toMatch(/Dry-run will proceed/);
    expect(toast.error).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      "cinematic-director-decide",
      { body: { product_slug: "smart-litter-box", persist: true } },
    );
  });

  it("dry-run with never-synced stock warns and still invokes the director", async () => {
    const result = await runDirector({
      product: { slug: "modern-cat-tree", last_inventory_sync_at: null },
      dryRun: true,
      toast,
      supabase,
      now: NOW,
    });

    expect(result.blocked).toBe(false);
    expect(result.warned).toBe(true);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning.mock.calls[0][1].description).toMatch(/never synced/);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it("dry-run with fresh stock proceeds silently (no warning, no error)", async () => {
    const result = await runDirector({
      product: { slug: "smart-litter-box", last_inventory_sync_at: hoursAgo(2) },
      dryRun: true,
      toast,
      supabase,
      now: NOW,
    });

    expect(result.blocked).toBe(false);
    expect(result.warned).toBe(false);
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it("paid run with stale stock blocks: error toast, no director invocation", async () => {
    const result = await runDirector({
      product: { slug: "smart-litter-box", last_inventory_sync_at: hoursAgo(24) },
      dryRun: false,
      toast,
      supabase,
      now: NOW,
    });

    expect(result.blocked).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toBe("CJ stock data is stale");
    expect(toast.warning).not.toHaveBeenCalled();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});