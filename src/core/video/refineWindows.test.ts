import { describe, expect, it } from 'vitest';
import { refineWindows } from './refineWindows';

const ev = (startTime: number, endTime: number) => ({ startTime, endTime });

describe('refineWindows', () => {
  it('pads a single event and clamps to the media', () => {
    expect(refineWindows([ev(1, 2)], [], { mediaDurationSec: 100, padSec: 2.5 })).toEqual([
      { fromSec: 0, toSec: 4.5 },
    ]);
    expect(refineWindows([ev(98, 99)], [], { mediaDurationSec: 100, padSec: 2.5 })).toEqual([
      { fromSec: 95.5, toSec: 100 },
    ]);
  });

  it('merges spans that touch after padding', () => {
    const w = refineWindows([ev(10, 11), ev(14, 15)], [], { mediaDurationSec: 100, padSec: 2.5 });
    expect(w).toEqual([{ fromSec: 7.5, toSec: 17.5 }]);
  });

  it('keeps spans that stay apart', () => {
    const w = refineWindows([ev(10, 11), ev(40, 41)], [], { mediaDurationSec: 100, padSec: 2 });
    expect(w).toHaveLength(2);
  });

  it('folds in the extra timestamps', () => {
    const w = refineWindows([ev(10, 11)], [50], { mediaDurationSec: 100, padSec: 2 });
    expect(w).toEqual([
      { fromSec: 8, toSec: 13 },
      { fromSec: 48, toSec: 52 },
    ]);
  });

  it('returns nothing for empty inputs', () => {
    expect(refineWindows([], [], { mediaDurationSec: 100 })).toEqual([]);
  });

  it('drops a window entirely past the media duration', () => {
    expect(refineWindows([ev(200, 201)], [], { mediaDurationSec: 100 })).toEqual([]);
  });
});
