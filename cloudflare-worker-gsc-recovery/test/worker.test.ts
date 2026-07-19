import { describe, it, expect, beforeAll, vi } from "vitest";
import worker, {
  filterQuery,
  normalizePath,
  ALLOWED_QUERY_PARAMS,
} from "../src/worker";

// Stub upstream fetch so pass-through is deterministically observable.
const PASS_STATUS = 299;
beforeAll(() => {
  // @ts-expect-error override global for test
  globalThis.fetch = vi.fn(async () =>
    new Response("PASSTHROUGH", { status: PASS_STATUS, headers: { "x-pass": "1" } }),
  );
});

function call(method: string, url: string) {
  const req = new Request(url, { method });
  return worker.fetch(req, {} as any, {} as any);
}

describe("filterQuery", () => {
  it("keeps allowed UTM params", () => {
    expect(filterQuery("?utm_source=pin&utm_medium=cpc")).toBe(
      "?utm_source=pin&utm_medium=cpc",
    );
  });
  it("keeps gclid/fbclid/pinclid", () => {
    const out = filterQuery("?gclid=abc&fbclid=def&pinclid=xyz");
    expect(out).toContain("gclid=abc");
    expect(out).toContain("fbclid=def");
    expect(out).toContain("pinclid=xyz");
  });
  it("drops unknown params", () => {
    expect(filterQuery("?session=SECRET&token=T&email=a@b.com")).toBe("");
  });
  it("mixed: keeps allowed, drops unknown", () => {
    const out = filterQuery("?utm_source=pin&session=X&fbclid=F&auth=Y");
    expect(out).toContain("utm_source=pin");
    expect(out).toContain("fbclid=F");
    expect(out).not.toContain("session");
    expect(out).not.toContain("auth");
  });
  it("preserves URL-encoded values", () => {
    const out = filterQuery("?utm_campaign=" + encodeURIComponent("black friday/50%"));
    // URLSearchParams uses '+' for spaces; both encodings are valid.
    expect(out).toMatch(/utm_campaign=black(\+|%20)friday%2F50%25/);
  });
  it("drops empty allowed params", () => {
    expect(filterQuery("?utm_source=&gclid=OK")).toBe("?gclid=OK");
  });
  it("no query -> empty string", () => {
    expect(filterQuery("")).toBe("");
    expect(filterQuery("?")).toBe("");
  });
  it("no duplicate ? prefix", () => {
    const out = filterQuery("?utm_source=pin");
    expect(out.startsWith("?")).toBe(true);
    expect(out.startsWith("??")).toBe(false);
  });
});

describe("normalizePath", () => {
  it("collapses trailing slash", () => {
    expect(normalizePath("/c/all/")).toBe("/c/all");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("worker.fetch — 410 removed cohort URLs", () => {
  it("GET /c/all returns 410 with correct headers and body", async () => {
    const res = await call("GET", "https://getpawsy.pet/c/all");
    expect(res.status).toBe(410);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("x-gsc-recovery")).toBe("410");
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = await res.text();
    expect(body).toContain("410 Gone");
    expect(body).toContain('name="robots" content="noindex,nofollow"');
    // No canonical anywhere in a 410 body.
    expect(body).not.toMatch(/rel=("|')canonical/);
  });

  it("HEAD /c/all returns 410 headers with no body", async () => {
    const res = await call("HEAD", "https://getpawsy.pet/c/all");
    expect(res.status).toBe(410);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("x-gsc-recovery")).toBe("410");
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = await res.text();
    expect(body).toBe("");
  });

  it("trailing slash normalizes /c/all/ -> 410", async () => {
    const res = await call("GET", "https://getpawsy.pet/c/all/");
    expect(res.status).toBe(410);
  });

  it("legacy numeric product id -> 410", async () => {
    const res = await call("GET", "https://getpawsy.pet/product/1806928748680728576");
    expect(res.status).toBe(410);
  });
});

describe("worker.fetch — 301 mapped active PDPs", () => {
  const src1 = "https://getpawsy.pet/product/e42efe24-988c-4581-b8e0-95efc2c5250f";
  const target1 =
    "/products/outdoor-dog-kennel-with-roof-rotating-4-level-adjustable-bowls";
  const src2 = "https://getpawsy.pet/product/5a93dba6-2030-4469-b40b-2f6aa07590aa";
  const target2 =
    "/products/house-type-with-running-ladder-orange-red-wooden-chicken-rabbit-cage";

  it("GET no-query -> clean 301 to canonical PDP", async () => {
    const res = await call("GET", src1);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(target1);
    expect(res.headers.get("x-gsc-recovery")).toBe("301");
    expect(res.headers.get("cache-control")).toContain("max-age");
    expect(await res.text()).toBe("");
  });

  it("HEAD -> 301 headers, no body", async () => {
    const res = await call("HEAD", src2);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(target2);
    expect(res.headers.get("x-gsc-recovery")).toBe("301");
    expect(await res.text()).toBe("");
  });

  it("allowed marketing params survive on 301", async () => {
    const res = await call(
      "GET",
      src1 + "?utm_source=pinterest&utm_medium=social&gclid=A1&fbclid=B2&pinclid=P3",
    );
    const loc = res.headers.get("location")!;
    expect(loc.startsWith(target1 + "?")).toBe(true);
    expect(loc).toContain("utm_source=pinterest");
    expect(loc).toContain("utm_medium=social");
    expect(loc).toContain("gclid=A1");
    expect(loc).toContain("fbclid=B2");
    expect(loc).toContain("pinclid=P3");
  });

  it("disallowed params (session/auth/email/token/checkout) are stripped", async () => {
    const res = await call(
      "GET",
      src1 +
        "?session=SECRET&auth=TOKEN&email=a@b.com&token=T&checkout=abc&product_id=999",
    );
    expect(res.headers.get("location")).toBe(target1); // no ? at all
  });

  it("mixed allowed + disallowed: only allowed survive, single ?", async () => {
    const res = await call(
      "GET",
      src1 + "?utm_source=pin&session=SECRET&fbclid=F&internal_ref=X",
    );
    const loc = res.headers.get("location")!;
    expect(loc.split("?").length).toBe(2); // exactly one '?'
    expect(loc).toContain("utm_source=pin");
    expect(loc).toContain("fbclid=F");
    expect(loc).not.toContain("session");
    expect(loc).not.toContain("internal_ref");
    expect(loc).not.toContain("SECRET");
  });

  it("URL-encoded allowed values remain valid", async () => {
    const encoded = encodeURIComponent("black friday/50%");
    const res = await call("GET", src1 + "?utm_campaign=" + encoded);
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/utm_campaign=black(\+|%20)friday%2F50%25/);
  });

  it("empty allowed param is dropped", async () => {
    const res = await call("GET", src1 + "?utm_source=&gclid=OK");
    expect(res.headers.get("location")).toBe(target1 + "?gclid=OK");
  });
});

describe("worker.fetch — pass-through", () => {
  it("live PDP passes through", async () => {
    const res = await call(
      "GET",
      "https://getpawsy.pet/products/automatic-cat-litter-box-self-cleaning-app-control",
    );
    expect(res.status).toBe(PASS_STATUS);
  });
  it("/dogs passes through", async () => {
    const res = await call("GET", "https://getpawsy.pet/dogs");
    expect(res.status).toBe(PASS_STATUS);
  });
  it("homepage passes through", async () => {
    const res = await call("GET", "https://getpawsy.pet/");
    expect(res.status).toBe(PASS_STATUS);
  });
  it("cart passes through", async () => {
    const res = await call("GET", "https://getpawsy.pet/cart");
    expect(res.status).toBe(PASS_STATUS);
  });
  it("checkout passes through", async () => {
    const res = await call("GET", "https://getpawsy.pet/checkout?session=abc");
    expect(res.status).toBe(PASS_STATUS);
  });
  it("sitemap.xml passes through", async () => {
    const res = await call("GET", "https://getpawsy.pet/sitemap.xml");
    expect(res.status).toBe(PASS_STATUS);
  });
  it("asset passes through", async () => {
    const res = await call("GET", "https://getpawsy.pet/assets/logo-abc.svg");
    expect(res.status).toBe(PASS_STATUS);
  });
  it("non-cohort UUID under /product/ passes through", async () => {
    const res = await call(
      "GET",
      "https://getpawsy.pet/product/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(PASS_STATUS);
  });
  it("non-cohort cj_* slug passes through", async () => {
    const res = await call(
      "GET",
      "https://getpawsy.pet/products/cj_new_never_seen_product_slug",
    );
    expect(res.status).toBe(PASS_STATUS);
  });
  it("POST on cohort path passes through", async () => {
    const res = await call("POST", "https://getpawsy.pet/c/all");
    expect(res.status).toBe(PASS_STATUS);
  });
  it("PUT/PATCH/DELETE on cohort path pass through", async () => {
    for (const m of ["PUT", "PATCH", "DELETE"]) {
      const res = await call(m, "https://getpawsy.pet/product/1806928748680728576");
      expect(res.status).toBe(PASS_STATUS);
    }
  });
  it("unknown host passes through even for cohort path", async () => {
    const res = await call("GET", "https://evil.example.com/c/all");
    expect(res.status).toBe(PASS_STATUS);
  });
});

describe("rule integrity", () => {
  // Load rules directly to prove reconciliation totals.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rules = require("../data/worker-rules.json") as {
    exact_410: string[];
    exact_301: Record<string, string>;
    exact_preserve: string[];
  };

  it("331 total, 166/2/163 buckets, 0 overlap, 0 dup", () => {
    const a = rules.exact_410;
    const b = Object.keys(rules.exact_301);
    const c = rules.exact_preserve;
    expect(a.length).toBe(166);
    expect(b.length).toBe(2);
    expect(c.length).toBe(163);
    expect(a.length + b.length + c.length).toBe(331);
    expect(new Set(a).size).toBe(a.length);
    expect(new Set(b).size).toBe(b.length);
    expect(new Set(c).size).toBe(c.length);
    const all = [...a, ...b, ...c];
    expect(new Set(all).size).toBe(all.length); // no overlaps
  });

  it("no redirect loop: 301 targets are not themselves cohort rules", () => {
    for (const [from, to] of Object.entries(rules.exact_301)) {
      expect(rules.exact_410).not.toContain(to);
      expect(Object.keys(rules.exact_301)).not.toContain(to);
      expect(from).not.toBe(to);
    }
  });

  it("allowlist size and members are as agreed", () => {
    expect(ALLOWED_QUERY_PARAMS.size).toBe(8);
    for (const k of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "gclid",
      "fbclid",
      "pinclid",
    ]) {
      expect(ALLOWED_QUERY_PARAMS.has(k)).toBe(true);
    }
  });
});
