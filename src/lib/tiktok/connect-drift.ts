/**
 * TikTok connect-flow drift detection.
 *
 * Each time the admin clicks "Connect TikTok", we fetch the live config
 * from `tiktok-oauth-status` (which returns the unmasked `client_key_full`
 * and the `redirect_uri` the server actually uses) and compare against the
 * values we used on the previous attempt. Any change is surfaced as a toast
 * + appended to a small ring buffer in localStorage so the admin can audit
 * config drift on the TikTok status page.
 *
 * Why this matters: TikTok rejects OAuth with a generic
 * `invalid_client_key` / `redirect_uri mismatch` error if either value was
 * silently rotated (secret rotated, redirect URI edited in the Developer
 * Portal, env var swapped). Without a diff, that failure is invisible.
 */

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const LAST_ATTEMPT_KEY = "tiktok_last_connect_attempt";
const DRIFT_LOG_KEY = "tiktok_connect_drift_log";
const DRIFT_LOG_MAX = 25;

export type ConnectAttemptSnapshot = {
  client_key_full: string | null;
  client_key_masked: string | null;
  redirect_uri: string | null;
  origin: string;
  observed_at: string;
};

export type DriftField = "client_key" | "redirect_uri" | "origin";

export type DriftLogEntry = {
  observed_at: string;
  origin: string;
  changed: DriftField[];
  previous: {
    client_key_masked: string | null;
    redirect_uri: string | null;
    origin: string | null;
  };
  current: {
    client_key_masked: string | null;
    redirect_uri: string | null;
    origin: string;
  };
};

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function getLastConnectAttempt(): ConnectAttemptSnapshot | null {
  return readJSON<ConnectAttemptSnapshot>(LAST_ATTEMPT_KEY);
}

export function getDriftLog(): DriftLogEntry[] {
  return readJSON<DriftLogEntry[]>(DRIFT_LOG_KEY) ?? [];
}

export function clearDriftLog(): void {
  try {
    localStorage.removeItem(DRIFT_LOG_KEY);
  } catch {
    // ignore
  }
}

/**
 * Fetches the current TikTok OAuth config via the status edge function,
 * compares it against the last stored attempt, surfaces a toast on drift,
 * appends an entry to the drift log, and finally records the new snapshot
 * as the latest attempt.
 *
 * Always non-blocking: if the status call fails for any reason we log a
 * console warning and let the connect flow continue — the goal is
 * observability, not gating.
 */
export async function recordConnectAttemptAndDetectDrift(
  origin: string,
): Promise<DriftLogEntry | null> {
  let current: ConnectAttemptSnapshot;
  try {
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      config?: {
        client_key_full?: string | null;
        client_key_masked?: string | null;
        redirect_uri?: string | null;
      };
    }>("tiktok-oauth-status", { body: {} });
    if (error) throw error;
    current = {
      client_key_full: data?.config?.client_key_full ?? null,
      client_key_masked:
        data?.config?.client_key_masked ??
        maskKey(data?.config?.client_key_full ?? null),
      redirect_uri: data?.config?.redirect_uri ?? null,
      origin,
      observed_at: new Date().toISOString(),
    };
  } catch (err) {
    // Don't block the connect flow — just skip drift detection this round.
    console.warn("[tiktok-drift] status fetch failed; skipping drift check", err);
    return null;
  }

  const previous = getLastConnectAttempt();

  // Always persist the latest attempt as the new baseline.
  writeJSON(LAST_ATTEMPT_KEY, current);

  // No prior attempt → nothing to diff against.
  if (!previous) return null;

  const changed: DriftField[] = [];
  if ((previous.client_key_full ?? "") !== (current.client_key_full ?? "")) {
    changed.push("client_key");
  }
  if ((previous.redirect_uri ?? "") !== (current.redirect_uri ?? "")) {
    changed.push("redirect_uri");
  }
  if (previous.origin !== current.origin) {
    changed.push("origin");
  }

  if (changed.length === 0) return null;

  const entry: DriftLogEntry = {
    observed_at: current.observed_at,
    origin,
    changed,
    previous: {
      client_key_masked:
        previous.client_key_masked ?? maskKey(previous.client_key_full),
      redirect_uri: previous.redirect_uri,
      origin: previous.origin,
    },
    current: {
      client_key_masked:
        current.client_key_masked ?? maskKey(current.client_key_full),
      redirect_uri: current.redirect_uri,
      origin: current.origin,
    },
  };

  // Prepend + cap the ring buffer.
  const next = [entry, ...getDriftLog()].slice(0, DRIFT_LOG_MAX);
  writeJSON(DRIFT_LOG_KEY, next);

  // User-visible warning so drift never goes unnoticed mid-flow.
  const fields = changed
    .map((c) =>
      c === "client_key"
        ? "client_key"
        : c === "redirect_uri"
          ? "redirect URI"
          : "origin",
    )
    .join(", ");
  toast.warning(`TikTok config drift detected: ${fields} changed since last attempt`, {
    description:
      changed.includes("client_key") || changed.includes("redirect_uri")
        ? "Verify the TikTok Developer Portal still matches before continuing."
        : "Connecting from a different origin than last time.",
    duration: 8000,
  });

  // Structured console log for easier debugging.
  console.warn("[tiktok-drift] detected", entry);

  return entry;
}