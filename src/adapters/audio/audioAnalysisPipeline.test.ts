import { describe, expect, it } from 'vitest';
import { genAudioPcm } from '../../core/testing/generators';
import { decodeFailureAnalysis, runAudioAnalysisPipeline } from './audioAnalysisPipeline';
import type { DecodedAudio } from './types';

/** A clock that advances 5 ms per call. */
function clock() {
  let t = 1000;
  return () => {
    t += 5;
    return t;
  };
}

function decodedFrom(
  events: Parameters<typeof genAudioPcm>[0]['events'],
  sampleRate: number,
): DecodedAudio {
  const { pcm } = genAudioPcm({ durationSec: 14, sampleRate, events });
  return {
    sampleRate,
    channelData: sampleRate === 16000 ? [pcm] : [pcm, pcm],
    durationSec: 14,
  };
}

describe('runAudioAnalysisPipeline', () => {
  it('analyzes a 16 kHz mono track and reports an ok run', () => {
    const { events, run } = runAudioAnalysisPipeline(
      decodedFrom([{ kind: 'loudness-spike', atSec: 5, durSec: 0.3, levelDb: -3 }], 16000),
      {},
      clock(),
    );
    expect(events.some((e) => e.kind === 'loudness-spike')).toBe(true);
    expect(run.status).toBe('ok');
    expect(run.analyzerId).toBe('audio-loudness');
    expect(run.version).toBe('1');
    expect(run.sampleCount).toBe(700);
    expect(run.durationMs).toBe(5);
  });

  it('downmixes and resamples a stereo 44.1 kHz track (the Firefox path)', () => {
    const { events, run } = runAudioAnalysisPipeline(
      decodedFrom([{ kind: 'sustained-loudness', fromSec: 3, toSec: 11, levelDb: -8 }], 44100),
      {},
      clock(),
    );
    expect(events.some((e) => e.kind === 'sustained-loudness')).toBe(true);
    expect(run.status).toBe('ok');
  });

  it('records the analyzer params, including the analysis sample rate', () => {
    const { run } = runAudioAnalysisPipeline(decodedFrom([], 16000), {}, clock());
    expect(run.params.sampleRate).toBe(16000);
    expect(run.params.spikeRiseDb).toBe(10);
    expect(run.params.sustainedDb).toBe(-14);
  });

  it('passes loudness option overrides through to the analyzer', () => {
    // A -6 dB threshold should exclude a -8 dB region.
    const { events, run } = runAudioAnalysisPipeline(
      decodedFrom([{ kind: 'sustained-loudness', fromSec: 3, toSec: 11, levelDb: -8 }], 16000),
      { loudness: { sustainedDb: -6 } },
      clock(),
    );
    expect(events.some((e) => e.kind === 'sustained-loudness')).toBe(false);
    expect(run.params.sustainedDb).toBe(-6);
  });

  it('handles a track that decoded to no channels', () => {
    const { events, run } = runAudioAnalysisPipeline(
      { sampleRate: 16000, channelData: [], durationSec: 0 },
      {},
      clock(),
    );
    expect(events).toEqual([]);
    expect(run.status).toBe('ok');
  });
});

describe('decodeFailureAnalysis', () => {
  it('is an empty, failed run with a soft note and the given duration', () => {
    const { events, run } = decodeFailureAnalysis({}, 42);
    expect(events).toEqual([]);
    expect(run.status).toBe('failed');
    expect(run.sampleCount).toBe(0);
    expect(run.durationMs).toBe(42);
    expect(run.note).toMatch(/could not read the audio/i);
    expect(run.params.sampleRate).toBe(16000);
  });
});
