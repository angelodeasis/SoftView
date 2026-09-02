import { describe, expect, it } from 'vitest';
import { largeFileAdvisory } from './largeFileAdvisory';

const MB = 1024 * 1024;

describe('largeFileAdvisory', () => {
  it('says nothing for short media', () => {
    expect(largeFileAdvisory({ sizeBytes: 20 * MB, durationSec: 10 * 60 })).toBeNull();
  });

  it('gives an info-level heads-up for moderately long media', () => {
    const advisory = largeFileAdvisory({ sizeBytes: 60 * MB, durationSec: 45 * 60 });
    expect(advisory?.level).toBe('info');
  });

  it('gives a warning for very long media, with an approximate duration', () => {
    const advisory = largeFileAdvisory({ sizeBytes: 200 * MB, durationSec: 2 * 3600 });
    expect(advisory?.level).toBe('warn');
    expect(advisory?.message).toContain('2h 0m');
  });

  it('falls back to file size when the duration is unknown', () => {
    expect(largeFileAdvisory({ sizeBytes: 800 * MB })?.level).toBe('info');
    expect(largeFileAdvisory({ sizeBytes: 10 * MB })).toBeNull();
  });

  it('ignores a non-finite or zero duration', () => {
    expect(largeFileAdvisory({ sizeBytes: 10 * MB, durationSec: Number.NaN })).toBeNull();
    expect(largeFileAdvisory({ sizeBytes: 800 * MB, durationSec: 0 })?.level).toBe('info');
  });
});
