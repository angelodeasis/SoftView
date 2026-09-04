# SoftView — session log

Recovery aid for picking work back up. Architecture and constraints live in `CLAUDE.md`;
spike measurements and the decisions they drove live in `spikes/README.md`. This file
only tracks session-to-session state.

---

## 2026-09-04 — main @ ec247aa, Phases 4–7 uncommitted in working tree

### Summary

Went from an empty repo (readme + license only) through a design plan, three validation
spikes, and the first eight implementation phases (0–7). **The app now runs a full
analysis end to end** — select → Analyze → progress → event list + timeline + limitations.
Remaining for the MVP: the real-browser pass of Phase 7, then Assisted Viewing (Phase 8)
and hardening (Phase 9).

- **Phases 0–3 are committed and pushed:** `669b254` → `3cf45f1 "Testing mp3/mp4 file
handling"` (Phases 0–1) → `ec247aa "Phase 3 push"` (Phases 2–3). `main` is in sync with
  `origin/main`.
- **Phases 4–7 are complete in the working tree, not committed** — the user reviews and
  commits. All checks green (188 tests); the real-browser pass found and fixed two bugs
  (scene-change misclassification, seek-target lag — see Bugs below) and is still in
  progress.

### Committed

- `669b254` — readme + license.
- `3cf45f1 "Testing mp3/mp4 file handling"` — Phases 0–1 (scaffold, core/UI boundary,
  local media selection + playback).
- `ec247aa "Phase 3 push"` — Phases 2–3 (common event model + testing kit; audio loudness
  analyzer). The sections below headed "Phase 2" / "Phase 3" describe what's in `ec247aa`.

### Committed detail (3cf45f1)

- **Design plan** — produced in conversation (not a file). Architecture, audio/visual
  analysis approach, common event model, Assisted Viewing, UX flow, testing, phasing.
- **Spikes** (`spikes/`, disposable — gitignored media, `media-generate.sh` regenerates).
  R1/R2 run by the user in Chrome 152; full results in `spikes/README.md`.
  - R1: `decodeAudioData` is fine — decode whole file at 16 kHz, downmix mono, drop buffer.
  - R2: coarse pass (2× playback, brightness variance, over-flag) → refine pass (exact
    seeks on coarse flags + audio-event timestamps, ±2–3 s pad).
  - R3: WebCodecs / mp4box.js not needed for MVP; later speed-up behind the analyzer iface.
- **Phase 0 — scaffold + core/UI boundary:** Vite 6 + React 19 + TS + Vitest; only runtime
  deps `react`, `react-dom`. `tsconfig.core.json` compiles `src/core` with **no "DOM" lib**;
  ESLint `no-restricted-imports` / `no-restricted-globals` on `src/core/**` is the second
  layer. Vitest split into `core` (node) and `browser` (jsdom) projects. `CLAUDE.md`.
- **Phase 1 — local media selection & playback:** `src/core/media/` (`validate.ts`,
  `largeFileAdvisory.ts`, `types.ts`); `src/media/` browser glue (`objectUrl.ts`,
  `probeMetadata.ts`, `MediaDescriptor.ts`); `src/ui/` (`SelectMedia.tsx` + `MediaDropZone`,
  `MediaPlayer`, `FileFactsPanel`). Real-browser click-through done in Chrome.

### Phase 2 — common event model + testing kit (committed in `ec247aa`)

Pure `src/core/` only. No adapters, no UI, no new deps, no config changes (the `testing/`
code is import-only from tests and tree-shakes out of the build — verified against `dist/`).

- `src/core/signal/timeSeries.ts` — `TimeSeries` = columnar `{ times: Float64Array;
values: Float32Array }` (the analyzer input contract; non-decreasing times, no assumed
  spacing). Helpers: `makeTimeSeries`, `sampleCount`, `spanSeconds`, `sliceByTime`
  (refine-pass window, copies), `valueAtOrBefore` (binary search), `EMPTY_SERIES`.
- `src/core/events/model.ts` — added `RawEvent` (`Omit<SensoryEvent, 'id' | 'severity'>`,
  what an analyzer emits) and `AnalyzerId` union (`'audio-loudness' | 'visual-flash'`,
  extended per analyzer phase). Existing `SensoryEvent` + `severityFromScore` unchanged.
- `src/core/events/normalize.ts` — `normalizeEvents(raw, { durationSec, mergeGapSec? })`:
  clamp times to `[0, duration]` and scores to `[0,1]` (NaN → 0), drop non-positive spans,
  merge events of the **same `channel` + `kind`** that overlap or sit within `mergeGapSec`
  (default 1 s), `severityScore` = max, `confidence` = `1 − Π(1 − cᵢ)`, highest-severity
  contributor wins `peakTime` + metric-key collisions, deterministic
  `id = channel:kind:round(start*1000)`, output sorted by start/channel/kind.
- `src/core/events/analysisResult.ts` — `AnalysisResult` (media, events, `runs`, `status`,
  `limitations`, `warnings`), `AnalyzerRun` (id, version, params, `durationMs`,
  `sampleCount`, `ok|failed|skipped`, `note?`), `BASE_LIMITATIONS` (soft-language
  standing caveats), `buildAnalysisResult(...)` — normalizes events, derives `status`
  (`complete` only if ≥1 run and all `ok`), prepends `BASE_LIMITATIONS`.
- `src/core/testing/generators.ts` — `genLoudnessSeries` (dBFS per hop) and
  `genBrightnessSeries` (0..1 per frame). **Emit a `TimeSeries` directly, not PCM/pixels**
  (decided with the user — PCM→loudness windowing is Phase 3's problem). Deterministic;
  seeded `mulberry32` for noise + time jitter. Each returns the `groundTruth` it injected.
  Event specs: `loudness-spike` / `sustained-loudness`; `flashing` / `luminance-spike`.
- `src/core/testing/groundTruth.ts` — `GroundTruthEvent`, `scoreDetections(expected,
actual, { toleranceSec? })` → `{ precision, recall, truePositives, matches,
unmatchedExpected, unmatchedActual, … }`. Greedy one-to-one by best overlap; a padded
  tolerance window (default 0.5 s) lets near-misses count. Phases 3/5 assert recall here.
- One `*.test.ts` beside each new file. +42 tests (30 → 72).

### Phase 3 — audio loudness analyzer (committed in `ec247aa`)

Pure `src/core/audio/` only. No adapters, no UI, no new deps, no config changes (imported
only by tests until Phase 4 wires it — tree-shakes out of the build, verified against `dist/`).

- `src/core/audio/loudness.ts` — `computeLoudness(pcm: Float32Array, sampleRate, opts?)
→ { rms: TimeSeries; peak: TimeSeries }`. Block processing: contiguous `hopSec` (20 ms)
  blocks get a mean-square + max-abs in one linear pass, then each output sample
  aggregates the trailing `windowSec` (400 ms). dBFS (`10·log10` RMS, `20·log10` peak),
  clamped to `DBFS_FLOOR = -120`. Sample time = block centre; value is trailing
  short-term loudness. Full-scale sine → −3.01 dBFS RMS / 0 dBFS peak.
- `src/core/audio/analyzeLoudness.ts` — `analyzeLoudness({ rms, peak? }, opts?) →
RawEvent[]` + `analyzeAudioLoudness(pcm, sr, opts?)` (compute + analyze). Three
  detectors, each emitting non-overlapping spans (global `normalizeEvents` still
  merges/orders):
  - **loudness-spike** — rms rise ≥ `spikeRiseDb` (10) vs the `meanInRange` baseline over
    `[t − spikeBaselineSec, t − spikeAttackSec]` **and** rms ≥ `spikeFloorDb` (−20).
  - **sustained-loudness** — rms ≥ `sustainedDb` (−14) for ≥ `sustainedMinSec` (4),
    tolerating dips < `sustainedGapSec` (0.5).
  - **clipping** — peak ≥ `clipDbfs` (−0.5) for ≥ `clipMinSec` (0.2); skipped if no peak.
    Exports `AUDIO_LOUDNESS_ANALYZER_ID` (: `AnalyzerId`), `AUDIO_LOUDNESS_VERSION = '1'`,
    `DEFAULT_LOUDNESS_PARAMS`. Severity/confidence via a local `clamp01` + `ramp`.
- `src/core/signal/timeSeries.ts` — added `meanInRange` / `maxInRange` (both analyzers
  will use these; `undefined` when the window catches no sample).
- `src/core/testing/generators.ts` — added `genAudioPcm({ durationSec, sampleRate?,
toneHz?, baselineDb?, noiseAmp?, seed?, events? }) → { pcm, sampleRate, groundTruth }`.
  Sine carrier tracking the loudest active event; `clipping` specs driven past full scale
  then hard-clamped. `PcmEventSpec`: `loudness-spike` / `sustained-loudness` / `clipping`.
- `analyzeLoudness.test.ts` runs `genAudioPcm → computeLoudness → analyzeLoudness →
normalizeEvents`, scored with `scoreDetections` (recall 1 on the combined-signal case).
- +24 tests (72 → 96).

### Completed in working tree — NOT committed (Phase 4 — audio decode adapter, first `src/adapters/`)

Browser glue. First code under `src/adapters/`. First worker. First config changes since
Phase 0. Nothing in the app imports it yet, so it tree-shakes out of the build.

- **Split: decode on the main thread, analyze in a worker.** Web Audio
  (`OfflineAudioContext`) is `Exposed=Window` only — _not available in workers_ (confirmed
  against `lib.webworker.d.ts`), so the plan's "whole pass in a worker" isn't possible.
  `analyzeAudioTrack` decodes on the main thread (async, non-blocking) and transfers the
  raw channel buffers to a worker that does the CPU-heavy downmix / resample / windowing /
  detection.
- `src/core/audio/downmix.ts` — `downmixToMono(channels) → Float32Array` (pure): `[]`→empty,
  1→copy, N→per-sample mean over the shortest channel.
- `src/core/audio/resample.ts` — `resampleLinear(pcm, fromRate, toRate) → Float32Array`
  (pure): linear interpolation, copy on equal rates. **Decision:** linear, not a second
  `OfflineAudioContext` render — we measure a loudness envelope, HF aliasing is negligible
  for RMS/peak, and it drops a browser dependency. Firefox path only.
- `src/adapters/audio/`:
  - `constants.ts` — `AUDIO_ANALYSIS_SAMPLE_RATE = 16000`.
  - `types.ts` — `AudioTrackOptions` (`{ loudness?: ... }`), `AudioTrackAnalysis`
    (`{ events, run }`), `DecodedAudio` (`{ sampleRate, channelData, durationSec }`),
    worker message shapes.
  - `audioAnalysisPipeline.ts` — `runAudioAnalysisPipeline(decoded, opts, now) →
AudioTrackAnalysis` (downmix → resample if ≠16k → `computeLoudness` → `analyzeLoudness`
    → ok `AnalyzerRun`); `decodeFailureAnalysis(opts, durationMs)` → failed run + empty
    events + soft `note`. **The unit-tested workhorse** (fake `now`, `genAudioPcm` fixtures).
  - `decodeAudio.ts` — `decodeViaOfflineAudioContext(bytes)`; browser-only, no unit test.
  - `audioAnalysis.worker.ts` — thin: message → pipeline → message. `/// <reference lib="webworker" />`.
  - `analyzeAudioTrack.ts` — `analyzeAudioTrack(blob, opts?, deps?)`: `blob.arrayBuffer()`
    → `decode` (try/catch → `decodeFailureAnalysis`) → `analyze` (default spawns the module
    worker via `new Worker(new URL('./audioAnalysis.worker.ts', import.meta.url), { type: 'module' })`,
    transfers buffers, `terminate()`s). Non-Blob (duck-typed on `arrayBuffer`) → `TypeError`.
    `deps` = `{ decode, analyze, now }`, all injectable.
- Config: `tsconfig.worker.json` (WebWorker lib, no DOM); `tsconfig.json` excludes
  `src/**/*.worker.ts`; `typecheck` script now runs **4** tsconfigs; `eslint.config.js`
  gains a `*.worker.ts` worker-globals block and a `src/adapters/**` rule barring imports
  from `ui/` / `state/` / `runtime/`.
- +20 tests (96 → 116).

### Completed in working tree — NOT committed (Phase 5 — visual flash analyzer)

Pure `src/core/video/` only. No adapters, no UI, no new deps, no config changes.
Tree-shakes out of the build until Phase 6 wires it.

- `src/core/video/analyzeFlash.ts` — `analyzeVisualFlash({ luminance: TimeSeries, redness? },
opts?) → RawEvent[]`. `redness` is accepted (mirrors `analyzeLoudness({ rms, peak? })`)
  but **unused until `red-flash`** lands. Exports `VISUAL_FLASH_ANALYZER_ID` (:`AnalyzerId`),
  `VISUAL_FLASH_VERSION = '1'`, `DEFAULT_FLASH_PARAMS`. Three detectors (run flashing →
  scene → spike, since spikes exclude the other two):
  - **flashing** — sliding `flashWindowSec` (1 s) window: count **direction reversals**
    among significant cumulative moves (a smooth ramp = one move; counting raw steps
    would flag a single spike). Flag when `reversals/2/spanSec ≥ flashPairsPerSec` (2.5,
    < WCAG's 3) **or** (`range ≥ flashRangeRel` 0.2 **and** mean-crossings ≥
    `flashMinZeroCross` 4 — the variance arm, for sub-Nyquist coarse sampling). Coalesce
    runs, drop < `flashMinRunSec` (0.3, unpadded). `confidence` 0.7 if the reversal arm
    fired, 0.45 variance-only.
  - **luminance-spike** — `|value − valueAtOrBefore(t − spikeWindowSec)| ≥ spikeDeltaRel`
    (0.22 over 0.25 s), **excluded** if inside a flashing run or within `sceneCompareSec`
    of a scene boundary. `normalizeEvents` merges the up + down of one flash into one event.
  - **scene-change** — `before`/`after`/`held` means (`meanInRange`, 0.5 s each side +
    1 s hold): fire when the shift is ≥ `sceneDeltaRel` (0.2) **and persists**.
    Deliberately **low severity** (`0.1–0.3`, always buckets `low`) — a context marker
    that also keeps a hard cut from being mis-flagged as a spike.
- `src/core/testing/generators.ts` — `BrightnessEventSpec` gains a `scene-change` variant
  (`{ atSec, from, to }` — a step that holds, with a 1 s lead-in at `from`). `brightnessSpan`
  updated.
- +11 tests (116 → 127). `analyzeFlash.test.ts` runs `genBrightnessSeries →
analyzeVisualFlash → normalizeEvents`, scored with `scoreDetections`.

### Completed in working tree — NOT committed (Phase 6 — video frame-capture adapter)

Browser glue in `src/adapters/video/` + two pure `src/core/video/` helpers. No worker
(`<video>` / canvas / rVFC are `Exposed=Window`). No config changes. Nothing in the app
imports it yet → tree-shakes out.

- `src/core/video/luminance.ts` — `relativeLuminance(r,g,b)` + `meanLuminance(rgba:
Uint8ClampedArray)`. Gamma-encoded Rec.709 luma (what R2 validated), **not** linearised
  — noted as a possible later refinement. Takes a byte array (not `ImageData`) so it
  compiles under `tsconfig.core.json`.
- `src/core/video/refineWindows.ts` — `refineWindows(coarseEvents, extraSec, {
mediaDurationSec, padSec? })` → pad each span/timestamp by `padSec` (2.5), clamp to the
  media, merge where they touch. Pure.
- `src/adapters/video/videoAnalysisPipeline.ts` — `runVideoAnalysisPipeline(deps, opts,
progress?) → { events, run, warnings }` (**the unit-tested workhorse**). deps =
  `{ coarseScan(ctx), refineScan(from,to,ctx), durationSec, now }`. Flow: coarse scan →
  `analyzeVisualFlash` (over-flag) → `refineWindows` → per-window dense re-scan +
  `analyzeVisualFlash` → `normalizeEvents(refined)`. **Coarse events are discarded** —
  only a "where to look" signal (R2). Progress 0–0.7 coarse / 0.7–1 refine.
  `coarseScanFailureAnalysis` → `status:'failed'`; refine-window failure → keep that
  window's coarse events + a soft warning, run stays `ok`; abort (`ctx.signal`) →
  `status:'skipped'` with partial events.
- `src/adapters/video/frameSampler.ts` — `createFrameSampler(video, opts)` →
  `{ coarseScan, refineScan }`. rVFC loop at `coarsePlaybackRate` (2) drawing to a hidden
  `downscalePx²` (64) canvas → `meanLuminance`; Firefox (no rVFC) → whole-file seek-loop
  at 15 Hz; refine = seek-loop at `refineFps` (30) over the window. Browser-only, no unit
  test (adapted from `spikes/r2-frame-sampling/`).
- `src/adapters/video/analyzeVideoTrack.ts` — `analyzeVideoTrack(blob, opts?, progress?,
deps?)`: `createObjectUrl` (revoked in `finally`), `buildSampler` (default: detached
  `<video muted playsInline>`, `loadedmetadata` → `video.duration` + `createFrameSampler`,
  `dispose` detaches), run pipeline. `buildSampler` failure → `failed` run. Non-Blob →
  `TypeError`. `deps` = `{ buildSampler, now }`, injectable.
- `src/adapters/video/types.ts` — `VideoTrackOptions` (`{ flash?, coarsePlaybackRate?,
downscalePx?, refinePadSec?, refineFps?, refineAroundSec? }`), `VideoTrackAnalysis`
  (`{ events, run, warnings }`), `ScanContext`, `VideoAnalysisProgress`.
- +22 tests (127 → 149). Pipeline tested with fake scans returning `genBrightnessSeries`
  output.

### Completed in working tree — NOT committed (Phase 7 — orchestration + results UI)

The integration phase. The app now runs a real analysis end to end. No new deps; no
config changes. **The audio worker chunk is now emitted** (`dist/assets/audioAnalysis.worker-*.js`,
4.5 kB) and the main bundle grew 200 → 221 kB as all the analyzer code became reachable.

- `src/core/events/describe.ts` (pure) — `eventKindLabel` / `severityLabel` /
  `confidencePhrase` (`likely`/`possible`/`uncertain`) / `channelLabel`. Kept in core so
  the "no alarming vocabulary" rule (CLAUDE.md #2) gets a regex test.
- `src/runtime/runMediaAnalysis.ts` — `runMediaAnalysis(input, progress?, deps?) →
AnalysisResult`. **Sequential: audio then video.** Both adapters injectable. MP4 gets
  both passes (audio event `peakTime`s → video `refineAroundSec`); MP3 gets audio only.
  `buildAnalysisResult` folds the runs — `partial` falls out automatically on a failed or
  `skipped` run.
- `src/state/analysisStore.tsx` — **Context + `useReducer`, no library** (the deferred
  decision). `<AnalysisProvider run={runMediaAnalysis}>` (`run` injectable) +
  `useAnalysis() → { state, analyze, cancel, reset }`. State union
  `idle | running{fraction,label} | done{result} | error{message}`. Run-token race guard
  drops stale resolutions after `cancel` (the `probeMetadata` pattern).
- `src/ui/components/`: `AnalyzeControls` (button ▸ `role="progressbar"` + Stop ▸ Analyze
  again), `EventList` (accessible `<ol>`, per-event seek `<button>` + `<details>` metrics,
  empty state), `EventTimeline` (static `aria-hidden` overview bar, severity-coloured
  clickable markers, list is the a11y path), `LimitationsNotice` (`role="note"`, always
  shows `BASE_LIMITATIONS`, partial notice + warnings), `ResultsPanel` (composes them).
  `MediaPlayer` → `forwardRef`. `src/ui/format.ts` — shared `formatClock`.
  `src/ui/seekTarget.ts` — shared "where to seek for this event" (see Bugs: fixed to
  anchor on `startTime`, not `peakTime`).
- `SelectMedia` refactored to **controlled** (`{ descriptor, onSelect }`); `App` now owns
  the descriptor + its object-URL lifecycle (revoke keyed off `objectUrl` so the
  `withMetadata` re-emit doesn't kill the shared URL) + a `playerRef` for seek-on-click,
  and `reset()`s the analysis when the file changes. `main.tsx` wraps `<App>` in the
  provider.
- `src/index.css` — analyze/progress, event list, timeline (severity tokens
  `--sev-low/moderate/high`), limitations styles, under the existing token +
  reduced-motion conventions.
- +35 tests (149 → 184). `App.test.tsx`: select MP3 → Analyze (fake `run`) → results.

### In progress

- Nothing mid-edit. Phases 4–7 are complete in the working tree (Phases 0–3 committed);
  all checks pass. **Real-browser pass: in progress, one bug found + fixed (see Bugs
  below), re-verification of the fix is the next step** — dev server is up.

### Planned / not started

- Phases 8–9 per the design plan: Assisted Viewing → hardening.
- **Real-browser pass (resume):** re-check the flash video from `test-media/` now
  reports `luminance-spike` (not `scene-change`) and seeking lands on the flash; then
  finish the original checklist — MP3 events, MP4 progress bar + audio worker +
  `frameSampler`, Stop mid-run, event seeking — in Chrome and Firefox. Clears most of the
  standing browser-code follow-up.
- **Phase 8 (Assisted Viewing)** — soften the flagged moments during playback: gain
  ducking / low-pass around audio events, brightness/contrast reduction + gentle
  transitions around visual events, seeking support, custom controls.

### Unresolved questions

- **Growing pile of browser code that only synthetic tests cover — needs a real Chrome +
  Firefox pass, folded into Phase 7 (or a throwaway harness):**
  - Phase 4: the worker transport (`new Worker(new URL(...))`), `OfflineAudioContext`
    decode, the Firefox `sampleRate !== 16000` resample branch.
  - Phase 6: `frameSampler`'s rVFC coarse loop, the Firefox whole-file seek-loop fallback,
    canvas `drawImage`/`getImageData` readback, `<video>` `loadedmetadata` + `duration`,
    playbackRate, and the abort→`video.pause()` paths.
- R2 capture-cost micro-optimisation (willReadFrequently vs GPU canvas vs
  `createImageBitmap`) deliberately not chased — revisit only if the coarse pass feels slow.
- No state-management library yet — deferred until state is shared across screens (~Phase 7).
- Whether to keep `spikes/` long-term or delete it — user's call; nothing depends on it.
- `AnalyzerId` is a closed union edited per analyzer phase (not an open string). Revisit
  only if that churn becomes annoying.

### Decisions made

- **Phase 2 design choices (with the user):**
  - Sample stream = **columnar typed arrays** (`Float64Array`/`Float32Array`), not
    array-of-structs — feature-film scale is 100k–400k samples; avoid per-sample objects.
  - Signal generators **emit a pre-computed `TimeSeries`**, not raw PCM. Video's
    frame→brightness is canvas-only (adapter's job); audio's PCM→loudness windowing gets
    its own fixtures in Phase 3.
  - **Full `AnalysisResult` container now** — per-run metadata, `complete`/`partial`
    status, limitations, warnings — rather than a minimal shape enriched later.
  - `testing/` code lives under `src/core/` (stays under the purity umbrella + `core`
    vitest project) and is expected to tree-shake out of the build.
- **Phase 3 design choices (with the user):**
  - **PCM→loudness windowing lives in pure core** (`src/core/audio/loudness.ts`), not in
    the decode adapter. The Phase 4 adapter just decodes + downmixes + calls it.
  - **All three audio event kinds** (`loudness-spike`, `sustained-loudness`, `clipping`);
    the windower emits a per-hop peak series alongside RMS so clipping is nearly free.
  - **`loudness-spike` = sudden rise AND loud floor** — a jump from silence to quiet
    speech doesn't qualify.
  - Plain RMS dBFS; K-weighting / LUFS deliberately deferred (R1 left the headroom).
  - Reversed the earlier SESSION.md note: `genAudioPcm` **does** synthesize raw PCM (added
    to Phase 2's `generators.ts`), so the windower is tested on real samples.
- **Phase 4 design choices (with the user):**
  - **Web Worker for the audio pass** — but decode had to stay on the main thread (Web
    Audio isn't in workers); only the CPU-heavy analysis half runs off-thread. Spawn a
    fresh module worker per analysis (fine for MVP; a pooled worker is a later option).
  - **`analyzeAudioTrack` returns a full unit** — `{ events, run }`, decode + analyze +
    timing + metadata in one call.
  - **Decode failure resolves, not rejects** — `run.status: 'failed'` + soft `note`, so
    the orchestrator can still build a `partial` result. Rejects only on a bad argument.
  - **Firefox resample = pure linear interpolation** (see Phase 4 notes above).
  - Every browser-only step (`decode`, `analyze`, `now`) is an injectable dep with a real
    default and a fake in tests — the `src/media/` pattern.
- **Phase 5 design choices (with the user):**
  - **Three visual kinds** (`flashing`, `luminance-spike`, `scene-change`) from one 0..1
    luminance series; **`red-flash` deferred** (needs per-frame colour from the Phase 6
    adapter — the analyzer already takes an optional `redness` series for it).
  - **Thresholds deliberately more sensitive than WCAG / Harding, all tunable** (~8% rel.
    luminance, ~2.5 transition-pairs/sec vs 10% / >3).
  - **flashing fires on transition-rate OR high windowed variance** — the variance arm
    catches flashing that sub-Nyquist coarse-pass sampling under-counts.
  - flashing counts **direction reversals**, not raw steps, so a single spike's ramp
    isn't mistaken for oscillation.
  - `scene-change` is intentionally low-severity — a marker that also improves
    `luminance-spike` precision (a hard cut is a scene change, not a spike).
- **Phase 6 design choices (with the user):**
  - **`refineAroundSec: number[]` option** — the orchestrator feeds audio-event
    timestamps in; video stays decoupled from the audio analyzer.
  - **Best-effort refine failure** — coarse-scan failure → `failed` run; one refine
    window failing → keep its coarse events + a warning, run stays `ok`.
  - **Progress + cancellation built into Phase 6** — `coarseScan`/`refineScan` take
    `onProgress` + `AbortSignal`; abort → `status: 'skipped'` with partial events.
  - **No worker** — `<video>` / canvas / rVFC are Window-only; the pass is playback-wall-
    time-bound, not CPU-bound, so a worker wouldn't help.
  - `analyzeVideoTrack` takes a `Blob` (like `analyzeAudioTrack`) and manages its own
    object URL, rather than an object-URL string.
- **Phase 7 design choices (with the user):**
  - **State: Context + `useReducer`, no library** — resolves the decision deferred since
    Phase 1. Small status union; `run` injectable on the provider.
  - **Results view = accessible event list (primary) + static overview bar + always-on
    limitations.** No keyboard-navigable timeline widget yet.
  - **Explicit Analyze button** — never auto-start (video is a minutes-long playback pass).
  - Audio runs before video so its event times feed the video refine pass (sequential).
  - Plain-language event copy lives in `src/core/events/describe.ts` (the soft-language
    mandate is a core concern).
- **TypeScript** over JS/JSDoc (README still says "JavaScript"; not updated).
- **No state library, no WebCodecs, no mp4box.js, no ffmpeg, no new deps** — none
  justified yet (the worker, linear resampler, and app state are all hand-rolled /
  browser-native / React built-ins).
- Pure media logic lives in `src/core/media/` (boundary is about purity, not just "analysis").
- Native `<video>`/`<audio>` controls for now; custom controls arrive with Assisted Viewing.
- `readme.md` / `License` casing left as-is (user's optional cleanup).

### Bugs / blockers / follow-ups

- **Fixed — found via the real-browser pass (2026-09-04):** a brief video flash with
  nothing else happening afterward was misreported as a low-severity `scene-change`
  instead of `luminance-spike`, and clicking it seeked to _after_ the flash. Root cause:
  `sceneChangeEvents`' "before" comparison window could straddle the flash's own trailing
  edge, getting pulled toward it; since the video then genuinely stayed dark, that read as
  a persistent shift, and the false scene-change's proximity then suppressed the real
  spike (spikes are excluded near a scene boundary — `luminanceSpikeEvents`'s
  `nearScene`). **Fix:** `sceneChangeEvents` now requires the "before" window to itself be
  flat (`max − min < sceneDeltaRel`, via a new `minInRange` alongside the existing
  `maxInRange`) before accepting a candidate boundary — `src/core/signal/timeSeries.ts`,
  `src/core/video/analyzeFlash.ts`. Two regression tests added (no scene-change alongside
  a lone flash; `peakTime` lands on/near the flash, not after). Confirmed by generating
  real fixtures (`test-media/`, ffmpeg — gitignored) and re-testing in the browser.
- **Fixed — found via the real-browser pass (2026-09-04):** clicking a `loudness-spike`
  event seeked noticeably _after_ the audible beep (it had nearly finished playing by the
  seek point). Root cause: `computeLoudness`'s RMS is a _trailing_ 400 ms window, so for
  a short burst the windowed value keeps climbing until the window is fully inside the
  loud region — its measured max (`peakTime`, what the UI seeked to) lands up to
  ~windowSec after the true onset, not at it. `startTime` (the first sample that tripped
  the detector) lags the true onset by only ~1–2 hops (tens of ms) and doesn't have this
  problem. **Fix:** seeking now targets `startTime` (with a 0.2 s lead-in), not
  `peakTime`, for every event kind — a new shared `src/ui/seekTarget.ts`, used by
  `EventList` and `EventTimeline` (previously each had its own `peakTime ?? startTime`
  helper). `peakTime` is unchanged in the model/analyzers (still useful for severity /
  future features) — only what the UI seeks to changed. Existing seek-related component
  tests updated; a new `seekTarget.test.ts` added.
- Follow-up: Claude's first-pass output repeatedly failed `prettier --check` and needed a
  `prettier --write` pass. Consider a pre-commit hook, or just run `format` before `build`.
  (Phase 2: ran `npm run format` before committing checks — clean.)

### Test / build status (run 2026-09-04, after Phase 7 + the scene-change and seek-target bugfixes)

- Lint: PASS (0 problems) · Typecheck: PASS (**4** tsconfigs) · Format: PASS
- Tests: **188 passed / 188** (33 files; `core` in node, `browser` in jsdom)
- Build: PASS — **the audio worker chunk is now emitted**
  (`dist/assets/audioAnalysis.worker-*.js`, 4.5 kB); main bundle 200 → **221 kB**
  (70.4 kB gzip), CSS 2.0 → 4.7 kB, 66 modules (was 38). All expected — the app now pulls
  in every analyzer.

### Next session should start with

**The real-browser pass** (last Phase-7 task, in progress — two bugs found and fixed so
far) — `npm run dev` in Chrome + Firefox: re-check the beep MP3 now seeks right before the
beep, re-check the flash MP4, then finish the original checklist (MP3/MP4 events, progress
bar, worker + frame sampler, Stop, seeking) in both browsers. Then review + commit Phases
4–7 and plan **Phase 8** (Assisted Viewing — softening the flagged moments during
playback: audio ducking/low-pass, brightness/contrast reduction, gentle transitions,
custom controls).

### Git state

`main` @ `ec247aa`, in sync with `origin/main`. Phases 0–3 committed and pushed. Working
tree = Phases 4–7 (+ the two bugfixes), awaiting the user's review and commit; nothing
branched or stashed:

- modified (tracked): `SESSION.md`; `eslint.config.js`, `package.json`, `tsconfig.json`
  (Phase 4); `src/core/testing/generators.ts` + `.test.ts` (Phase 5); `src/core/signal/timeSeries.ts`
  - `.test.ts` (`minInRange`, bugfix); `src/App.tsx`, `src/main.tsx`, `src/index.css`,
    `src/ui/screens/SelectMedia.tsx` + `.test.tsx`, `src/ui/components/MediaPlayer.tsx`
    (Phase 7); `.gitignore` (`test-media/`)
- new/untracked: `tsconfig.worker.json`; `src/adapters/` (Phases 4, 6); `src/core/audio/{downmix,
resample}.ts` (Phase 4); `src/core/video/` (Phases 5–6, incl. the scene-change bugfix in
  `analyzeFlash.ts`); `src/core/events/describe.ts`, `src/runtime/`, `src/state/`,
  `src/ui/format.ts`, `src/ui/seekTarget.ts` (+ test, bugfix), `src/ui/components/{AnalyzeControls,
EventList,EventTimeline,LimitationsNotice,ResultsPanel}.tsx`, `src/App.test.tsx` (Phase 7);
  all with `.test.*`

Phase 4 = audio adapter + worker + config; Phase 5 = `analyzeFlash` + generators
`scene-change`; Phase 6 = video adapter + `luminance`/`refineWindows`; Phase 7 = runtime +
state + results UI + the `SelectMedia`/`App` refactor. Commit as one unit, or split by
phase from the diff.
