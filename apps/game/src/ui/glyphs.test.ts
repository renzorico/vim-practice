import { describe, expect, it } from 'vitest';
import { classifyGlyph, classifyRow, describeMapSummary, describeOffset, markerIndex } from './glyphs.js';

describe('describeMapSummary', () => {
  const markers = [
    { at: { line: 2, col: 4 }, kind: 'note' },
    { at: { line: 2, col: 15 }, kind: 'door' },
  ] as const;

  it('names position, nearest entity and objective', () => {
    const text = describeMapSummary({ line: 2, col: 11 }, markers, 'Open the door.');
    expect(text).toBe('You are at row 3, column 12. Nearest: a door, 4 columns east. Objective: Open the door.');
  });

  it('says what you stand on', () => {
    const text = describeMapSummary({ line: 2, col: 4 }, markers, 'Go.');
    expect(text).toContain('standing on a note');
    expect(text).toContain('Nearest: a door, 11 columns east');
  });

  it('describes offsets in both axes', () => {
    expect(describeOffset({ line: 0, col: 5 }, { line: 1, col: 3 })).toBe('2 columns west, 1 row south');
  });
});

const none = markerIndex([]);
const away = { line: 9, col: 9 };

describe('classifyGlyph', () => {
  it('classifies fixed glyphs', () => {
    expect(classifyGlyph('#', { line: 0, col: 0 }, away, none)).toBe('wall');
    expect(classifyGlyph('░', { line: 0, col: 0 }, away, none)).toBe('fog');
    expect(classifyGlyph('~', { line: 0, col: 0 }, away, none)).toBe('corrupted');
    expect(classifyGlyph('.', { line: 0, col: 0 }, away, none)).toBe('floor');
  });

  it('marks the cursor cell as you, even on an entity', () => {
    const markers = markerIndex([{ at: { line: 0, col: 1 }, kind: 'door' }]);
    expect(classifyGlyph('D', { line: 0, col: 1 }, { line: 0, col: 1 }, markers)).toBe('you');
  });

  it('colours letters only where an entity sits', () => {
    const markers = markerIndex([{ at: { line: 0, col: 0 }, kind: 'note' }]);
    expect(classifyGlyph('N', { line: 0, col: 0 }, away, markers)).toBe('note');
    expect(classifyGlyph('N', { line: 0, col: 5 }, away, markers)).toBe('floor');
  });

  it('maps every entity kind', () => {
    const kinds = ['note', 'door', 'key', 'echo'] as const;
    for (const kind of kinds) {
      const markers = markerIndex([{ at: { line: 0, col: 0 }, kind }]);
      expect(classifyGlyph('x', { line: 0, col: 0 }, away, markers)).toBe(kind);
    }
  });
});

describe('classifyRow', () => {
  it('merges neighbours of the same class', () => {
    expect(classifyRow('##..', 0, away, none)).toEqual([
      { text: '##', glyph: 'wall' },
      { text: '..', glyph: 'floor' },
    ]);
  });

  it('keeps the cursor cell on its own', () => {
    const runs = classifyRow('...', 0, { line: 0, col: 1 }, none);
    expect(runs.map((run) => run.glyph)).toEqual(['floor', 'you', 'floor']);
  });
});
