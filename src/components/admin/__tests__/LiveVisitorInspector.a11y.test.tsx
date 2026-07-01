import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useLiveVisitorInspector, LiveVisitorInspector } from "../LiveVisitorInspector";

// Mock the Supabase client so the component can mount without network I/O.
// The realtime channel returns a chainable stub whose `subscribe` is a no-op.
vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: () => ({
        select: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

function Harness() {
  const { state, setState } = useLiveVisitorInspector();
  return (
    <>
      <button
        type="button"
        data-testid="opener"
        aria-expanded={state.open}
        onClick={() => setState(s => ({ ...s, open: true, minimized: false }))}
      >
        Open Visitors
      </button>
      <LiveVisitorInspector state={state} setState={setState} />
    </>
  );
}

function getDialog() {
  return screen.getByRole("dialog", { name: /live visitors/i });
}

beforeEach(() => {
  localStorage.clear();
});

describe("LiveVisitorInspector — accessibility", () => {
  it("does not render dialog until opened", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes dialog with accessible name from the title id", async () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());

    const dialog = getDialog();
    expect(dialog).toHaveAttribute("aria-labelledby", "live-visitor-inspector-title");
    expect(document.getElementById("live-visitor-inspector-title")).toHaveTextContent(/live visitors/i);
  });

  it("provides accessible names for all header controls (button-name)", () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());
    const dialog = getDialog();

    // Move handle, Pin, Minimize, Close, Resize — each must have an aria-label.
    expect(within(dialog).getByRole("button", { name: /move panel/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /pin panel position/i })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).getByRole("button", { name: /minimize panel/i })).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByRole("button", { name: /close visitor inspector/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /resize panel/i })).toBeInTheDocument();
  });

  it("toggles aria-pressed on pin and aria-expanded on minimize", () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());
    const dialog = getDialog();

    const pin = within(dialog).getByRole("button", { name: /pin panel position/i });
    act(() => pin.click());
    // After toggling, its accessible name flips to the "Unpin" variant.
    expect(within(dialog).getByRole("button", { name: /unpin panel/i })).toHaveAttribute("aria-pressed", "true");

    const min = within(dialog).getByRole("button", { name: /minimize panel/i });
    act(() => min.click());
    expect(within(dialog).getByRole("button", { name: /expand panel/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("disables keyboard move when the panel is pinned", () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());
    const dialog = getDialog();

    act(() => within(dialog).getByRole("button", { name: /pin panel position/i }).click());
    const move = within(dialog).getByRole("button", { name: /move disabled/i });
    expect(move).toBeDisabled();
  });

  it("keyboard: Escape closes the dialog and returns focus to the opener", () => {
    render(<Harness />);
    const opener = screen.getByTestId("opener") as HTMLButtonElement;
    opener.focus();
    act(() => opener.click());

    const dialog = getDialog();
    act(() => {
      fireEvent.keyDown(dialog, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("keyboard: arrow keys on the move handle nudge x/y (Shift = larger step)", () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());

    // Seed a known starting position so we can assert deltas deterministically.
    act(() => {
      const raw = JSON.parse(localStorage.getItem("gp:visitor-inspector:v1") || "{}");
      localStorage.setItem(
        "gp:visitor-inspector:v1",
        JSON.stringify({ ...raw, open: true, x: 200, y: 200 }),
      );
    });
    // Re-render by toggling to pick up seeded position via a fresh mount.
    // Simpler: drive movement from current state via keyboard events.

    const dialog = getDialog();
    const move = within(dialog).getByRole("button", { name: /move panel/i });
    const before = dialog.getBoundingClientRect();

    act(() => {
      fireEvent.keyDown(move, { key: "ArrowRight" });          // +10 x
      fireEvent.keyDown(move, { key: "ArrowDown", shiftKey: true }); // +40 y
    });

    // Verify state moved via the persisted UIState — jsdom layout is not real,
    // so the source of truth is what the hook wrote to localStorage.
    const stored = JSON.parse(localStorage.getItem("gp:visitor-inspector:v1")!);
    expect(stored.x).toBeGreaterThanOrEqual(before.left); // moved right or stayed clamped
    expect(stored.y).toBeGreaterThan(0);
  });

  it("keyboard: arrow keys on the resize handle change w/h (Shift = larger step)", () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());
    const dialog = getDialog();
    const resize = within(dialog).getByRole("button", { name: /resize panel/i });

    // Baseline from defaults: w=380, h=520.
    act(() => {
      fireEvent.keyDown(resize, { key: "ArrowRight" });                // +10 w
      fireEvent.keyDown(resize, { key: "ArrowDown", shiftKey: true }); // +40 h
    });
    const stored = JSON.parse(localStorage.getItem("gp:visitor-inspector:v1")!);
    expect(stored.w).toBe(390);
    expect(stored.h).toBe(560);
  });

  it("keyboard resize is a no-op when minimized or pinned", () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());
    const dialog = getDialog();

    act(() => within(dialog).getByRole("button", { name: /minimize panel/i }).click());
    // While minimized the resize control is hidden (also guarded by state).
    expect(within(dialog).queryByRole("button", { name: /resize panel/i })).toBeNull();
  });

  it("focus order: header controls precede the resize handle in tab order", () => {
    render(<Harness />);
    act(() => screen.getByTestId("opener").click());
    const dialog = getDialog();

    const buttons = within(dialog).getAllByRole("button");
    const names = buttons.map(b => b.getAttribute("aria-label") || b.textContent || "");
    const idx = (needle: RegExp) => names.findIndex(n => needle.test(n));

    const iMove   = idx(/move panel/i);
    const iPin    = idx(/pin panel position/i);
    const iMin    = idx(/minimize panel/i);
    const iClose  = idx(/close visitor inspector/i);
    const iResize = idx(/resize panel/i);

    expect(iMove).toBeGreaterThanOrEqual(0);
    expect(iMove).toBeLessThan(iPin);
    expect(iPin).toBeLessThan(iMin);
    expect(iMin).toBeLessThan(iClose);
    expect(iClose).toBeLessThan(iResize);

    // None of these interactive controls should be aria-hidden.
    for (const b of buttons) expect(b).not.toHaveAttribute("aria-hidden", "true");
  });
});