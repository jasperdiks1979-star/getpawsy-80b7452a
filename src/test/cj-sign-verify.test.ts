import { describe, it, expect } from "vitest";
import { computeCJSign, verifyCJSign, timingSafeEqual } from "../../supabase/functions/_shared/cj-sign";

const openId = "test-open-id-123";
const body = new TextEncoder().encode(JSON.stringify({ messageId: "m1", type: "STOCK" }));

describe("CJ webhook signature verification", () => {
  it("accepts a valid sign header over the exact raw body", async () => {
    const sign = await computeCJSign(body, openId);
    expect(await verifyCJSign(body, sign, openId)).toBe(true);
  });

  it("rejects an invalid signature", async () => {
    expect(await verifyCJSign(body, "AAAAinvalid====", openId)).toBe(false);
  });

  it("rejects a missing sign header", async () => {
    expect(await verifyCJSign(body, null, openId)).toBe(false);
  });

  it("rejects when the body was tampered after signing", async () => {
    const sign = await computeCJSign(body, openId);
    const tampered = new TextEncoder().encode(JSON.stringify({ messageId: "m1", type: "ORDER" }));
    expect(await verifyCJSign(tampered, sign, openId)).toBe(false);
  });

  it("rejects when signed with a different openId", async () => {
    const sign = await computeCJSign(body, "other-open-id");
    expect(await verifyCJSign(body, sign, openId)).toBe(false);
  });

  it("rejects when no openId is provisioned", async () => {
    const sign = await computeCJSign(body, openId);
    expect(await verifyCJSign(body, sign, "")).toBe(false);
  });

  it("produces stable Base64 output for the same input", async () => {
    const a = await computeCJSign(body, openId);
    const b = await computeCJSign(body, openId);
    expect(a).toBe(b);
    expect(/^[A-Za-z0-9+/]+={0,2}$/.test(a)).toBe(true);
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
