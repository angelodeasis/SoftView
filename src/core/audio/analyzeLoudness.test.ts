import { describe, expect, it } from 'vitest';
import { normalizeEvents } from '../events/normalize';
import { genAudioPcm, genLoudnessSeries, type PcmEventSpec } from '../testing/generators';
import { scoreDetections } from '../testing/groundTruth';
import { makeTimeSeries, type TimeSeries } from '../signal/timeSeries';
import { computeLoudness } from './loudness';
import { analyzeAudioLoudness, analyzeLoudness } from './analyzeLoudness';

const SAMPLE_RATE = 16000;

/** Rebuild a series with every `n`th sample removed, to break even spacing. */
function dropEvery(ts: TimeSeries, n: number): TimeSeries {
  const times: number[] = [];
  const values: number[] = [];
  for (let i = 0; i < ts.times.length; i++) {
    if (i % n !== 0) {
      times.push(ts.times[i]);
      values.push(ts.values[i]);
    }
  }
  return makeTimeSeries(Float64Array.from(times), Float32Array.from(values));
}

function run(events: readonly PcmEventSpec[], durationSec: number) {
  const { pcm, groundTruth } = genAudioPcm({ durationSec, sampleRate: SAMPLE_RATE, events });
  const raw = analyzeAudioLoudness(pcm, SAMPLE_RATE);
  const normalized = normalizeEvents(raw, { durationSec });
  return { normalized, groundTruth };
}

const kinds = (events: readonly { kind: string }[]) => events.map((e) => e.kind).sort();

describe('analyzeLoudness', () => {
  it('flags a sudden loud burst as a loudness-spike', () => {
    const { normalized, groundTruth } = run(
      [{ kind: 'loudness-spike', atSec: 5, durSec: 0.3, levelDb: -3 }],
      10,
    );
    const spikes = normalized.filter((e) => e.kind === 'loudness-spike');
    expect(spikes).toHaveLength(1);
    const score = scoreDetections(groundTruth, spikes, { toleranceSec: 0.6 });
    expect(score.recall).toBe(1);
  });

  it('flags a long loud region as sustained-loudness', () => {
    const { normalized } = run(
      [{ kind: 'sustained-loudness', fromSec: 3, toSec: 12, levelDb: -8 }],
      16,
    );
    const sustained = normalized.filter((e) => e.kind === 'sustained-loudness');
    expect(sustained).toHaveLength(1);
    expect(sustained[0].endTime - sustained[0].startTime).toBeGreaterThan(6);
  });

  it('flags a hard-clipped region as clipping', () => {
    const { normalized, groundTruth } = run([{ kind: 'clipping', fromSec: 4, toSec: 5.5 }], 10);
    const clipping = normalized.filter((e) => e.kind === 'clipping');
    expect(clipping).toHaveLength(1);
    expect(scoreDetections(groundTruth, clipping, { toleranceSec: 0.6 }).recall).toBe(1);
  });

  it('finds nothing in quiet, uneventful audio', () => {
    const { normalized } = run([], 10);
    expect(normalized).toHaveLength(0);
  });

  it('recovers every event in a combined signal', () => {
    const specs: PcmEventSpec[] = [
      { kind: 'loudness-spike', atSec: 2, durSec: 0.3, levelDb: -2 },
      { kind: 'sustained-loudness', fromSec: 8, toSec: 16, levelDb: -9 },
      { kind: 'clipping', fromSec: 20, toSec: 21.5 },
    ];
    const { normalized, groundTruth } = run(specs, 25);
    const score = scoreDetections(groundTruth, normalized, { toleranceSec: 1 });
    expect(score.recall).toBe(1);
    expect(score.precision).toBeGreaterThanOrEqual(0.5);
  });

  it('does not flag a jump from silence to a quiet level', () => {
    // -35 dBFS is a clear rise from the ~-45 baseline but below spikeFloorDb (-20).
    const { normalized } = run(
      [{ kind: 'loudness-spike', atSec: 5, durSec: 0.3, levelDb: -35 }],
      10,
    );
    expect(normalized.filter((e) => e.kind === 'loudness-spike')).toHaveLength(0);
  });

  it('flags a loud moment that only rises a few dB over a tense-hush baseline', () => {
    // Regression: a real jump-scare clip's scream measured just ~6.5 dB over its own
    // pre-scream baseline (quieter build-up, not silence) despite being loud in
    // absolute terms (well above spikeFloorDb) — missed entirely at the old 10 dB
    // spikeRiseDb default. Numbers (riseDb 6.47 / peakDb −15.74 / baselineDb −22.21) are
    // the real browser-measured values, read back from the app's own event-details UI —
    // an earlier offline ffmpeg-decode estimate of the same clip was a few dB off.
    const { series } = genLoudnessSeries({
      durationSec: 8,
      baselineDb: -22.21,
      events: [{ kind: 'loudness-spike', atSec: 5, durSec: 0.3, peakDb: -15.74 }],
    });
    const spikes = analyzeLoudness({ rms: series }).filter((e) => e.kind === 'loudness-spike');
    expect(spikes).toHaveLength(1);
    expect(spikes[0].startTime).toBeLessThan(5.3);
    expect(spikes[0].endTime).toBeGreaterThan(5);
  });

  it('lands two equally loud spikes in the same severity bucket, regardless of rise', () => {
    // Same clip: the user reported too little audio ducking on the scream even once it
    // was detected — its severityScore (driven mostly by the small rise) landed as
    // 'low', then 'moderate' after a first pass, despite peaking about as loud as the
    // clip's other, clearly 'high' rise-from-silence spike. Confirmed with the user that
    // both should land as 'high': severityScore is now driven almost entirely by
    // absolute peak loudness, since riseDb's job is detection (alongside spikeFloorDb),
    // not ranking how loud something turned out to be once it's already been flagged.
    // peakDb here is the real browser-measured value for the scream (see the test above).
    const quietRiseFromHush = genLoudnessSeries({
      durationSec: 8,
      baselineDb: -22.21,
      events: [{ kind: 'loudness-spike', atSec: 5, durSec: 0.3, peakDb: -15.74 }],
    }).series;
    const loudRiseFromSilence = genLoudnessSeries({
      durationSec: 8,
      baselineDb: -50,
      events: [{ kind: 'loudness-spike', atSec: 5, durSec: 0.3, peakDb: -15.74 }],
    }).series;

    const [modestRise] = analyzeLoudness({ rms: quietRiseFromHush });
    const [bigRise] = analyzeLoudness({ rms: loudRiseFromSilence });

    expect(modestRise.severityScore).toBeGreaterThanOrEqual(0.66); // both clearly 'high'
    expect(bigRise.severityScore).toBeGreaterThanOrEqual(0.66);
  });

  it('works from a pre-computed series and skips clipping when no peak is given', () => {
    const { pcm } = genAudioPcm({
      durationSec: 10,
      sampleRate: SAMPLE_RATE,
      events: [{ kind: 'clipping', fromSec: 4, toSec: 6 }],
    });
    const { rms } = computeLoudness(pcm, SAMPLE_RATE);
    const events = analyzeLoudness({ rms });
    expect(events.every((e) => e.kind !== 'clipping')).toBe(true);
  });

  it('detects on an irregularly spaced series', () => {
    const { pcm } = genAudioPcm({
      durationSec: 12,
      sampleRate: SAMPLE_RATE,
      events: [{ kind: 'sustained-loudness', fromSec: 3, toSec: 10, levelDb: -8 }],
    });
    const { rms, peak } = computeLoudness(pcm, SAMPLE_RATE);
    const events = analyzeLoudness({ rms: dropEvery(rms, 7), peak: dropEvery(peak, 7) });
    expect(events.some((e) => e.kind === 'sustained-loudness')).toBe(true);
  });

  it('keeps kinds distinct from the raw detector output', () => {
    const { normalized } = run(
      [
        { kind: 'loudness-spike', atSec: 2, durSec: 0.3, levelDb: -2 },
        { kind: 'clipping', fromSec: 6, toSec: 7.5 },
      ],
      10,
    );
    expect(kinds(normalized)).toContain('clipping');
    expect(kinds(normalized)).toContain('loudness-spike');
  });
});
