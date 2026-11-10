import { describe, expect, it } from 'vitest';
import { findChar, targetDisplayCol } from './targetCell.js';

describe('targetDisplayCol', () => {
  it('is the column on plain text', () => {
    expect(targetDisplayCol('hello', 3)).toBe(3);
  });

  it('shifts after a tab', () => {
    expect(targetDisplayCol('\tx', 1)).toBe(8);
  });

  it('points at the last cell of a tab', () => {
    expect(targetDisplayCol('\tx', 0)).toBe(7);
  });

  it('allows a column past the end', () => {
    expect(targetDisplayCol('ab', 2)).toBe(2);
  });
});

describe('findChar', () => {
  it('finds the X of the gallery sample, away from the cursor', () => {
    const lines = ['the quick brown fox', 'jumps over the lazy dogX'];
    expect(findChar(lines, 'X')).toEqual({ line: 1, col: 23 });
    expect(findChar(lines, 'Q')).toBeNull();
  });
});
