import { describe, expect, it } from 'vitest';
import type { SensoryEvent } from '../core/events/model';
import { seekTarget } from './seekTarget';

const event = (over: Partial<SensoryEvent> = {}): SensoryEvent => ({
  id: 'x',
  channel: 'audio',
  kind: 'loudness-spike',
  startTime: 10,
  endTime: 11,
  severityScore: 0.5,
  severity: 'moderate',
  confidence: 0.6,
  metrics: {},
  ...over,
});

describe('seekTarget', () => {
  it('lands a short lead-in before the event start, ignoring peakTime', () => {
    expect(seekTarget(event({ startTime: 10, peakTime: 10.8 }))).toBeCloseTo(9.8, 5);
  });

  it('is unaffected by peakTime being absent', () => {
    expect(seekTarget(event({ startTime: 5, peakTime: undefined }))).toBeCloseTo(4.8, 5);
  });

  it('never goes negative for an event near the start of the media', () => {
    expect(seekTarget(event({ startTime: 0.05 }))).toBe(0);
  });
});
