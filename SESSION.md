# SoftView — session log

Recovery aid for picking work back up. Architecture and constraints live in `CLAUDE.md`;
spike measurements and the decisions they drove live in `spikes/README.md`. This file
only tracks session-to-session state.

---

## 2026-09-02 — main @ 3cf45f1, Phases 2 + 3 uncommitted in working tree

### Summary

Went from an empty repo (readme + license only) through a design plan, three validation
spikes, and the first four implementation phases.

- **Phase 0 + Phase 1 are committed and pushed** as `3cf45f1 "Testing mp3/mp4 file
handling"` (on top of `669b254`). `main` is in sync with `origin/main`.
- **Phases 2 and 3 are complete in the working tree, not committed** — the user reviews
  and commits. All checks green (96 tests).

### Committed (3cf45f1)

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

### Completed in working tree — NOT committed (Phase 2 — common event model + testing kit)

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

### Completed in working tree — NOT committed (Phase 3 — audio loudness analyzer)

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

### In progress

- Nothing mid-edit. Phases 2 and 3 are complete in the working tree; all checks pass.

### Planned / not started

- Phases 4–9 per the design plan: decode adapter → visual analyzer → frame-capture
  adapter → orchestration + results UI → Assisted Viewing → hardening.
- **Phase 4 (audio decode adapter, `src/adapters/audio/`)** — browser glue: 16 kHz
  `AudioContext` decode → mono downmix → `computeLoudness` → `analyzeLoudness`. Branch on
  `decodedBuffer.sampleRate` (Firefox `OfflineAudioContext` resample fallback). First
  code in `src/adapters/`.

### Unresolved questions

- **Safari / Firefox untested** — Chrome only. Audio adapter will branch on
  `decodedBuffer.sampleRate` (Firefox likely won't resample on decode). Needs a
  real-device pass, or an explicit decision to scope Safari/Firefox out of the MVP.
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
- **TypeScript** over JS/JSDoc (README still says "JavaScript"; not updated).
- **No state library, no WebCodecs, no mp4box.js, no ffmpeg** — none justified yet.
- Pure media logic lives in `src/core/media/` (boundary is about purity, not just "analysis").
- Native `<video>`/`<audio>` controls for now; custom controls arrive with Assisted Viewing.
- `readme.md` / `License` casing left as-is (user's optional cleanup).

### Bugs / blockers / follow-ups

- No known bugs.
- Follow-up: Claude's first-pass output repeatedly failed `prettier --check` and needed a
  `prettier --write` pass. Consider a pre-commit hook, or just run `format` before `build`.
  (Phase 2: ran `npm run format` before committing checks — clean.)

### Test / build status (run 2026-09-02, after Phase 3)

- Lint: PASS · Typecheck: PASS (3 tsconfigs, incl. `tsconfig.core.json` no-DOM) · Format: PASS
- Tests: **96 passed / 96** (14 files; `core` in node, `browser` in jsdom)
- Build: PASS (`npm run build` → 200.27 kB JS / 63 kB gzip — unchanged; `src/core/audio`
  and `src/core/testing` not in the bundle)

### Next session should start with

Review + commit Phases 2 and 3 (working tree), then plan **Phase 4** — the audio decode
adapter (`src/adapters/audio/`): first browser-glue module. 16 kHz `AudioContext` decode
→ mono downmix → `computeLoudness` → `analyzeLoudness`, with the Firefox
`OfflineAudioContext` resample fallback keyed off `decodedBuffer.sampleRate`. This is
where the ESLint config likely needs an `src/adapters/**` block and the `browser` vitest
project's `include` already covers `src/adapters/`.

### Git state

`main` @ `3cf45f1`, in sync with `origin/main`. Phase 0 + Phase 1 committed and pushed.
Working tree (all Phases 2 + 3, awaiting the user's review and commit; nothing branched
or stashed):

- modified (tracked): `SESSION.md`, `src/core/events/model.ts`
- untracked: `src/core/audio/`, `src/core/signal/`, `src/core/testing/`,
  `src/core/events/normalize.ts` + `analysisResult.ts` (+ their `.test.ts`)

Phase-2 files (`src/core/signal/`, `src/core/testing/`, `normalize`, `analysisResult`)
and Phase-3 files (`src/core/audio/`) are interleaved in `src/core/signal/timeSeries.ts`
and `src/core/testing/generators.ts` — Phase 3 extended both. Commit as one unit, or
split by reading the diff.
