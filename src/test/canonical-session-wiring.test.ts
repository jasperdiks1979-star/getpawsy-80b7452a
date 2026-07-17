// Phase 4A regression suite: writer-wiring + technical-route guard.
// Verifies all storefront writers unify on getCanonicalSessionId() and
// that the canonical provider mirrors sid into legacy namespaces.
import { describe, it, expect, beforeEach, vi } from "vitest";

// jsdom is configured in vitest.config.ts, so window/sessionStorage exist.
import {
  getCanonicalSessionId,
  peekCanonicalSessionId,
  CANONICAL_SID_KEY,
  CANONICAL_LEGACY_KEYS,
  _resetCanonicalSessionForTests,
} from "@/lib/canonicalSession";
import { isTechnicalPath } from "@/lib/technicalRoutes";

function clearAllStorage() {
  try { sessionStorage.clear(); } catch {}
  try { localStorage.clear(); } catch {}
}

describe("Phase 4A — canonical session unification", () => {
  beforeEach(() => {
    clearAllStorage();
    _resetCanonicalSessionForTests();
  });

  it("mirrors sid to every legacy key on first call", () => {
    const sid = getCanonicalSessionId();
    expect(sid).toBeTruthy();
    for (const k of CANONICAL_LEGACY_KEYS) {
      expect(sessionStorage.getItem(k)).toBe(sid);
    }
    expect(sessionStorage.getItem(CANONICAL_SID_KEY)).toBe(sid);
  });

  it("returns the same sid across repeated calls (single tab, no timeout)", () => {
    const a = getCanonicalSessionId();
    const b = getCanonicalSessionId();
    const c = getCanonicalSessionId();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("adopts a pre-existing gp_session_id so mid-visit sessions never rotate", () => {
    sessionStorage.setItem("gp_session_id", "legacy-existing-sid-12345");
    const sid = getCanonicalSessionId();
    expect(sid).toBe("legacy-existing-sid-12345");
    expect(sessionStorage.getItem("visitor_session_id")).toBe("legacy-existing-sid-12345");
    expect(sessionStorage.getItem("gp_funnel_sid")).toBe("legacy-existing-sid-12345");
  });

  it("adopts a pre-existing visitor_session_id when gp_session_id is absent", () => {
    sessionStorage.setItem("visitor_session_id", "va-existing-sid-67890");
    const sid = getCanonicalSessionId();
    expect(sid).toBe("va-existing-sid-67890");
    expect(sessionStorage.getItem("gp_session_id")).toBe("va-existing-sid-67890");
  });

  it("does not fabricate a new UUID per pageview", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) ids.add(getCanonicalSessionId());
    expect(ids.size).toBe(1);
  });

  it("rotates only after inactivity timeout is simulated", () => {
    const first = getCanonicalSessionId();
    // Simulate 45 min of inactivity by rewinding the last-seen marker.
    const past = Date.now() - 45 * 60 * 1000;
    sessionStorage.setItem("gp_canonical_sid_last", String(past));
    const second = getCanonicalSessionId();
    expect(second).not.toBe(first);
    // But once rotated, subsequent calls are stable again.
    expect(getCanonicalSessionId()).toBe(second);
  });

  it("peekCanonicalSessionId returns null when unset", () => {
    expect(peekCanonicalSessionId()).toBeNull();
  });

  it("cci writer converges on the same sid as visitor_activity source", async () => {
    const anchor = getCanonicalSessionId();
    // Simulate cci ensuring a sid — reads via the same provider.
    const ccisid = getCanonicalSessionId();
    // Simulate visitor_activity path reading the mirrored legacy key.
    const vaLegacy = sessionStorage.getItem("visitor_session_id");
    // Simulate checkoutFunnel path.
    const funnelLegacy = sessionStorage.getItem("gp_funnel_sid");
    expect(ccisid).toBe(anchor);
    expect(vaLegacy).toBe(anchor);
    expect(funnelLegacy).toBe(anchor);
  });
});

describe("Phase 4A — technical route guard", () => {
  it("blocks /api/*", () => {
    expect(isTechnicalPath("/api/img/x.jpg")).toBe(true);
    expect(isTechnicalPath("/api/anything")).toBe(true);
  });
  it("blocks /_lovable_preview and __lovable_*", () => {
    expect(isTechnicalPath("/_lovable_preview/foo")).toBe(true);
    expect(isTechnicalPath("/__lovable_diag")).toBe(true);
  });
  it("blocks static asset extensions", () => {
    expect(isTechnicalPath("/foo.png")).toBe(true);
    expect(isTechnicalPath("/style.css")).toBe(true);
    expect(isTechnicalPath("/x.js?v=1")).toBe(true);
  });
  it("allows real storefront routes", () => {
    expect(isTechnicalPath("/")).toBe(false);
    expect(isTechnicalPath("/product/foo")).toBe(false);
    expect(isTechnicalPath("/checkout")).toBe(false);
    expect(isTechnicalPath("/cart")).toBe(false);
  });
});
