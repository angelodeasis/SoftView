import type { MediaKind } from '../../core/media/types';

interface Props {
  src: string;
  kind: MediaKind;
  label: string;
}

/**
 * Plays the selected media with the browser's native controls. Custom controls and
 * the Assisted Viewing overlay come in a later phase.
 */
export function MediaPlayer({ src, kind, label }: Props) {
  if (kind === 'video') {
    return <video className="player" src={src} controls playsInline aria-label={label} />;
  }
  return <audio className="player" src={src} controls aria-label={label} />;
}
