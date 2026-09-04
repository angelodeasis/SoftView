import { describe, expect, it, vi } from 'vitest';
import { genBrightnessSeries, type BrightnessEventSpec } from '../../core/testing/generators';
import { makeTimeSeries, type TimeSeries } from '../../core/signal/timeSeries';
import { runVideoAnalysisPipeline, type VideoPipelineDeps } from './videoAnalysisPipeline';
import type { ScanContext } from './types';

const DURATION = 30;
const flash = (fromSec: number, toSec: number): BrightnessEventSpec => ({
  kind: 'flashing',
  fromSec,
  toSec,
  hz: 6,
  low: 0.1,
  high: 0.9,
});

const seriesFor = (events: readonly BrightnessEventSpec[], durationSec = DURATION): TimeSeries =>
  genBrightnessSeries({ durationSec, hopSec: 1 / 30, events }).series;

function clock() {
  let t = 1000;
  return () => (t += 5);
}

function deps(over: Partial<VideoPipelineDeps> = {}): VideoPipelineDeps {
  return {
    durationSec: DURATION,
    now: clock(),
    coarseScan: (ctx: ScanContext) => {
      ctx.onProgress?.(1);
      return Promise.resolve(seriesFor([]));
    },
    refineScan: (from: number, to: number) => Promise.resolve(seriesFor([flash(from, to)])),
    ...over,
  };
}

describe('runVideoAnalysisPipeline', () => {
  it('refines around a coarse flag and reports an ok run', async () => {
    const refineScan = vi.fn((from: number, to: number) =>
      Promise.resolve(seriesFor([flash(from + 1, to - 1)])),
    );
    const { events, run, warnings } = await runVideoAnalysisPipeline(
      deps({ coarseScan: () => Promise.resolve(seriesFor([flash(10, 13)])), refineScan }),
      {},
      {},
    );

    expect(run.status).toBe('ok');
    expect(run.analyzerId).toBe('visual-flash');
    expect(events.some((e) => e.kind === 'flashing')).toBe(true);
    expect(warnings).toEqual([]);
    // one padded window spanning the coarse flag around [10, 13]
    expect(refineScan).toHaveBeenCalledTimes(1);
    const [from, to] = refineScan.mock.calls[0];
    expect(from).toBeLessThan(10);
    expect(to).toBeGreaterThan(13);
  });

  it('refines around a caller-supplied timestamp with no coarse flags', async () => {
    const refineScan = vi.fn(() => Promise.resolve(seriesFor([])));
    await runVideoAnalysisPipeline(
      deps({ refineScan }),
      { refineAroundSec: [20], refinePadSec: 2 },
      {},
    );
    expect(refineScan).toHaveBeenCalledWith(18, 22, expect.anything());
  });

  it('fails the run when the coarse scan throws', async () => {
    const { events, run } = await runVideoAnalysisPipeline(
      deps({ coarseScan: () => Promise.reject(new Error('decode error')) }),
      {},
      {},
    );
    expect(run.status).toBe('failed');
    expect(events).toEqual([]);
    expect(run.note).toMatch(/could not scan/i);
  });

  it('falls back to coarse events and warns when one refine window fails', async () => {
    const { events, run, warnings } = await runVideoAnalysisPipeline(
      deps({
        coarseScan: () => Promise.resolve(seriesFor([flash(5, 7), flash(20, 22)])),
        refineScan: (from: number, to: number) =>
          from < 10
            ? Promise.reject(new Error('seek failed'))
            : Promise.resolve(seriesFor([flash(from + 1, to - 1)])),
      }),
      {},
      {},
    );

    expect(run.status).toBe('ok');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/could not be re-scanned/i);
    expect(events.filter((e) => e.kind === 'flashing').length).toBeGreaterThanOrEqual(2);
  });

  it('returns a skipped run when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const coarseScan = vi.fn(() => Promise.resolve(seriesFor([])));
    const { run } = await runVideoAnalysisPipeline(
      deps({ coarseScan }),
      {},
      {
        signal: controller.signal,
      },
    );
    expect(run.status).toBe('skipped');
    expect(coarseScan).not.toHaveBeenCalled();
  });

  it('stops with a skipped run when aborted mid-refine', async () => {
    const controller = new AbortController();
    const refineScan = vi.fn((from: number, to: number) => {
      controller.abort();
      return Promise.resolve(seriesFor([flash(from + 0.5, to - 0.5)]));
    });
    const { run } = await runVideoAnalysisPipeline(
      deps({
        coarseScan: () => Promise.resolve(seriesFor([flash(4, 6), flash(24, 26)])),
        refineScan,
      }),
      {},
      { signal: controller.signal },
    );
    expect(run.status).toBe('skipped');
    expect(refineScan).toHaveBeenCalledTimes(1);
  });

  it('reports progress monotonically ending at 1', async () => {
    const seen: number[] = [];
    await runVideoAnalysisPipeline(
      deps({
        coarseScan: (ctx) => {
          ctx.onProgress?.(0.5);
          ctx.onProgress?.(1);
          return Promise.resolve(seriesFor([flash(10, 12)]));
        },
        refineScan: (_from, _to, ctx) => {
          ctx.onProgress?.(1);
          return Promise.resolve(seriesFor([]));
        },
      }),
      {},
      { onProgress: (f) => seen.push(f) },
    );
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it('sums coarse and refine sample counts', async () => {
    const { run } = await runVideoAnalysisPipeline(
      deps({
        coarseScan: () =>
          Promise.resolve(
            makeTimeSeries(Float64Array.from([0, 1, 2]), Float32Array.from([0, 0, 0])),
          ),
        refineScan: () =>
          Promise.resolve(makeTimeSeries(Float64Array.from([0, 1]), Float32Array.from([0, 0]))),
      }),
      { refineAroundSec: [15] },
      {},
    );
    expect(run.sampleCount).toBe(5);
  });

  it('merges two nearby coarse flags into one refine window', async () => {
    const refineScan = vi.fn(() => Promise.resolve(seriesFor([])));
    await runVideoAnalysisPipeline(
      deps({
        coarseScan: () => Promise.resolve(seriesFor([flash(10, 11), flash(13, 14)])),
        refineScan,
      }),
      {},
      {},
    );
    expect(refineScan).toHaveBeenCalledTimes(1);
  });

  describe('short videos (at or under fullScanMaxDurationSec)', () => {
    const SHORT_DURATION = 6;

    it('skips the coarse pass and dense-scans the whole file directly', async () => {
      const coarseScan = vi.fn(() => Promise.resolve(seriesFor([], SHORT_DURATION)));
      const refineScan = vi.fn((from: number, to: number) =>
        Promise.resolve(seriesFor([flash(from, to)], SHORT_DURATION)),
      );
      const { events, run } = await runVideoAnalysisPipeline(
        deps({ durationSec: SHORT_DURATION, coarseScan, refineScan }),
        {},
        {},
      );

      expect(coarseScan).not.toHaveBeenCalled();
      expect(refineScan).toHaveBeenCalledExactlyOnceWith(0, SHORT_DURATION, expect.anything());
      expect(run.status).toBe('ok');
      expect(events.some((e) => e.kind === 'flashing')).toBe(true);
    });

    it('catches a flash a coarse-only pass could plausibly miss', async () => {
      // A single brief flash — nothing flags it up front the way a coarse-triggered
      // window would, only the whole-file dense scan sees it.
      const { events, run } = await runVideoAnalysisPipeline(
        deps({
          durationSec: SHORT_DURATION,
          coarseScan: vi.fn(),
          refineScan: () => Promise.resolve(seriesFor([flash(3, 3.3)], SHORT_DURATION)),
        }),
        {},
        {},
      );
      expect(run.status).toBe('ok');
      expect(events.some((e) => e.kind === 'flashing' && e.startTime < 4)).toBe(true);
    });

    it('reports progress 0..1 straight from the dense scan', async () => {
      const seen: number[] = [];
      await runVideoAnalysisPipeline(
        deps({
          durationSec: SHORT_DURATION,
          refineScan: (_from, _to, ctx) => {
            ctx.onProgress?.(0.5);
            ctx.onProgress?.(1);
            return Promise.resolve(seriesFor([], SHORT_DURATION));
          },
        }),
        {},
        { onProgress: (f) => seen.push(f) },
      );
      expect(seen).toEqual([0.5, 1, 1]);
    });

    it('fails the run when the dense scan throws', async () => {
      const { events, run } = await runVideoAnalysisPipeline(
        deps({
          durationSec: SHORT_DURATION,
          refineScan: () => Promise.reject(new Error('seek failed')),
        }),
        {},
        {},
      );
      expect(run.status).toBe('failed');
      expect(events).toEqual([]);
    });

    it('returns a skipped run when aborted mid-scan', async () => {
      const controller = new AbortController();
      const { run } = await runVideoAnalysisPipeline(
        deps({
          durationSec: SHORT_DURATION,
          refineScan: (from: number, to: number) => {
            controller.abort();
            return Promise.resolve(seriesFor([flash(from, to)], SHORT_DURATION));
          },
        }),
        {},
        { signal: controller.signal },
      );
      expect(run.status).toBe('skipped');
    });

    it('reports the sample count from the dense scan alone', async () => {
      const { run } = await runVideoAnalysisPipeline(
        deps({
          durationSec: SHORT_DURATION,
          refineScan: () =>
            Promise.resolve(
              makeTimeSeries(Float64Array.from([0, 1, 2, 3]), Float32Array.from([0, 0, 0, 0])),
            ),
        }),
        {},
        {},
      );
      expect(run.sampleCount).toBe(4);
    });

    it('a caller-lowered threshold still takes the long-video coarse+refine path', async () => {
      const coarseScan = vi.fn(() => Promise.resolve(seriesFor([], SHORT_DURATION)));
      await runVideoAnalysisPipeline(
        deps({ durationSec: SHORT_DURATION, coarseScan }),
        { fullScanMaxDurationSec: 1 },
        {},
      );
      expect(coarseScan).toHaveBeenCalledOnce();
    });
  });
});
