import { afterEach, expect, it, vi } from 'vitest';
import { withBuildTimeout } from '../../scripts/with-build-timeout';

afterEach(() => vi.useRealTimers());

it('clears the deadline after a successful build operation', async () => {
  vi.useFakeTimers();
  await expect(withBuildTimeout(Promise.resolve('feed'), 180000, 'deadline')).resolves.toBe('feed');
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves failures and clears their deadline', async () => {
  vi.useFakeTimers();
  const failure = new Error('database unavailable');
  await expect(withBuildTimeout(Promise.reject(failure), 180000, 'deadline')).rejects.toBe(failure);
  expect(vi.getTimerCount()).toBe(0);
});

it('still rejects a stalled operation at its deadline', async () => {
  vi.useFakeTimers();
  const result = withBuildTimeout(new Promise(() => {}), 180000, 'feed timed out');
  const assertion = expect(result).rejects.toThrow('feed timed out');
  await vi.advanceTimersByTimeAsync(180000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
