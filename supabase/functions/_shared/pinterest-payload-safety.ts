type SanitizeResult = {
  payload: Record<string, unknown>;
  rejectedFields: Array<{ path: string; value: unknown; reason: string }>;
  coercedFields: Array<{ path: string; from: unknown; to: number }>;
};

const INTEGER_FIELD_RE = /(^|_)(key_frame_time|cover_image_key_frame_time|duration|duration_seconds|interval|gap|position|order|sort_order|rank|count|limit|page_size|delay_seconds|min_gap_minutes|max_gap_minutes|attempt|attempts)$/i;
const SECRET_KEY_RE = /(token|authorization|secret|refresh|access_token|client_secret|api_key|apikey)/i;

function isIntegerField(key: string): boolean {
  return INTEGER_FIELD_RE.test(key);
}

function sanitizeValue(value: unknown, path: string[], out: SanitizeResult): unknown {
  if (Array.isArray(value)) return value.map((v, i) => sanitizeValue(v, [...path, String(i)], out));
  if (!value || typeof value !== "object") return value;

  const copy: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (isIntegerField(key)) {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n === "number" && Number.isFinite(n)) {
        const rounded = Math.max(0, Math.round(n));
        copy[key] = rounded;
        if (!Number.isInteger(raw) || raw !== rounded) out.coercedFields.push({ path: nextPath.join("."), from: raw, to: rounded });
        continue;
      }
      if (raw !== undefined && raw !== null) {
        out.rejectedFields.push({ path: nextPath.join("."), value: raw, reason: "expected_integer" });
      }
    }
    copy[key] = sanitizeValue(raw, nextPath, out);
  }
  return copy;
}

export function sanitizePinterestPayload(payload: Record<string, unknown>): SanitizeResult {
  const out: SanitizeResult = { payload: {}, rejectedFields: [], coercedFields: [] };
  out.payload = sanitizeValue(payload, [], out) as Record<string, unknown>;
  return out;
}

export function validatePinterestIntegerPayload(payload: unknown, path: string[] = []): Array<{ path: string; value: unknown; reason: string }> {
  const errors: Array<{ path: string; value: unknown; reason: string }> = [];
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => errors.push(...validatePinterestIntegerPayload(v, [...path, String(i)])));
    return errors;
  }
  if (!payload || typeof payload !== "object") return errors;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (isIntegerField(key) && typeof value === "number" && !Number.isInteger(value)) {
      errors.push({ path: nextPath.join("."), value, reason: "not_integer_after_sanitize" });
    }
    errors.push(...validatePinterestIntegerPayload(value, nextPath));
  }
  return errors;
}

export function redactPinterestPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPinterestPayload);
  if (!value || typeof value !== "object") return value;
  const copy: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    copy[key] = SECRET_KEY_RE.test(key) ? "[REDACTED]" : redactPinterestPayload(raw);
  }
  return copy;
}

export function sanitizeAndValidatePinterestPayload(payload: Record<string, unknown>) {
  const sanitized = sanitizePinterestPayload(payload);
  const validationErrors = [...sanitized.rejectedFields, ...validatePinterestIntegerPayload(sanitized.payload)];
  return {
    payload: sanitized.payload,
    rejectedFields: validationErrors,
    coercedFields: sanitized.coercedFields,
    debugPayload: redactPinterestPayload(sanitized.payload),
    ok: validationErrors.length === 0,
  };
}