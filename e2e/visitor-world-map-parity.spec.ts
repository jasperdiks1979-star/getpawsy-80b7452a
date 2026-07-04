import { test, expect } from "../playwright-fixture";

// End-to-end parity certification for the Visitor World Map.
//
// Mocks `analytics-canonical` with a deterministic session set and asserts
// that the on-screen counters, the CSV export, and the Markdown Summary
// export are all derived from the SAME canonical truth envelope. If any of
// them drifts (extra/missing sessions, mismatched ATC/checkout/revenue,
// alternate visitor counts), this test fails.

const BACKEND_REF = "nojvgfbcjgipjxpfatmm";
const BACKEND_HOST = `${BACKEND_REF}.supabase.co`;
const STORAGE_KEY = `sb-${BACKEND_REF}-auth-token`;

function b64url(input: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function createTestJwt(userId: string) {
  return [
    b64url({ alg: "none", typ: "JWT" }),
    b64url({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }),
    "test-signature",
  ].join(".");
}

const fakeUserId = "00000000-0000-0000-0000-000000000001";

const fakeSession = {
  access_token: createTestJwt(fakeUserId),
  refresh_token: "fake-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: fakeUserId,
    aud: "authenticated",
    role: "authenticated",
    email: "admin@example.test",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
};

// 4 canonical sessions with mixed funnel state so we exercise every counter.
//   - 2 sessions with valid geo (US)
//   - 1 session without geo (still counted in totals/CSV/Summary)
//   - 1 checkout + purchase with revenue $49.90
//   - 1 additional add_to_cart (no checkout)
const canonicalSessions = [
  {
    session_id: "canon-1",
    visitor_id: "visitor-1",
    country: "United States",
    city: "New York",
    latitude: 40.7128,
    longitude: -74.006,
    first_seen_at: "2026-07-04T10:00:00.000Z",
    last_seen_at: "2026-07-04T10:03:00.000Z",
    page_views: 3,
    source: "direct",
    device: "desktop",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: null,
    page_path: "/",
    has_product_view: true,
    has_add_to_cart: true,
    has_view_cart: false,
    has_checkout: false,
    has_purchase: false,
    order_value: 0,
    is_internal: false,
  },
  {
    session_id: "canon-2",
    visitor_id: "visitor-2",
    country: "United States",
    city: "Chicago",
    latitude: 41.8661,
    longitude: -88.107,
    first_seen_at: "2026-07-04T10:01:00.000Z",
    last_seen_at: "2026-07-04T10:07:00.000Z",
    page_views: 5,
    source: "direct",
    device: "mobile",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: null,
    page_path: "/products/x",
    has_product_view: true,
    has_add_to_cart: true,
    has_view_cart: true,
    has_checkout: true,
    has_purchase: true,
    order_value: 49.9,
    is_internal: false,
  },
  {
    session_id: "canon-3-nogeo",
    visitor_id: "visitor-3",
    country: null,
    city: null,
    latitude: null,
    longitude: null,
    first_seen_at: "2026-07-04T10:02:00.000Z",
    last_seen_at: "2026-07-04T10:04:00.000Z",
    page_views: 2,
    source: "direct",
    device: "desktop",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: null,
    page_path: "/collections/all",
    has_product_view: false,
    has_add_to_cart: false,
    has_view_cart: false,
    has_checkout: false,
    has_purchase: false,
    order_value: 0,
    is_internal: false,
  },
  {
    session_id: "canon-4",
    visitor_id: "visitor-4",
    country: "United States",
    city: "Austin",
    latitude: 30.2672,
    longitude: -97.7431,
    first_seen_at: "2026-07-04T10:05:00.000Z",
    last_seen_at: "2026-07-04T10:09:00.000Z",
    page_views: 4,
    source: "direct",
    device: "desktop",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer: null,
    page_path: "/products/y",
    has_product_view: true,
    has_add_to_cart: false,
    has_view_cart: false,
    has_checkout: false,
    has_purchase: false,
    order_value: 0,
    is_internal: false,
  },
];

// Ground truth totals derived from the fixture above. If the fixture
// changes, update these expectations — they are the single-source-of-truth
// the parity assertions reconcile against.
const EXPECTED = {
  sessions: 4,
  visitors: 4,
  pageViews: 14,
  addToCart: 2, // canon-1, canon-2
  viewCart: 1, // canon-2
  checkoutStarted: 1, // canon-2
  purchases: 1, // canon-2
  revenue: 49.9,
  browsingBadge: 2, // sessions with no cart/checkout: canon-3-nogeo, canon-4
  cartBadge: 1, // cart-only sessions; checkout sessions are counted in checkout
  checkoutBadge: 1, // canon-2
  sessionsWithGeo: 3,
  sessionsWithoutGeo: 1,
};

// Marker/heatmap ground truth derived from the fixture. Weight scheme
// (mirrors markerFeaturesToGeoJson): checkout=3, cart=2, browsing=1.
//   canon-1 → cart      (weight 2)
//   canon-2 → checkout  (weight 3)
//   canon-4 → browsing  (weight 1)
//   canon-3-nogeo excluded (no coords).
const EXPECTED_MARKERS = {
  total: 3,
  checkout: 1,
  cart: 1,
  browsing: 1,
  heatmapWeightTotal: 2 + 3 + 1,
};

function canonicalFixture() {
  return {
    ok: true,
    window: { hours: 1, since: "2026-07-04T09:00:00.000Z", until: "2026-07-04T10:00:00.000Z" },
    filter: { geo: "all", clean: true, source: "test" },
    totals: {
      visitors: EXPECTED.visitors,
      sessions: EXPECTED.sessions,
      page_views: EXPECTED.pageViews,
      product_views: 3,
      add_to_cart: EXPECTED.addToCart,
      view_cart: EXPECTED.viewCart,
      checkout_started: EXPECTED.checkoutStarted,
      purchases: EXPECTED.purchases,
      revenue: EXPECTED.revenue,
      currency: "USD",
      conversion_rate: EXPECTED.purchases / EXPECTED.sessions,
    },
    funnel: [],
    countries: [],
    sources: [{ source: "direct", sessions: EXPECTED.sessions }],
    sessions: canonicalSessions,
    sample_event: null,
    generated_at: "2026-07-04T10:00:00.000Z",
  };
}

async function seedAdmin(context: any, page: any) {
  await context.addInitScript(([key, session]: [string, unknown]) => {
    window.localStorage.setItem(key, JSON.stringify(session));
    window.localStorage.setItem("map-exclude-internal", "true");
    window.localStorage.setItem("map-us-only", "false");
  }, [STORAGE_KEY, fakeSession]);

  // Capture Blob text keyed by createObjectURL result so we can inspect
  // programmatic downloads (CSV, Summary md) that never leave the browser.
  await context.addInitScript(() => {
    const w = window as unknown as {
      __capturedDownloads: Record<string, { name: string; text: string }>;
      __blobStore: Map<string, string>;
    };
    w.__capturedDownloads = {};
    w.__blobStore = new Map();
    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = originalCreate(obj);
      if (obj instanceof Blob) {
        obj.text().then((text) => {
          w.__blobStore.set(url, text);
        });
      }
      return url;
    };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
      const href = this.getAttribute("href") || "";
      const name = this.getAttribute("download") || "";
      if (name && href.startsWith("blob:")) {
        w.__capturedDownloads[name] = { name, text: w.__blobStore.get(href) ?? "" };
        if (!w.__capturedDownloads[name].text) {
          const started = Date.now();
          const timer = window.setInterval(() => {
            const text = w.__blobStore.get(href) ?? "";
            if (text || Date.now() - started > 5000) {
              w.__capturedDownloads[name] = { name, text };
              window.clearInterval(timer);
            }
          }, 25);
        }
        return; // suppress actual navigation
      }
      return originalClick.call(this);
    };
  });

  await page.route(`**/${BACKEND_HOST}/auth/v1/**`, (route: any) => {
    if (route.request().url().includes("/user")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSession.user) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fakeSession) });
  });
  await page.route(`**/${BACKEND_HOST}/functions/v1/analytics-canonical`, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(canonicalFixture()) }),
  );
  await page.route(`**/${BACKEND_HOST}/functions/v1/get-mapbox-token`, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "pk.test-token" }) }),
  );
  await page.route("https://api.mapbox.com/styles/v1/mapbox/dark-v11**", (route: any) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        name: "test-style",
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#061014" } }],
      }),
    }),
  );
  await page.route("https://events.mapbox.com/**", (route: any) => route.fulfill({ status: 204, body: "" }));
  await page.route(`**/${BACKEND_HOST}/rest/v1/**`, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: JSON.stringify([]) }),
  );
  await page.route(`**/${BACKEND_HOST}/rest/v1/user_roles**`, (route: any) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ role: "admin" }) }),
  );
}

function parseSummaryTotals(md: string) {
  const num = (label: string): number => {
    const re = new RegExp(`- ${label}:\\s*\\*?\\*?([0-9]+(?:\\.[0-9]+)?)`);
    const match = md.match(re);
    return match ? Number(match[1]) : NaN;
  };
  const revenueMatch = md.match(/- Omzet:\s*\$?([0-9]+(?:\.[0-9]+)?)/);
  return {
    sessions: num("Sessies"),
    visitors: num("Unieke bezoekers"),
    pageViews: num("Pageviews"),
    addToCart: num("Add to Cart"),
    viewCart: num("View Cart"),
    checkoutStarted: num("Checkout gestart"),
    purchases: num("Purchases"),
    revenue: revenueMatch ? Number(revenueMatch[1]) : 0,
  };
}

test.describe("Visitor World Map canonical parity", () => {
  test("counters, CSV, and Summary all derive from the same canonical truth set", async ({ context, page }) => {
    await seedAdmin(context, page);
    await page.goto("/live-map");

    // ---------- 1) On-screen counters ----------
    const diagnostics = page.getByTestId("world-map-render-diagnostics");
    await expect(diagnostics).toBeVisible();
    await expect
      .poll(async () => Number(await diagnostics.getAttribute("data-rendered-mapbox-source-features")))
      .toBeGreaterThan(0);

    const diag = await diagnostics.evaluate((el) => ({
      canonicalSessions: Number(el.getAttribute("data-canonical-sessions")),
      sessionsWithGeo: Number(el.getAttribute("data-sessions-with-geo")),
      sessionsWithoutGeo: Number(el.getAttribute("data-sessions-without-geo")),
      markerFeatures: Number(el.getAttribute("data-marker-features")),
      renderedMapboxSourceFeatures: Number(el.getAttribute("data-rendered-mapbox-source-features")),
    }));
    expect(diag.canonicalSessions).toBe(EXPECTED.sessions);
    expect(diag.sessionsWithGeo).toBe(EXPECTED.sessionsWithGeo);
    expect(diag.sessionsWithoutGeo).toBe(EXPECTED.sessionsWithoutGeo);
    expect(diag.markerFeatures).toBe(EXPECTED.sessionsWithGeo);
    expect(diag.renderedMapboxSourceFeatures).toBeGreaterThan(0);

    // ---------- 1b) Marker breakdown + heatmap intensity parity ----------
    // Marker counts per activity_type AND the total heatmap intensity weight
    // must be byte-identical to what the canonical truth set produces —
    // otherwise the visible map would over/under-represent conversions.
    const markerBreakdown = await diagnostics.evaluate((el) => ({
      total: Number(el.getAttribute("data-marker-features")),
      heatmap: Number(el.getAttribute("data-heatmap-features")),
      checkout: Number(el.getAttribute("data-marker-checkout")),
      cart: Number(el.getAttribute("data-marker-cart")),
      browsing: Number(el.getAttribute("data-marker-browsing")),
      heatmapWeightTotal: Number(el.getAttribute("data-heatmap-weight-total")),
    }));
    expect(markerBreakdown.total).toBe(EXPECTED_MARKERS.total);
    expect(markerBreakdown.heatmap).toBe(EXPECTED_MARKERS.total);
    expect(markerBreakdown.checkout).toBe(EXPECTED_MARKERS.checkout);
    expect(markerBreakdown.cart).toBe(EXPECTED_MARKERS.cart);
    expect(markerBreakdown.browsing).toBe(EXPECTED_MARKERS.browsing);
    expect(markerBreakdown.heatmapWeightTotal).toBe(EXPECTED_MARKERS.heatmapWeightTotal);
    // Rendered Mapbox source count must equal marker count — marker and
    // heatmap layers share the SAME `visitor-map-source`, so any drift
    // between markers and heatmap intensity would indicate parallel truth.
    expect(diag.renderedMapboxSourceFeatures).toBe(EXPECTED_MARKERS.total);
    // Per-activity marker totals must also reconcile with canonical funnel
    // counters: checkout markers ≤ checkout_started, cart markers ≤ ATC.
    expect(markerBreakdown.checkout).toBeLessThanOrEqual(EXPECTED.checkoutStarted);
    expect(markerBreakdown.cart + markerBreakdown.checkout).toBeLessThanOrEqual(EXPECTED.addToCart + EXPECTED.checkoutStarted);

    // Badges (Dutch labels, source-of-truth for the visible counters row).
    await expect(page.getByText(`${EXPECTED.visitors} unieke bezoekers`)).toBeVisible();
    await expect(page.getByText(`${EXPECTED.browsingBadge} pageviews`)).toBeVisible();
    await expect(page.getByText(`${EXPECTED.cartBadge} winkelwagen`)).toBeVisible();
    await expect(page.getByText(`${EXPECTED.checkoutBadge} afrekenen`)).toBeVisible();

    // ---------- 2) CSV export parity ----------
    await page.getByRole("button", { name: /Export CSV/i }).click();

    // Wait until the captured download shows up (blob text is read async).
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const w = window as unknown as { __capturedDownloads: Record<string, { name: string; text: string }> };
          const entry = Object.values(w.__capturedDownloads ?? {}).find((d) => d.name.endsWith(".csv"));
          return entry?.text?.length ?? 0;
        });
      })
      .toBeGreaterThan(0);

    const csv = await page.evaluate(() => {
      const w = window as unknown as { __capturedDownloads: Record<string, { name: string; text: string }> };
      const entry = Object.values(w.__capturedDownloads).find((d) => d.name.endsWith(".csv"))!;
      return entry.text.replace(/^\uFEFF/, "");
    });

    const csvLines = csv.split("\n").filter(Boolean);
    const [header, ...dataLines] = csvLines;
    expect(header.split(";")[0]).toBe("session_id");
    // 1 row per canonical session — including the one without geo.
    expect(dataLines).toHaveLength(EXPECTED.sessions);

    const csvSessionIds = dataLines.map((l) => l.split(";")[0]).sort();
    expect(csvSessionIds).toEqual(canonicalSessions.map((s) => s.session_id).sort());

    // Reconcile CSV-derived aggregates against the same truth set.
    const csvAtc = dataLines.filter((l) => l.split(";")[18] === "true").length;
    const csvCheckout = dataLines.filter((l) => l.split(";")[20] === "true").length;
    const csvRevenue = dataLines.reduce((sum, l) => sum + Number(l.split(";")[22] || 0), 0);
    expect(csvAtc).toBe(EXPECTED.addToCart);
    expect(csvCheckout).toBe(EXPECTED.checkoutStarted);
    expect(Number(csvRevenue.toFixed(2))).toBe(EXPECTED.revenue);

    // ---------- 3) Summary (Markdown) parity ----------
    await page.getByRole("button", { name: /Samenvatting/i }).click();
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const w = window as unknown as { __capturedDownloads: Record<string, { name: string; text: string }> };
          const entry = Object.values(w.__capturedDownloads ?? {}).find((d) => d.name.endsWith(".md"));
          return entry?.text?.length ?? 0;
        });
      })
      .toBeGreaterThan(0);

    const summaryMd = await page.evaluate(() => {
      const w = window as unknown as { __capturedDownloads: Record<string, { name: string; text: string }> };
      const entry = Object.values(w.__capturedDownloads).find((d) => d.name.endsWith(".md"))!;
      return entry.text;
    });

    const summary = parseSummaryTotals(summaryMd);
    expect(summary.sessions).toBe(EXPECTED.sessions);
    expect(summary.visitors).toBe(EXPECTED.visitors);
    expect(summary.pageViews).toBe(EXPECTED.pageViews);
    expect(summary.addToCart).toBe(EXPECTED.addToCart);
    expect(summary.viewCart).toBe(EXPECTED.viewCart);
    expect(summary.checkoutStarted).toBe(EXPECTED.checkoutStarted);
    expect(summary.purchases).toBe(EXPECTED.purchases);
    expect(summary.revenue).toBe(EXPECTED.revenue);

    // ---------- 4) Cross-surface reconciliation ----------
    // The visible visitors badge, CSV session count, and Summary sessions
    // total must all agree — this is the canonical-parity certification.
    expect(csvSessionIds.length).toBe(summary.sessions);
    expect(csvSessionIds.length).toBe(EXPECTED.sessions);
  });
});