import { describe, expect, it } from 'vitest';
import { resampleLinear } from './resample';

const sine = (hz: number, rate: number, seconds: number) => {
  const pcm = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return pcm;
};

const peak = (pcm: Float32Array) => pcm.reduce((m, s) => Math.max(m, Math.abs(s)), 0);

describe('resampleLinear', () => {
  it('returns a copy when the rate is unchanged', () => {
    const source = Float32Array.from([1, 2, 3]);
    const out = resampleLinear(source, 16000, 16000);
    out[0] = 9;
    expect(Array.from(source)).toEqual([1, 2, 3]);
  });

  it('doubles the length when upsampling 2x and keeps the endpoints', () => {
    const out = resampleLinear(Float32Array.from([0, 1, 0, -1]), 8000, 16000);
    expect(out).toHaveLength(8);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(1, 5);
  });

  it('shrinks the length when downsampling 48k -> 16k', () => {
    const out = resampleLinear(new Float32Array(4800), 48000, 16000);
    expect(out).toHaveLength(1600);
  });

  it('roughly preserves a mid-band sine amplitude through 44.1k -> 16k', () => {
    const out = resampleLinear(sine(300, 44100, 0.5), 44100, 16000);
    expect(peak(out)).toBeGreaterThan(0.9);
    expect(peak(out)).toBeLessThanOrEqual(1.0001);
  });

  it('returns a copy for empty input', () => {
    expect(resampleLinear(new Float32Array(0), 44100, 16000)).toEqual(new Float32Array(0));
  });

  it('rejects a non-positive rate', () => {
    expect(() => resampleLinear(new Float32Array(4), 0, 16000)).toThrow(RangeError);
  });
});
