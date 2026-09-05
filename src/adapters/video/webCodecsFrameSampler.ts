/**
 * A `FrameSampler` (see `frameSampler.ts`) that decodes frames via WebCodecs instead of
 * playing the `<video>` element. Playback-based capture is capped at a few× realtime —
 * it's fundamentally "play the video and sample frames as they go by." WebCodecs
 * decodes as fast as the hardware allows, with no such ceiling.
 *
 * `mp4box.js` demuxes the MP4 container into the video track's codec config plus a
 * stream of encoded samples; `VideoDecoder` (native, no library) does the actual
 * decoding. Once a whole file can be decoded densely and quickly, there's nothing left
 * to "refine" — `coarseScan`/`refineScan` both draw from one cached, fully-dense
 * decode of the whole file; `refineScan` just slices it.
 *
 * `probeWebCodecs` decides, per file, whether this sampler or the `<video>`-based one
 * gets used (`analyzeVideoTrack.ts`) — WebCodecs support doesn't guarantee this
 * specific codec/profile is decodable, so this never throws; `supported: false` means
 * "fall back," not "broken."
 *
 * Browser-only, same as `frameSampler.ts` — no jsdom equivalent for `VideoDecoder` or
 * canvas readback, so this is verified in the real-browser pass, not unit tests. The
 * one piece of plain logic (`sortedTimeSeries`) is exported and unit-tested directly,
 * same reasoning as `scanGuard.ts` being split out of `frameSampler.ts`.
 */

import * as MP4Box from 'mp4box';
import { makeTimeSeries, sliceByTime, type TimeSeries } from '../../core/signal/timeSeries';
import { makeCapture } from './frameSampler';
import { withStallGuard } from './scanGuard';
import type { FrameSampler } from './frameSampler';
import type { ScanContext, VideoTrackOptions } from './types';

const DEFAULT_STALL_TIMEOUT_MS = 10_000;
/** How many samples mp4box batches into each `onSamples` call — a tuning knob only. */
const EXTRACTION_BATCH_SIZE = 200;

/**
 * Builds a `TimeSeries` from per-frame `(time, value)` pairs collected in whatever
 * order `VideoDecoder` delivered them — presentation order per the WebCodecs spec, but
 * sorted here defensively rather than assumed, since `TimeSeries` requires
 * non-decreasing times.
 */
export function sortedTimeSeries(times: readonly number[], values: readonly number[]): TimeSeries {
  const order = times.map((_, i) => i).sort((a, b) => times[a] - times[b]);
  return makeTimeSeries(
    Float64Array.from(order.map((i) => times[i])),
    Float32Array.from(order.map((i) => values[i])),
  );
}

interface DemuxedVideoTrack {
  readonly file: MP4Box.ISOFile;
  readonly trackId: number;
  readonly nbSamples: number;
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly description: Uint8Array;
  readonly durationSec: number;
}

/** A sample entry that carries an AVC or HEVC decoder configuration box. */
interface CodecConfigSampleEntry {
  readonly avcC?: { write(stream: MP4Box.MultiBufferStream): void };
  readonly hvcC?: { write(stream: MP4Box.MultiBufferStream): void };
}

/**
 * The `avcC`/`hvcC` box, serialized, minus its own 8-byte header (size + fourcc) — the
 * raw decoder configuration payload `VideoDecoderConfig.description` expects.
 */
function extractDescription(file: MP4Box.ISOFile, trackId: number): Uint8Array {
  const track = file.getTrackById(trackId);
  const entry = track.mdia.minf.stbl.stsd.entries[0] as unknown as CodecConfigSampleEntry;
  const box = entry.avcC ?? entry.hvcC;
  if (!box) throw new Error('No AVC/HEVC decoder configuration box found.');
  const stream = new MP4Box.MultiBufferStream();
  box.write(stream);
  return new Uint8Array(stream.buffer, 8, stream.getPosition() - 8);
}

/** Demuxes just far enough to read the video track's codec config — cheap; no sample
 * data is touched yet. Resolves `undefined` (never rejects) if there's no usable video
 * track, so callers can treat "can't tell" the same as "no." */
function demuxVideoTrack(blob: Blob): Promise<DemuxedVideoTrack | undefined> {
  return blob.arrayBuffer().then(
    (buffer) =>
      new Promise<DemuxedVideoTrack | undefined>((resolve) => {
        const file = MP4Box.createFile();
        file.onError = () => resolve(undefined);
        file.onReady = (info) => {
          const track = info.videoTracks[0];
          if (!track) {
            resolve(undefined);
            return;
          }
          try {
            resolve({
              file,
              trackId: track.id,
              nbSamples: track.nb_samples,
              codec: track.codec,
              codedWidth: track.video?.width ?? 0,
              codedHeight: track.video?.height ?? 0,
              description: extractDescription(file, track.id),
              durationSec: info.timescale > 0 ? info.duration / info.timescale : 0,
            });
          } catch {
            resolve(undefined);
          }
        };
        file.appendBuffer(MP4Box.MP4BoxBuffer.fromArrayBuffer(buffer, 0));
      }),
    () => undefined,
  );
}

export interface WebCodecsProbe {
  readonly supported: boolean;
  /** `0` when `supported` is `false` — meaningless in that case. */
  readonly durationSec: number;
}

/**
 * Whether this file's video track can actually be decoded via WebCodecs on this
 * browser (WebCodecs *existing* doesn't mean this codec/profile is), plus the
 * duration read along the way — one demux instead of the caller needing a second to
 * find out how long the file is. Never throws; a `false` just means "fall back."
 */
export async function probeWebCodecs(blob: Blob): Promise<WebCodecsProbe> {
  if (typeof VideoDecoder === 'undefined') return { supported: false, durationSec: 0 };
  try {
    const track = await demuxVideoTrack(blob);
    if (!track) return { supported: false, durationSec: 0 };
    const support = await VideoDecoder.isConfigSupported({
      codec: track.codec,
      codedWidth: track.codedWidth,
      codedHeight: track.codedHeight,
      description: track.description,
    });
    return { supported: support.supported === true, durationSec: track.durationSec };
  } catch {
    return { supported: false, durationSec: 0 };
  }
}

function decodeWholeFile(
  blob: Blob,
  capture: ReturnType<typeof makeCapture>,
  ctx: ScanContext,
  stallTimeoutMs: number,
): Promise<TimeSeries> {
  return withStallGuard(
    (bump) =>
      demuxVideoTrack(blob).then(
        (track) =>
          new Promise<TimeSeries>((resolve, reject) => {
            // demuxVideoTrack never rejects (blob.arrayBuffer() failures and parse
            // errors both resolve `undefined`) — this is the one place that matters.
            if (!track) {
              reject(new Error("SoftView couldn't read this video's codec configuration."));
              return;
            }

            const times: number[] = [];
            const values: number[] = [];
            let fed = 0;
            let settled = false;
            const fail = (err: unknown) => {
              if (settled) return;
              settled = true;
              reject(err);
            };

            const decoder = new VideoDecoder({
              output: (frame) => {
                try {
                  bump();
                  times.push(frame.timestamp / 1e6);
                  values.push(capture.sampleAt(frame));
                } finally {
                  frame.close();
                }
              },
              error: fail,
            });

            try {
              decoder.configure({
                codec: track.codec,
                codedWidth: track.codedWidth,
                codedHeight: track.codedHeight,
                description: track.description,
              });
            } catch (err) {
              fail(err);
              return;
            }

            track.file.onSamples = (_id, _user, samples) => {
              if (settled) return;
              for (const sample of samples) {
                if (!sample.data) continue;
                decoder.decode(
                  new EncodedVideoChunk({
                    type: sample.is_sync ? 'key' : 'delta',
                    timestamp: (sample.cts * 1e6) / sample.timescale,
                    duration: (sample.duration * 1e6) / sample.timescale,
                    data: sample.data,
                  }),
                );
                fed++;
                ctx.onProgress?.(track.nbSamples > 0 ? fed / track.nbSamples : 0);
              }
              if (fed >= track.nbSamples) {
                decoder
                  .flush()
                  .then(() => {
                    if (settled) return;
                    settled = true;
                    decoder.close();
                    ctx.onProgress?.(1);
                    resolve(sortedTimeSeries(times, values));
                  })
                  .catch(fail);
              }
            };
            track.file.setExtractionOptions(track.trackId, undefined, {
              nbSamples: EXTRACTION_BATCH_SIZE,
            });
            track.file.start();
          }),
      ),
    { signal: ctx.signal, stallTimeoutMs },
  );
}

export function createWebCodecsFrameSampler(
  blob: Blob,
  opts: VideoTrackOptions = {},
): FrameSampler {
  const capture = makeCapture(opts.downscalePx ?? 64);
  const stallTimeoutMs = opts.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
  let cached: Promise<TimeSeries> | undefined;

  const wholeFile = (ctx: ScanContext) =>
    (cached ??= decodeWholeFile(blob, capture, ctx, stallTimeoutMs));

  return {
    coarseScan: wholeFile,
    refineScan: (fromSec, toSec, ctx) => wholeFile(ctx).then((s) => sliceByTime(s, fromSec, toSec)),
  };
}
