/**
 * A non-alarming heads-up for files whose analysis will be slow or memory-heavy.
 * Pure. Not a blocker — the UI shows it, the user decides.
 */

export interface MediaAdvisory {
  readonly level: 'info' | 'warn';
  readonly message: string;
}

const MINUTE = 60;
const LONG_SECONDS = 90 * MINUTE;
const MODERATE_SECONDS = 30 * MINUTE;
const LARGE_BYTES = 500 * 1024 * 1024;

function approxDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function largeFileAdvisory(input: {
  sizeBytes: number;
  durationSec?: number;
}): MediaAdvisory | null {
  const { sizeBytes, durationSec } = input;

  if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
    if (durationSec >= LONG_SECONDS) {
      return {
        level: 'warn',
        message:
          `This is a long file (about ${approxDuration(durationSec)}). ` +
          'Analysis runs entirely on your device and may take several minutes.',
      };
    }
    if (durationSec >= MODERATE_SECONDS) {
      return {
        level: 'info',
        message: 'Analysis of a file this length may take a few minutes.',
      };
    }
    return null;
  }

  if (sizeBytes >= LARGE_BYTES) {
    return {
      level: 'info',
      message: 'This is a large file. Analysis may take a while and use significant memory.',
    };
  }
  return null;
}
