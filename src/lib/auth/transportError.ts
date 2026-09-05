/**
 * Transport-failure classification for the auth/admin path.
 *
 * A wedged or unreachable backend surfaces as a fetch-level failure whose
 * message differs per browser ("Load failed" on Safari/iOS, "Failed to fetch"
 * on Chromium, "NetworkError ..." on Firefox). Those must never be presented
 * as rejected credentials.
 */

const TRANSPORT_PATTERNS = [
  'load failed',
  'failed to fetch',
  'networkerror',
  'network request failed',
  'aborterror',
  'the operation was aborted',
  'the user aborted a request',
  'timeout',
  'timed out',
  'authretryablefetcherror',
  'fetch failed',
  'connection',
  'err_network',
];

/** True when the error is a transport/network failure rather than a rejection. */
export function isTransportError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as { name?: string; message?: string; status?: number };
  if (anyErr?.name === 'AuthRetryableFetchError') return true;
  if (anyErr?.name === 'AbortError') return true;
  // 0 / 5xx from the auth gateway is an availability problem, not a credential one.
  if (typeof anyErr?.status === 'number' && (anyErr.status === 0 || anyErr.status >= 500)) return true;
  const haystack = `${anyErr?.name ?? ''} ${anyErr?.message ?? ''}`.toLowerCase();
  if (!haystack.trim()) return false;
  // Never misclassify an explicit credential rejection.
  if (haystack.includes('invalid login credentials')) return false;
  return TRANSPORT_PATTERNS.some((p) => haystack.includes(p));
}

export class AuthRequestTimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'AuthRequestTimeoutError';
  }
}

/**
 * Reject with a timeout error if the promise does not settle in time.
 * The underlying request is not cancellable here; the point is to stop the UI
 * from hanging on a wedged origin.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthRequestTimeoutError(ms)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Default finite timeout for auth/admin requests (ms). */
export const AUTH_REQUEST_TIMEOUT_MS = 10_000;
