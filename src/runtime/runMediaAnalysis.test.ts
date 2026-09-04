import { describe, expect, it, vi } from 'vitest';
import { BASE_LIMITATIONS } from '../core/events/analysisResult';
import type { AnalyzerRun } from '../core/events/analysisResult';
import type { RawEvent } from '../core/events/model';
import type { MediaFacts } from '../core/media/types';
import type { AudioTrackAnalysis } from '../adapters/audio/types';
import type { VideoTrackAnalysis } from '../adapters/video/types';
import { runMediaAnalysis, type MediaAnalysisDeps } from './runMediaAnalysis';

const facts = (kind: 'audio' | 'video'): MediaFacts => ({
  name: kind === 'audio' ? 'song.mp3' : 'clip.mp4',
  sizeBytes: 1_000_000,
  mimeType: kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
  kind,
  durationSec: 60,
});

const run = (
  analyzerId: AnalyzerRun['analyzerId'],
  status: AnalyzerRun['status'],
): AnalyzerRun => ({
  analyzerId,
  version: '1',
  params: {},
  durationMs: 10,
  sampleCount: 100,
  status,
});

const rawEvent = (over: Partial<RawEvent> = {}): RawEvent => ({
  channel: 'audio',
  kind: 'loudness-spike',
  startTime: 10,
  endTime: 11,
  peakTime: 10.5,
  severityScore: 0.5,
  confidence: 0.6,
  metrics: {},
  ...over,
});

const audioResult = (over: Partial<AudioTrackAnalysis> = {}): AudioTrackAnalysis => ({
  events: [rawEvent()],
  run: run('audio-loudness', 'ok'),
  ...over,
});

const videoResult = (over: Partial<VideoTrackAnalysis> = {}): VideoTrackAnalysis => ({
  events: [
    rawEvent({ channel: 'visual', kind: 'flashing', startTime: 20, endTime: 24, peakTime: 22 }),
  ],
  run: run('visual-flash', 'ok'),
  warnings: [],
  ...over,
});

function deps(over: Partial<MediaAnalysisDeps> = {}): MediaAnalysisDeps {
  return {
    analyzeAudioTrack: vi.fn(() => Promise.resolve(audioResult())),
    analyzeVideoTrack: vi.fn(() => Promise.resolve(videoResult())),
    ...over,
  };
}

const input = (kind: 'audio' | 'video') => ({
  file: new Blob([new Uint8Array(8)]),
  kind,
  media: facts(kind),
  durationSec: 60,
});

describe('runMediaAnalysis', () => {
  it('runs audio only for an MP3', async () => {
    const d = deps();
    const result = await runMediaAnalysis(input('audio'), {}, d);

    expect(d.analyzeVideoTrack).not.toHaveBeenCalled();
    expect(result.runs).toHaveLength(1);
    expect(result.status).toBe('complete');
    expect(result.limitations.slice(0, BASE_LIMITATIONS.length)).toEqual(BASE_LIMITATIONS);
  });

  it('runs audio then video for an MP4, feeding audio-event times into the refine pass', async () => {
    const analyzeVideoTrack = vi.fn<MediaAnalysisDeps['analyzeVideoTrack']>(() =>
      Promise.resolve(videoResult()),
    );
    const result = await runMediaAnalysis(input('video'), {}, deps({ analyzeVideoTrack }));

    expect(analyzeVideoTrack).toHaveBeenCalledOnce();
    const [, opts] = analyzeVideoTrack.mock.calls[0];
    expect(opts?.refineAroundSec).toEqual([10.5]); // the audio event's peakTime
    expect(result.runs.map((r) => r.analyzerId)).toEqual(['audio-loudness', 'visual-flash']);
    expect(result.events.length).toBeGreaterThanOrEqual(2);
  });

  it('is partial when the audio run failed', async () => {
    const result = await runMediaAnalysis(
      input('audio'),
      {},
      deps({
        analyzeAudioTrack: () =>
          Promise.resolve(audioResult({ events: [], run: run('audio-loudness', 'failed') })),
      }),
    );
    expect(result.status).toBe('partial');
  });

  it('is partial when the video pass was stopped', async () => {
    const result = await runMediaAnalysis(
      input('video'),
      {},
      deps({
        analyzeVideoTrack: () =>
          Promise.resolve(videoResult({ run: run('visual-flash', 'skipped'), warnings: [] })),
      }),
    );
    expect(result.status).toBe('partial');
  });

  it('reports non-decreasing progress ending at 1', async () => {
    const seen: number[] = [];
    await runMediaAnalysis(
      input('video'),
      {
        onProgress: ({ fraction }) => seen.push(fraction),
      },
      deps({
        analyzeVideoTrack: (_file, _opts, progress) => {
          progress?.onProgress?.(0.5);
          progress?.onProgress?.(1);
          return Promise.resolve(videoResult());
        },
      }),
    );
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
});
