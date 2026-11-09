import { describe, expect, it } from 'vitest';
import { describeGoal, failureMessage, hasMoreHints, keystrokeText, modeLabel, parStatus, starText, visibleHints } from './hudText.js';

describe('hudText', () => {
  it('labels modes', () => {
    expect(modeLabel('visual-line')).toBe('V-LINE');
    expect(modeLabel('insert')).toBe('INSERT');
  });

  it('describes each goal type', () => {
    expect(describeGoal({ type: 'reach', target: { line: 0, col: 4 } })).toContain('line 1, column 5');
    expect(describeGoal({ type: 'quit', mustSave: true })).toBe('Save and quit');
    expect(describeGoal({ type: 'quit', mustSave: false })).toBe('Quit');
    expect(describeGoal({ type: 'collect', register: 'k', text: 'key' })).toContain('register k');
    expect(describeGoal({ type: 'transform', targetLines: [] })).toContain('target');
  });

  it('compares keystrokes with par', () => {
    expect(keystrokeText(3, 4)).toBe('3 / par 4');
    expect(parStatus(3, 4)).toBe('under');
    expect(parStatus(4, 4)).toBe('on');
    expect(parStatus(5, 4)).toBe('over');
  });

  it('reveals hints one at a time', () => {
    const hints = ['a', 'b'];
    expect(visibleHints(hints, 0)).toEqual([]);
    expect(visibleHints(hints, 1)).toEqual(['a']);
    expect(visibleHints(hints, 5)).toEqual(['a', 'b']);
    expect(hasMoreHints(hints, 1)).toBe(true);
    expect(hasMoreHints(hints, 2)).toBe(false);
  });

  it('explains failures and renders stars', () => {
    expect(failureMessage('quit')).toContain('left Vim');
    expect(failureMessage('must-use')).toContain('required');
    expect(starText(2)).toBe('**.');
  });
});
