import { describe, expect, it } from 'vitest';
import { isAdvanceKey, nextIndex, speakerName } from './advance';
import { heartsText, turnText } from './hud';

describe('isAdvanceKey', () => {
  it('accepts Enter and Space', () => {
    expect(isAdvanceKey('Enter')).toBe(true);
    expect(isAdvanceKey(' ')).toBe(true);
  });
  it('lets every other key through', () => {
    for (const key of ['j', 'Escape', 'Tab', 'ArrowDown']) expect(isAdvanceKey(key)).toBe(false);
  });
});

describe('nextIndex', () => {
  it('moves on', () => {
    expect(nextIndex(0, 3)).toEqual({ index: 1, done: false });
  });
  it('is done after the last item', () => {
    expect(nextIndex(2, 3)).toEqual({ index: 2, done: true });
  });
  it('is done at once for one item', () => {
    expect(nextIndex(0, 1).done).toBe(true);
  });
});

describe('speakerName', () => {
  it('names the cast', () => {
    expect(speakerName({ speaker: 'scribe', text: '' })).toBe('The Scribe');
    expect(speakerName({ speaker: 'dot', text: '' })).toBe('Dot');
  });
  it('uses the line name for an npc', () => {
    expect(speakerName({ speaker: 'npc', name: 'The Lamplighter', text: '' })).toBe('The Lamplighter');
    expect(speakerName({ speaker: 'npc', text: '' })).toBe('');
  });
  it('shows no name for system', () => {
    expect(speakerName({ speaker: 'system', text: '' })).toBe('');
  });
});

describe('hud text', () => {
  it('draws hearts', () => {
    expect(heartsText(2, 3)).toBe('♥♥♡');
  });
  it('clamps hearts', () => {
    expect(heartsText(5, 3)).toBe('♥♥♥');
    expect(heartsText(-1, 2)).toBe('♡♡');
  });
  it('writes the turn', () => {
    expect(turnText(7)).toBe('Turn 7');
    expect(turnText(-2)).toBe('Turn 0');
  });
});
