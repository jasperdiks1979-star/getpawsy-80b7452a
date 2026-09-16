// Security A — mocked-auth coverage for the newly guarded edge functions.
//
// No real network calls are made: `globalThis.fetch` is stubbed, and
// `Deno.serve` is intercepted so importing a function module hands us its
// request handler instead of binding a port. Unauthorized callers must be
// rejected BEFORE any privileged read/write or third-party (CJ/Stripe) call.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
Deno.env.set("INTERNAL_FUNCTION_SECRET", "top-secret");
Deno.env.set("CJ_API_KEY", "stub");
Deno.env.set("CJ_EMAIL", "stub@example.com");

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";

type Call = { url: string; method: string };

function installFetchStub(calls: Call[], opts: { admin: boolean }) {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input.toString(), init);
    const url = new URL(req.url);
    calls.push({ url: req.url, method: req.method });
    if (url.pathname.endsWith("/auth/v1/user")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: ADMIN_ID, aud: "authenticated", email: "admin@example.com" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (url.pathname.includes("/rpc/has_role")) {
      return Promise.resolve(
        new Response(JSON.stringify(opts.admin), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    // Any other REST/table/function traffic: empty, successful payload.
    return Promise.resolve(
      new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

// Modules are only evaluated once per process, so cache the captured handler.
const handlerCache = new Map<string, (req: Request) => Promise<Response>>();

/** Import an edge function module and capture the handler it registers. */
async function loadHandler(path: string): Promise<(req: Request) => Promise<Response>> {
  const cached = handlerCache.get(path);
  if (cached) return cached;
  let captured: ((req: Request) => Promise<Response>) | null = null;
  const originalServe = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (handler: any) => {
    captured = typeof handler === "function" ? handler : handler?.handler;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} };
  };
  try {
    await import(path);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = originalServe;
  }
  assert(captured, `no handler registered by ${path}`);
  handlerCache.set(path, captured!);
  return captured!;
}

const GUARDED = [
  { name: "analytics-health-probe", path: "../analytics-health-probe/index.ts" },
  {
    name: "visitor-map-stabilization-monitor",
    path: "../visitor-map-stabilization-monitor/index.ts",
  },
];

const EXTERNAL_HOSTS = ["cjdropshipping.com", "api.stripe.com"];

for (const fn of GUARDED) {
  Deno.test({ sanitizeOps: false, sanitizeResources: false, name: `${fn.name}: unauthenticated request is rejected with 401`, fn: async () => {
    const calls: Call[] = [];
    const restore = installFetchStub(calls, { admin: false });
    try {
      const handler = await loadHandler(fn.path);
      const res = await handler(new Request("https://stub.supabase.co/" + fn.name, { method: "POST" }));
      assertEquals(res.status, 401);
      const body = await res.json();
      assertEquals(body.ok, false);
      assert(
        !calls.some((c) => EXTERNAL_HOSTS.some((h) => c.url.includes(h))),
        "no third-party call may happen for an unauthorized caller",
      );
    } finally {
      restore();
    }
  });

  Deno.test({ sanitizeOps: false, sanitizeResources: false, name: `${fn.name}: signed-in non-admin is rejected with 403`, fn: async () => {
    const calls: Call[] = [];
    const restore = installFetchStub(calls, { admin: false });
    try {
      const handler = await loadHandler(fn.path);
      const res = await handler(
        new Request("https://stub.supabase.co/" + fn.name, {
          method: "POST",
          headers: { Authorization: "Bearer user-jwt" },
        }),
      );
      assertEquals(res.status, 403);
    } finally {
      restore();
    }
  });

  Deno.test({ sanitizeOps: false, sanitizeResources: false, name: `${fn.name}: wrong internal secret does not authorize`, fn: async () => {
    const calls: Call[] = [];
    const restore = installFetchStub(calls, { admin: false });
    try {
      const handler = await loadHandler(fn.path);
      const res = await handler(
        new Request("https://stub.supabase.co/" + fn.name, {
          method: "POST",
          headers: { "x-internal-secret": "wrong" },
        }),
      );
      assertEquals(res.status, 401);
    } finally {
      restore();
    }
  });

  Deno.test({ sanitizeOps: false, sanitizeResources: false, name: `${fn.name}: correct internal secret is accepted`, fn: async () => {
    const calls: Call[] = [];
    const restore = installFetchStub(calls, { admin: true });
    try {
      const handler = await loadHandler(fn.path);
      const res = await handler(
        new Request("https://stub.supabase.co/" + fn.name, {
          method: "POST",
          headers: { "x-internal-secret": "top-secret" },
        }),
      );
      assert(res.status !== 401 && res.status !== 403, `expected acceptance, got ${res.status}`);
    } finally {
      restore();
    }
  });

  Deno.test({ sanitizeOps: false, sanitizeResources: false, name: `${fn.name}: admin JWT is accepted`, fn: async () => {
    const calls: Call[] = [];
    const restore = installFetchStub(calls, { admin: true });
    try {
      const handler = await loadHandler(fn.path);
      const res = await handler(
        new Request("https://stub.supabase.co/" + fn.name, {
          method: "POST",
          headers: { Authorization: "Bearer admin-jwt" },
        }),
      );
      assert(res.status !== 401 && res.status !== 403, `expected acceptance, got ${res.status}`);
    } finally {
      restore();
    }
  });
}
