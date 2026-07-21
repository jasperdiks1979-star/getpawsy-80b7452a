import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { classifyAttempt, copyToClipboardSafe, MerchantApiTransportDiagnostics } from '@/components/admin/MerchantApiTransportDiagnostics';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

const invokeMock = vi.fn();
const getSessionMock = vi.fn(async () => ({ data: { session: { access_token: 't', user: { id: 'u1' } } } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: () => getSessionMock() },
    functions: { invoke: (name: string, opts?: unknown) => invokeMock(name, opts) },
  },
}));

describe('classifyAttempt', () => {
  const base = { hasBearer: true, requiresAuth: true } as const;

  it('classifies successful ok:true JSON response', () => {
    expect(classifyAttempt({ ...base, method: 'direct_fetch', httpStatus: 200, contentType: 'application/json', parsedJson: { ok: true } })).toBe('AUTHENTICATED_EDGE_SUCCESS');
  });

  it('classifies timeouts', () => {
    expect(classifyAttempt({ ...base, method: 'direct_fetch', httpStatus: null, errorName: 'AbortError', errorMessage: 'Request timed out after 20000ms' })).toBe('REQUEST_TIMEOUT');
  });

  it('classifies unauth GET 401 as edge reachable', () => {
    expect(classifyAttempt({ method: 'unauth_get', httpStatus: 401, contentType: 'application/json', bodyPreview: '{"ok":false,"error":"missing_auth"}', hasBearer: false, requiresAuth: false })).toBe('UNAUTHENTICATED_EDGE_REACHABLE');
  });

  it('classifies text/html shell as storefront interception', () => {
    expect(classifyAttempt({ ...base, method: 'direct_fetch', httpStatus: 200, contentType: 'text/html; charset=utf-8', bodyPreview: '<!doctype html><html>...' })).toBe('STOREFRONT_HTML_INTERCEPTION');
  });

  it('classifies missing session', () => {
    expect(classifyAttempt({ method: 'direct_fetch', httpStatus: null, hasBearer: false, requiresAuth: true })).toBe('SESSION_MISSING');
  });

  it('classifies transport failure when no status and error present', () => {
    expect(classifyAttempt({ ...base, method: 'supabase_invoke', httpStatus: null, errorName: 'TypeError', errorMessage: 'Load failed' })).toBe('PREFLIGHT_OR_BROWSER_TRANSPORT_FAILURE');
  });

  it('classifies non-2xx as authenticated http error', () => {
    expect(classifyAttempt({ ...base, method: 'direct_fetch', httpStatus: 500, contentType: 'application/json', parsedJson: { ok: false } })).toBe('AUTHENTICATED_HTTP_ERROR');
  });
});

describe('copyToClipboardSafe', () => {
  beforeEach(() => {
    // remove native clipboard
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    (document as unknown as { execCommand: () => boolean }).execCommand = vi.fn(() => true);
  });

  it('falls back to textarea + execCommand when clipboard API is missing', async () => {
    const ok = await copyToClipboardSafe('hello');
    expect(ok).toBe(true);
    expect((document as unknown as { execCommand: () => boolean }).execCommand).toHaveBeenCalled();
  });
});

describe('MerchantApiTransportDiagnostics — Run all', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    invokeMock.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('executes A → B → C in order and never renders bearer token', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method || 'GET'} ${u}`);
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ ok: true, probeId: 'x' }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-echo-probe-id': 'x' },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: 'missing_auth' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    invokeMock.mockResolvedValue({ data: { ok: true, probeId: 'y' }, error: null });

    render(<MerchantApiTransportDiagnostics />);
    const btn = screen.getByTestId('run-all-diagnostics');
    await act(async () => { fireEvent.click(btn); });

    await waitFor(() => {
      expect(screen.getByText(/Diagnostics completed/i)).toBeInTheDocument();
    }, { timeout: 5000 });

    // A (POST direct), B (invoke), C (GET direct) — POST happened before GET
    const postIdx = calls.findIndex((c) => c.startsWith('POST '));
    const getIdx = calls.findIndex((c) => c.startsWith('GET '));
    expect(postIdx).toBeGreaterThanOrEqual(0);
    expect(getIdx).toBeGreaterThan(postIdx);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // JWT/apikey values never rendered in DOM text
    const dom = document.body.innerHTML;
    expect(dom).not.toContain('Bearer t');
    // The literal access token 't' is too short to assert; assert the header word never appears
    expect(dom).not.toMatch(/access_token/i);
  });
});