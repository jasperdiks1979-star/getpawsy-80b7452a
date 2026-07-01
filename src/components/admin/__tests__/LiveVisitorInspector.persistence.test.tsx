import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLiveVisitorInspector } from "../LiveVisitorInspector";

const LS_KEY = "gp:visitor-inspector:v1";

beforeEach(() => {
  localStorage.clear();
});

describe("useLiveVisitorInspector — localStorage persistence", () => {
  it("defaults to closed with no stored state", () => {
    const { result } = renderHook(() => useLiveVisitorInspector());
    expect(result.current.state.open).toBe(false);
    expect(result.current.state.pinned).toBe(false);
    expect(result.current.state.minimized).toBe(false);
  });

  it("persists open=true across a simulated reload", () => {
    const first = renderHook(() => useLiveVisitorInspector());
    act(() => first.result.current.open());
    expect(first.result.current.state.open).toBe(true);
    first.unmount();

    const second = renderHook(() => useLiveVisitorInspector());
    expect(second.result.current.state.open).toBe(true);
  });

  it("persists open=false after close across a simulated reload", () => {
    const first = renderHook(() => useLiveVisitorInspector());
    act(() => first.result.current.open());
    act(() => first.result.current.close());
    first.unmount();

    const second = renderHook(() => useLiveVisitorInspector());
    expect(second.result.current.state.open).toBe(false);
  });

  it("persists last position (x, y) across a simulated reload", () => {
    const first = renderHook(() => useLiveVisitorInspector());
    act(() => {
      first.result.current.setState(s => ({ ...s, open: true, x: 210, y: 340 }));
    });
    first.unmount();

    const second = renderHook(() => useLiveVisitorInspector());
    expect(second.result.current.state.x).toBe(210);
    expect(second.result.current.state.y).toBe(340);
  });

  it("persists last size (w, h) across a simulated reload", () => {
    const first = renderHook(() => useLiveVisitorInspector());
    act(() => {
      first.result.current.setState(s => ({ ...s, open: true, w: 512, h: 640 }));
    });
    first.unmount();

    const second = renderHook(() => useLiveVisitorInspector());
    expect(second.result.current.state.w).toBe(512);
    expect(second.result.current.state.h).toBe(640);
  });

  it("persists pinned and minimized flags", () => {
    const first = renderHook(() => useLiveVisitorInspector());
    act(() => {
      first.result.current.setState(s => ({ ...s, open: true, pinned: true, minimized: true }));
    });
    first.unmount();

    const second = renderHook(() => useLiveVisitorInspector());
    expect(second.result.current.state.pinned).toBe(true);
    expect(second.result.current.state.minimized).toBe(true);
  });

  it("merges partial stored state with defaults (forward-compatible)", () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ open: true, x: 99 }));
    const { result } = renderHook(() => useLiveVisitorInspector());
    expect(result.current.state.open).toBe(true);
    expect(result.current.state.x).toBe(99);
    expect(result.current.state.w).toBe(380);
    expect(result.current.state.h).toBe(520);
  });

  it("survives a corrupted localStorage payload by falling back to defaults", () => {
    localStorage.setItem(LS_KEY, "{not-json");
    const { result } = renderHook(() => useLiveVisitorInspector());
    expect(result.current.state.open).toBe(false);
    expect(result.current.state.w).toBe(380);
  });
});
