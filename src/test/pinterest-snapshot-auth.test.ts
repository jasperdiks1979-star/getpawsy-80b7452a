import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the real handler with injected boundaries; no production calls.
const source = readFileSync('supabase/functions/pinterest-connection-snapshot/index.ts', 'utf8');
function handler(denial: Response | null) {
  const guard = vi.fn(async () => denial);
  const client = vi.fn(() => { throw new Error('authorized database boundary'); });
  let serve: (req: Request) => Promise<Response>;
  const compiled = ts.transpileModule(source.replace(/^import .*;\n/gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  new Function('Deno', 'requireInternalOrAdmin', 'createClient', compiled)(
    { serve: (fn: typeof serve) => { serve = fn; }, env: { get: () => 'test' } }, guard, client,
  );
  return { call: (method = 'POST') => serve(new Request('https://test/snapshot', { method })), guard, client };
}
describe('Pinterest snapshot authorization boundary', () => {
  for (const status of [401, 403, 503]) {
    it(`returns ${status} before reading private data`, async () => {
      const h = handler(new Response('{}', { status }));
      expect((await h.call()).status).toBe(status);
      expect(h.guard).toHaveBeenCalledOnce();
      expect(h.client).not.toHaveBeenCalled();
    });
  }
  it('preflight exposes no data and performs no authentication work', async () => {
    const h = handler(null);
    expect((await h.call('OPTIONS')).status).toBe(200);
    expect(h.guard).not.toHaveBeenCalled();
    expect(h.client).not.toHaveBeenCalled();
  });
  it('only reaches the database after successful authorization', async () => {
    const h = handler(null);
    await expect(h.call()).rejects.toThrow('authorized database boundary');
    expect(h.guard).toHaveBeenCalledOnce();
    expect(h.client).toHaveBeenCalledOnce();
  });
});
