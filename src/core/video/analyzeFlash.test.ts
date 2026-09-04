import { describe, expect, it } from 'vitest';
import { normalizeEvents } from '../events/normalize';
import { makeTimeSeries, type TimeSeries } from '../signal/timeSeries';
import { genBrightnessSeries, type BrightnessEventSpec } from '../testing/generators';
import { scoreDetections } from '../testing/groundTruth';
import { analyzeVisualFlash } from './analyzeFlash';

function run(events: readonly BrightnessEventSpec[], durationSec: number, hopSec = 1 / 30) {
  const { series, groundTruth } = genBrightnessSeries({ durationSec, hopSec, events });
  const raw = analyzeVisualFlash({ luminance: series });
  const normalized = normalizeEvents(raw, { durationSec });
  return { normalized, groundTruth };
}

const only = <T extends { kind: string }>(events: readonly T[], kind: string): T[] =>
  events.filter((e) => e.kind === kind);

describe('analyzeVisualFlash', () => {
  it('flags a 3 Hz flashing region', () => {
    const { normalized, groundTruth } = run(
      [{ kind: 'flashing', fromSec: 3, toSec: 7, hz: 3, low: 0.1, high: 0.9 }],
      10,
    );
    expect(only(normalized, 'flashing')).toHaveLength(1);
    expect(
      scoreDetections(groundTruth, only(normalized, 'flashing'), { toleranceSec: 1 }).recall,
    ).toBe(1);
  });

  it('rates faster flashing as more severe', () => {
    const slow = run(
      [{ kind: 'flashing', fromSec: 2, toSec: 6, hz: 3, low: 0.1, high: 0.9 }],
      8,
    ).normalized;
    const fast = run(
      [{ kind: 'flashing', fromSec: 2, toSec: 6, hz: 12, low: 0.1, high: 0.9 }],
      8,
    ).normalized;
    expect(only(fast, 'flashing')[0].severityScore).toBeGreaterThan(
      only(slow, 'flashing')[0].severityScore,
    );
  });

  it('does not flag a slow 1 Hz oscillation as flashing', () => {
    const { normalized } = run(
      [{ kind: 'flashing', fromSec: 2, toSec: 8, hz: 1, low: 0.1, high: 0.9 }],
      10,
    );
    expect(only(normalized, 'flashing')).toHaveLength(0);
  });

  it('still flags fast flashing when the sampling aliases it', () => {
    // A 12 Hz flash sampled at 10 Hz — well below Nyquist; the transition count folds
    // down but the window still swings the full range and crosses its mean often.
    const { normalized } = run(
      [{ kind: 'flashing', fromSec: 3, toSec: 8, hz: 12, low: 0.1, high: 0.9 }],
      10,
      1 / 10,
    );
    expect(only(normalized, 'flashing')).toHaveLength(1);
  });

  it('flags a single bright flash as a luminance-spike, not flashing or a scene-change', () => {
    const { normalized } = run(
      [{ kind: 'luminance-spike', atSec: 5, durSec: 0.3, from: 0.2, to: 0.95 }],
      10,
    );
    expect(only(normalized, 'luminance-spike')).toHaveLength(1);
    expect(only(normalized, 'flashing')).toHaveLength(0);
    expect(only(normalized, 'scene-change')).toHaveLength(0);
  });

  it('does not mistake a brief flash for a persistent cut when nothing follows it', () => {
    // Regression (found via real-browser testing): a short bright flash on an otherwise
    // steady dark background, with nothing else happening afterwards, used to look like
    // a persistent scene-change right at the flash's trailing edge — the "before" window
    // there is contaminated by the flash itself, and the video genuinely stays dark
    // afterwards, so the old check read that as a lasting shift. That false scene-change
    // then suppressed the real spike (spikes are excluded near a scene boundary), and
    // seeking to it landed after the flash instead of on it.
    const { series } = genBrightnessSeries({
      durationSec: 6,
      hopSec: 1 / 30,
      baseline: 0.24,
      events: [{ kind: 'luminance-spike', atSec: 4, durSec: 0.33, from: 0.24, to: 0.92 }],
    });
    const normalized = normalizeEvents(analyzeVisualFlash({ luminance: series }), {
      durationSec: 6,
    });

    expect(only(normalized, 'scene-change')).toHaveLength(0);
    const spikes = only(normalized, 'luminance-spike');
    expect(spikes).toHaveLength(1);
    expect(spikes[0].peakTime).toBeGreaterThanOrEqual(4);
    expect(spikes[0].peakTime).toBeLessThan(4.4);
  });

  it('flags a persistent brightness shift as a low-severity scene-change, not a spike', () => {
    const { normalized } = run([{ kind: 'scene-change', atSec: 4, from: 0.3, to: 0.7 }], 10);
    const scene = only(normalized, 'scene-change');
    expect(scene).toHaveLength(1);
    expect(scene[0].severity).toBe('low');
    expect(only(normalized, 'luminance-spike')).toHaveLength(0);
  });

  it('finds nothing in steady brightness', () => {
    const { normalized } = run([], 10);
    expect(normalized).toHaveLength(0);
  });

  it('detects flashing on an irregularly spaced series', () => {
    const { series } = genBrightnessSeries({
      durationSec: 10,
      hopSec: 1 / 30,
      jitterSec: 0.01,
      seed: 4,
      events: [{ kind: 'flashing', fromSec: 3, toSec: 7, hz: 4, low: 0.1, high: 0.9 }],
    });
    const events = normalizeEvents(analyzeVisualFlash({ luminance: series }), { durationSec: 10 });
    expect(only(events, 'flashing')).toHaveLength(1);
  });

  it('recovers every event in a combined signal', () => {
    const specs: BrightnessEventSpec[] = [
      { kind: 'flashing', fromSec: 2, toSec: 5, hz: 5, low: 0.1, high: 0.9 },
      { kind: 'luminance-spike', atSec: 10, durSec: 0.3, from: 0.3, to: 0.95 },
      { kind: 'scene-change', atSec: 16, from: 0.3, to: 0.75 },
    ];
    const { normalized, groundTruth } = run(specs, 22);
    expect(scoreDetections(groundTruth, normalized, { toleranceSec: 1.5 }).recall).toBe(1);
  });

  it('rejects nothing structurally on an empty series', () => {
    const empty: TimeSeries = makeTimeSeries(new Float64Array(0), new Float32Array(0));
    expect(analyzeVisualFlash({ luminance: empty })).toEqual([]);
  });
});
