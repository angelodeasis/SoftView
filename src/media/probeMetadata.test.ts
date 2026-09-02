import { describe, expect, it, vi } from 'vitest';
import { probeMetadata, type ProbeMediaElement } from './probeMetadata';

function fakeElement(overrides: Partial<ProbeMediaElement> = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const el: ProbeMediaElement = {
    preload: '',
    src: '',
    duration: 0,
    videoWidth: 0,
    videoHeight: 0,
    addEventListener: (type, listener) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type, listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    },
    removeAttribute: vi.fn(),
    load: vi.fn(),
    ...overrides,
  };
  return {
    el,
    emit: (type: string) => (listeners[type] ?? []).forEach((l) => l()),
    remaining: () => Object.values(listeners).flat().length,
  };
}

describe('probeMetadata', () => {
  it('resolves with the duration for audio', async () => {
    const { el, emit } = fakeElement({ duration: 42.5 });
    const result = probeMetadata('blob:x', 'audio', { createElement: () => el });
    emit('loadedmetadata');
    await expect(result).resolves.toEqual({ durationSec: 42.5 });
  });

  it('resolves with duration and dimensions for video', async () => {
    const { el, emit } = fakeElement({ duration: 10, videoWidth: 1920, videoHeight: 1080 });
    const result = probeMetadata('blob:x', 'video', { createElement: () => el });
    emit('loadedmetadata');
    await expect(result).resolves.toEqual({ durationSec: 10, width: 1920, height: 1080 });
  });

  it('omits a non-finite duration', async () => {
    const { el, emit } = fakeElement({ duration: Number.POSITIVE_INFINITY });
    const result = probeMetadata('blob:x', 'audio', { createElement: () => el });
    emit('loadedmetadata');
    await expect(result).resolves.toEqual({});
  });

  it('rejects on a media error', async () => {
    const { el, emit } = fakeElement();
    const result = probeMetadata('blob:x', 'audio', { createElement: () => el });
    emit('error');
    await expect(result).rejects.toThrow(/metadata/i);
  });

  it('rejects after the timeout', async () => {
    vi.useFakeTimers();
    const { el } = fakeElement();
    const result = probeMetadata('blob:x', 'audio', { createElement: () => el, timeoutMs: 1000 });
    const expectation = expect(result).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
  });

  it('tears the element down after settling', async () => {
    const { el, emit, remaining } = fakeElement({ duration: 5 });
    const result = probeMetadata('blob:x', 'audio', { createElement: () => el });
    emit('loadedmetadata');
    await result;
    expect(el.removeAttribute).toHaveBeenCalledWith('src');
    expect(el.load).toHaveBeenCalledOnce();
    expect(remaining()).toBe(0);
  });
});
