/**
 * Export / import helpers for TikTok test user settings.
 *
 * These let an admin move the "which TikTok account is the active
 * Recording User + per-account label/notes" configuration between
 * environments (e.g. preview → production) without having to re-add
 * every account by hand.
 *
 * The OAuth tokens themselves are deliberately NOT exported: tokens
 * are environment-bound (per Supabase project, per TikTok Developer
 * Portal app), and copying them would create a dangerous footgun.
 * Importing only restores the metadata the admin curates manually.
 */

import { supabase } from "@/integrations/supabase/client";

export const TIKTOK_TEST_USERS_EXPORT_VERSION = 1 as const;

/**
 * One row of the export. Mirrors the editable fields of
 * `tiktok_test_users`. We intentionally omit `id`, `created_at`,
 * `updated_at`, and `created_by` — those are environment-specific.
 */
export type TestUserExportRow = {
  open_id: string;
  label: string | null;
  notes: string | null;
  is_recording_user: boolean;
  registered_in_dev_portal_at: string | null;
};

export type TestUsersExportEnvelope = {
  /** Schema version. Bump if the row shape ever changes. */
  version: typeof TIKTOK_TEST_USERS_EXPORT_VERSION;
  /** ISO timestamp of the export. */
  exported_at: string;
  /** Origin the export came from, for debugging only. */
  exported_from?: string;
  /** open_id of the recording user at export time, or null. */
  recording_open_id: string | null;
  rows: TestUserExportRow[];
};

/**
 * Pull every row of `tiktok_test_users` and wrap it in the export envelope.
 * Throws on any DB error so the caller can toast a precise message.
 */
export async function buildTestUsersExport(): Promise<TestUsersExportEnvelope> {
  const { data, error } = await supabase
    .from("tiktok_test_users")
    .select("open_id, label, notes, is_recording_user, registered_in_dev_portal_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load test users: ${error.message}`);
  }

  const rows: TestUserExportRow[] = (data ?? []).map((r) => ({
    open_id: r.open_id,
    label: r.label,
    notes: r.notes,
    is_recording_user: r.is_recording_user,
    registered_in_dev_portal_at: r.registered_in_dev_portal_at,
  }));

  const recording = rows.find((r) => r.is_recording_user);

  return {
    version: TIKTOK_TEST_USERS_EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    exported_from:
      typeof window !== "undefined" ? window.location.origin : undefined,
    recording_open_id: recording?.open_id ?? null,
    rows,
  };
}

/**
 * Trigger a browser download of the export envelope as a pretty-printed
 * JSON file. Filename includes the date for easy diffing.
 */
export function downloadTestUsersExport(envelope: TestUsersExportEnvelope): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = envelope.exported_at.replace(/[:.]/g, "-");
  a.href = url;
  a.download = `tiktok-test-users-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ImportMode = "merge" | "replace";

export type ImportSummary = {
  inserted: number;
  updated: number;
  deleted: number;
  recording_user_set: string | null;
};

/**
 * Validate an arbitrary JSON blob and return a typed envelope, or throw
 * a human-readable error explaining what's missing/wrong. We're strict on
 * shape because a bad import can silently destroy the recording-user flag.
 */
export function parseTestUsersExport(raw: unknown): TestUsersExportEnvelope {
  if (!raw || typeof raw !== "object") {
    throw new Error("Import file is not a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== TIKTOK_TEST_USERS_EXPORT_VERSION) {
    throw new Error(
      `Unsupported export version: ${String(obj.version)} (expected ${TIKTOK_TEST_USERS_EXPORT_VERSION})`,
    );
  }
  if (!Array.isArray(obj.rows)) {
    throw new Error("Import file is missing a 'rows' array");
  }

  const rows: TestUserExportRow[] = [];
  const seen = new Set<string>();
  let recordingCount = 0;

  for (const [idx, item] of (obj.rows as unknown[]).entries()) {
    if (!item || typeof item !== "object") {
      throw new Error(`Row ${idx} is not an object`);
    }
    const r = item as Record<string, unknown>;
    if (typeof r.open_id !== "string" || r.open_id.trim() === "") {
      throw new Error(`Row ${idx} is missing a non-empty open_id`);
    }
    if (seen.has(r.open_id)) {
      throw new Error(`Duplicate open_id in import: ${r.open_id}`);
    }
    seen.add(r.open_id);

    const isRecording = Boolean(r.is_recording_user);
    if (isRecording) recordingCount += 1;

    rows.push({
      open_id: r.open_id,
      label:
        typeof r.label === "string"
          ? r.label
          : r.label === null
            ? null
            : null,
      notes:
        typeof r.notes === "string"
          ? r.notes
          : r.notes === null
            ? null
            : null,
      is_recording_user: isRecording,
      registered_in_dev_portal_at:
        typeof r.registered_in_dev_portal_at === "string"
          ? r.registered_in_dev_portal_at
          : null,
    });
  }

  if (recordingCount > 1) {
    throw new Error(
      `Import has ${recordingCount} rows flagged as recording user — only one is allowed`,
    );
  }

  return {
    version: TIKTOK_TEST_USERS_EXPORT_VERSION,
    exported_at:
      typeof obj.exported_at === "string"
        ? obj.exported_at
        : new Date().toISOString(),
    exported_from:
      typeof obj.exported_from === "string" ? obj.exported_from : undefined,
    recording_open_id:
      typeof obj.recording_open_id === "string"
        ? obj.recording_open_id
        : rows.find((r) => r.is_recording_user)?.open_id ?? null,
    rows,
  };
}

/**
 * Apply a parsed envelope to the live `tiktok_test_users` table.
 *
 * - mode = "merge"   → upsert each row by open_id; rows present locally but
 *                       absent in the import are left untouched.
 * - mode = "replace" → also delete every local row whose open_id is NOT in
 *                       the import (mirrors the export exactly).
 *
 * The recording-user flag is applied in two passes to satisfy the partial
 * unique index `tiktok_test_users_one_recording`: first we clear ALL
 * recording flags, then we upsert with the desired flags. This avoids a
 * brief moment with two recording users which would error out.
 */
export async function applyTestUsersImport(
  envelope: TestUsersExportEnvelope,
  mode: ImportMode,
): Promise<ImportSummary> {
  // Snapshot of current rows so we can compute insert/update/delete counts
  // and know what to delete in "replace" mode.
  const { data: existingRaw, error: loadErr } = await supabase
    .from("tiktok_test_users")
    .select("open_id");
  if (loadErr) throw new Error(`Failed to load existing rows: ${loadErr.message}`);

  const existingIds = new Set((existingRaw ?? []).map((r) => r.open_id));
  const importedIds = new Set(envelope.rows.map((r) => r.open_id));

  // Pass 1: clear every recording flag so the partial unique index can't
  // collide when we re-apply the import.
  const { error: clearErr } = await supabase
    .from("tiktok_test_users")
    .update({ is_recording_user: false })
    .eq("is_recording_user", true);
  if (clearErr) {
    throw new Error(`Failed to clear recording flag: ${clearErr.message}`);
  }

  // Pass 2: upsert every imported row with its final values.
  if (envelope.rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("tiktok_test_users")
      .upsert(envelope.rows, { onConflict: "open_id" });
    if (upsertErr) {
      throw new Error(`Failed to upsert rows: ${upsertErr.message}`);
    }
  }

  // Pass 3 (replace mode only): drop rows that aren't in the import.
  let deleted = 0;
  if (mode === "replace") {
    const toDelete = [...existingIds].filter((id) => !importedIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from("tiktok_test_users")
        .delete()
        .in("open_id", toDelete);
      if (delErr) {
        throw new Error(`Failed to delete stale rows: ${delErr.message}`);
      }
      deleted = toDelete.length;
    }
  }

  let inserted = 0;
  let updated = 0;
  for (const id of importedIds) {
    if (existingIds.has(id)) updated += 1;
    else inserted += 1;
  }

  const recording = envelope.rows.find((r) => r.is_recording_user) ?? null;

  return {
    inserted,
    updated,
    deleted,
    recording_user_set: recording?.open_id ?? null,
  };
}