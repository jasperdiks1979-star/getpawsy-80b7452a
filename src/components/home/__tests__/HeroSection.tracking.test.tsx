import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HeroSection } from "@/components/home/HeroSection";

const trackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

/**
 * Locks the hero CTA tracking contract:
 *  - Both CTAs fire `hero_cta_click` with destination + location.
 *  - The "See How It Works" CTA additionally fires `hero_anchor_result`
 *    after the scroll delay, reporting whether the #how-it-works target
 *    was actually reached (or `target_missing` when absent).
 */
describe("HeroSection click tracking", () => {
  beforeEach(() => {
    trackEvent.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("logs hero_cta_click for the primary 'Shop Smart Litter Boxes' CTA", () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: /shop smart litter boxes/i }));

    expect(trackEvent).toHaveBeenCalledWith("hero_cta_click", {
      cta_id: "shop_litter_boxes",
      destination: "/collections/cat-litter-boxes",
      location: "homepage_hero",
    });
  });

  it("logs hero_anchor_result with target_missing when #how-it-works is not on the page", () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: /see how it works/i }));

    // First call = the click event itself.
    expect(trackEvent).toHaveBeenCalledWith("hero_cta_click", {
      cta_id: "how_it_works",
      destination: "#how-it-works",
      location: "homepage_hero",
    });

    // Verification fires after the 800ms scroll-resolution window.
    vi.advanceTimersByTime(900);

    expect(trackEvent).toHaveBeenCalledWith("hero_anchor_result", {
      cta_id: "how_it_works",
      anchor: "how-it-works",
      anchor_reached: false,
      reason: "target_missing",
    });
  });

  it("reports anchor_reached=true when #how-it-works is in the viewport", () => {
    // Inject the anchor target so the verifier can find it.
    const target = document.createElement("section");
    target.id = "how-it-works";
    document.body.appendChild(target);
    // Pretend the element sits comfortably inside the viewport.
    target.getBoundingClientRect = () =>
      ({ top: 100, bottom: 600, left: 0, right: 0, width: 0, height: 500, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: /see how it works/i }));
    vi.advanceTimersByTime(900);

    expect(trackEvent).toHaveBeenCalledWith(
      "hero_anchor_result",
      expect.objectContaining({
        cta_id: "how_it_works",
        anchor: "how-it-works",
        anchor_reached: true,
      }),
    );

    target.remove();
  });
});