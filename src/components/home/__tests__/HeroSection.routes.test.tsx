import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HeroSection } from "@/components/home/HeroSection";
import { HowItWorks } from "@/components/home/HowItWorks";

// The hero pings analytics on click; stub it so tests don't touch window.gtag.
vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

/**
 * The hero today only mounts on the homepage, but its CTAs use absolute
 * paths + a hash anchor, so they MUST resolve identically regardless of
 * which route the component is rendered under. We verify that invariant
 * by mounting the hero across a representative set of routes and checking
 * both CTA destinations on every one — plus confirming the `#how-it-works`
 * anchor target actually exists in the `HowItWorks` section.
 */
const ROUTES_TO_TEST = [
  "/",
  "/collections/cat-litter-boxes",
  "/products/some-product",
  "/guides/cat-litter-boxes",
  "/cart",
];

const PRIMARY_HREF = "/collections/cat-litter-boxes";
const SECONDARY_HREF = "#how-it-works";

describe("HeroSection CTA links resolve on every route", () => {
  beforeEach(() => {
    cleanup();
  });

  it.each(ROUTES_TO_TEST)(
    "resolves both CTAs when rendered at %s",
    (initialRoute) => {
      render(
        <MemoryRouter initialEntries={[initialRoute]}>
          <HeroSection />
        </MemoryRouter>,
      );

      const primary = screen.getByRole("link", { name: /shop smart litter boxes/i });
      expect(primary).toBeInTheDocument();
      // react-router renders an absolute path verbatim regardless of current route.
      expect(primary.getAttribute("href")).toBe(PRIMARY_HREF);

      const secondary = screen.getByRole("link", { name: /see how it works/i });
      expect(secondary).toBeInTheDocument();
      expect(secondary.getAttribute("href")).toBe(SECONDARY_HREF);
    },
  );
});

describe("HowItWorks renders the #how-it-works anchor target", () => {
  it("exposes an element with id='how-it-works' for hero anchor scrolling", () => {
    const { container } = render(
      <MemoryRouter>
        <HowItWorks />
      </MemoryRouter>,
    );

    const target = container.querySelector("#how-it-works");
    expect(target).not.toBeNull();
  });
});