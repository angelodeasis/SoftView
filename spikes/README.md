# SoftView — technical spikes (disposable)

These are throwaway experiments to validate architectural assumptions **before** Phase 0.
Nothing here is production code. This whole `spikes/` directory can be deleted once the
questions are answered — none of it will be imported by the app.

Questions under test:

- **R1** — how badly does `decodeAudioData` scale with duration? Do we need an MVP duration guard?
- **R2** — can we sample video frames locally, fast enough, for flash detection?
- **R3** — do we actually need WebCodecs + mp4box.js, or are the plain browser APIs enough?
  (No code — decided from R1/R2 results.)

## Setup

Test media is synthetic and generated with ffmpeg:

```sh
sh spikes/media-generate.sh
```

This writes fixtures into `r1-audio-memory/` and `r2-frame-sampling/`
(a 3 Hz flash clip, a motion clip, and MP3/M4A files from 30 s to 60 min).
Use your own representative MP4/MP3 files too — the synthetic ones only cover the mechanics.

## Running

The pages need no build step and no dependencies.

- **Simplest:** open `r1-audio-memory/index.html` / `r2-frame-sampling/index.html` directly in
  a browser (`file://`) and pick a file with the file input.
- **If you want the generated fixtures pre-loadable via `?autorun=`:** serve the folder first:
  ```sh
  cd spikes && python3 -m http.server 8777
  ```
  then open `http://localhost:8777/r1-audio-memory/?autorun=audio-1800s-44100hz-2ch.mp3`.

Run in the **browsers you care about supporting** — at least Chrome and Safari, plus Firefox
(which lacks `requestVideoFrameCallback` and will exercise the seek-loop fallback).

Chrome only: launch with `--enable-precise-memory-info` for real heap deltas in R1.

Each page has a **Copy results JSON** button. Paste the JSON back for analysis.

---

## RESULTS & CONCLUSIONS

Measured on Chrome 152, Apple-silicon Mac (10 cores, 16 GB), 2026-09-01.
Only Chrome was available; Safari/Firefox behaviour is handled defensively in code
(see "cross-browser" below) and gets a real-device pass before we claim support.

### R1 — audio decode memory

Raw numbers (142 s stereo 44.1 kHz MP3):

| path | PCM size | decode time | notes |
|---|---|---|---|
| native 44.1 kHz stereo | 48 MB | 103 ms (~1384× realtime) | `heapDelta` 0 — Chrome keeps PCM off the JS heap |
| **decode at 16 kHz** | 17.4 MB | 167 ms | `resampledByBrowser: true` — Chrome honours the requested rate |
| mono downmix (post-decode) | — | 24 ms | halves the resident set again |

Scaling is exact arithmetic (`sampleRate × channels × 4 bytes/s`):

| duration | native 44.1k stereo | 16 kHz stereo | **16 kHz mono** (what the analyzer sees) |
|---|---|---|---|
| 30 min | 606 MB | 220 MB | 110 MB |
| 60 min | 1.2 GB | 440 MB | 220 MB |
| 120 min | 2.4 GB | 880 MB | 440 MB |
| 180 min | 3.6 GB | 1.3 GB | 660 MB |

**Verdict:** plain `decodeAudioData` is sufficient. Strategy: request a 16 kHz
`AudioContext`, decode the whole file in one call, downmix to mono, extract the
windowed metric series, drop the `AudioBuffer`. 16 kHz Nyquist (8 kHz) is ample for
loudness/intensity; 16 (not 8) leaves headroom for K-weighting later. Decode time is
a non-issue at ~1000×+ realtime. A duration guard is a *nice-to-have advisory* past
~90 min, not a correctness requirement on desktop.

**Cross-browser (untested, handled in code):** the adapter reads `decodedBuffer.sampleRate`
after decode. If it's 16000 (Chrome confirmed; Safari very likely) → downmix + done.
If it's native (Firefox likely — historically ignores the requested rate) → downmix to
mono, then resample down via `OfflineAudioContext`, then drop the native buffer.

**Not measured:** the exact `decodeAudioData` failure ceiling (the held-copies stress
test). Not blocking — the 16 kHz path stays well under any plausible limit for
feature-length content.

### R2 — video frame sampling

Effective sample rate vs. playback rate, 30 fps source, 64×64 downscale, Chrome:

| playback rate | effective sample rate | wall speed-up | dropped frames | proc ms/frame* |
|---|---|---|---|---|
| 1× | 30 Hz (every frame) | 1.2× | 13% | 8.7 |
| **2×** | **30 Hz (every frame)** | **1.9×** | **1.3%** | 6.7 |
| 4× | ~14 Hz (every other frame) | 3.9× | 7% flash clip / **32% real motion** | 4.7–7.2 |
| 8× | ~8 Hz | 4.1× (plateau) | ~3% | 4.5 |

\* `willReadFrequently` 2D-canvas path — likely CPU-bound on full-frame readback;
a GPU canvas or `createImageBitmap` resize should cut this. Not chased down — not on
the critical path for the MVP.

Seek-loop (jump to exact timestamp, `seeked` event, draw):

- **Seek accuracy: exact.** 0 ms error on every one of 151 seeks — no keyframe snapping observed.
- **Speed: slow.** ~48 ms/seek mean, ~97 ms p95 → ~1.3× realtime for a full-file pass.
- Per-frame processing cheap (~3.7 ms).

**Verdict:** two-pass strategy.

1. **Coarse pass** — background playback at **2×** (`requestVideoFrameCallback`), full
   30 Hz sampling, ~1% frame drops, ~2× faster than realtime. Flag on brightness
   *variance/range* in short windows (aliasing-robust), tuned for recall — over-flag,
   accept false positives.
2. **Refine pass** — for each coarse flag, and for each audio event timestamp, re-scan
   a window padded ±2–3 s using the **exact seek-loop** at full frame rate. Confirms /
   rejects / precisely times each event. Total refine work is tens of seconds even for
   a feature film (a handful of short windows).

Known limitation: brief, fast flashing that falls between coarse samples and isn't
near an audio event can still be missed. Consistent with SoftView's stated
heuristic-only, no-guarantees position.

**Cross-browser:** Firefox has no `requestVideoFrameCallback` → coarse pass falls back
to a slower seek-loop scan there. Acceptable; flagged for a real-device pass.

### R3 — WebCodecs + mp4box.js

**Not needed for the MVP**, on both axes:

- Audio — R1 shows plain `decodeAudioData` is enough.
- Video — the 2×-playback coarse pass + seek-loop refine covers flash detection with
  plain browser APIs.

`WebCodecs VideoDecoder` (+ `mp4box.js` to demux the container) remains the **scaling
path for long-video coarse-pass speed**: it decodes as fast as the CPU allows, not
capped at ~4× realtime, and can be parallelised across workers. It slots in behind the
same analyzer interface (adapters produce a timestamped sample stream; the analyzer
doesn't care about the source), so it can be added later without a rewrite.

**Adopt it only if:** coarse-pass duration on long videos becomes a real UX problem,
or frame drops at 2× on real content prove worse than the ~1% seen here.

### Net architectural decisions

- Analysis engines are pure functions over a **timestamped sample stream**, no assumed
  frame/sample rate, no DOM, no React.
- Audio: one full pass at 16 kHz mono.
- Video: coarse (2× playback, variance-based, over-flagging) → refine (exact seek-loop
  on coarse flags + audio-event timestamps, padded a few seconds).
- Dependencies for Phase 0: React, Vite, Vitest, ESLint/Prettier. No WebCodecs, no
  mp4box.js, no ffmpeg, no state library — none justified yet.

This directory can now be deleted or kept as reference; nothing depends on it.
