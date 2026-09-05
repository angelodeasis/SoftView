import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withStallGuard } from './scanGuard';

describe('withStallGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with whatever run resolves, when it finishes before any timeout', async () => {
    const promise = withStallGuard(
      (bump) => {
        bump();
        return Promise.resolve('done');
      },
      { stallTimeoutMs: 10_000 },
    );
    await expect(promise).resolves.toBe('done');
  });

  it('propagates a rejection from run that has nothing to do with stalling', async () => {
    const promise = withStallGuard(() => Promise.reject(new Error('decode error')), {
      stallTimeoutMs: 10_000,
    });
    await expect(promise).rejects.toThrow('decode error');
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const promise = withStallGuard(() => new Promise(() => {}), {
      signal: controller.signal,
      stallTimeoutMs: 10_000,
    });
    await expect(promise).rejects.toThrow(/cancelled/i);
  });

  it('rejects once the signal aborts mid-run, even though run never settles or bumps again', async () => {
    const controller = new AbortController();
    const promise = withStallGuard(
      (bump) => {
        bump();
        return new Promise(() => {}); // never settles on its own
      },
      { signal: controller.signal, stallTimeoutMs: 10_000 },
    );
    controller.abort();
    await expect(promise).rejects.toThrow(/cancelled/i);
  });

  it('rejects with a stall error if bump is never called within stallTimeoutMs', async () => {
    const promise = withStallGuard(() => new Promise(() => {}), { stallTimeoutMs: 5_000 });
    const assertion = expect(promise).rejects.toThrow(/stalled/i);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it('a bump resets the clock, so periodic progress avoids a stall even past the original window', async () => {
    let cancelled = false;
    const promise = withStallGuard(
      (bump) => {
        const id = setInterval(bump, 1_000);
        return new Promise((resolve) => {
          setTimeout(() => {
            clearInterval(id);
            cancelled = true;
            resolve('ok');
          }, 12_000);
        });
      },
      { stallTimeoutMs: 5_000 },
    );
    await vi.advanceTimersByTimeAsync(12_000);
    await expect(promise).resolves.toBe('ok');
    expect(cancelled).toBe(true);
  });

  it('does not reject with a stall once run has already resolved', async () => {
    const promise = withStallGuard(
      (bump) => {
        bump();
        return Promise.resolve('finished');
      },
      { stallTimeoutMs: 1_000 },
    );
    await expect(promise).resolves.toBe('finished');
    // If the stall timer weren't cleaned up, this would fire a rejected promise with
    // nothing listening — vitest fails the test on an unhandled rejection.
    await vi.advanceTimersByTimeAsync(5_000);
  });
});
