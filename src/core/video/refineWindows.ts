/**
 * Given the coarse pass's flags (and any extra timestamps the caller wants looked at —
 * e.g. audio-event times), work out which stretches of the video the refine pass should
 * re-scan in detail: each span padded, clamped to the media, and merged where they touch.
 *
 * Pure. Checked with `tsconfig.core.json` (no "DOM" lib).
 */

export interface RefineWindow {
  readonly fromSec: number;
  readonly toSec: number;
}

export interface RefineWindowOptions {
  readonly mediaDurationSec: number;
  /** Seconds of context added to each side of a span. Default `2.5`. */
  readonly padSec?: number;
}

const DEFAULT_PAD_SEC = 2.5;

export function refineWindows(
  coarseEvents: readonly { readonly startTime: number; readonly endTime: number }[],
  extraSec: readonly number[],
  opts: RefineWindowOptions,
): readonly RefineWindow[] {
  const pad = opts.padSec ?? DEFAULT_PAD_SEC;
  const dur = opts.mediaDurationSec;

  const clamped = [
    ...coarseEvents.map((e) => ({ fromSec: e.startTime - pad, toSec: e.endTime + pad })),
    ...extraSec.map((t) => ({ fromSec: t - pad, toSec: t + pad })),
  ]
    .map((w) => ({ fromSec: Math.max(0, w.fromSec), toSec: Math.min(dur, w.toSec) }))
    .filter((w) => w.toSec > w.fromSec)
    .sort((a, b) => a.fromSec - b.fromSec);

  const merged: RefineWindow[] = [];
  for (const w of clamped) {
    const last = merged[merged.length - 1];
    if (last && w.fromSec <= last.toSec) {
      if (w.toSec > last.toSec)
        merged[merged.length - 1] = { fromSec: last.fromSec, toSec: w.toSec };
    } else {
      merged.push(w);
    }
  }
  return merged;
}
