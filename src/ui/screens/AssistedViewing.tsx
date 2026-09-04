import { useCallback, useEffect, useRef } from 'react';
import type { AnalysisResult } from '../../core/events/analysisResult';
import type { MediaDescriptor } from '../../media/MediaDescriptor';
import { EventTimeline } from '../components/EventTimeline';
import { MediaPlayer } from '../components/MediaPlayer';
import { useAssistedPlayback } from '../useAssistedPlayback';

interface Props {
  descriptor: MediaDescriptor;
  result: AnalysisResult;
  onExit: () => void;
}

/**
 * The Assisted Viewing mode: its own player instance (never alongside the raw preview
 * player), softened live around the flagged moments, with the same coloured overview bar
 * from the review screen — now tracking playback live — a status line, and a way out.
 */
export function AssistedViewing({ descriptor, result, onExit }: Props) {
  const playerRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const durationSec = result.media.durationSec ?? 0;
  const { status } = useAssistedPlayback(playerRef, result.events, {
    ref: playheadRef,
    durationSec,
  });

  // Replaces the whole review view (including the "Start Assisted Viewing" button the
  // user just activated) — without this, focus would drop to <body> on entry.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const el = playerRef.current;
    if (!el) return;
    el.currentTime = seconds;
    void el.play();
  }, []);

  return (
    <section className="assisted" aria-labelledby="assisted-heading">
      <h2 id="assisted-heading" ref={headingRef} tabIndex={-1}>
        Assisted Viewing
      </h2>
      <p className="assisted__note">
        Audio, brightness, and colour are gently reduced during flagged moments, then gradually
        restored.
      </p>

      <MediaPlayer
        ref={playerRef}
        src={descriptor.objectUrl}
        kind={descriptor.kind}
        label={`Assisted playback of ${descriptor.facts.name}`}
      />

      <EventTimeline
        events={result.events}
        durationSec={durationSec}
        onSeek={seekTo}
        playheadRef={playheadRef}
      />

      <p className="assisted__status" role="status" aria-live="polite">
        {status ?? 'Playing normally'}
      </p>

      <button type="button" onClick={onExit}>
        Exit Assisted Viewing
      </button>
    </section>
  );
}
