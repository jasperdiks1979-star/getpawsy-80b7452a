import { canRunStockSyncWatchdog } from "./stock-sync-watchdog-policy.ts";

Deno.test("watchdog is disabled by default and cannot be enabled by a caller", () => {
  const key = "private-service-role";
  for (const enabled of [undefined, "", "false", "TRUE"]) {
    if (canRunStockSyncWatchdog("POST", `Bearer ${key}`, key, enabled)) {
      throw new Error("Watchdog enabled without explicit opt-in");
    }
  }
  for (const header of [null, "", "Bearer anon", "Bearer", key]) {
    if (canRunStockSyncWatchdog("POST", header, key, "true")) {
      throw new Error("Non-service credential authorized");
    }
  }
});

Deno.test("watchdog permits only explicitly enabled service POST", () => {
  const key = "private-service-role";
  if (!canRunStockSyncWatchdog("POST", `Bearer ${key}`, key, "true")) {
    throw new Error("Valid service request rejected");
  }
  if (canRunStockSyncWatchdog("GET", `Bearer ${key}`, key, "true")) {
    throw new Error("Read request must not initiate recovery");
  }
  if (canRunStockSyncWatchdog("POST", "Bearer undefined", undefined, "true")) {
    throw new Error("Missing service key authorized");
  }
});
