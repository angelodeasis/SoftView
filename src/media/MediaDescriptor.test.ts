import { describe, expect, it, vi } from 'vitest';
import { createMediaDescriptor, withMetadata } from './MediaDescriptor';

function makeFile(name = 'clip.mp4', type = 'video/mp4', bytes = 2048) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('createMediaDescriptor', () => {
  it('builds facts from the file and exposes a playable URL', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:desc/1');
    const file = makeFile('song.mp3', 'audio/mpeg', 4096);

    const descriptor = createMediaDescriptor(file, 'audio');

    expect(descriptor.objectUrl).toBe('blob:desc/1');
    expect(descriptor.kind).toBe('audio');
    expect(descriptor.file).toBe(file);
    expect(descriptor.facts).toEqual({
      name: 'song.mp3',
      sizeBytes: 4096,
      mimeType: 'audio/mpeg',
      kind: 'audio',
    });
  });

  it('revoke() delegates to the underlying handle', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:desc/2');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');

    const descriptor = createMediaDescriptor(makeFile(), 'video');
    descriptor.revoke();
    descriptor.revoke();

    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('withMetadata', () => {
  it('merges metadata into a new descriptor without mutating the original', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:desc/3');
    const original = createMediaDescriptor(makeFile(), 'video');

    const enriched = withMetadata(original, { durationSec: 12.3, width: 1280, height: 720 });

    expect(original.facts.durationSec).toBeUndefined();
    expect(enriched.facts).toMatchObject({ durationSec: 12.3, width: 1280, height: 720 });
    expect(enriched.objectUrl).toBe(original.objectUrl);
  });
});
