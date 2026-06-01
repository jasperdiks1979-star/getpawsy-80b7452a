import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifySafariPlayback } from "./safari-playback-check.ts";

/** Helper: install a fetch mock that returns scripted Responses per URL+method. */
function withFetch(
  handler: (input: string | Request | URL, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
) {
  const orig = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = handler;
  return fn().finally(() => {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).fetch = orig;
  });
}

const FTYP_MOOV = (() => {
  // Minimal buffer with "moov" ascii inside first 1KB.
  const buf = new Uint8Array(1024);
  const tag = new TextEncoder().encode("moov");
  buf.set(tag, 32);
  return buf;
})();

const FTYP_NO_MOOV = new Uint8Array(1024); // all zeros

Deno.test("verifySafariPlayback: happy path passes all checks", async () => {
  await withFetch(async (input, init) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "12345",
          "accept-ranges": "bytes",
        },
      });
    }
    return new Response(FTYP_MOOV, {
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "access-control-allow-origin": "*",
      },
    });
  }, async () => {
    const r = await verifySafariPlayback("https://example.com/storage/v1/object/public/cinematic-ads/job/output-trimmed.mp4");
    assertEquals(r.passed, true, JSON.stringify(r.checks));
    assertEquals(r.has_faststart, true);
    assertEquals(r.has_double_slash, false);
    assertEquals(r.http_range_status, 206);
  });
});

Deno.test("verifySafariPlayback: double slash in path fails url_no_double_slash", async () => {
  await withFetch(async (_input, init) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "accept-ranges": "bytes" },
      });
    }
    return new Response(FTYP_MOOV, {
      status: 206,
      headers: { "access-control-allow-origin": "*" },
    });
  }, async () => {
    const r = await verifySafariPlayback("https://example.com//storage/v1/object/public/cinematic-ads/job/o.mp4");
    assert(!r.passed);
    assert(r.has_double_slash);
    const dbl = r.checks.find((c) => c.name === "url_no_double_slash");
    assert(dbl && !dbl.passed);
  });
});

Deno.test("verifySafariPlayback: wrong content-type fails", async () => {
  await withFetch(async (_input, init) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-type": "application/octet-stream", "accept-ranges": "bytes" },
      });
    }
    return new Response(FTYP_MOOV, {
      status: 206,
      headers: { "access-control-allow-origin": "*" },
    });
  }, async () => {
    const r = await verifySafariPlayback("https://example.com/path/clean.mp4");
    assert(!r.passed);
    const ct = r.checks.find((c) => c.name === "content_type_video_mp4");
    assert(ct && !ct.passed);
  });
});

Deno.test("verifySafariPlayback: missing moov atom fails faststart check", async () => {
  await withFetch(async (_input, init) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "accept-ranges": "bytes" },
      });
    }
    return new Response(FTYP_NO_MOOV, {
      status: 206,
      headers: { "access-control-allow-origin": "*" },
    });
  }, async () => {
    const r = await verifySafariPlayback("https://example.com/path/clean.mp4");
    assert(!r.passed);
    assertEquals(r.has_faststart, false);
    const fs = r.checks.find((c) => c.name === "faststart_moov_atom");
    assert(fs && !fs.passed);
  });
});

Deno.test("verifySafariPlayback: missing CORS header fails cors check", async () => {
  await withFetch(async (_input, init) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "accept-ranges": "bytes" },
      });
    }
    return new Response(FTYP_MOOV, { status: 206, headers: {} });
  }, async () => {
    const r = await verifySafariPlayback("https://example.com/path/clean.mp4");
    assert(!r.passed);
    const cors = r.checks.find((c) => c.name === "cors_allow_origin");
    assert(cors && !cors.passed);
  });
});

Deno.test("verifySafariPlayback: non-206 range response fails", async () => {
  await withFetch(async (_input, init) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-type": "video/mp4", "accept-ranges": "bytes" },
      });
    }
    return new Response(FTYP_MOOV, {
      status: 200,
      headers: { "access-control-allow-origin": "*" },
    });
  }, async () => {
    const r = await verifySafariPlayback("https://example.com/path/clean.mp4");
    assert(!r.passed);
    const rg = r.checks.find((c) => c.name === "range_206");
    assert(rg && !rg.passed);
  });
});