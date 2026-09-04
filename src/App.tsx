import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { largeFileAdvisory } from './core/media/largeFileAdvisory';
import { useAnalysis } from './state/analysisStore';
import type { MediaDescriptor } from './media/MediaDescriptor';
import { SelectMedia } from './ui/screens/SelectMedia';
import { AssistedViewing } from './ui/screens/AssistedViewing';
import { MediaPlayer } from './ui/components/MediaPlayer';
import { AnalyzeControls } from './ui/components/AnalyzeControls';
import { ResultsPanel } from './ui/components/ResultsPanel';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { CrashNotice } from './ui/components/CrashNotice';

export function App() {
  const { state, analyze, reset } = useAnalysis();
  const [descriptor, setDescriptor] = useState<MediaDescriptor | null>(null);
  const [assisted, setAssisted] = useState(false);
  const playerRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const latest = useRef<MediaDescriptor | null>(null);

  // Release the object URL when the media is replaced or the app unmounts.
  useEffect(() => () => latest.current?.revoke(), []);

  const onSelect = useCallback(
    (next: MediaDescriptor) => {
      const prev = latest.current;
      if (prev && prev.objectUrl !== next.objectUrl) {
        prev.revoke();
        reset();
        setAssisted(false);
      }
      latest.current = next;
      setDescriptor(next);
    },
    [reset],
  );

  const seekTo = useCallback((seconds: number) => {
    const el = playerRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play();
  }, []);

  const durationSec = descriptor?.facts.durationSec;
  const canAnalyze = durationSec !== undefined && durationSec > 0;

  const advisory = useMemo(
    () =>
      descriptor ? largeFileAdvisory({ sizeBytes: descriptor.facts.sizeBytes, durationSec }) : null,
    [descriptor, durationSec],
  );

  const onAnalyze =
    descriptor && canAnalyze
      ? () =>
          analyze({
            file: descriptor.file,
            kind: descriptor.kind,
            media: descriptor.facts,
            durationSec,
          })
      : undefined;

  return (
    <main className="app">
      <h1>SoftView</h1>
      <p className="tagline">
        A privacy-first media viewer that helps soften potentially intense audio and visual moments.
      </p>

      <p className="disclaimer" role="note">
        SoftView&rsquo;s analysis is a heuristic estimate. It may miss moments or flag moments that
        are not intense for you. SoftView does not determine whether media is safe, and is not a
        medical device. Your media is analyzed on your device and is never uploaded.
      </p>

      <SelectMedia descriptor={descriptor} onSelect={onSelect} />

      {descriptor && !assisted && (
        <MediaPlayer
          ref={playerRef}
          key={descriptor.objectUrl}
          src={descriptor.objectUrl}
          kind={descriptor.kind}
          label={`Preview of ${descriptor.facts.name}`}
        />
      )}

      <ErrorBoundary
        fallback={(boundaryReset) => (
          <CrashNotice
            onReset={() => {
              boundaryReset();
              reset();
              setAssisted(false);
            }}
          />
        )}
      >
        {assisted && descriptor && state.status === 'done' ? (
          <AssistedViewing
            descriptor={descriptor}
            result={state.result}
            onExit={() => setAssisted(false)}
          />
        ) : (
          <>
            {descriptor && (
              <AnalyzeControls
                onAnalyze={onAnalyze}
                disabledReason={
                  canAnalyze
                    ? undefined
                    : 'SoftView needs the media duration before it can analyze — try re-selecting the file.'
                }
                advisory={advisory}
              />
            )}

            {state.status === 'done' && (
              <ResultsPanel
                result={state.result}
                onSeek={seekTo}
                onStartAssistedViewing={() => setAssisted(true)}
              />
            )}
          </>
        )}
      </ErrorBoundary>
    </main>
  );
}
