import { expect, it } from 'vitest';
import { content, shaft } from '../play2/content.js';
import { throwbackAreas } from './hazards.js';

it('the Shaft throws nobody back now: its mortar is simply not walkable', () => {
  expect(throwbackAreas(shaft, content, {})).toEqual([]);
});
it('works with arbitrary stage and trigger ids and ignores one-shot or interact triggers', () => {
  const area = { from: { line: 1, col: 2 }, to: { line: 3, col: 4 } };
  const stage = { ...shaft, id: 'other', triggers: [
    { id: 'trap', on: 'enter' as const, once: false, area },
    { id: 'trap', on: 'enter' as const, once: true, area },
    { id: 'trap', on: 'interact' as const, once: false, target: { type: 'area' as const, area } },
  ] };
  const story = { ...content, reactions: [{ id: 'throw', once: false,
    when: { type: 'trigger' as const, trigger: 'trap' }, then: [{ type: 'world' as const,
      effects: [{ type: 'move-player' as const, to: { line: 0, col: 0 } }] }] }] };
  expect(throwbackAreas(stage, story, {})).toEqual([area]);
  expect(throwbackAreas(stage, { ...story, reactions: story.reactions.map(r => ({ ...r, once: true })) }, {})).toEqual([]);
  expect(throwbackAreas(stage, { ...story, reactions: [] }, {})).toEqual([]);
});
it('respects trigger and reaction flag gates', () => {
  const area = { from: { line: 1, col: 2 }, to: { line: 3, col: 4 } };
  const stage = { ...shaft, id: 'other', triggers: [{ id: 'trap', on: 'enter' as const, once: false, area, onlyIf: 'enabled' }] };
  const story = { ...content, reactions: [{ id: 'throw', once: false, unless: 'safe',
    when: { type: 'trigger' as const, trigger: 'trap' }, then: [{ type: 'world' as const,
      effects: [{ type: 'move-player' as const, to: { line: 0, col: 0 } }] }] }] };
  expect(throwbackAreas(stage, story, {})).toEqual([]);
  expect(throwbackAreas(stage, story, { enabled: true })).toHaveLength(1);
  expect(throwbackAreas(stage, story, { enabled: true, safe: true })).toEqual([]);
});
