import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("supabase/functions/revenue-root-cause/index.ts", "utf8");

describe("revenue-root-cause human sessions window", () => {
  it("uses the window-first human sessions function with the report's since", () => {
    expect(src).toMatch(/rpc\("session_forensics_human_window",\s*\{\s*p_since:\s*since\s*\}\)/);
  });
  it("still keeps the first_seen_at >= since filter so results match the old view", () => {
    expect(src).toMatch(/\.gte\("first_seen_at",\s*since\)/);
  });
});
