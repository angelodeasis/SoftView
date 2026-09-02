import { describe, expect, it } from 'vitest';
import { fileExtension, validateMediaSelection } from './validate';

describe('fileExtension', () => {
  it('returns the lower-cased extension', () => {
    expect(fileExtension('clip.MP4')).toBe('mp4');
    expect(fileExtension('a.b.mp3')).toBe('mp3');
  });

  it('returns empty string when there is no usable extension', () => {
    expect(fileExtension('noext')).toBe('');
    expect(fileExtension('.hidden')).toBe('');
    expect(fileExtension('trailingdot.')).toBe('');
  });
});

describe('validateMediaSelection', () => {
  it('accepts MP4 by MIME type', () => {
    expect(validateMediaSelection({ name: 'x', mimeType: 'video/mp4' })).toEqual({
      ok: true,
      kind: 'video',
    });
  });

  it('accepts MP3 by MIME type', () => {
    expect(validateMediaSelection({ name: 'x', mimeType: 'audio/mpeg' })).toEqual({
      ok: true,
      kind: 'audio',
    });
  });

  it('falls back to the extension when the MIME type is missing', () => {
    expect(validateMediaSelection({ name: 'song.mp3', mimeType: '' })).toEqual({
      ok: true,
      kind: 'audio',
    });
    expect(validateMediaSelection({ name: 'movie.MP4', mimeType: '' })).toEqual({
      ok: true,
      kind: 'video',
    });
  });

  it('rejects unsupported files', () => {
    expect(validateMediaSelection({ name: 'clip.mov', mimeType: 'video/quicktime' }).ok).toBe(
      false,
    );
    expect(validateMediaSelection({ name: 'notes.txt', mimeType: 'text/plain' }).ok).toBe(false);
    expect(validateMediaSelection({ name: 'noext', mimeType: '' }).ok).toBe(false);
  });

  it('rejects when MIME type and extension disagree', () => {
    const result = validateMediaSelection({ name: 'song.mp3', mimeType: 'video/mp4' });
    expect(result.ok).toBe(false);
  });
});
