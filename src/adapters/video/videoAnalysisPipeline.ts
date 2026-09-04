/**
 * The video analysis pass, minus the browser: coarse whole-file luminance scan →
 * `analyzeVisualFlash` (over-flag) → refine each flagged / caller-supplied window with a
 * dense re-scan → refined events + an `AnalyzerRun`.
 *
 * The two browser scans are injected, so this whole flow is unit-tested with fakes.
 * `frameSampler.ts` provides the real `<video>` + canvas scans.
 */

import {
  analyzeVisualFlash,
  DEFAULT_FLASH_PARAMS,
  VISUAL_FLASH_ANALYZER_ID,
  VISUAL_FLASH_VERSION,
} from '../../core/video/analyzeFlash';
import { normalizeEvents } from '../../core/events/normalize';
import { refineWindows, type RefineWindow } from '../../core/video/refineWindows';
import type { AnalyzerRun } from '../../core/events/analysisResult';
import type { RawEvent } from '../../core/events/model';
import type { TimeSeries } from '../../core/signal/timeSeries';
import type {
  ScanContext,
  VideoAnalysisProgress,
  VideoTrackAnalysis,
  VideoTrackOptions,
} from './types';

export interface VideoPipelineDeps {
  readonly coarseScan: (ctx: ScanContext) => Promise<TimeSeries>;
  readonly refineScan: (fromSec: number, toSec: number, ctx: ScanContext) => Promise<TimeSeries>;
  readonly durationSec: number;
  readonly now: () => number;
}

export const COARSE_SCAN_FAILED_NOTE = 'SoftView could not scan the video in this file.';
export const STOPPED_NOTE = 'Video analysis was stopped before it finished.';

const COARSE_FRACTION = 0.7;

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function runParams(opts: VideoTrackOptions): AnalyzerRun['params'] {
  return {
    ...DEFAULT_FLASH_PARAMS,
    ...opts.flash,
    coarsePlaybackRate: opts.coarsePlaybackRate ?? 2,
    downscalePx: opts.downscalePx ?? 64,
    refinePadSec: opts.refinePadSec ?? 2.5,
    refineFps: opts.refineFps ?? 30,
  };
}

function result(
  opts: VideoTrackOptions,
  durationMs: number,
  sampleCount: number,
  status: AnalyzerRun['status'],
  events: readonly RawEvent[],
  warnings: readonly string[],
  note?: string,
): VideoTrackAnalysis {
  return {
    events,
    warnings,
    run: {
      analyzerId: VISUAL_FLASH_ANALYZER_ID,
      version: VISUAL_FLASH_VERSION,
      params: runParams(opts),
      durationMs,
      sampleCount,
      status,
      ...(note !== undefined ? { note } : {}),
    },
  };
}

/** The empty, failed result for a file whose video could not be scanned at all. */
export function coarseScanFailureAnalysis(
  opts: VideoTrackOptions,
  durationMs: number,
): VideoTrackAnalysis {
  return result(opts, durationMs, 0, 'failed', [], [], COARSE_SCAN_FAILED_NOTE);
}

const overlaps = (e: RawEvent, w: RefineWindow) => e.startTime <= w.toSec && e.endTime >= w.fromSec;

export async function runVideoAnalysisPipeline(
  deps: VideoPipelineDeps,
  opts: VideoTrackOptions,
  progress: VideoAnalysisProgress = {},
): Promise<VideoTrackAnalysis> {
  const startedMs = deps.now();
  const { signal } = progress;
  const aborted = () => signal?.aborted ?? false;
  const finish = (
    status: AnalyzerRun['status'],
    sampleCount: number,
    events: readonly RawEvent[],
    warnings: readonly string[],
    note?: string,
  ) =>
    result(
      opts,
      deps.now() - startedMs,
      sampleCount,
      status,
      normalizeEvents(events, { durationSec: deps.durationSec }),
      warnings,
      note,
    );

  if (aborted()) return finish('skipped', 0, [], [], STOPPED_NOTE);

  let coarse: TimeSeries;
  try {
    coarse = await deps.coarseScan({
      onProgress: (f) => progress.onProgress?.(COARSE_FRACTION * f),
      signal,
    });
  } catch (err) {
    if (isAbortError(err) || aborted()) return finish('skipped', 0, [], [], STOPPED_NOTE);
    return coarseScanFailureAnalysis(opts, deps.now() - startedMs);
  }

  const coarseEvents = analyzeVisualFlash({ luminance: coarse }, opts.flash);
  const windows = refineWindows(coarseEvents, opts.refineAroundSec ?? [], {
    mediaDurationSec: deps.durationSec,
    padSec: opts.refinePadSec,
  });

  const refined: RawEvent[] = [];
  const warnings: string[] = [];
  let sampleCount = coarse.times.length;

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (aborted()) {
      const rest = windows.slice(i).flatMap((rw) => coarseEvents.filter((e) => overlaps(e, rw)));
      return finish('skipped', sampleCount, [...refined, ...rest], warnings, STOPPED_NOTE);
    }
    try {
      const dense = await deps.refineScan(w.fromSec, w.toSec, {
        onProgress: (f) =>
          progress.onProgress?.(
            COARSE_FRACTION + (1 - COARSE_FRACTION) * ((i + f) / windows.length),
          ),
        signal,
      });
      sampleCount += dense.times.length;
      refined.push(...analyzeVisualFlash({ luminance: dense }, opts.flash));
    } catch (err) {
      if (isAbortError(err)) {
        const rest = windows.slice(i).flatMap((rw) => coarseEvents.filter((e) => overlaps(e, rw)));
        return finish('skipped', sampleCount, [...refined, ...rest], warnings, STOPPED_NOTE);
      }
      refined.push(...coarseEvents.filter((e) => overlaps(e, w)));
      warnings.push(
        `Part of the video (${mmss(w.fromSec)}–${mmss(w.toSec)}) could not be re-scanned in detail.`,
      );
    }
  }

  progress.onProgress?.(1);
  return finish('ok', sampleCount, refined, warnings);
}
