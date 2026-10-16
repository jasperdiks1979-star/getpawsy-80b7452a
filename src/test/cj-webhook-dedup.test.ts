import { describe, it, expect } from "vitest";
import { decideDedup } from "../../supabase/functions/_shared/cj-webhook-dedup";

const incoming = { type: "STOCK", messageType: "UPDATE", params: { vid: "v1", qty: 3 } };
const row = (processed: boolean, params: unknown = { qty: 3, vid: "v1" }) => ({
  processed, webhook_type: "STOCK", message_type: "UPDATE", payload: params,
});

describe("CJ webhook duplicate handling", () => {
  it("processes a genuinely new event", () => {
    expect(decideDedup(true, null, incoming)).toEqual({ action: "process", reason: "new" });
  });
  it("skips an identical redelivery that was already processed", () => {
    expect(decideDedup(false, row(true), incoming)).toEqual({ action: "skip", reason: "already_processed", conflicting: false });
  });
  it("flags a conflicting payload but keeps the original", () => {
    const d = decideDedup(false, row(true, { vid: "v1", qty: 9 }), incoming);
    expect(d).toEqual({ action: "skip", reason: "already_processed", conflicting: true });
  });
  it("retries an event whose earlier attempt never finished (not silently lost)", () => {
    expect(decideDedup(false, row(false), incoming)).toEqual({ action: "process", reason: "retry_unprocessed" });
  });
  it("processes when the existing row cannot be read back", () => {
    expect(decideDedup(false, null, incoming).action).toBe("process");
  });
});
