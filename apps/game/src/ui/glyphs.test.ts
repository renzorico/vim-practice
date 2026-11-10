import { describe, expect, it } from 'vitest';
import { classifyGlyph, classifyRow, markerIndex } from './glyphs.js';

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
