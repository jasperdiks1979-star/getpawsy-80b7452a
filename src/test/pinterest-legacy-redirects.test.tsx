import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { resolveUtm, appendUtmToPath } from "@/lib/utmNormalizer";

/**
 * End-to-end validation that legacy Pinterest URLs
 *   /product/:slug   (singular, deprecated)
 *   /lp/:slug        (deprecated landing pages)
 * redirect to the canonical /products/:slug PDP while preserving:
 *   - UTM parameters
 *   - arbitrary query strings (non-UTM)
 *   - URL hash fragments
 *
 * These redirect components mirror the production implementations in
 * `src/App.tsx` (LpRedirect, ProductRouteRedirect). They MUST stay in sync.
 */

function LpRedirect() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const utm = resolveUtm({ search: searchParams });
  const to = appendUtmToPath(
    `/products/${slug}`,
    utm,
    `?${searchParams.toString()}`,
  );
  return <Navigate to={to} replace />;
}

function ProductRouteRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const utm = resolveUtm({ search: location.search });
  return (
    <Navigate
      to={appendUtmToPath(
        `/products/${slug || ""}`,
        utm,
        location.search,
        location.hash,
      )}
      replace
    />
  );
}

function LandingProbe() {
  const location = useLocation();
  const { slug } = useParams();
  return (
    <div>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="search">{location.search}</div>
      <div data-testid="hash">{location.hash}</div>
      <div data-testid="slug">{slug}</div>
    </div>
  );
}

function renderAt(initialUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/product/:slug" element={<ProductRouteRedirect />} />
        <Route path="/lp/:slug" element={<LpRedirect />} />
        <Route path="/products/:slug" element={<LandingProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function getParams() {
  return new URLSearchParams(screen.getByTestId("search").textContent || "");
}

const PINTEREST_UTMS = {
  utm_source: "pinterest",
  utm_medium: "social",
  utm_campaign: "cat_litter_box_q2",
  utm_content: "pin_482917",
  utm_term: "self_cleaning",
};

function buildQS(extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ ...PINTEREST_UTMS, ...extra });
  return `?${params.toString()}`;
}

describe("legacy Pinterest redirects — UTM & query string preservation", () => {
  beforeEach(() => {
    try {
      window.sessionStorage.clear();
      window.localStorage.clear();
    } catch {
      /* jsdom isolation */
    }
  });

  describe("/product/:slug → /products/:slug (singular → plural)", () => {
    const slug = "cactus-cat-climbing-tree-all-in-one-condo";

    it("redirects to canonical /products/:slug", () => {
      renderAt(`/product/${slug}${buildQS()}`);
      expect(screen.getByTestId("path").textContent).toBe(`/products/${slug}`);
      expect(screen.getByTestId("slug").textContent).toBe(slug);
    });

    it("preserves all Pinterest UTM parameters", () => {
      renderAt(`/product/${slug}${buildQS()}`);
      const params = getParams();
      for (const [k, v] of Object.entries(PINTEREST_UTMS)) {
        expect(params.get(k)).toBe(v);
      }
    });

    it("preserves arbitrary non-UTM query params alongside UTMs", () => {
      renderAt(
        `/product/${slug}${buildQS({ variant: "large", ref: "pin_abc" })}`,
      );
      const params = getParams();
      expect(params.get("variant")).toBe("large");
      expect(params.get("ref")).toBe("pin_abc");
      expect(params.get("utm_campaign")).toBe(PINTEREST_UTMS.utm_campaign);
    });

    it("preserves the URL hash fragment", () => {
      renderAt(`/product/${slug}${buildQS()}#reviews`);
      expect(screen.getByTestId("hash").textContent).toBe("#reviews");
      expect(getParams().get("utm_source")).toBe("pinterest");
    });

    it("works when no UTMs are present (does not invent params)", () => {
      renderAt(`/product/${slug}`);
      expect(screen.getByTestId("path").textContent).toBe(`/products/${slug}`);
      expect(screen.getByTestId("search").textContent).toBe("");
    });
  });

  describe("/lp/:slug → /products/:slug (deprecated landing pages)", () => {
    const LP_SUSPECTS = [
      "dog-outdoor-leash-high-density-nylon",
      "spaceship-top-entry-fully-enclosed-cat-litter-box-with-free-litter-mat-anti-32e5",
      "enclosed-cat-litter-box-front-entry-extra-large",
      "cat-stainless-steel-cat-litter-box-for-big-cats-with-flip-cover",
      "front-flip-door-dual-opening-anti-splashing-anti-tracking-odor-locking-cat-e265",
    ];

    it.each(LP_SUSPECTS)(
      "redirects /lp/%s to /products/%s with UTMs preserved",
      (slug) => {
        renderAt(`/lp/${slug}${buildQS()}`);
        expect(screen.getByTestId("path").textContent).toBe(
          `/products/${slug}`,
        );
        const params = getParams();
        for (const [k, v] of Object.entries(PINTEREST_UTMS)) {
          expect(params.get(k)).toBe(v);
        }
      },
    );

    it("preserves arbitrary non-UTM query params on /lp/:slug", () => {
      const slug = "dog-outdoor-leash-high-density-nylon";
      renderAt(`/lp/${slug}${buildQS({ size: "xl", color: "black" })}`);
      const params = getParams();
      expect(params.get("size")).toBe("xl");
      expect(params.get("color")).toBe("black");
      expect(params.get("utm_medium")).toBe("social");
    });

    it("redirects cleanly when no query string is supplied", () => {
      const slug = "enclosed-cat-litter-box-front-entry-extra-large";
      renderAt(`/lp/${slug}`);
      expect(screen.getByTestId("path").textContent).toBe(`/products/${slug}`);
    });
  });

  describe("appendUtmToPath / resolveUtm contract", () => {
    it("merges UTMs into an existing query string without dropping params", () => {
      const out = appendUtmToPath(
        "/products/foo",
        { utm_source: "pinterest", utm_campaign: "spring" },
        "?variant=red",
      );
      const url = new URL(out, "https://getpawsy.pet");
      expect(url.pathname).toBe("/products/foo");
      expect(url.searchParams.get("variant")).toBe("red");
      expect(url.searchParams.get("utm_source")).toBe("pinterest");
      expect(url.searchParams.get("utm_campaign")).toBe("spring");
    });

    it("preserves a hash fragment when provided", () => {
      const out = appendUtmToPath(
        "/products/foo",
        { utm_source: "pinterest" },
        "?a=1",
        "#reviews",
      );
      expect(out.endsWith("#reviews")).toBe(true);
    });
  });
});
