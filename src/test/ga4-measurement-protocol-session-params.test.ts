import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  "supabase/functions/_shared/ga4-measurement-protocol.ts",
  "utf8",
);

describe("GA4 Measurement Protocol session attribution", () => {
  it("places session_id inside purchase event params", () => {
    const purchase = source.slice(source.indexOf('name: "purchase"'), source.indexOf('server_origin: "stripe_webhook"'));
    expect(purchase).toContain("...(input.sessionId ? { session_id: input.sessionId } : {})");
  });
  it("places session_id inside begin_checkout event params", () => {
    const checkout = source.slice(source.indexOf('name: "begin_checkout"'), source.indexOf('server_origin: "create_checkout"'));
    expect(checkout).toContain("...(input.sessionId ? { session_id: input.sessionId } : {})");
  });
  it("does not put session_id at the request body's top level", () => {
    expect(source).not.toMatch(/client_id:\s*clientId,\s*\.\.\.\(input\.sessionId/);
    expect(source.match(/session_id: input\.sessionId/g)).toHaveLength(2);
  });
});
