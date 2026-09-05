# SoftView — session log

Recovery aid for picking work back up. Architecture and constraints live in `CLAUDE.md`;
spike measurements and the decisions they drove live in `spikes/README.md`. This file
only tracks session-to-session state.

---

## 2026-09-04 — main @ 5e66d69, working tree clean, in sync with origin/main

### Summary

Went from an empty repo (readme + license only) through a design plan, three validation
spikes, and **Phases 0–9, all committed and pushed**, plus a round of post-Phase-9
polish and two real-file bugfixes (also committed and pushed) — the app runs the full
experience end to end: select → Analyze → progress → results → Assisted Viewing,
user-confirmed in the browser at every stage, including a real jump-scare clip that now
correctly gets flagged and dimmed/ducked on both the visual and audio channels.

- **Phases 0–3:** `669b254` → `3cf45f1 "Testing mp3/mp4 file handling"` (Phases 0–1) →
  `ec247aa "Phase 3 push"` (Phases 2–3).
- **Phases 4–7 + both bugfixes:** `a629e6e "MP3 and MP4 Audio Analysis"`.
- **Phase 8 (Assisted Viewing) + the audio-target tuning + colour desaturation:**
  `2c6296b "assisted viewing"`.
- **Phase 9 (hardening) + post-Phase-9 UI polish** (live timeline/playhead in Assisted
  Viewing, the visual redesign): `98d7626 "verification tests"`.
- **Jump-scare detection fixes** (short-video full dense scan, `spikeRiseDb` lowered,
  the severity-weighting rebalance and its two follow-up corrections): `5e66d69
"jumpscare detection"`.
- `main` is in sync with `origin/main`, working tree clean. All checks green
  (228 tests).

### Committed

- `669b254` — readme + license.
- `3cf45f1 "Testing mp3/mp4 file handling"` — Phases 0–1 (scaffold, core/UI boundary,
  local media selection + playback).
- `ec247aa "Phase 3 push"` — Phases 2–3 (common event model + testing kit; audio loudness
  analyzer). The sections below headed "Phase 2" / "Phase 3" describe what's in `ec247aa`.
- `a629e6e "MP3 and MP4 Audio Analysis"` — Phases 4–7 (audio decode adapter, visual flash
  analyzer, video frame-capture adapter, orchestration + results UI) plus the two
  real-browser-pass bugfixes (scene-change misclassification, seek-target lag). The
  sections below headed "Phase 4" through "Phase 7" and the two "Fixed" bugs describe
  what's in `a629e6e`.
- `2c6296b "assisted viewing"` — Phase 8 (the `mitigationAt` envelope, the
  `useAssistedPlayback` hook, the Assisted Viewing screen) plus the post-review tuning:
  `DEFAULT_AUDIO_TARGETS` deepened twice, and colour desaturation (`saturation` /
  `DEFAULT_SATURATION_TARGETS`) added to visual mitigation. The section below headed
  "Phase 8" describes what's in `2c6296b`.
- `98d7626 "verification tests"` — Phase 9 (`ErrorBoundary` / `CrashNotice`, the
  `MediaPlayer` playback-failure fallback, the large-file advisory surfaced by the
  Analyze button, focus-management fixes) plus two post-Phase-9 UI requests: a live
  playhead added to `EventTimeline` and reused inside `AssistedViewing`, and a from-
  scratch visual redesign of `src/index.css` (design tokens, card layout, unified
  buttons, filled severity chips). The section below headed "Post-Phase-9 UI polish"
  describes the timeline/playhead and redesign parts of what's in `98d7626`.
- `5e66d69 "jumpscare detection"` — three real-file-driven fixes, all found by testing an
  actual FNAF jump-scare clip end to end: (1) short videos (`fullScanMaxDurationSec`,
  default 20s) skip the coarse pass and dense-scan the whole file, closing a blind spot
  where a brief flash could fall entirely between coarse-pass samples; (2)
  `spikeRiseDb` lowered `10 → 5` so a loud sound following a quieter-but-not-silent
  moment (not true silence) still registers as a spike; (3) `analyzeLoudness`'s
  `severityScore` reweighted toward absolute peak loudness rather than how much a sound
  rose, through two follow-up corrections once real browser-measured numbers (read from
  the app's own event-details UI) showed the first calibration's margin was too thin.
  The sections below headed "Bug found + fixed" / "Tuning" / "Then reconsidered..."
  describe what's in `5e66d69`.

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

### Phase 4 — audio decode adapter, first `src/adapters/` (committed in `a629e6e`)

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

### Phase 5 — visual flash analyzer (committed in `a629e6e`)

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

### Phase 6 — video frame-capture adapter (committed in `a629e6e`)

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

### Phase 7 — orchestration + results UI (committed in `a629e6e`)

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

### Phase 8 — Assisted Viewing (committed in `2c6296b`)

The feature the project is named for. No new deps, no config changes — native
`HTMLMediaElement.volume` + CSS `filter: brightness()`, both browser-native.

- `src/core/assistedViewing/envelope.ts` (pure) — `mitigationAt(events, currentTime,
opts?) → { volume, brightness, activeAudioEvent?, activeVisualEvent? }`. Consumes
  events, never re-detects: a pure function of `(events, currentTime)`, recomputed fresh
  every call — which is also why seeking "just works" with no special-casing. Per event:
  padded window `[startTime−fadeSec, endTime+fadeSec]` (`fadeSec` default 0.5s); factor 0
  outside it, 1 across `[startTime,endTime]`, linear ramp in the fades either side;
  multiplier `= 1 − factor·(1 − target[severity])`. Overlapping events of the same
  channel → **minimum** multiplier wins (deepest cut), no special-casing needed — falls
  out of recomputing per call. Audio-channel events → `volume`; visual-channel events
  **except `scene-change`** (Phase 5's low-severity context marker) → `brightness`.
  Default targets: audio low/moderate/high → ×0.7/×0.45/×0.2; visual → ×0.75/×0.55/×0.35.
- `src/ui/useAssistedPlayback.ts` — `requestAnimationFrame` hook: each tick reads
  `el.currentTime`, calls `mitigationAt`, sets `el.volume` + `el.style.filter`, derives a
  plain-language `status` (via `eventKindLabel`) for the live region. Runs continuously
  (not gated on play/pause) so a paused seek still reflects the right state. DOM-mutation
  wiring, not a capture adapter — stays in `src/ui/`, not `src/adapters/`; **not
  unit-tested** (rAF + live DOM mutation), same precedent as `frameSampler.ts` — verified
  in the real-browser pass instead.
- `src/ui/screens/AssistedViewing.tsx` — its **own** `MediaPlayer` instance (never
  alongside the raw preview player — App swaps between the two, never renders both),
  wires the hook, shows a heading, an explanatory note, an `aria-live="polite"` status
  line, and an **Exit Assisted Viewing** button.
- `src/ui/components/ResultsPanel.tsx` — added `onStartAssistedViewing` + a "Start
  Assisted Viewing" button (a **separate, explicit mode** per the user's choice — not a
  toggle on the preview player, matching the README's literal flow: review, _then_ start
  Assisted Viewing).
- `src/App.tsx` — `const [assisted, setAssisted] = useState(false)`; when `assisted &&
state.status === 'done'`, renders only `<AssistedViewing>`; otherwise the normal
  review flow. Selecting a new file resets `assisted` to `false` alongside the existing
  analysis reset.
- +13 tests (188 → 201): `envelope.test.ts` (9, the real coverage — no-op far from
  events, full target in the hold region, symmetric fade-in/out, exact boundary, deepest
  overlapping cut wins, `scene-change` never dims, custom targets/fade, zero-fade step),
  `AssistedViewing.test.tsx` (2), `ResultsPanel.test.tsx` (+1), `App.test.tsx` (+1, start
  → exit). (Phase 8's own post-review tuning — audio targets deepened twice, colour
  desaturation added — is folded into the "Phase 8 design choices" block below since it
  landed in the same commit.)

### Phase 9 — hardening (committed in `98d7626`)

Closes the README checklist items never explicitly targeted: error handling, large-file
behavior, a final accessibility pass. No new deps, no config changes.

- **Error boundary, scoped to analysis/results (not the whole app).**
  `src/ui/components/ErrorBoundary.tsx` — a class component (React error boundaries need
  `componentDidCatch`/`getDerivedStateFromError`; no hook equivalent), `fallback` is a
  render-prop receiving a `reset()`. `src/ui/components/CrashNotice.tsx` — the fallback UI
  (`role="alert"`, soft-language, "your file was never uploaded, this wasn't a data
  issue", a **Back to start** button). `src/App.tsx` wraps only
  `AnalyzeControls`/`ResultsPanel`/`AssistedViewing` in it; `SelectMedia` and the raw
  preview player are hoisted outside so they stay usable through a crash. Back to start
  calls the boundary's `reset()` **and** the analysis store's `reset()` **and**
  `setAssisted(false)` — a full return to "file selected, nothing analyzed", no reload.
- **`MediaPlayer.tsx` surfaces local playback failures.** An `onError` handler +local
  `broken` state swaps the element for a `role="alert"` message ("couldn't be played
  back... SoftView may still be able to analyze it") instead of a silently broken
  control. `App.tsx`'s preview instance gets `key={descriptor.objectUrl}` so `broken`
  resets per file (the Assisted Viewing screen's own instance already remounts fresh per
  session, no key needed).
- **The large-file advisory now also shows by the Analyze button**, not just in the facts
  panel — `AnalyzeControls` gained an optional `advisory` prop (reuses the existing
  `advisory`/`advisory--{level}` styles), `App.tsx` computes it once via
  `largeFileAdvisory` and passes it down. **Stays non-blocking** per the user's choice —
  purely a second look at the same information, no confirmation gate.
- **Accessibility: focus management was the one real gap found.** Entering/exiting
  Assisted Viewing and completing an analysis all replace the button the user just
  activated; unhandled, the browser drops focus to `<body>`. Fix: `ResultsPanel` and
  `AssistedViewing`'s headings get a ref + `tabIndex={-1}` + a mount-only
  `useEffect(() => ref.current?.focus(), [])`. Because both components fully
  unmount/remount on every relevant transition, this single pattern in each covers **all
  four** transitions (analysis completing, entering Assisted Viewing, exiting back to
  review) with no extra wiring. Everything else audited (heading hierarchy, accessible
  names, keyboard reach) was already sound from Phases 1/7/8.
- **`EventList`'s per-event disclosure** — each `<summary>Details</summary>` had the same
  accessible name for every event; now `aria-label="Details for {time}, {kind}"` per row.
- +13 tests (203 → 216): `ErrorBoundary.test.tsx` (3), `CrashNotice.test.tsx` (2),
  `MediaPlayer.test.tsx` (3, incl. a new file — this component had none before),
  `AnalyzeControls.test.tsx` (+2, advisory shown/absent), `ResultsPanel.test.tsx` (+1,
  heading gets focus), `AssistedViewing.test.tsx` (+1, heading gets focus),
  `EventList.test.tsx` (+1, distinct accessible names).

### In progress

- Nothing mid-edit. Everything through Phase 9 and the post-Phase-9 jump-scare fixes
  (see further down this log) is committed, pushed, and real-browser-verified.

### Planned / not started

- ~~Real-browser pass for Phase 9~~ — done; user confirmed the crash boundary + Back to
  start, focus management across all four transitions, and the `MediaPlayer` fallback
  all work, then committed and pushed (`98d7626`).
- **Standing real-browser gaps (Phases 4–7):** Stop mid-run, and a full pass in
  **Firefox** (audio resample fallback, `frameSampler` seek-loop) — still not exercised.
  Revisit before shipping.

### Unresolved questions

- **Growing pile of browser code that only synthetic tests cover:**
  - Phase 4: the worker transport (`new Worker(new URL(...))`), `OfflineAudioContext`
    decode, the Firefox `sampleRate !== 16000` resample branch.
  - Phase 6: `frameSampler`'s rVFC coarse loop, the Firefox whole-file seek-loop fallback,
    canvas `drawImage`/`getImageData` readback, `<video>` `loadedmetadata` + `duration`,
    playbackRate, and the abort→`video.pause()` paths.
  - Phase 8: `useAssistedPlayback`'s rAF loop, live `.volume`/`.style.filter` mutation —
    eyeballed and confirmed by the user in Chrome (incl. the tuning rounds); Firefox and
    automated coverage are still open.
- R2 capture-cost micro-optimisation (willReadFrequently vs GPU canvas vs
  `createImageBitmap`) deliberately not chased — revisit only if the coarse pass feels slow.
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
- **Phase 8 design choices (with the user):**
  - **Native `.volume` property, not Web Audio API.** No `AudioContext`/`GainNode` graph
    — simplest mechanism that satisfies "gradually reducing audio"; a richer (low-pass/EQ)
    mechanism stays a documented future option if plain ducking ever proves insufficient.
  - **A separate, explicit "Assisted Viewing" mode**, not a toggle on the existing
    preview player — its own player instance, entered via a button on the results view,
    with an Exit back to review. Matches the README's literal flow (review, _then_ start
    Assisted Viewing) and keeps "the user remains in control" unambiguous (one action in,
    one action out).
  - **Severity-scaled mitigation depth, `scene-change` excluded** from visual dimming
    (it's a deliberately low-severity context marker, not an intensity event).
  - Custom playback controls explicitly deferred again — native `controls` on both
    players is enough for Phase 8; nothing about softening requires replacing them.
  - **Tuned deeper twice after real-browser feedback (2026-09-04):**
    `DEFAULT_AUDIO_TARGETS` low/moderate/high `0.7/0.45/0.2 → 0.55/0.3/0.1 →
0.3/0.15/0.05` — the user found the beep-MP3 ducking too mild, twice. A `high`
    severity event now plays at 5% volume. `DEFAULT_VISUAL_TARGETS` untouched throughout.
    Only the constant changed in `src/core/assistedViewing/envelope.ts`; existing tests
    reference the exported
    constant rather than hardcoded numbers, so all 9 stayed green with no edits.
  - **Colour desaturation added to visual mitigation (2026-09-04, user's idea):** flagged
    visual moments now also pull toward grayscale (CSS `saturate()`), not just dimmer —
    reduces flash-trigger potential more broadly than luminance alone, and covers
    saturated-red specifically (which WCAG/Harding call out) without needing a dedicated
    red-detection signal. `MitigationLevel` gained `saturation`; `DEFAULT_SATURATION_TARGETS`
    low/moderate/high = `0.6/0.3/0` (high severity → full grayscale). Deliberately
    **derived from the same active event/factor that `brightness` picked** (in
    `channelMultiplier`, which now also returns `factor`), not independently re-selected —
    the two always move together, one "what's happening visually right now" decision.
    `scene-change` stays excluded, same as brightness. `useAssistedPlayback` now sets
    `filter: brightness(...) saturate(...)` together. +2 tests (envelope: 9 → 11; total
    201 → 203).
- **Phase 9 design choices (with the user):**
  - **Error boundary scoped to analysis/results, not the whole app** — a crash there
    shouldn't take `SelectMedia` or the raw preview player down with it, and "Back to
    start" (boundary reset + analysis reset + `assisted=false`) is a full recovery
    without a page reload.
  - **Large-file behavior stays non-blocking** — the existing advisory is shown a second
    time, by the Analyze button, rather than gating Analyze behind a confirmation step.
  - **Full accessibility audit**, not a light skim — focus management (headings losing
    focus to `<body>` on the four review/Assisted-Viewing transitions) was the one real
    gap; fixed via `tabIndex={-1}` + mount-focus on `ResultsPanel`/`AssistedViewing`'s
    headings, which covers all four transitions from two small, identical additions.
- **TypeScript** over JS/JSDoc (README still says "JavaScript"; not updated).
- **No state library, no WebCodecs, no mp4box.js, no ffmpeg, no new deps** — none
  justified yet (the worker, linear resampler, app state, and Assisted Viewing's envelope
  are all hand-rolled / browser-native / React built-ins).
- Pure media logic lives in `src/core/media/` (boundary is about purity, not just "analysis").
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

### Test / build status (run 2026-09-04, after Phase 9)

- Lint: PASS (0 problems) · Typecheck: PASS (**4** tsconfigs) · Format: PASS
- Tests: **216 passed / 216** (38 files; `core` in node, `browser` in jsdom)
- Build: PASS — bundle grew modestly, no new chunks: main bundle 223.2 → **224.85 kB**
  (71.7 kB gzip), CSS 5.2 → 5.7 kB, 71 modules (was 69); the audio worker chunk is
  unchanged (4.5 kB).

### Post-Phase-9 UI polish (2026-09-04)

After the real-browser pass the user confirmed Phase 9 works and asked for two small,
mainly-UI follow-ups. **#1 — live timeline in Assisted Viewing:** the same coloured
severity-overview bar shown on the results/review screen (`EventTimeline`) is now also
rendered in `AssistedViewing`, with a live playhead that tracks `currentTime` so the
viewer can see what's coming up while actually watching.

- `EventTimeline` gained an optional `playheadRef?: RefObject<HTMLDivElement | null>` —
  when passed, it renders a `.timeline__playhead` div the caller moves imperatively.
- `useAssistedPlayback` gained an optional third `playhead?: PlayheadTarget` arg
  (`{ ref, durationSec }`) — driven from the **same** `requestAnimationFrame` loop that
  already updates volume/filter, not a second loop; stored in a ref so the main effect's
  `[ref]` dependency array is untouched.
- `AssistedViewing` wires a `playheadRef`, passes it to both the hook and
  `EventTimeline`, and reuses `EventTimeline`'s existing `onSeek` for click-to-seek on
  the assisted player itself.
- New CSS: `.timeline__playhead` (thin vertical bar, `pointer-events: none`).
- Tests: `EventTimeline.test.tsx` (+1 — playhead only renders when a ref is passed, and
  attaches to the right element), `AssistedViewing.test.tsx` (+2 — the timeline/playhead
  render with events, and clicking a marker seeks the assisted player).
- Verified: **219/219** tests pass, typecheck/lint/format clean, build succeeds (main
  bundle 224.85 → 225.34 kB / 71.91 kB gzip, CSS 5.7 → 5.81 kB, module count unchanged).
  Not yet reviewed in the real browser by the user.

**#2 — a visual redesign** ("sleek modern look... not overdone"). CSS-only pass over
`src/index.css`: design tokens (surface/border/radius/shadow colours, light + dark),
card treatment for every top-level section, a unified button system (filled primary vs.
outline secondary, hover/active/focus-visible states), a refined dropzone (including a
styled native `::file-selector-button`), filled severity chips instead of outlined text,
a rounded/hover-able timeline with an accent-coloured playhead, and soft tinted banners
(disclaimer/error/advisory/limitations/crash) replacing the old left-accent-bar look.
No markup or class-name changes, so no test was touched. Verified: 219/219 tests,
typecheck/lint/format clean, build OK (CSS 5.81 → 8.97 kB / gzip 2.33 kB, JS unchanged).
Not yet reviewed in the real browser by the user.

### Bug found + fixed: short clips could miss a fast visual event entirely

The user tested a real 6 s FNAF jumpscare clip (in `~/Downloads/`, not a repo fixture) —
Assisted Viewing didn't flag the jumpscare at all. Diagnosed by extracting the file's
real luminance and 16 kHz-mono loudness curves with ffmpeg and feeding them straight into
the pure `src/core` analyzers (`analyzeVisualFlash`, `analyzeLoudness`) via a throwaway
Vitest file (deleted after, never committed) — no browser needed since core is pure.

Findings:

- The jumpscare's brightness spike is enormous (~0.25 → ~0.92 relative luminance, ~4× the
  `spikeDeltaRel` threshold) and `analyzeVisualFlash` catches it easily — at 60 fps, at a
  simulated 30 fps (the real `refineFps` default), and even at a crudely decimated ~15
  fps. So the detector itself was never the problem.
- The audio has one loud onset near t≈0.3 s (correctly flagged as `loudness-spike` +
  `clipping`) that continues, without a fresh silence-to-loud rise, straight through the
  visual jumpscare at t≈3.2 s — so no second audio event exists there to seed a video
  refine window via `refineAroundSec`.
- That leaves the video coarse pass (background playback at ~2×, sampling whatever frames
  `requestVideoFrameCallback` actually delivers) as the only path that could have caught
  it — and on a short, few-second clip, a ~150 ms flash can plausibly fall entirely
  between coarse samples with nothing to compensate, unlike on a long file where the
  coarse pass's job is explicitly to over-flag _candidates_ for a guaranteed-dense refine.

**Fix:** `runVideoAnalysisPipeline` (`src/adapters/video/videoAnalysisPipeline.ts`) now
skips the coarse pass entirely for videos at or under a new `fullScanMaxDurationSec`
(default 20 s) and dense-scans the whole file directly at `refineFps` instead — the
coarse pass is a speed trade-off that only pays for itself on longer files; on a short
clip a full dense scan is already fast and removes the frame-drop blind spot completely.
New option on `VideoTrackOptions`, threaded into `AnalyzerRun.params` like the other
tunables. 6 new tests in `videoAnalysisPipeline.test.ts` (skips coarse and calls
`refineScan(0, duration, …)` directly; catches a flash a coarse-only pass could
plausibly miss; progress/sample-count/failure/abort behavior on this path; a
caller-lowered threshold still takes the long-video path). All of this project's past
short (~6 s) test clips (`flash-once-6s.mp4`, the beep mp3) were relying on the coarse
path incidentally working — this closes that gap for all of them, not just this file.
Verified: **226/226** tests, typecheck/lint/format clean, build OK (JS 225.34 → 225.83
kB). Not yet re-tested against the real jumpscare file in the browser — that real-file
confirmation is next.

### Bug found + fixed: a scream after a tense hush didn't duck the audio

Follow-up from the same jumpscare clip: the user watched it in Assisted Viewing and
reported Freddy's scream — which they describe as extremely loud — got no audio
softening at all, even though the visual fix above (correctly) started dimming the
screen. Dug into the real 16 kHz-mono loudness curve (same throwaway-Vitest-file method
as the visual bug, deleted after, never committed):

- The clip's audio isn't one continuous loud passage — there are two genuinely separate
  loud moments with a real quiet gap between them: an intro cue (0.4–0.8 s, correctly
  flagged) and, after ~1.5 s of quieter "tense hush" (≈ −19 dBFS, not silence), the
  scream itself (≈ 2.3–3.2 s, peaking around −13 dBFS — objectively about as loud as the
  intro, not louder).
- `loudness-spike` requires a rise of `spikeRiseDb` (10 dB, old default) over the
  trailing-1s baseline. Measured precisely: the scream's baseline (the hush) sits around
  −19 dBFS, its peak around −13 dBFS — a real rise of only **~6.3 dB**. Under the 10 dB
  bar, that's mathematically invisible to the detector, despite easily clearing
  `spikeFloorDb` (it's genuinely loud, just not loud _relative to what came right before
  it_). `sustained-loudness` doesn't help either — its own 4 s minimum doesn't fit either
  of the two ~1 s loud moments, together or apart.

**Fix:** lowered `spikeRiseDb` from 10 → 5 (`DEFAULT_LOUDNESS_PARAMS`,
`src/core/audio/analyzeLoudness.ts`) — `spikeFloorDb` (−20 dBFS) is what keeps this from
flagging ordinary quiet-to-moderate transitions, so this mainly widens what counts as a
"sudden" rise, consistent with the codebase's stated over-flag-rather-than-miss
philosophy. Verified against the real clip: now produces a second `loudness-spike` at
≈2.3–2.6 s (peak 2.65 s), whose mitigation window (event span + the 0.5 s fade either
side) reaches to ≈3.25 s — covering the visual jumpscare moment at 3.2 s. New regression
test in `analyzeLoudness.test.ts` (a loud moment ~6 dB over a non-silent baseline, using
`genLoudnessSeries` directly) plus the one existing test that hardcoded the old default
(`audioAnalysisPipeline.test.ts`) updated. Verified: **227/227** tests, typecheck/lint/
format clean, build OK. Not yet re-tested against the real file in the browser.

### Tuning: the scream was detected but barely ducked

The user re-tested after the `spikeRiseDb` fix: detection now fires, but the ducking felt
too light specifically on the scream. Root cause was in `severityScore`, not detection —
`mitigationAt`'s duck depth is picked by severity _bucket_ (`DEFAULT_AUDIO_TARGETS`:
low 0.3 / moderate 0.15 / high 0.05), and the old formula weighted 55% toward _how much
the sound rose_ vs. 45% toward _how loud it actually is_. The scream's rise (~~6.5 dB,
just over the new 5 dB bar) scored that arm near zero, landing the whole event at
severityScore ≈0.22 — `'low'`, only a 30%-volume duck — even though its peak (~~‑12.7
dBFS) is essentially identical to the intro cue's, which scores `'high'` (0.73) because
_that_ one rises from true silence.

**Fix:** rebalanced the weighting to 30% rise / 70% peak loudness, and moved the peak
arm's "full credit" reference from −2 dBFS (near-clipping) to −7 dBFS (already clearly
loud — few natural sounds approach clipping without distorting). Verified against the
real clip: the scream now scores ≈0.41 (`'moderate'`, 15%-volume duck — meaningfully
stronger), while the intro cue stays solidly `'high'` (≈0.69). New test
(`analyzeLoudness.test.ts`) asserts both: a loud-but-modest-rise event lands at least
`'moderate'`, a loud rise-from-silence event stays `'high'`. Verified: **228/228** tests,
typecheck/lint/format clean, build OK. Not yet re-tested against the real file in the
browser.

### Tuning: still not quite enough dimming

Still not quite enough dimming per the user's follow-up ("dim it a bit more") — rather
than push the severity weighting further (which would also touch every other
`'moderate'`-severity event, not just this one), deepened
`DEFAULT_AUDIO_TARGETS.moderate` itself from `0.15` to `0.1`
(`src/core/assistedViewing/envelope.ts`) — the same lever used for the two earlier
audio-ducking tuning rounds in Phase 8. `low` (0.3) and `high` (0.05) unchanged. No test
hardcodes the numeric value (`envelope.test.ts` references
`DEFAULT_AUDIO_TARGETS.moderate` symbolically), so nothing needed updating. Verified:
**228/228** tests, typecheck/lint/format clean, build OK. Not yet re-heard in the
browser — worth confirming this is enough before moving on.

User said "further" right after — pushed `DEFAULT_AUDIO_TARGETS.moderate` again, `0.1 →
0.06`, now sitting right next to `high` (`0.05`) rather than roughly halfway between
`low` and `high`.

**Then reconsidered, prompted by the user asking whether classifying the scream as
`'high'` outright would be "consistent across all":** yes — `severityScore` is a pure
function with no per-file special-casing, so tuning it (rather than a target constant)
reclassifies every event with this loud-but-modest-rise profile the same way everywhere,
not just this one clip. That's the more correct fix, so:

- `severityScore`'s weighting moved again, `0.3`/`0.7` (rise/peak) → **`0.15`/`0.85`**,
  and the peak arm's "full credit" reference tightened `-7` → `-11` dBFS. Rationale:
  `riseDb`'s job is detection (alongside `spikeFloorDb`) — separating a spike from
  steady background level — not ranking how severe something is once it's already been
  flagged as one; severity should track how loud it actually is almost exclusively.
  Verified against the real clip: both the scream (0.70) and the intro cue (0.84) now
  land solidly in `'high'`, not one `'moderate'` and one `'high'`.
- `DEFAULT_AUDIO_TARGETS.moderate` reverted `0.06 → 0.15` (its Phase-8-tuned value) —
  the earlier squeeze was patching a misclassification, not a real "moderate needs to be
  deeper" need. `low` (0.3) and `high` (0.05) untouched throughout this whole chase.
- Rewrote the regression test to assert the corrected invariant: a loud-but-modest-rise
  spike and a loud rise-from-silence spike both land at or above the `'high'` cutoff
  (0.66), not one clamped to "at least moderate."

Verified: **228/228** tests, typecheck/lint/format clean, build OK.

**Then the user reported the ducking finally felt right, but the results panel still
didn't classify the event as `'high'`.** The `-11 dBFS` peak-arm reference above was
calibrated against an ffmpeg-decoded estimate of the clip's peak (~-12.7 dBFS) — margin
over the 0.66 cutoff was only ~0.04, thin enough that any real browser-vs-ffmpeg decode
difference could flip it back to `'moderate'`. Asked the user to read the actual numbers
from the event's own "Details" disclosure in the UI (exactly what it's there for) instead
of guessing again: **riseDb 6.47 / peakDb −15.74 / baselineDb −22.21** — a few dB quieter
across the board than the ffmpeg estimate had suggested.

**Fix:** the peak arm's "full credit" reference is now `spikeFloorDb + 4` (dynamic,
`-16` dBFS at the default `-20` floor) instead of a hardcoded `-11` — both more robust
(real short-term RMS rarely gets much louder than 4 dB above a "loud enough to flag"
floor without clipping) and scales correctly if `spikeFloorDb` is ever overridden.
Against the real numbers: scores ≈0.86, comfortable margin over 0.66. Updated both
regression tests in `analyzeLoudness.test.ts` to use these real measured values instead
of the earlier ffmpeg-estimated ones. Verified: **228/228** tests, typecheck/lint/format
clean, build OK. This should be the last round of this particular chase — the fix is
now grounded in the app's own real decode output, not an offline approximation of it.

The user re-tested in the browser after this last fix, confirmed the ducking and the
`'high'` classification both look right now, and **committed and pushed everything**.

### Next session should start with

**The real-browser re-test of the stall-guard fix** (see further down this log) — the
Avengers clip that got stuck at 58% (`~/Downloads/`, not a repo fixture): confirm
analysis now either finishes or fails cleanly with a clear message, and that Stop
analysis actually works if clicked mid-run. That also answers whether the original
"speed up analysis" question is fully explained by this hang or whether the coarse
pass's ~90s-for-3-minutes cost is still worth addressing on its own (raise
`coarsePlaybackRate`, or the already-discussed WebCodecs/mp4box.js path — see
`spikes/README.md`). Then review + commit the stall-guard fix. The standing Phase 4–7
gaps are still open too: a Stop-mid-run real-browser pass (now more pointed, given this
bug) and a full pass in Firefox (the `seekLoop`-based coarse fallback in
`frameSampler.ts`, never yet exercised for real).

### Bug found + fixed: analysis could hang forever, with no way to cancel it

User asked how to speed up analysis (~3 min videos "take a while"). Before tuning
anything, tried to find out where the time actually goes — explained the two-pass
architecture's known cost (coarse pass ≈ half the video's own length, ~90s for a 3 min
file, close to unavoidable at 2× background playback) and asked whether the progress bar
was crawling in the first ~70% (coarse) or the last ~30% (refine) to tell which half was
actually the problem.

Instead the user reported something worse on a real file (an Avengers clip,
`~/Downloads/`, 1080p h264, 199.5 s): **analysis got stuck at 58% and stayed there.**

Root cause, found by reading `frameSampler.ts`: the coarse (`rvfcScan`) and refine
(`seekLoop`) scan loops only checked `ctx.signal?.aborted` **from inside their own
callback** (`requestVideoFrameCallback` / a `seeked` event). If the real `<video>`
element silently stops delivering frames or `seeked` events partway through — a decode
hiccup, or Chrome's background-tab/hidden-element power throttling of a muted,
never-appended-to-the-DOM `<video>` (exactly what `analyzeVideoTrack.ts` creates) — that
callback simply never fires again. Two consequences: the promise never settles (the scan
hangs forever, with no error), **and Stop analysis doesn't work either**, since the abort
check that would have caught it never gets a chance to run. 58% overall works out to
~78% through the coarse pass specifically, consistent with a stall partway through, not
at a natural end-of-scan boundary.

**Fix:** new `src/adapters/video/scanGuard.ts` — `withStallGuard(run, { signal,
stallTimeoutMs })`, generic and DOM-free (only `setTimeout`/`AbortSignal`), so it's
unit-tested directly even though the rest of `frameSampler.ts` isn't (browser-only,
verified in the real-browser pass per its own docstring). It listens for `abort`
independently of whatever `run` is doing (fixes Stop not working under a stall) and
rejects with a new `MediaStallError` if `run`'s `bump()` callback goes unchronologically
quiet for `stallTimeoutMs` (default 10 s — reset on every real frame/seek, so a
genuinely slow-but-progressing multi-minute coarse scan never trips it). Both `rvfcScan`
and `seekLoop` now report progress through `bump`, dropped their old inline
`signal.aborted` checks (redundant now), and take a `stallTimeoutMs` from a new
`VideoTrackOptions.stallTimeoutMs`, threaded into `AnalyzerRun.params` like the other
scan tunables. A `MediaStallError` isn't an `AbortError`, so it correctly falls through
existing paths as a real failure (`coarseScanFailureAnalysis`, or the refine-window
catch-and-warn-with-partial-results path) rather than being reported as user-cancelled —
no pipeline changes needed, both graceful-degradation paths already existed.

7 new tests in `scanGuard.test.ts` (resolves normally; propagates a non-stall rejection;
rejects immediately if already aborted; rejects on a mid-run abort even if `run` never
settles again; rejects on a stall; a periodic `bump` avoids a stall past the original
window; no stray rejection fires after an early resolve — via fake timers). Verified:
**235/235** tests, typecheck/lint/format clean, build OK. Not yet re-tested against the
real file — that's the natural next step (does it now either finish or fail cleanly
within ~10s of a stall, and does Stop actually work if clicked during one), and also
tells us whether the original "3 minutes takes a while" question was ever anything more
than the coarse pass's expected, mostly-unavoidable cost — worth reopening the
faster-coarse-pass options (raise `coarsePlaybackRate`, or the already-discussed
WebCodecs/mp4box.js path) only once we know it isn't just this hang.

The user re-tested on the real Avengers clip: the stall guard worked exactly as
designed — no more infinite hang, and the results panel correctly showed "Some analysis
did not finish" (partial). Audio still detected the loud moment correctly.

That surfaced a separate, smaller gap: the partial-status banner had **no specific
reason** attached — `AnalyzerRun.note` (e.g. "SoftView could not scan the video in this
file.") was set on a failed/skipped run but never made it into `result.warnings`, so
`LimitationsNotice` had nothing to show beyond the generic banner + the four
always-present base limitations. **Fix:** `buildAnalysisResult`
(`src/core/events/analysisResult.ts`) now folds any non-`ok` run's `note` into
`warnings` automatically, alongside whatever the caller passed directly — the interface
already documented `warnings` as "Run-specific notices (e.g. a scan that did not
finish)," this just makes it actually happen. 3 new tests in `analysisResult.test.ts`.

**Then, still not knowing exactly why the coarse scan stalls on this file**, added one
more resilience measure: `rvfcScan` now listens for the video's own `waiting`/`stalled`
events and nudges it with `.play()` again — a blob URL has no network to stall on, but
decode itself can still hiccup (a rough GOP, or Chrome's background-video power-saving
throttling of a muted, never-appended-to-the-DOM `<video>` — exactly what
`analyzeVideoTrack.ts` creates, and a real suspect given the stall only shows up on a
long real file, never the short test clips). This is a low-risk, generically-useful
recovery attempt, not a confirmed fix for the specific root cause — `withStallGuard`'s
10 s timeout stays as the backstop either way. Not yet confirmed whether this alone
resolves it, and the DOM-attachment theory is still just a theory — worth asking the
user whether the tab stayed focused/visible for the whole ~3 minute wait, which would
narrow it down further.

Verified: **238/238** tests, typecheck/lint/format clean, build OK.

**The user confirmed they had switched to something else while the 3-minute file
analyzed** — the background-tab-throttling theory is now the confirmed cause, not just
a guess. Two more changes on the back of that:

- **`keepAliveWhileHidden` in `frameSampler.ts`** — while `document.hidden`, both
  `rvfcScan` and `seekLoop` now `bump()` the stall guard every 2s via `setInterval`,
  independent of whatever the throttled video/rVFC pipeline is actually doing. A
  backgrounded tab is expected browser behaviour (battery-saving), not a genuine stall
  — this stops it from being misreported as a scan failure; analysis just quietly takes
  longer while the tab is hidden, and picks back up at full speed once it's visible
  again. `scanGuard.ts` itself stayed untouched (still DOM-free/pure) — the
  visibility-awareness lives entirely in the browser-only caller, per the existing
  architecture boundary.
- **A proactive note in `AnalyzeControls`**, shown for video (not audio) both before and
  during analysis: "Keep this tab open and visible for it to finish quickest." The
  keep-alive fix above stops a false failure, but backgrounding still genuinely slows
  video analysis down — worth setting that expectation up front rather than only
  explaining it after the fact. New `kind?: MediaKind` prop, threaded from `App.tsx`
  (`descriptor.kind`). 3 new tests in `AnalyzeControls.test.tsx`.

Verified: **240/240** tests, typecheck/lint/format clean, build OK. Not yet re-tested
against the real file — this should be the actual fix (not just a graceful failure) for
the specific scenario reported, assuming the video-decode side of Chrome's throttling
responds to the periodic `bump()`-driven wall-clock extension the way the JS-timer side
clearly does. If the coarse pass still fails/hangs specifically while backgrounded even
with this in place, that would mean the browser is throttling video decode/rVFC so hard
that no amount of stall-guard patience helps, and the real fix would have to prevent the
throttling itself (e.g. attaching the analysis `<video>` to the page, hidden via CSS
rather than fully detached) rather than tolerate it — untried, since the current fix
might already be enough.

### Phase 10 — WebCodecs-accelerated video scanning

The user asked directly for the real speed fix, not just resilience around the slowness
(and separately confirmed a YouTube-link idea was a non-starter — breaks the
local-only-analysis premise, and wouldn't be faster anyway since the analysis cost is
the same regardless of how the file arrived; and that trimming a clip first / bumping
`coarsePlaybackRate` were understood as the cheap partial options, but they're "gearing
towards bigger investment"). Planned with the user (`EnterPlanMode` → approved) and
built as **Phase 10** — the WebCodecs/mp4box.js path `spikes/README.md` (R3) had
already named as "the scaling path... adopt only if coarse-pass duration becomes a real
problem." That problem is now on record from this session's own Avengers-clip
investigation.

**Key finding the plan turned up:** `videoAnalysisPipeline.ts` only depends on the
`FrameSampler` interface (`coarseScan`/`refineScan` → `TimeSeries`) — nothing in
`src/core` needed to change. And since WebCodecs decodes as fast as the hardware
allows (no realtime ceiling), the whole coarse/refine split becomes unnecessary: once
dense whole-file decoding is fast, there's nothing left to "refine." This reuses the
"skip the split, one dense scan" pattern already built for short videos
(`fullScanMaxDurationSec`) — for a WebCodecs-sampled file, that threshold is overridden
to `Infinity` regardless of actual length.

**New dependency: `mp4box`** (bundle grew 225.83 kB → **414.19 kB** JS, gzip 71.99 →
**119.04 kB** — mp4box's smaller `/simple` export was checked and rejected: it doesn't
register the `avcC`/`hvcC` box parsers this needs, so the full build is the real cost
of this feature, not an oversight).

**New file: `src/adapters/video/webCodecsFrameSampler.ts`** — a `FrameSampler`
implementation:

- `probeWebCodecs(blob)` — demuxes just the video track's codec config (codec string +
  the `avcC`/`hvcC` box, serialized via `mp4box`'s `MultiBufferStream` minus its 8-byte
  header — the payload `VideoDecoderConfig.description` expects), then
  `VideoDecoder.isConfigSupported(...)`. Never throws — a `false` means "fall back,"
  covering both "no WebCodecs" and "WebCodecs exists but not for this codec/profile."
  Also returns the file's duration (from mp4box's `Movie.duration`/`timescale`) so the
  caller doesn't need a second demux, or a `<video>` element at all, just to find out
  how long the file is.
- `createWebCodecsFrameSampler` — feeds every demuxed sample into `VideoDecoder` in
  decode order, downscales each output `VideoFrame` through the **same**
  `makeCapture`/`meanLuminance` used by the `<video>`-based path (now exported from
  `frameSampler.ts`, broadened to accept any `CanvasImageSource` — behavior unchanged
  for its existing caller), closes each frame immediately (they leak otherwise), and
  resolves once `decoder.flush()` confirms every submitted chunk has actually been
  decoded and emitted — the spec-correct way to know decoding is done, no manual frame
  counting needed. `coarseScan`/`refineScan` both draw from one cached decode;
  `refineScan` slices it (`sliceByTime`, already existed). Reuses `withStallGuard` for
  the same cancellation semantics as the `<video>` path, though a genuine stall is far
  less likely here — no `<video>` playback/rendering pipeline is involved at all, so
  the background-tab throttling class of bug this session just fixed shouldn't apply to
  this path in the first place.
- `sortedTimeSeries` — the one piece of plain logic (frames sorted into a valid
  `TimeSeries`; presentation order should already match decode-output order per the
  WebCodecs spec, but sorted defensively rather than assumed) — pulled out and
  unit-tested directly (4 tests), same reasoning as `scanGuard.ts`. The
  demux/decode/canvas glue around it stays real-browser-only, like the rest of
  `frameSampler.ts`.

**Call site — `analyzeVideoTrack.ts`:** `defaultBuildSampler` now tries
`probeWebCodecs(blob)` first; on `supported`, builds the WebCodecs sampler (and
overrides `fullScanMaxDurationSec` to `Infinity`); otherwise falls back to the existing
`createFrameSampler` unchanged — mirrors the existing `HAS_RVFC` Chrome/Firefox
fallback pattern, one level higher (whole sampler instead of one method).
`AnalyzeVideoTrackDeps['buildSampler']` now takes the original `Blob` (not just the
derived blob: URL) so the WebCodecs path can read raw bytes directly.

**Audit trail:** new `usedWebCodecs` field on `VideoTrackOptions`, threaded into
`AnalyzerRun.params` (`videoAnalysisPipeline.ts`) — visible after the fact which path
actually ran, useful for exactly the kind of debugging this session just did.

**Deliberately deferred (per the plan):** moving this into a Worker (like
`audioAnalysis.worker.ts`) for UI responsiveness on a long decode — landing the
main-thread version first and confirming it's correct/faster in the real browser
before adding that. Also: no backpressure-aware chunk feeding (`decoder.decode()` is
called for a whole batch without checking `decodeQueueSize`) — a simplification worth
revisiting if a very long/high-bitrate file shows high memory use in practice.

Verified: **244/244** tests, typecheck/lint/format clean, build OK. Not yet tested in a
real browser at all — this is the biggest, least-verified single change of the
session, and needs the real-browser pass against the same three files used throughout
(the two 6s fixtures, the FNAF clip, and — the actual point — the 3-minute Avengers
clip: confirm it's now meaningfully faster, still correct, and still fine if the user
switches tabs mid-scan).

### Git state

### Tuning: dim all audio severity tiers a bit more

Not tied to any specific event this time — a general "dim it all a bit more" across the
board. Lowered all three of `DEFAULT_AUDIO_TARGETS` proportionally: `low` 0.3 → 0.2,
`moderate` 0.15 → 0.1, `high` 0.05 → 0.03. Same as every prior round of this tuning, no
test hardcodes the numeric values. Verified: **244/244** tests, typecheck/lint/format
clean, build OK.

### Tuning: more lead-in/lead-out around the mute

Follow-up: "give a 1 second more leeway on the start and end of the mute" —
`DEFAULT_FADE_SEC` in `envelope.ts` (the linear ramp either side of an event's span,
shared by audio ducking and visual dim/desaturate) raised `0.5s → 1.5s`. Applies
symmetrically: ducking now starts ramping 1.5s before an event's `startTime` (was 0.5s)
and takes 1.5s to fully restore after `endTime`. Three tests in `envelope.test.ts`
asserted specific currentTime values keyed to the old 0.5s default (`9.75`/`12.25`/
`4.75`, each a fade-window midpoint) — updated to the new midpoints (`9.25`/`12.75`/
`4.25`) with comments kept in sync; the assertions themselves (severity-target ramp
math) were unaffected, only which instant is "halfway through the fade." Verified:
**244/244** tests, typecheck/lint/format
clean, build OK.

### Git state

`main` @ `5e66d69`, in sync with `origin/main`. `98d7626` (Phase 9 + the
timeline/playhead + visual redesign) and `5e66d69` (jump-scare detection fixes) are
committed and pushed. Working tree = everything from this session since then, not yet
committed: the stall-guard fix, the warnings-surfacing fix, the waiting/stalled
recovery nudge, the background-tab keep-alive, the tab-visibility UI hint, Phase 10
(WebCodecs-accelerated video scanning), and the latest audio-target dimming —
`src/adapters/video/{scanGuard, webCodecsFrameSampler}.ts` + tests (new), edits to
`frameSampler.ts`, `types.ts`, `videoAnalysisPipeline.ts`, `analyzeVideoTrack.ts` +
test, `src/core/events/analysisResult.ts` + test,
`src/ui/components/AnalyzeControls.tsx` + test, `src/core/assistedViewing/envelope.ts`,
`src/App.tsx`, `package.json`/`package-lock.json` (new dependency: `mp4box`),
`SESSION.md`. Awaiting the user's review, the real-browser pass (Phase 10 in
particular, still untested in an actual browser), and commit; nothing branched or
stashed.
