import { useCallback, useRef, useState } from 'react';
import { validateMediaSelection } from '../../core/media/validate';
import {
  createMediaDescriptor,
  withMetadata,
  type MediaDescriptor,
} from '../../media/MediaDescriptor';
import { probeMetadata } from '../../media/probeMetadata';
import { MediaDropZone } from '../components/MediaDropZone';
import { FileFactsPanel } from '../components/FileFactsPanel';

const ACCEPT = 'video/mp4,audio/mpeg,.mp4,.mp3';

interface Props {
  descriptor: MediaDescriptor | null;
  /** The parent owns the descriptor's object-URL lifecycle. */
  onSelect: (descriptor: MediaDescriptor) => void;
}

export function SelectMedia({ descriptor, onSelect }: Props) {
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<MediaDescriptor | null>(null);

  const onFile = useCallback(
    async (file: File) => {
      const result = validateMediaSelection({ name: file.name, mimeType: file.type });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setError(null);

      const next = createMediaDescriptor(file, result.kind);
      pending.current = next;
      onSelect(next);

      try {
        const meta = await probeMetadata(next.objectUrl, next.kind);
        if (pending.current === next) onSelect(withMetadata(next, meta));
      } catch {
        // Metadata is best-effort; the facts panel just omits duration/resolution.
      }
    },
    [onSelect],
  );

  return (
    <section className="select-media" aria-labelledby="select-media-heading">
      <h2 id="select-media-heading">Select media</h2>

      <MediaDropZone onFile={onFile} accept={ACCEPT} />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {descriptor && <FileFactsPanel facts={descriptor.facts} />}
    </section>
  );
}
