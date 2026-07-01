import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeThrowable, throwableToError } from "./normalize-throwable.ts";

Deno.test("normalizeThrowable handles thrown Error", () => {
  const err = new TypeError("boom");
  const n = normalizeThrowable(err);
  assertEquals(n.message, "boom");
  assertEquals(n.name, "TypeError");
  assertEquals((n.raw as Record<string, unknown>).message, "boom");
  assertEquals(throwableToError(err), err);
});

Deno.test("normalizeThrowable handles thrown string", () => {
  const n = normalizeThrowable("plain failure");
  assertEquals(n.message, "plain failure");
  assertEquals(n.name, "NonErrorThrowable");
  assertEquals(n.raw, "plain failure");
  assertEquals(throwableToError("plain failure").message, "plain failure");
});

Deno.test("normalizeThrowable handles thrown object", () => {
  const raw = { code: "23505", message: "duplicate", details: { table: "x" } };
  const n = normalizeThrowable(raw);
  assertEquals(n.message, JSON.stringify(raw));
  assertEquals(n.name, "NonErrorThrowable");
  assertEquals(n.raw, raw);
});

Deno.test("normalizeThrowable handles thrown null", () => {
  const n = normalizeThrowable(null);
  assertEquals(n.message, "null");
  assertEquals(n.name, "NonErrorThrowable");
  assertEquals(n.raw, null);
});

Deno.test("normalizeThrowable handles thrown backend response object", () => {
  const response = {
    data: null,
    error: {
      message: "permission denied for table compiler_prompt_ledger",
      code: "42501",
      hint: "Grant access to the role.",
    },
    status: 401,
    statusText: "Unauthorized",
  };
  const n = normalizeThrowable(response);
  assertEquals(n.message, JSON.stringify(response));
  assertEquals((n.raw as typeof response).error.code, "42501");
  assertEquals(throwableToError(response).message, JSON.stringify(response));
});