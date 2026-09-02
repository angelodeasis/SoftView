# SoftView — working guide

SoftView is a privacy-first, accessibility-focused browser app that analyzes **local**
MP4/MP3 files for potentially intense audio and visual moments (sudden loud audio,
sustained loudness, flashing / rapid brightness changes) and offers an **Assisted
Viewing** mode that softens those moments during playback.

## Non-negotiable constraints

1. **Everything stays on device.** No uploads, no server doing media work, no external
   media-analysis APIs, no Firebase, no database, no accounts, no cloud storage. There is
   no code path that sends user media anywhere.
2. **Detection is heuristic.** Never claim media is "safe" or that an event is definitely
   dangerous. Use soft language: "potential sensory event", "potentially intense". Always
   surface the limitation.
3. **Analysis logic is pure.** Everything in `src/core/` is plain functions over data —
   no React, no DOM, no network, no storage. Enforced by ESLint and by `tsconfig.core.json`
   (compiled with no "DOM" lib). Browser glue lives in `src/adapters/`; UI in `src/ui/`.
4. **No new dependencies without a clear technical reason we have discussed.** Prefer
   browser-native APIs. The default answer to "should we add X" is no.

## Architecture

```
UI (src/ui) ──> app state ──> adapters (src/adapters, browser + workers)
                                   │
                                   ▼
                          core analyzers (src/core, pure)
                                   │
                                   ▼
                          common event model (src/core/events)
                                   │
                                   ▼
                 Assisted Viewing (consumes events, never re-detects)
```

- **Audio:** one full pass. Decode the whole file via a 16 kHz `AudioContext`, downmix to
  mono, extract a windowed metric series, drop the buffer.
- **Video:** two passes. *Coarse* — background playback at ~2× via
  `requestVideoFrameCallback`, sampling downscaled-frame brightness, flagging on
  brightness *variance* (aliasing-robust), tuned to over-flag. *Refine* — re-scan a
  padded window around each coarse flag and each audio-event timestamp using exact seeks.
- Analyzers consume a **timestamped sample stream** and assume no fixed frame/sample rate.
- `WebCodecs` / `mp4box.js` are a known later speed-up for long-video coarse scans, added
  behind the analyzer interface only if pass duration becomes a real problem. Not now.

See `spikes/README.md` for the measurements behind these decisions.

## How we work

- Small, reviewable phases. Each phase builds, type-checks, and tests on its own.
- The user runs **all** git operations. Claude does not commit, push, branch, merge,
  rebase, or touch the remote. Read-only git only (`status`, `log`, `diff`).
- Prefer simple and maintainable over clever or abstract. No premature abstraction.

## Commands

| command | purpose |
| --- | --- |
| `npm run dev` | local dev server |
| `npm test` | Vitest once (core tests in Node, UI tests in jsdom) |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | three tsconfigs: core (no DOM), app, node |
| `npm run lint` | ESLint, including the `src/core` purity boundary |
| `npm run build` | typecheck + Vite production build |
| `npm run format` | Prettier write |
