import type { MediaFacts, MediaKind } from '../core/media/types';
import { createObjectUrl, type ObjectUrlHandle } from './objectUrl';
import type { MediaMetadata } from './probeMetadata';

/**
 * Everything the app needs to hold about the currently selected media: the `File`
 * itself (never uploaded, never copied), a playable object URL, the display facts,
 * and the means to release the URL. Immutable — {@link withMetadata} returns a new one.
 */
export interface MediaDescriptor {
  readonly file: File;
  readonly kind: MediaKind;
  readonly objectUrl: string;
  readonly facts: MediaFacts;
  revoke(): void;
}

export function createMediaDescriptor(file: File, kind: MediaKind): MediaDescriptor {
  const handle: ObjectUrlHandle = createObjectUrl(file);
  return {
    file,
    kind,
    objectUrl: handle.url,
    facts: {
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      kind,
    },
    revoke: () => handle.revoke(),
  };
}

export function withMetadata(descriptor: MediaDescriptor, meta: MediaMetadata): MediaDescriptor {
  return {
    ...descriptor,
    facts: {
      ...descriptor.facts,
      durationSec: meta.durationSec,
      width: meta.width,
      height: meta.height,
    },
  };
}
