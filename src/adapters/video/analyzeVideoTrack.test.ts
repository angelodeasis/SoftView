import { describe, expect, it, vi } from 'vitest';
import { makeTimeSeries } from '../../core/signal/timeSeries';
import { analyzeVideoTrack, type AnalyzeVideoTrackDeps } from './analyzeVideoTrack';

const fakeBlob = () =>
  ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }) as unknown as Blob;

const emptySeries = () => makeTimeSeries(new Float64Array(0), new Float32Array(0));

describe('analyzeVideoTrack', () => {
  it('builds a sampler, runs the pipeline, and revokes the object URL', async () => {
    const dispose = vi.fn();
    const buildSampler = vi.fn<AnalyzeVideoTrackDeps['buildSampler']>(() =>
      Promise.resolve({
        durationSec: 10,
        coarseScan: () => Promise.resolve(emptySeries()),
        refineScan: () => Promise.resolve(emptySeries()),
        dispose,
      }),
    );

    const { run } = await analyzeVideoTrack(fakeBlob(), {}, {}, { buildSampler, now: () => 0 });

    expect(run.status).toBe('ok');
    expect(buildSampler).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('resolves with a failed run when the sampler cannot be built', async () => {
    const { events, run } = await analyzeVideoTrack(
      fakeBlob(),
      {},
      {},
      {
        buildSampler: () => Promise.reject(new Error('video could not be loaded')),
        now: () => 0,
      },
    );
    expect(run.status).toBe('failed');
    expect(events).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('rejects a non-Blob argument', async () => {
    // @ts-expect-error deliberately wrong type
    await expect(analyzeVideoTrack('not a blob')).rejects.toThrow(TypeError);
  });
});
