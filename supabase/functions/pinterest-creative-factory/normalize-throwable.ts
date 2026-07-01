export interface NormalizedThrowable {
  message: string;
  name: string;
  stack: string | null;
  raw: unknown;
}

function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function rawForAudit(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (typeof value === "object") {
    const json = safeJson(value);
    return json ? JSON.parse(json) : String(value);
  }
  return String(value);
}

function messageFor(value: unknown): string {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === "string") return value;
  const json = safeJson(value);
  return json ?? String(value);
}

export function normalizeThrowable(error: unknown): NormalizedThrowable {
  if (error instanceof Error) {
    return {
      message: error.message || error.name,
      name: error.name || "Error",
      stack: error.stack ?? null,
      raw: rawForAudit(error),
    };
  }
  return {
    message: messageFor(error),
    name: "NonErrorThrowable",
    stack: null,
    raw: rawForAudit(error),
  };
}

export function throwableToError(error: unknown): Error {
  if (error instanceof Error) return error;
  const normalized = normalizeThrowable(error);
  const wrapped = new Error(normalized.message);
  wrapped.name = normalized.name;
  return wrapped;
}