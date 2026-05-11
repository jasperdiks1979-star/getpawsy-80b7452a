// Unified logger for the Pinterest video pipeline.
// Writes a console line AND a row to `pinterest_video_function_logs` so the
// admin diagnostics page can correlate every step of a job by trace_id.
export type LogLevel = "info" | "warn" | "error";

export interface PvLogger {
  info(message: string, payload?: unknown, ids?: { queue_id?: string | null; asset_id?: string | null }): Promise<void>;
  warn(message: string, payload?: unknown, ids?: { queue_id?: string | null; asset_id?: string | null }): Promise<void>;
  error(message: string, payload?: unknown, ids?: { queue_id?: string | null; asset_id?: string | null }): Promise<void>;
  trace_id: string;
}

export function createPvLogger(sb: any, function_name: string, trace_id: string): PvLogger {
  const write = async (
    level: LogLevel,
    message: string,
    payload?: unknown,
    ids?: { queue_id?: string | null; asset_id?: string | null },
  ) => {
    const tag = `[${function_name} ${trace_id}]`;
    const line = payload === undefined ? `${tag} ${message}` : `${tag} ${message} ${safeStringify(payload)}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    try {
      await sb.from("pinterest_video_function_logs").insert({
        function_name,
        trace_id,
        level,
        message,
        payload: payload === undefined ? null : (payload as any),
        queue_id: ids?.queue_id ?? null,
        asset_id: ids?.asset_id ?? null,
      });
    } catch (e) {
      // Logging must never throw — surface to console only.
      console.error(`${tag} log_insert_failed`, (e as Error)?.message);
    }
  };
  return {
    trace_id,
    info: (m, p, ids) => write("info", m, p, ids),
    warn: (m, p, ids) => write("warn", m, p, ids),
    error: (m, p, ids) => write("error", m, p, ids),
  };
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v).slice(0, 1000); } catch { return String(v); }
}