import { useCallback, useEffect, useRef, useState } from 'react';
import { validateMediaSelection } from '../../core/media/validate';
import {
  createMediaDescriptor,
  withMetadata,
  type MediaDescriptor,
} from '../../media/MediaDescriptor';
import { probeMetadata } from '../../media/probeMetadata';
import { MediaDropZone } from '../components/MediaDropZone';
import { MediaPlayer } from '../components/MediaPlayer';
import { FileFactsPanel } from '../components/FileFactsPanel';

const ACCEPT = 'video/mp4,audio/mpeg,.mp4,.mp3';

export function SelectMedia() {
  const [descriptor, setDescriptor] = useState<MediaDescriptor | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Always revoke the latest object URL on unmount.
  const latest = useRef<MediaDescriptor | null>(null);
  useEffect(() => {
    latest.current = descriptor;
  }, [descriptor]);
  useEffect(() => () => latest.current?.revoke(), []);

  const onFile = useCallback(async (file: File) => {
    const result = validateMediaSelection({ name: file.name, mimeType: file.type });
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);

    const next = createMediaDescriptor(file, result.kind);
    setDescriptor((prev) => {
      prev?.revoke();
      return next;
    });

    try {
      const meta = await probeMetadata(next.objectUrl, next.kind);
      setDescriptor((current) => (current === next ? withMetadata(current, meta) : current));
    } catch {
      // Metadata is best-effort; the facts panel just omits duration/resolution.
    }
  }, []);

  return (
    <section className="select-media" aria-labelledby="select-media-heading">
      <h2 id="select-media-heading">Select media</h2>

      <MediaDropZone onFile={onFile} accept={ACCEPT} />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {descriptor && (
        <>
          <FileFactsPanel facts={descriptor.facts} />
          <MediaPlayer
            src={descriptor.objectUrl}
            kind={descriptor.kind}
            label={`Preview of ${descriptor.facts.name}`}
          />
        </>
      )}
    </section>
  );
}
