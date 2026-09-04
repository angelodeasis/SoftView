import { describe, expect, it, vi } from 'vitest';
import { analyzeAudioTrack, type AnalyzeAudioTrackDeps } from './analyzeAudioTrack';
import type { AudioTrackAnalysis, DecodedAudio } from './types';

const decoded: DecodedAudio = {
  sampleRate: 16000,
  channelData: [Float32Array.from([0, 0.1, 0])],
  durationSec: 1,
};

const analysis: AudioTrackAnalysis = {
  events: [],
  run: {
    analyzerId: 'audio-loudness',
    version: '1',
    params: {},
    durationMs: 10,
    sampleCount: 5,
    status: 'ok',
  },
};

const fakeBlob = (bytes: number[]) =>
  ({ arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) }) as unknown as Blob;

describe('analyzeAudioTrack', () => {
  it('decodes the blob bytes, then analyzes the decoded audio', async () => {
    const decode = vi.fn<AnalyzeAudioTrackDeps['decode']>(() => Promise.resolve(decoded));
    const analyze = vi.fn<AnalyzeAudioTrackDeps['analyze']>(() => Promise.resolve(analysis));

    const result = await analyzeAudioTrack(
      fakeBlob([1, 2, 3, 4]),
      { loudness: { spikeRiseDb: 8 } },
      {
        decode,
        analyze,
      },
    );

    expect(result).toBe(analysis);
    expect(new Uint8Array(decode.mock.calls[0][0])).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(analyze).toHaveBeenCalledWith(decoded, { loudness: { spikeRiseDb: 8 } });
  });

  it('resolves with a failed run when decoding throws, without calling analyze', async () => {
    const analyze = vi.fn<AnalyzeAudioTrackDeps['analyze']>(() => Promise.resolve(analysis));
    let t = 0;

    const result = await analyzeAudioTrack(
      fakeBlob([0]),
      {},
      {
        decode: () => Promise.reject(new Error('bad codec')),
        analyze,
        now: () => (t += 100),
      },
    );

    expect(result.run.status).toBe('failed');
    expect(result.run.durationMs).toBe(100);
    expect(result.events).toEqual([]);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('rejects a non-Blob argument', async () => {
    // @ts-expect-error deliberately wrong type
    await expect(analyzeAudioTrack('not a blob')).rejects.toThrow(TypeError);
  });
});
