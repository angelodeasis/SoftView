import { forwardRef, type Ref } from 'react';
import type { MediaKind } from '../../core/media/types';

interface Props {
  src: string;
  kind: MediaKind;
  label: string;
}

/**
 * Plays the selected media with the browser's native controls. The forwarded ref points
 * at the underlying element so the results view can seek it. Custom controls and the
 * Assisted Viewing overlay come in a later phase.
 */
export const MediaPlayer = forwardRef<HTMLVideoElement | HTMLAudioElement, Props>(
  function MediaPlayer({ src, kind, label }, ref) {
    if (kind === 'video') {
      return (
        <video
          ref={ref as Ref<HTMLVideoElement>}
          className="player"
          src={src}
          controls
          playsInline
          aria-label={label}
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
      />
    );
  },
);
