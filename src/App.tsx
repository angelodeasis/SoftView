import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnalysis } from './state/analysisStore';
import type { MediaDescriptor } from './media/MediaDescriptor';
import { SelectMedia } from './ui/screens/SelectMedia';
import { MediaPlayer } from './ui/components/MediaPlayer';
import { AnalyzeControls } from './ui/components/AnalyzeControls';
import { ResultsPanel } from './ui/components/ResultsPanel';

export function App() {
  const { state, analyze, reset } = useAnalysis();
  const [descriptor, setDescriptor] = useState<MediaDescriptor | null>(null);
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

      {descriptor && (
        <>
          <MediaPlayer
            ref={playerRef}
            src={descriptor.objectUrl}
            kind={descriptor.kind}
            label={`Preview of ${descriptor.facts.name}`}
          />
          <AnalyzeControls
            onAnalyze={onAnalyze}
            disabledReason={
              canAnalyze
                ? undefined
                : 'SoftView needs the media duration before it can analyze — try re-selecting the file.'
            }
          />
        </>
      )}

      {state.status === 'done' && <ResultsPanel result={state.result} onSeek={seekTo} />}
    </main>
  );
}
