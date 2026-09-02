import type { MediaKind } from './types';

/**
 * Decides whether a selected file is something SoftView can work with, based only on
 * its name and reported MIME type. Pure — the browser layer passes these two strings in.
 *
 * MVP scope (see README): MP4 video and MP3 audio only.
 */

export type MediaValidation =
  { readonly ok: true; readonly kind: MediaKind } | { readonly ok: false; readonly reason: string };

const SUPPORTED_MESSAGE = 'SoftView currently supports MP4 video and MP3 audio files.';

const MIME_KIND: Readonly<Record<string, MediaKind>> = {
  'video/mp4': 'video',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio', // non-standard, but some systems report it
};

const EXTENSION_KIND: Readonly<Record<string, MediaKind>> = {
  mp4: 'video',
  mp3: 'audio',
};

/** Lower-cased extension without the dot, or `''` if there isn't a usable one. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 1 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function validateMediaSelection(input: { name: string; mimeType: string }): MediaValidation {
  const mime = input.mimeType.trim().toLowerCase();
  const ext = fileExtension(input.name);

  const byMime = MIME_KIND[mime];
  const byExt = EXTENSION_KIND[ext];

  if (byMime && byExt && byMime !== byExt) {
    return {
      ok: false,
      reason: `This file’s type and extension don’t match. ${SUPPORTED_MESSAGE}`,
    };
  }

  const kind = byMime ?? byExt;
  if (!kind) {
    return { ok: false, reason: SUPPORTED_MESSAGE };
  }
  return { ok: true, kind };
}
