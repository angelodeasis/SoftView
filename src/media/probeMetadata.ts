import type { MediaKind } from '../core/media/types';

/**
 * Reads duration (and, for video, pixel dimensions) from a media file by pointing a
 * detached, metadata-only media element at its object URL. Best-effort: on error or
 * timeout the promise rejects and the caller simply proceeds without the extra facts.
 *
 * The element is created via an injectable factory so the logic can be tested without
 * a real media pipeline.
 */

export interface MediaMetadata {
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface ProbeMediaElement {
  preload: string;
  src: string;
  readonly duration: number;
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  addEventListener(type: 'loadedmetadata' | 'error', listener: () => void): void;
  removeEventListener(type: 'loadedmetadata' | 'error', listener: () => void): void;
  removeAttribute(name: string): void;
  load(): void;
}

export interface ProbeDeps {
  createElement: (kind: MediaKind) => ProbeMediaElement;
  timeoutMs: number;
}

const defaultDeps: ProbeDeps = {
  createElement: (kind) =>
    document.createElement(kind === 'video' ? 'video' : 'audio') as unknown as ProbeMediaElement,
  timeoutMs: 15_000,
};

export function probeMetadata(
  objectUrl: string,
  kind: MediaKind,
  deps: Partial<ProbeDeps> = {},
): Promise<MediaMetadata> {
  const { createElement, timeoutMs } = { ...defaultDeps, ...deps };

  return new Promise<MediaMetadata>((resolve, reject) => {
    const el = createElement(kind);
    el.preload = 'metadata';

    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('error', onError);
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      run();
    };

    const onLoaded = () => {
      const meta: MediaMetadata = {};
      if (Number.isFinite(el.duration) && el.duration > 0) meta.durationSec = el.duration;
      if (kind === 'video') {
        if (el.videoWidth) meta.width = el.videoWidth;
        if (el.videoHeight) meta.height = el.videoHeight;
      }
      finish(() => resolve(meta));
    };
    const onError = () => finish(() => reject(new Error('Could not read this file’s metadata.')));
    const timer = setTimeout(
      () => finish(() => reject(new Error('Timed out reading this file’s metadata.'))),
      timeoutMs,
    );

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('error', onError);
    el.src = objectUrl;
  });
}
