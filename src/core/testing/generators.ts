/**
 * Synthetic sample streams with a known answer key, for testing the analyzers.
 *
 * Most emit a {@link TimeSeries} directly — the same shape an adapter would hand an
 * analyzer. Audio loudness values are dBFS per hop; visual values are 0..1 brightness
 * per sampled frame. {@link genAudioPcm} is the exception: it emits raw mono PCM, so the
 * loudness windower can be exercised on real samples. Every generator also returns the
 * `groundTruth` events it injected, for {@link scoreDetections}.
 *
 * Pure and deterministic (seeded). Test-support code: tree-shaken out of the build.
 */

import { makeTimeSeries, type TimeSeries } from '../signal/timeSeries';
import type { GroundTruthEvent } from './groundTruth';

export interface GeneratedSeries {
  readonly series: TimeSeries;
  readonly groundTruth: readonly GroundTruthEvent[];
}

// --- deterministic noise --------------------------------------------------------

/** Small, fast, seedable PRNG (mulberry32). Enough for jitter and noise in fixtures. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sample times over `[0, durationSec)`, optionally jittered but kept non-decreasing. */
function buildTimes(
  durationSec: number,
  hopSec: number,
  jitterSec: number,
  rand: () => number,
): Float64Array {
  const n = Math.max(1, Math.round(durationSec / hopSec));
  const times = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let t = i * hopSec;
    if (jitterSec > 0) t += (rand() * 2 - 1) * jitterSec;
    t = Math.max(0, Math.min(durationSec, t));
    if (t < prev) t = prev;
    times[i] = t;
    prev = t;
  }
  return times;
}

/**
 * A trapezoidal envelope: `floor` outside `[start, end]`, ramping to `peak` over
 * `rampSec` at each edge, flat `peak` in between.
 */
function ramped(
  t: number,
  start: number,
  end: number,
  peak: number,
  floor: number,
  rampSec: number,
): number {
  if (t <= start || t >= end) return floor;
  if (rampSec > 0 && t < start + rampSec) return floor + (peak - floor) * ((t - start) / rampSec);
  if (rampSec > 0 && t > end - rampSec) return floor + (peak - floor) * ((end - t) / rampSec);
  return peak;
}

// --- audio: loudness series ----------------------------------------------------

export type LoudnessEventSpec =
  | {
      readonly kind: 'loudness-spike';
      readonly atSec: number;
      readonly durSec: number;
      readonly peakDb: number;
    }
  | {
      readonly kind: 'sustained-loudness';
      readonly fromSec: number;
      readonly toSec: number;
      readonly levelDb: number;
    };

export interface LoudnessSeriesOptions {
  readonly durationSec: number;
  /** Hop between samples in seconds. Default `0.02` (50 Hz). */
  readonly hopSec?: number;
  /** Quiet-room floor the series sits at between events. Default `-50`. */
  readonly baselineDb?: number;
  /** Peak-to-peak random wobble added to every sample. Default `0`. */
  readonly noiseDb?: number;
  /** Random +/- perturbation of sample times. Default `0`. */
  readonly jitterSec?: number;
  readonly seed?: number;
  readonly events?: readonly LoudnessEventSpec[];
}

function loudnessSpan(e: LoudnessEventSpec): { start: number; end: number; level: number } {
  return e.kind === 'loudness-spike'
    ? { start: e.atSec, end: e.atSec + e.durSec, level: e.peakDb }
    : { start: e.fromSec, end: e.toSec, level: e.levelDb };
}

export function genLoudnessSeries(options: LoudnessSeriesOptions): GeneratedSeries {
  const hopSec = options.hopSec ?? 0.02;
  const baselineDb = options.baselineDb ?? -50;
  const noiseDb = options.noiseDb ?? 0;
  const jitterSec = options.jitterSec ?? 0;
  const events = options.events ?? [];
  const rand = mulberry32(options.seed ?? 1);

  const times = buildTimes(options.durationSec, hopSec, jitterSec, rand);
  const values = new Float32Array(times.length);
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    let db = baselineDb;
    for (const e of events) {
      const { start, end, level } = loudnessSpan(e);
      const rampSec = Math.min(e.kind === 'loudness-spike' ? 0.05 : 0.1, (end - start) / 2);
      db = Math.max(db, ramped(t, start, end, level, baselineDb, rampSec));
    }
    if (noiseDb > 0) db += (rand() * 2 - 1) * (noiseDb / 2);
    values[i] = db;
  }

  return {
    series: makeTimeSeries(times, values),
    groundTruth: events.map((e) => {
      const { start, end } = loudnessSpan(e);
      return { channel: 'audio', kind: e.kind, startTime: start, endTime: end };
    }),
  };
}

// --- visual: brightness series -----------------------------------------------

export type BrightnessEventSpec =
  | {
      readonly kind: 'flashing';
      readonly fromSec: number;
      readonly toSec: number;
      readonly hz: number;
      readonly low: number;
      readonly high: number;
    }
  | {
      readonly kind: 'luminance-spike';
      readonly atSec: number;
      readonly durSec: number;
      readonly from: number;
      readonly to: number;
    };

export interface BrightnessSeriesOptions {
  readonly durationSec: number;
  /** Hop between samples in seconds. Default `1 / 30` (30 Hz). */
  readonly hopSec?: number;
  /** Steady brightness between events. Default `0.5`. */
  readonly baseline?: number;
  /** Random +/- perturbation of sample times. Default `0`. */
  readonly jitterSec?: number;
  readonly seed?: number;
  readonly events?: readonly BrightnessEventSpec[];
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function brightnessSpan(e: BrightnessEventSpec): { start: number; end: number } {
  return e.kind === 'flashing'
    ? { start: e.fromSec, end: e.toSec }
    : { start: e.atSec, end: e.atSec + e.durSec };
}

export function genBrightnessSeries(options: BrightnessSeriesOptions): GeneratedSeries {
  const hopSec = options.hopSec ?? 1 / 30;
  const baseline = options.baseline ?? 0.5;
  const jitterSec = options.jitterSec ?? 0;
  const events = options.events ?? [];
  const rand = mulberry32(options.seed ?? 1);

  const times = buildTimes(options.durationSec, hopSec, jitterSec, rand);
  const values = new Float32Array(times.length);
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    let v = baseline;
    for (const e of events) {
      if (e.kind === 'flashing') {
        if (t >= e.fromSec && t < e.toSec) {
          const halfPeriods = Math.floor((t - e.fromSec) * e.hz * 2);
          v = halfPeriods % 2 === 0 ? e.high : e.low;
        }
      } else if (t >= e.atSec && t <= e.atSec + e.durSec) {
        v = ramped(t, e.atSec, e.atSec + e.durSec, e.to, e.from, Math.min(0.2, e.durSec / 2));
      }
    }
    values[i] = clamp01(v);
  }

  return {
    series: makeTimeSeries(times, values),
    groundTruth: events.map((e) => {
      const { start, end } = brightnessSpan(e);
      return { channel: 'visual', kind: e.kind, startTime: start, endTime: end };
    }),
  };
}

// --- audio: raw mono PCM -----------------------------------------------------

export type PcmEventSpec =
  | {
      readonly kind: 'loudness-spike';
      readonly atSec: number;
      readonly durSec: number;
      readonly levelDb: number;
    }
  | {
      readonly kind: 'sustained-loudness';
      readonly fromSec: number;
      readonly toSec: number;
      readonly levelDb: number;
    }
  | { readonly kind: 'clipping'; readonly fromSec: number; readonly toSec: number };

export interface AudioPcmOptions {
  readonly durationSec: number;
  /** Default `16000` — the rate the decode adapter targets. */
  readonly sampleRate?: number;
  /** Carrier frequency of the test tone. Default `220`. */
  readonly toneHz?: number;
  /** Level of the tone between events. Default `-45` dBFS. */
  readonly baselineDb?: number;
  /** Peak-to-peak white noise added to every sample, in linear amplitude. Default `0`. */
  readonly noiseAmp?: number;
  readonly seed?: number;
  readonly events?: readonly PcmEventSpec[];
}

export interface GeneratedPcm {
  readonly pcm: Float32Array;
  readonly sampleRate: number;
  readonly groundTruth: readonly GroundTruthEvent[];
}

const dbToAmp = (db: number): number => 10 ** (db / 20);

function pcmEventSpan(e: PcmEventSpec): { start: number; end: number } {
  return e.kind === 'loudness-spike'
    ? { start: e.atSec, end: e.atSec + e.durSec }
    : { start: e.fromSec, end: e.toSec };
}

/**
 * A sine carrier whose amplitude follows the loudest active event (trapezoidal edges),
 * plus optional noise. `clipping` regions are driven past full scale and hard-clamped to
 * `[-1, 1]`, so their peak sits at 0 dBFS. Deterministic for a given `seed`.
 */
export function genAudioPcm(options: AudioPcmOptions): GeneratedPcm {
  const sampleRate = options.sampleRate ?? 16000;
  const toneHz = options.toneHz ?? 220;
  const baselineDb = options.baselineDb ?? -45;
  const noiseAmp = options.noiseAmp ?? 0;
  const events = options.events ?? [];
  const rand = mulberry32(options.seed ?? 1);

  const n = Math.max(1, Math.round(options.durationSec * sampleRate));
  const pcm = new Float32Array(n);
  const baselineAmp = dbToAmp(baselineDb);

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;

    let amp = baselineAmp;
    let clip = false;
    for (const e of events) {
      const { start, end } = pcmEventSpan(e);
      if (t < start || t > end) continue;
      if (e.kind === 'clipping') {
        amp = Math.max(amp, dbToAmp(0) * 1.8);
        clip = true;
      } else {
        const ramp = Math.min(0.02, (end - start) / 2);
        amp = Math.max(amp, ramped(t, start, end, dbToAmp(e.levelDb), baselineAmp, ramp));
      }
    }

    let s = amp * Math.sin(2 * Math.PI * toneHz * t);
    if (noiseAmp > 0) s += (rand() * 2 - 1) * noiseAmp;
    if (clip || s > 1 || s < -1) s = Math.max(-1, Math.min(1, s));
    pcm[i] = s;
  }

  return {
    pcm,
    sampleRate,
    groundTruth: events.map((e) => {
      const { start, end } = pcmEventSpan(e);
      return { channel: 'audio', kind: e.kind, startTime: start, endTime: end };
    }),
  };
}
