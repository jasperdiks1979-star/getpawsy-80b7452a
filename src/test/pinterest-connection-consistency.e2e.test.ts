import { describe, it, expect } from "vitest";

// E2E test: proves every admin surface reads the same Pinterest connection
// state, and that OAuth/boards/publisher/queue are operational.
//
// Hits the deployed `pinterest-connection-snapshot` edge function (no auth
// required, read-only). Skipped automatically when the env vars are missing
// (e.g. in offline CI sandboxes).

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

const runE2E = process.env.RUN_E2E === "1";
const describeMaybe = runE2E ? describe : describe.skip;

describeMaybe("Pinterest connection consistency (E2E)", () => {
  it("returns a consistent snapshot across every admin source", async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-connection-snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const snap = await res.json();

    // 1. OAuth + account
    expect(snap.ok).toBe(true);
    expect(snap.connection, "pinterest_connection row missing").toBeTruthy();
    expect(snap.connection.status).toBe("connected");
    expect(snap.connection.account_name).toBeTruthy();
    expect(snap.connection.last_account_status).toBe(200);

    // 2. Boards validated
    expect(snap.connection.last_boards_status).toBe(200);
    expect(snap.connection.board_count).toBeGreaterThanOrEqual(1);

    // 3. Publisher operational
    expect(snap.publisher.pcie2_publish_enabled).toBe(true);
    expect(snap.publisher.global_stop).toBe(false);
    expect(snap.publisher.operational).toBe(true);

    // 4. Queue operational (failed bucket must not be runaway)
    expect(snap.queue.failed).toBeLessThan(50);

    // 5. Every admin page resolves the same connection id
    const ids = Object.values(snap.sources);
    expect(new Set(ids).size, `divergent sources: ${JSON.stringify(snap.sources)}`).toBe(1);
    expect(ids[0]).toBe(snap.connection.id);
    expect(snap.consistent).toBe(true);
  });
});