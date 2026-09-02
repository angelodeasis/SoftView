/**
 * A blob object URL paired with a one-shot revoke. Keeping the pair together makes the
 * lifecycle easy to reason about: create when media is chosen, revoke when it is
 * replaced or the view unmounts. Revoking twice is harmless.
 */

export interface ObjectUrlHandle {
  readonly url: string;
  revoke(): void;
}

export function createObjectUrl(blob: Blob): ObjectUrlHandle {
  const url = URL.createObjectURL(blob);
  let revoked = false;
  return {
    url,
    revoke() {
      if (revoked) return;
      revoked = true;
      URL.revokeObjectURL(url);
    },
  };
}
