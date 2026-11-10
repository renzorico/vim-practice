import { describe, expect, it } from 'vitest';
import { differingLines, formatKeyCount, keysVersusBest, logText, powerPercent, roomTitle, showFailBanner } from './labels.js';

describe('differingLines', () => {
  it('flags the target lines that differ from the buffer', () => {
    expect(differingLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([false, true, false]);
  });

  it('flags lines the buffer does not have yet', () => {
    expect(differingLines(['a'], ['a', 'b'])).toEqual([false, true]);
  });
});

describe('labels', () => {
  it('formats key counts', () => {
    expect(formatKeyCount(2, 5)).toBe('2/5');
  });

  it('clamps the power meter', () => {
    expect(powerPercent(50, 100)).toBe(50);
    expect(powerPercent(150, 100)).toBe(100);
    expect(powerPercent(-1, 100)).toBe(0);
    expect(powerPercent(1, 0)).toBe(0);
  });

  it('compares keys used with par', () => {
    expect(keysVersusBest(7, 3)).toBe('7 keys (best possible: 3)');
    expect(keysVersusBest(1, 1)).toBe('1 key (best possible: 1)');
  });

  it('shows the banner when the solution or skip unlocks', () => {
    expect(showFailBanner(false, false)).toBe(false);
    expect(showFailBanner(true, false)).toBe(true);
    expect(showFailBanner(false, true)).toBe(true);
  });

  it('writes GC lines in capitals', () => {
    expect(logText({ speaker: 'gc', text: 'sector lost' })).toBe('SECTOR LOST');
    expect(logText({ speaker: 'operator', text: 'Keep going.' })).toBe('Keep going.');
  });

  it('writes the room header', () => {
    expect(roomTitle(3, 'The Long Line')).toBe('Room 3 \u00b7 The Long Line');
  });
});
