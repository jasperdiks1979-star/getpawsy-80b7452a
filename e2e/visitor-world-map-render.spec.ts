import { test, expect } from "../playwright-fixture";

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

function canonicalFixture() {
  const sessions = [
    {
      session_id: "canon-geo-1",
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
      has_product_view: false,
      has_add_to_cart: false,
      has_view_cart: false,
      has_checkout: false,
      has_purchase: false,
      order_value: 0,
      is_internal: false,
    },
    {
      session_id: "canon-geo-2",
      visitor_id: "visitor-2",
      country: "United States",
      city: "Chicago",
      latitude: 41.8661,
      longitude: -88.107,
      first_seen_at: "2026-07-04T10:01:00.000Z",
      last_seen_at: "2026-07-04T10:05:00.000Z",
      page_views: 2,
      source: "direct",
      device: "mobile",
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      referrer: null,
      page_path: "/products",
      has_product_view: true,
      has_add_to_cart: true,
      has_view_cart: false,
      has_checkout: false,
      has_purchase: false,
      order_value: 0,
      is_internal: false,
    },
    {
      session_id: "canon-no-geo",
      visitor_id: "visitor-3",
      country: null,
      city: null,
      latitude: null,
      longitude: null,
      first_seen_at: "2026-07-04T10:02:00.000Z",
      last_seen_at: "2026-07-04T10:06:00.000Z",
      page_views: 1,
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
  ];
  return {
    ok: true,
    window: { hours: 1, since: "2026-07-04T09:00:00.000Z", until: "2026-07-04T10:00:00.000Z" },
    filter: { geo: "all", clean: true, source: "test" },
    totals: {
      visitors: 3,
      sessions: 3,
      page_views: 6,
      product_views: 1,
      add_to_cart: 1,
      view_cart: 0,
      checkout_started: 0,
      purchases: 0,
      revenue: 0,
      currency: "USD",
      conversion_rate: 0,
    },
    funnel: [],
    countries: [],
    sources: [{ source: "direct", sessions: 3 }],
    sessions,
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

test.describe("Visitor World Map canonical visual render", () => {
  test("canonical sessions with geo produce nonzero marker and heatmap features", async ({ context, page }) => {
    await seedAdmin(context, page);
    await page.goto("/live-map");

    const diagnostics = page.getByTestId("world-map-render-diagnostics");
    await expect(diagnostics).toBeVisible();
    await expect
      .poll(async () => Number(await diagnostics.getAttribute("data-rendered-mapbox-source-features")))
      .toBeGreaterThan(0);

    const values = await diagnostics.evaluate((el) => ({
      canonicalSessions: Number(el.getAttribute("data-canonical-sessions")),
      sessionsWithGeo: Number(el.getAttribute("data-sessions-with-geo")),
      markerFeatures: Number(el.getAttribute("data-marker-features")),
      heatmapFeatures: Number(el.getAttribute("data-heatmap-features")),
      sessionsWithoutGeo: Number(el.getAttribute("data-sessions-without-geo")),
      renderedMapboxSourceFeatures: Number(el.getAttribute("data-rendered-mapbox-source-features")),
    }));

    expect(values.canonicalSessions).toBe(3);
    expect(values.sessionsWithGeo).toBe(2);
    expect(values.sessionsWithoutGeo).toBe(1);
    expect(values.markerFeatures).toBeGreaterThan(0);
    expect(values.heatmapFeatures).toBeGreaterThan(0);
    if (values.sessionsWithGeo > 0) {
      expect(values.markerFeatures).toBe(values.sessionsWithGeo);
      expect(values.heatmapFeatures).toBe(values.sessionsWithGeo);
      expect(values.renderedMapboxSourceFeatures).toBeGreaterThan(0);
    }
  });
});