import { describe, expect, it } from 'vitest';
import { sampleCount } from '../signal/timeSeries';
import { computeLoudness, DBFS_FLOOR } from './loudness';

const SAMPLE_RATE = 16000;

/** A sine of the given linear amplitude at `hz`, `seconds` long. */
function sine(
  amplitude: number,
  seconds: number,
  hz = 220,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const pcm = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return pcm;
}

describe('computeLoudness', () => {
  it('reads a full-scale sine as ~-3 dBFS RMS and ~0 dBFS peak', () => {
    const { rms, peak } = computeLoudness(sine(1, 1), SAMPLE_RATE);
    const mid = Math.floor(sampleCount(rms) / 2);
    expect(rms.values[mid]).toBeCloseTo(-3.01, 1);
    expect(peak.values[mid]).toBeCloseTo(0, 1);
  });

  it('reports the floor for digital silence', () => {
    const { rms, peak } = computeLoudness(new Float32Array(SAMPLE_RATE), SAMPLE_RATE);
    expect(rms.values[rms.values.length - 1]).toBe(DBFS_FLOOR);
    expect(peak.values[peak.values.length - 1]).toBe(DBFS_FLOOR);
  });

  it('tracks a mid-buffer level step in the RMS series', () => {
    const quiet = sine(0.01, 2); // ~-40 dBFS
    const loud = sine(0.5, 2); // ~-9 dBFS
    const pcm = new Float32Array(quiet.length + loud.length);
    pcm.set(quiet, 0);
    pcm.set(loud, quiet.length);

    const { rms } = computeLoudness(pcm, SAMPLE_RATE);
    const before = rms.values[Math.round((1 / 0.02) * 1)]; // ~1 s
    const after = rms.values[Math.round((1 / 0.02) * 3)]; // ~3 s
    expect(before).toBeLessThan(-30);
    expect(after).toBeGreaterThan(-14);
  });

  it('produces roughly duration / hopSec samples with ascending times', () => {
    const { rms } = computeLoudness(sine(0.3, 5), SAMPLE_RATE, { hopSec: 0.02 });
    expect(sampleCount(rms)).toBeGreaterThan(240);
    expect(sampleCount(rms)).toBeLessThan(260);
    for (let i = 1; i < rms.times.length; i++) {
      expect(rms.times[i]).toBeGreaterThan(rms.times[i - 1]);
    }
  });

  it('handles a buffer shorter than one hop', () => {
    const { rms } = computeLoudness(new Float32Array(64), SAMPLE_RATE);
    expect(sampleCount(rms)).toBe(1);
  });

  it('rejects a non-positive sample rate', () => {
    expect(() => computeLoudness(new Float32Array(10), 0)).toThrow(RangeError);
  });
});
