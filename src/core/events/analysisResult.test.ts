import { describe, expect, it } from 'vitest';
import type { MediaFacts } from '../media/types';
import { BASE_LIMITATIONS, buildAnalysisResult, type AnalyzerRun } from './analysisResult';
import type { RawEvent } from './model';

const media: MediaFacts = {
  name: 'clip.mp4',
  sizeBytes: 1_000_000,
  mimeType: 'video/mp4',
  kind: 'video',
  durationSec: 60,
};

const okRun: AnalyzerRun = {
  analyzerId: 'audio-loudness',
  version: '1',
  params: { thresholdDb: -12 },
  durationMs: 120,
  sampleCount: 3000,
  status: 'ok',
};

const rawEvent = (over: Partial<RawEvent> = {}): RawEvent => ({
  channel: 'audio',
  kind: 'loudness-spike',
  startTime: 10,
  endTime: 11,
  severityScore: 0.5,
  confidence: 0.6,
  metrics: {},
  ...over,
});

describe('buildAnalysisResult', () => {
  it('is complete only when at least one run succeeded and none failed', () => {
    expect(
      buildAnalysisResult({ media, runs: [okRun], rawEvents: [], durationSec: 60 }).status,
    ).toBe('complete');
  });

  it('is partial when any run failed or was skipped', () => {
    const result = buildAnalysisResult({
      media,
      runs: [
        okRun,
        { ...okRun, analyzerId: 'visual-flash', status: 'failed', note: 'scan stalled' },
      ],
      rawEvents: [],
      durationSec: 60,
    });
    expect(result.status).toBe('partial');
  });

  it('is partial when no analyzer ran at all', () => {
    expect(buildAnalysisResult({ media, runs: [], rawEvents: [], durationSec: 60 }).status).toBe(
      'partial',
    );
  });

  it('always includes the base limitations, then any extras', () => {
    const result = buildAnalysisResult({
      media,
      runs: [okRun],
      rawEvents: [],
      durationSec: 60,
      extraLimitations: ['Audio was analyzed but video was not.'],
    });
    expect(result.limitations.slice(0, BASE_LIMITATIONS.length)).toEqual(BASE_LIMITATIONS);
    expect(result.limitations.at(-1)).toBe('Audio was analyzed but video was not.');
  });

  it('normalizes the events it is given', () => {
    const result = buildAnalysisResult({
      media,
      runs: [okRun],
      rawEvents: [
        rawEvent({ startTime: 10, endTime: 14 }),
        rawEvent({ startTime: 13, endTime: 18 }),
        rawEvent({ startTime: -1, endTime: 500, kind: 'clipping' }),
      ],
      durationSec: 60,
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].startTime).toBe(0);
    expect(result.events[1].endTime).toBe(18);
  });

  it('defaults warnings to an empty list', () => {
    expect(
      buildAnalysisResult({ media, runs: [okRun], rawEvents: [], durationSec: 60 }).warnings,
    ).toEqual([]);
  });

  it('surfaces a failed or skipped run’s note as a warning, so partial results explain why', () => {
    const result = buildAnalysisResult({
      media,
      runs: [
        okRun,
        { ...okRun, analyzerId: 'visual-flash', status: 'failed', note: 'scan stalled' },
      ],
      rawEvents: [],
      durationSec: 60,
    });
    expect(result.warnings).toContain('scan stalled');
  });

  it('does not surface a note from a run that succeeded', () => {
    const result = buildAnalysisResult({
      media,
      runs: [{ ...okRun, note: 'not actually a problem' }],
      rawEvents: [],
      durationSec: 60,
    });
    expect(result.warnings).toEqual([]);
  });

  it('keeps caller-supplied warnings alongside any run notes', () => {
    const result = buildAnalysisResult({
      media,
      runs: [{ ...okRun, status: 'skipped', note: 'stopped early' }],
      rawEvents: [],
      durationSec: 60,
      warnings: ['a window could not be re-scanned'],
    });
    expect(result.warnings).toEqual(['a window could not be re-scanned', 'stopped early']);
  });
});
