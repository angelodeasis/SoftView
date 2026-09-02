# SoftView — session log

Recovery aid for picking work back up. Architecture and constraints live in `CLAUDE.md`;
spike measurements and the decisions they drove live in `spikes/README.md`. This file
only tracks session-to-session state.

---

## 2026-09-02 — main @ 669b254 (nothing committed this session)

### Summary

First working session. Went from an empty repo (readme + license only) through a full
design plan, three validation spikes, and the first two implementation phases. Nothing
has been committed — the entire working tree is the user's to review and commit.

### Completed (in working tree, all checks green — not committed)

- **Design plan** — produced in conversation (not a file). Covers architecture, the
  audio/visual analysis approach, the common event model, Assisted Viewing, UX flow,
  testing strategy, phasing, and risks.
- **Spikes** (`spikes/`, disposable — gitignored media, `media-generate.sh` regenerates):
  - R1 (`spikes/r1-audio-memory/`) and R2 (`spikes/r2-frame-sampling/`) HTML pages, run
    by the user in Chrome 152. Full results + conclusions in `spikes/README.md`.
  - R1: `decodeAudioData` is fine. Chrome honours `new AudioContext({sampleRate:16000})`
    and resamples on decode. Plan: decode whole file at 16 kHz, downmix to mono, drop the
    buffer. Duration guard is a nice-to-have advisory past ~90 min, not a correctness need.
  - R2: playback-pass sampling at **2× rate** gives full 30 Hz frame coverage, ~1% drops,
    ~2× realtime. 4× is too lossy (32% dropped frames on real content). Seek-loop is
    exact (0 ms error) but slow (~48 ms/seek) — Firefox fallback only. Chosen design:
    **coarse pass** (2× playback, flag on brightness variance, over-flag for recall) →
    **refine pass** (exact seeks on coarse flags + audio-event timestamps, ±2–3 s pad).
  - R3: WebCodecs / mp4box.js **not needed for MVP**; known later speed-up for long-video
    coarse scans, slots in behind the analyzer interface.
- **Phase 0 — scaffold + core/UI boundary:**
  - Vite 6 + React 19 + TypeScript + Vitest. Only runtime deps: `react`, `react-dom`.
  - `tsconfig.core.json` compiles `src/core` with **no "DOM" lib** — hard enforcement that
    analyzers stay pure. ESLint `no-restricted-imports` / `no-restricted-globals` on
    `src/core/**` is the second layer. Both were demo-verified to reject a React import
    and a `document` reference, then reverted.
  - Vitest split into two projects: `core` (node env, `src/core/**/*.test.ts`) and
    `browser` (jsdom, everything else). See `vite.config.ts`.
  - `CLAUDE.md` written (renamed from the empty lowercase `claude.md` via `git mv` —
    that rename is the only thing staged).
  - Scripts: `dev build preview test test:watch typecheck lint format format:check`.
- **Phase 1 — local media selection & playback:**
  - `src/core/media/` (pure): `validate.ts` (MP4/MP3 allowlist, MIME + extension),
    `largeFileAdvisory.ts` (info/warn thresholds), `types.ts`.
  - `src/media/` (browser glue): `objectUrl.ts` (revoke-once handle),
    `probeMetadata.ts` (detached metadata element, injectable factory, timeout,
    teardown), `MediaDescriptor.ts` (immutable; `withMetadata()` merges probe results).
  - `src/ui/`: `SelectMedia.tsx` screen (local `useState`, revokes prev URL on replace
    and unmount, race-guarded probe), `MediaDropZone`, `MediaPlayer` (native controls),
    `FileFactsPanel` (`role="status"` + advisory).
  - `src/App.tsx` renders `SelectMedia` below the header + disclaimer.
  - 30 tests across 7 files.

### In progress

- Nothing mid-edit. Both phases are complete in the working tree; all checks pass.

### Planned / not started

- **Phase 2** — common event model (`src/core/events/`: full `SensoryEvent` /
  `AnalysisResult`, normalization/merge utilities), synthetic signal generators
  (PCM + luminance series), and test fixtures + ground-truth files. `src/core/events/model.ts`
  currently holds only a minimal `SensoryEvent` + `severityFromScore` stub from Phase 0.
- Phases 3–9 per the design plan (audio analyzer → decode adapter → visual analyzer →
  frame-capture adapter → orchestration + results UI → Assisted Viewing → hardening).

### Unresolved questions

- **Safari / Firefox behaviour is untested** — the user only has Chrome. The audio adapter
  will branch on `decodedBuffer.sampleRate` at runtime (Firefox likely won't resample on
  decode). Needs a real-device pass before claiming cross-browser support, or an explicit
  decision to scope Safari/Firefox out of the MVP.
- R2 capture-cost micro-optimisation (willReadFrequently vs GPU canvas vs
  `createImageBitmap`) was deliberately **not chased** — 7 ms/frame at 2× is acceptable
  for MVP; revisit only if the coarse pass feels slow with real code.
- No state-management library chosen yet — deferred until state is shared across screens
  (Phase 7-ish). Phase 1 uses local `useState`.
- Whether to keep the `spikes/` directory long-term or delete it — user's call; nothing
  depends on it.

### Decisions made

- **TypeScript** over plain JS / JSDoc — the event model and analyzer signatures are the
  backbone; worth the type safety. (README still says "JavaScript"; not updated.)
- **No state library, no WebCodecs, no mp4box.js, no ffmpeg** — none justified yet.
- Pure media logic (`validate`, `largeFileAdvisory`) lives in `src/core/media/` because
  the core boundary is about purity/testability, not exclusively "analysis".
- Native `<video>`/`<audio>` controls for now; custom controls arrive with Assisted Viewing.
- Filename casing: `git mv claude.md CLAUDE.md` done. `readme.md` / `License` left as-is
  (user's optional cleanup).

### Bugs / blockers / follow-ups

- No known bugs. Two test-authoring issues were hit and fixed during the session:
  `files?.item()` doesn't exist on the array passed by `fireEvent.change` (switched to
  index access); an unhandled-rejection warning in the probe timeout test (attach the
  `.rejects` expectation before advancing fake timers).
- Follow-up: Claude's first-pass output repeatedly failed `prettier --check` and needed a
  `prettier --write` pass. Consider a pre-commit hook or just run `format` before `build`.
- ~~Follow-up: real-browser click-through of Phase 1~~ — done 2026-09-02 (Chrome, `npm run
  dev`): picked an MP4 and an MP3, both validate and play; confirmed working.

### Test / build status (run 2026-09-02, end of session)

- Lint: PASS · Typecheck: PASS (3 tsconfigs) · Format: PASS
- Tests: **30 passed / 30** (7 files; `core` project in node, `browser` in jsdom)
- Build: PASS (`npm run build` → ~200 kB JS / 63 kB gzip)

### Next session should start with

`npm install` (deps are new and uncommitted), then review + commit Phase 0 + Phase 1.
After that, plan **Phase 2** (event model + normalization + signal generators + fixtures).

### Git state

Nothing committed, pushed, branched, or stashed this session. Only `git mv claude.md
CLAUDE.md` is staged; everything else is untracked. `main` still at `669b254`.
