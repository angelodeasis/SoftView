import { describe, expect, it } from 'vitest';
import { sampleCount, spanSeconds, valueAtOrBefore } from '../signal/timeSeries';
import { computeLoudness } from '../audio/loudness';
import { genAudioPcm, genBrightnessSeries, genLoudnessSeries } from './generators';

describe('genLoudnessSeries', () => {
  it('produces roughly durationSec / hopSec samples spanning the duration', () => {
    const { series } = genLoudnessSeries({ durationSec: 10, hopSec: 0.02 });
    expect(sampleCount(series)).toBe(500);
    expect(spanSeconds(series)).toBeCloseTo(10 - 0.02, 5);
  });

  it('sits at the baseline away from events and rises inside a spike', () => {
    const { series } = genLoudnessSeries({
      durationSec: 20,
      baselineDb: -50,
      events: [{ kind: 'loudness-spike', atSec: 10, durSec: 1, peakDb: -3 }],
    });
    expect(valueAtOrBefore(series, 2)).toBeCloseTo(-50, 5);
    expect(valueAtOrBefore(series, 10.5)).toBeCloseTo(-3, 5);
  });

  it('reports ground truth matching the requested spans', () => {
    const { groundTruth } = genLoudnessSeries({
      durationSec: 60,
      events: [
        { kind: 'loudness-spike', atSec: 5, durSec: 0.5, peakDb: -2 },
        { kind: 'sustained-loudness', fromSec: 20, toSec: 35, levelDb: -10 },
      ],
    });
    expect(groundTruth).toEqual([
      { channel: 'audio', kind: 'loudness-spike', startTime: 5, endTime: 5.5 },
      { channel: 'audio', kind: 'sustained-loudness', startTime: 20, endTime: 35 },
    ]);
  });

  it('is deterministic for a given seed and varies with noise', () => {
    const opts = { durationSec: 5, noiseDb: 6, seed: 42 } as const;
    const a = genLoudnessSeries(opts);
    const b = genLoudnessSeries(opts);
    expect(Array.from(a.series.values)).toEqual(Array.from(b.series.values));
    expect(Array.from(a.series.values)).not.toEqual(
      Array.from(genLoudnessSeries({ ...opts, seed: 7 }).series.values),
    );
  });
});

describe('genBrightnessSeries', () => {
  it('alternates between low and high across a flashing window', () => {
    const { series } = genBrightnessSeries({
      durationSec: 4,
      hopSec: 0.01,
      baseline: 0.5,
      events: [{ kind: 'flashing', fromSec: 1, toSec: 3, hz: 3, low: 0.1, high: 0.9 }],
    });
    const inWindow: number[] = [];
    for (let i = 0; i < series.times.length; i++) {
      if (series.times[i] >= 1 && series.times[i] < 3) inWindow.push(series.values[i]);
    }
    expect(Math.min(...inWindow)).toBeCloseTo(0.1, 5);
    expect(Math.max(...inWindow)).toBeCloseTo(0.9, 5);
  });

  it('keeps jittered sample times non-decreasing and in range', () => {
    const { series } = genBrightnessSeries({ durationSec: 30, jitterSec: 0.05, seed: 3 });
    for (let i = 1; i < series.times.length; i++) {
      expect(series.times[i]).toBeGreaterThanOrEqual(series.times[i - 1]);
    }
    expect(series.times[0]).toBeGreaterThanOrEqual(0);
    expect(series.times.at(-1)).toBeLessThanOrEqual(30);
  });

  it('clamps brightness to 0..1', () => {
    const { series } = genBrightnessSeries({
      durationSec: 5,
      events: [{ kind: 'luminance-spike', atSec: 2, durSec: 1, from: 0.5, to: 5 }],
    });
    expect(Math.max(...Array.from(series.values))).toBeLessThanOrEqual(1);
  });
});

describe('genAudioPcm', () => {
  it('produces durationSec * sampleRate samples all within [-1, 1]', () => {
    const { pcm, sampleRate } = genAudioPcm({ durationSec: 2, sampleRate: 16000 });
    expect(pcm.length).toBe(32000);
    expect(sampleRate).toBe(16000);
    for (const s of pcm) expect(Math.abs(s)).toBeLessThanOrEqual(1);
  });

  it('hits the requested loudness levels (checked through computeLoudness)', () => {
    const { pcm } = genAudioPcm({
      durationSec: 12,
      sampleRate: 16000,
      baselineDb: -45,
      events: [{ kind: 'sustained-loudness', fromSec: 4, toSec: 9, levelDb: -9 }],
    });
    const { rms } = computeLoudness(pcm, 16000);
    // A sine at amplitude 10^(-9/20) reads ~3 dB below its level in RMS terms.
    const at = (t: number) => rms.values[Math.round(t / 0.02)];
    expect(at(1)).toBeLessThan(-40);
    expect(at(6.5)).toBeGreaterThan(-15);
    expect(at(6.5)).toBeLessThan(-9);
  });

  it('drives clipping regions to ~0 dBFS peak', () => {
    const { pcm } = genAudioPcm({
      durationSec: 6,
      sampleRate: 16000,
      events: [{ kind: 'clipping', fromSec: 2, toSec: 4 }],
    });
    const { peak } = computeLoudness(pcm, 16000);
    expect(peak.values[Math.round(3 / 0.02)]).toBeCloseTo(0, 1);
  });

  it('reports ground truth mirroring the specs', () => {
    const { groundTruth } = genAudioPcm({
      durationSec: 10,
      events: [
        { kind: 'loudness-spike', atSec: 3, durSec: 0.4, levelDb: -3 },
        { kind: 'clipping', fromSec: 6, toSec: 7 },
      ],
    });
    expect(groundTruth).toEqual([
      { channel: 'audio', kind: 'loudness-spike', startTime: 3, endTime: 3.4 },
      { channel: 'audio', kind: 'clipping', startTime: 6, endTime: 7 },
    ]);
  });

  it('is deterministic for a given seed', () => {
    const opts = { durationSec: 3, sampleRate: 16000, noiseAmp: 0.02, seed: 9 } as const;
    expect(Array.from(genAudioPcm(opts).pcm)).toEqual(Array.from(genAudioPcm(opts).pcm));
  });
});
