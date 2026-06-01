// Verifies the render budget RPC contract that cinematic-ad-claim-job depends on:
//   - normal call inside 24h window returns allowed=false, budget_24h_exhausted, reset_at
//   - p_force=true bypasses the cap and returns allowed=true, forced=true
//   - a successful (non-force) call after clear returns allowed=true, forced=false
//
// This protects against silent regressions where claim-job would freeze jobs in
// render_queued because the RPC shape changed.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY") ?? "";

const TEST_SLUG = "__render_budget_test__";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

Deno.test({
  name: "render budget — normal call after force is blocked with reset_at",
  ignore: !SERVICE_KEY,
  fn: async () => {
    const db = admin();
    // Reset state.
    await db.from("cinematic_ad_render_budget").delete().eq("product_slug", TEST_SLUG);

    // 1) First call (no force) — should reserve a slot.
    const first: any = await db.rpc("cinematic_reserve_render_slot", {
      p_product_slug: TEST_SLUG, p_force: false, p_admin_user_id: null, p_force_reason: null,
    }).maybeSingle();
    assertEquals(first.data?.allowed, true, "first call must reserve");
    assertEquals(first.data?.forced, false);
    assert(first.data?.reset_at, "reset_at must be returned");

    // 2) Second call (no force) within window — must be blocked with reset_at.
    const blocked: any = await db.rpc("cinematic_reserve_render_slot", {
      p_product_slug: TEST_SLUG, p_force: false, p_admin_user_id: null, p_force_reason: null,
    }).maybeSingle();
    assertEquals(blocked.data?.allowed, false, "second call inside window must be blocked");
    assertEquals(blocked.data?.reason, "budget_24h_exhausted");
    assert(blocked.data?.reset_at, "blocked result must carry reset_at for UI");

    // 3) Third call WITH force — must bypass, forced=true.
    const forced: any = await db.rpc("cinematic_reserve_render_slot", {
      p_product_slug: TEST_SLUG, p_force: true, p_admin_user_id: null, p_force_reason: "test_force",
    }).maybeSingle();
    assertEquals(forced.data?.allowed, true, "force must bypass budget");
    assertEquals(forced.data?.forced, true);
    assertEquals(forced.data?.reason, "reserved_force");

    // 4) Override counter must have incremented in the budget row.
    const { data: row }: any = await db.from("cinematic_ad_render_budget")
      .select("force_override_count").eq("product_slug", TEST_SLUG).maybeSingle();
    assert((row?.force_override_count ?? 0) >= 1, "force_override_count must be recorded");

    // Cleanup.
    await db.from("cinematic_ad_render_budget").delete().eq("product_slug", TEST_SLUG);
  },
});

Deno.test({
  name: "render budget — admin clear lets a fresh non-force call succeed",
  ignore: !SERVICE_KEY,
  fn: async () => {
    const db = admin();
    await db.from("cinematic_ad_render_budget").delete().eq("product_slug", TEST_SLUG);
    await db.rpc("cinematic_reserve_render_slot", {
      p_product_slug: TEST_SLUG, p_force: false, p_admin_user_id: null, p_force_reason: null,
    }).maybeSingle();
    // Direct service-role delete (cinematic_clear_render_budget needs an admin
    // JWT; we exercise the same effect here).
    await db.from("cinematic_ad_render_budget").delete().eq("product_slug", TEST_SLUG);
    const second: any = await db.rpc("cinematic_reserve_render_slot", {
      p_product_slug: TEST_SLUG, p_force: false, p_admin_user_id: null, p_force_reason: null,
    }).maybeSingle();
    assertEquals(second.data?.allowed, true, "after clear, fresh non-force call must reserve");
    assertEquals(second.data?.reason, "reserved");
    await db.from("cinematic_ad_render_budget").delete().eq("product_slug", TEST_SLUG);
  },
});