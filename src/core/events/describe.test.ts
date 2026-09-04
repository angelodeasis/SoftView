import { describe, expect, it } from 'vitest';
import type { SensoryEventKind } from './model';
import { channelLabel, confidencePhrase, eventKindLabel, severityLabel } from './describe';

const ALL_KINDS: SensoryEventKind[] = [
  'loudness-spike',
  'sustained-loudness',
  'clipping',
  'flashing',
  'red-flash',
  'luminance-spike',
  'scene-change',
];

describe('event descriptions', () => {
  it('has a non-empty label for every event kind', () => {
    for (const kind of ALL_KINDS) {
      expect(eventKindLabel(kind).length).toBeGreaterThan(0);
    }
  });

  it('labels severity buckets', () => {
    expect(severityLabel('low')).toBe('Low');
    expect(severityLabel('moderate')).toBe('Moderate');
    expect(severityLabel('high')).toBe('High');
  });

  it('phrases confidence tentatively', () => {
    expect(confidencePhrase(0.9)).toBe('likely');
    expect(confidencePhrase(0.5)).toBe('possible');
    expect(confidencePhrase(0.1)).toBe('uncertain');
  });

  it('labels channels', () => {
    expect(channelLabel('audio')).toBe('Audio');
    expect(channelLabel('visual')).toBe('Visual');
  });

  it('never uses alarming or absolute language', () => {
    const forbidden = /\b(danger(ous)?|unsafe|\bsafe\b|harm|seizure|guarantee|will cause)\b/i;
    const strings = [
      ...ALL_KINDS.map(eventKindLabel),
      severityLabel('low'),
      severityLabel('moderate'),
      severityLabel('high'),
      confidencePhrase(0.9),
      confidencePhrase(0.5),
      confidencePhrase(0.1),
    ];
    for (const s of strings) expect(s).not.toMatch(forbidden);
  });
});
