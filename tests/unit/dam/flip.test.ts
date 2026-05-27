import { describe, it, expect } from 'vitest';
import { invert } from '@/lib/dam/flip';

describe('invert', () => {
  it('returns the delta from new→old position', () => {
    expect(invert({ top: 10, left: 20 }, { top: 50, left: 60 })).toEqual({ dx: -40, dy: -40 });
  });

  it('returns zero when unchanged', () => {
    expect(invert({ top: 5, left: 5 }, { top: 5, left: 5 })).toEqual({ dx: 0, dy: 0 });
  });

  it('handles positive deltas', () => {
    expect(invert({ top: 100, left: 80 }, { top: 40, left: 30 })).toEqual({ dx: 50, dy: 60 });
  });
});
