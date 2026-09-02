import { describe, expect, it, vi } from 'vitest';
import { createObjectUrl } from './objectUrl';

describe('createObjectUrl', () => {
  it('creates a URL from the blob', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/1');
    const blob = new Blob(['x']);

    const handle = createObjectUrl(blob);

    expect(handle.url).toBe('blob:test/1');
    expect(create).toHaveBeenCalledWith(blob);
  });

  it('revokes exactly once, no matter how many times revoke() is called', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/2');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');

    const handle = createObjectUrl(new Blob(['x']));
    handle.revoke();
    handle.revoke();
    handle.revoke();

    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:test/2');
  });
});
