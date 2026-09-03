import { describe, expect, it } from 'vitest';
import type { RawEvent } from './model';
import { normalizeEvents } from './normalize';

function rawEvent(over: Partial<RawEvent> = {}): RawEvent {
  return {
    channel: 'audio',
    kind: 'loudness-spike',
    startTime: 10,
    endTime: 11,
    severityScore: 0.5,
    confidence: 0.5,
    metrics: {},
    ...over,
  };
}

describe('normalizeEvents', () => {
  it('clamps times to the media timeline', () => {
    const [e] = normalizeEvents([rawEvent({ startTime: -5, endTime: 200 })], { durationSec: 100 });
    expect(e.startTime).toBe(0);
    expect(e.endTime).toBe(100);
  });

  it('drops events with no positive duration after clamping', () => {
    const events = normalizeEvents(
      [rawEvent({ startTime: 5, endTime: 5 }), rawEvent({ startTime: 120, endTime: 130 })],
      { durationSec: 100 },
    );
    expect(events).toHaveLength(0);
  });

  it('clamps severityScore and confidence into 0..1 and keeps severity consistent', () => {
    const [e] = normalizeEvents([rawEvent({ severityScore: 5, confidence: -1 })], {
      durationSec: 100,
    });
    expect(e.severityScore).toBe(1);
    expect(e.confidence).toBe(0);
    expect(e.severity).toBe('high');
  });

  it('coerces NaN intensity fields to zero rather than throwing', () => {
    const [e] = normalizeEvents([rawEvent({ severityScore: Number.NaN })], { durationSec: 100 });
    expect(e.severityScore).toBe(0);
    expect(e.severity).toBe('low');
  });

  it('merges overlapping events of the same channel and kind', () => {
    const events = normalizeEvents(
      [
        rawEvent({ startTime: 10, endTime: 15, severityScore: 0.4 }),
        rawEvent({ startTime: 14, endTime: 20, severityScore: 0.8 }),
      ],
      { durationSec: 100 },
    );
    expect(events).toHaveLength(1);
    expect(events[0].startTime).toBe(10);
    expect(events[0].endTime).toBe(20);
    expect(events[0].severityScore).toBe(0.8);
  });

  it('merges events separated by no more than mergeGapSec, but not further', () => {
    const near = normalizeEvents(
      [rawEvent({ startTime: 10, endTime: 12 }), rawEvent({ startTime: 13, endTime: 15 })],
      { durationSec: 100, mergeGapSec: 1 },
    );
    expect(near).toHaveLength(1);

    const far = normalizeEvents(
      [rawEvent({ startTime: 10, endTime: 12 }), rawEvent({ startTime: 13.5, endTime: 15 })],
      { durationSec: 100, mergeGapSec: 1 },
    );
    expect(far).toHaveLength(2);
  });

  it('never merges across channel or kind', () => {
    const events = normalizeEvents(
      [
        rawEvent({ channel: 'audio', kind: 'loudness-spike', startTime: 10, endTime: 12 }),
        rawEvent({ channel: 'visual', kind: 'flashing', startTime: 10, endTime: 12 }),
        rawEvent({ channel: 'audio', kind: 'sustained-loudness', startTime: 10, endTime: 12 }),
      ],
      { durationSec: 100 },
    );
    expect(events).toHaveLength(3);
  });

  it('combines confidence as a probabilistic OR', () => {
    const [e] = normalizeEvents(
      [
        rawEvent({ startTime: 10, endTime: 12, confidence: 0.5 }),
        rawEvent({ startTime: 11, endTime: 13, confidence: 0.5 }),
      ],
      { durationSec: 100 },
    );
    expect(e.confidence).toBeCloseTo(0.75);
  });

  it('lets the highest-severity contributor win metric and peak-time collisions', () => {
    const [e] = normalizeEvents(
      [
        rawEvent({
          startTime: 10,
          endTime: 14,
          severityScore: 0.2,
          peakTime: 11,
          metrics: { deltaDb: 3, onlyLow: 1 },
        }),
        rawEvent({
          startTime: 12,
          endTime: 16,
          severityScore: 0.9,
          peakTime: 13,
          metrics: { deltaDb: 9, onlyHigh: 1 },
        }),
      ],
      { durationSec: 100 },
    );
    expect(e.peakTime).toBe(13);
    expect(e.metrics).toEqual({ deltaDb: 9, onlyLow: 1, onlyHigh: 1 });
  });

  it('assigns deterministic ids from channel, kind and start time', () => {
    const [a] = normalizeEvents([rawEvent({ startTime: 12.3456, endTime: 15 })], {
      durationSec: 100,
    });
    const [b] = normalizeEvents([rawEvent({ startTime: 12.3456, endTime: 15 })], {
      durationSec: 100,
    });
    expect(a.id).toBe('audio:loudness-spike:12346');
    expect(a.id).toBe(b.id);
  });

  it('sorts output by start time, then channel, then kind', () => {
    const events = normalizeEvents(
      [
        rawEvent({ channel: 'visual', kind: 'flashing', startTime: 30, endTime: 31 }),
        rawEvent({ channel: 'audio', kind: 'loudness-spike', startTime: 10, endTime: 11 }),
        rawEvent({ channel: 'visual', kind: 'luminance-spike', startTime: 10, endTime: 11 }),
      ],
      { durationSec: 100 },
    );
    expect(events.map((e) => e.id)).toEqual([
      'audio:loudness-spike:10000',
      'visual:luminance-spike:10000',
      'visual:flashing:30000',
    ]);
  });
});
