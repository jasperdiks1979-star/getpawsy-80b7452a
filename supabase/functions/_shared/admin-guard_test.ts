// Unit tests for the shared admin/internal-secret guard.
//
// These tests stub `globalThis.fetch` so no real Supabase calls are made:
// the supabase-js v2 client used inside `requireInternalOrAdmin` performs
// all of its work (auth.getUser + rpc has_role + audit insert) via fetch,
// which lets us drive every branch deterministically.

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Env MUST be set before importing the module under test.
Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
Deno.env.set("INTERNAL_FUNCTION_SECRET", "top-secret");

const { requireInternalOrAdmin } = await import("./admin-guard.ts");

type Handler = (req: Request) => Promise<Response> | Response;

function stubFetch(handler: Handler): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input.toString(), init);
    return Promise.resolve(handler(req));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://stub.supabase.co/some-guarded-function/", {
    method: "POST",
    headers,
  });
}

// Route the stubbed fetch through a routing table so each test can override
// only what it needs; audit inserts are always accepted so we don't leak
// pending promises.
function router(
  routes: {
    getUser?: () => Response;
    hasRole?: () => Response;
  } = {},
): () => void {
  return stubFetch((req) => {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/auth/v1/user")) {
      return routes.getUser?.() ??
        jsonResponse(401, { message: "invalid" });
    }
    if (url.pathname.endsWith("/rest/v1/rpc/has_role")) {
      return routes.hasRole?.() ?? jsonResponse(200, false);
    }
    // Audit inserts land on /rest/v1/admin_guard_audit_log — accept silently.
    if (url.pathname.includes("/rest/v1/admin_guard_audit_log")) {
      return jsonResponse(201, {});
    }
    return jsonResponse(404, { error: "unrouted", path: url.pathname });
  });
}

Deno.test("allows requests that present the correct internal secret", async () => {
  const restore = router();
  try {
    const res = await requireInternalOrAdmin(
      makeRequest({ "x-internal-secret": "top-secret" }),
    );
    assertEquals(res, null);
  } finally {
    restore();
  }
});

Deno.test("rejects requests with a WRONG internal secret and no bearer token", async () => {
  const restore = router();
  try {
    const res = await requireInternalOrAdmin(
      makeRequest({ "x-internal-secret": "not-the-secret" }),
    );
    assertExists(res);
    assertEquals(res!.status, 401);
    const body = await res!.json();
    assertEquals(body.error, "unauthorized");
  } finally {
    restore();
  }
});

Deno.test("rejects requests with no auth header at all", async () => {
  const restore = router();
  try {
    const res = await requireInternalOrAdmin(makeRequest());
    assertExists(res);
    assertEquals(res!.status, 401);
  } finally {
    restore();
  }
});

Deno.test("rejects requests with a bearer token that Supabase cannot resolve", async () => {
  const restore = router({
    getUser: () => jsonResponse(401, { message: "bad jwt" }),
  });
  try {
    const res = await requireInternalOrAdmin(
      makeRequest({ Authorization: "Bearer garbage" }),
    );
    assertExists(res);
    assertEquals(res!.status, 401);
  } finally {
    restore();
  }
});

Deno.test("rejects authenticated users that lack the admin role (403)", async () => {
  const restore = router({
    getUser: () =>
      jsonResponse(200, {
        id: "00000000-0000-0000-0000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "user@example.com",
      }),
    hasRole: () => jsonResponse(200, false),
  });
  try {
    const res = await requireInternalOrAdmin(
      makeRequest({ Authorization: "Bearer good-jwt" }),
    );
    assertExists(res);
    assertEquals(res!.status, 403);
    const body = await res!.json();
    assertEquals(body.error, "forbidden");
  } finally {
    restore();
  }
});

Deno.test("allows authenticated admins", async () => {
  const restore = router({
    getUser: () =>
      jsonResponse(200, {
        id: "00000000-0000-0000-0000-000000000002",
        aud: "authenticated",
        role: "authenticated",
        email: "admin@example.com",
      }),
    hasRole: () => jsonResponse(200, true),
  });
  try {
    const res = await requireInternalOrAdmin(
      makeRequest({ Authorization: "Bearer good-jwt" }),
    );
    assertEquals(res, null);
  } finally {
    restore();
  }
});