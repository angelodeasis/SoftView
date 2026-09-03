import { describe, expect, it } from 'vitest';
import type { SensoryEvent } from '../events/model';
import { scoreDetections, type GroundTruthEvent } from './groundTruth';

const gt = (over: Partial<GroundTruthEvent> = {}): GroundTruthEvent => ({
  channel: 'audio',
  kind: 'loudness-spike',
  startTime: 10,
  endTime: 12,
  ...over,
});

const detected = (over: Partial<SensoryEvent> = {}): SensoryEvent => ({
  id: 'x',
  channel: 'audio',
  kind: 'loudness-spike',
  startTime: 10,
  endTime: 12,
  severityScore: 0.5,
  severity: 'moderate',
  confidence: 0.5,
  metrics: {},
  ...over,
});

describe('scoreDetections', () => {
  it('scores a perfect match as precision 1, recall 1', () => {
    const score = scoreDetections([gt()], [detected()]);
    expect(score.precision).toBe(1);
    expect(score.recall).toBe(1);
    expect(score.truePositives).toBe(1);
  });

  it('a missed event lowers recall but not precision', () => {
    const score = scoreDetections(
      [gt({ startTime: 10 }), gt({ startTime: 40, endTime: 42 })],
      [detected({ startTime: 10 })],
    );
    expect(score.recall).toBe(0.5);
    expect(score.precision).toBe(1);
    expect(score.falseNegatives).toBe(1);
    expect(score.unmatchedExpected).toHaveLength(1);
  });

  it('an extra detection lowers precision but not recall', () => {
    const score = scoreDetections([gt()], [detected(), detected({ startTime: 40, endTime: 42 })]);
    expect(score.recall).toBe(1);
    expect(score.precision).toBe(0.5);
    expect(score.falsePositives).toBe(1);
    expect(score.unmatchedActual).toHaveLength(1);
  });

  it('does not match across event kind', () => {
    const score = scoreDetections(
      [gt({ kind: 'clipping' })],
      [detected({ kind: 'loudness-spike' })],
    );
    expect(score.truePositives).toBe(0);
    expect(score.recall).toBe(0);
  });

  it('matches a near miss within the tolerance window and not beyond it', () => {
    const near = scoreDetections(
      [gt({ startTime: 10, endTime: 12 })],
      [detected({ startTime: 12.4, endTime: 13 })],
    );
    expect(near.truePositives).toBe(1);

    const far = scoreDetections(
      [gt({ startTime: 10, endTime: 12 })],
      [detected({ startTime: 12.6, endTime: 13 })],
    );
    expect(far.truePositives).toBe(0);
  });

  it('handles empty inputs', () => {
    expect(scoreDetections([], []).recall).toBe(1);
    expect(scoreDetections([], []).precision).toBe(0);
    expect(scoreDetections([], [detected()]).precision).toBe(0);
  });

  it('matches one-to-one, best overlap first', () => {
    const score = scoreDetections(
      [gt({ startTime: 10, endTime: 20 })],
      [detected({ startTime: 18, endTime: 22 }), detected({ startTime: 10, endTime: 20 })],
    );
    expect(score.truePositives).toBe(1);
    expect(score.matches[0].actual.startTime).toBe(10);
  });
});
