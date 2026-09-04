import { forwardRef, useState, type Ref } from 'react';
import type { MediaKind } from '../../core/media/types';

interface Props {
  src: string;
  kind: MediaKind;
  label: string;
}

/**
 * Plays the selected media with the browser's native controls. The forwarded ref points
 * at the underlying element so the results view can seek it. If local playback fails
 * (corrupt file, unsupported codec) a plain-language message replaces the player instead
 * of leaving a silently broken control — analysis doesn't depend on preview playback
 * succeeding. Pass a `key` keyed on the source when reusing this component across files
 * so that state resets per file.
 */
export const MediaPlayer = forwardRef<HTMLVideoElement | HTMLAudioElement, Props>(
  function MediaPlayer({ src, kind, label }, ref) {
    const [broken, setBroken] = useState(false);

    if (broken) {
      return (
        <p className="player-error" role="alert">
          This file couldn’t be played back in your browser. SoftView may still be able to analyze
          it.
        </p>
      );
    }

    if (kind === 'video') {
      return (
        <video
          ref={ref as Ref<HTMLVideoElement>}
          className="player"
          src={src}
          controls
          playsInline
          aria-label={label}
          onError={() => setBroken(true)}
        />
      );
    }
    return (
      <audio
        ref={ref as Ref<HTMLAudioElement>}
        className="player"
        src={src}
        controls
        aria-label={label}
        onError={() => setBroken(true)}
      />
    );
  },
);
