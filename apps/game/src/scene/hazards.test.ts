import { expect, it } from 'vitest';
import { content, shaft } from '../play2/content.js';
import { throwbackAreas } from './hazards.js';

it('derives the shaft warning from its repeatable enter trigger and throw reaction', () => {
  expect(throwbackAreas(shaft, content, {})).toEqual([{ from: { line: 4, col: 0 }, to: { line: 26, col: 8 } }]);
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
  const stage = { ...shaft, triggers: shaft.triggers.map(trigger => ({ ...trigger, onlyIf: 'enabled' })) };
  expect(throwbackAreas(stage, content, {})).toEqual([]);
  expect(throwbackAreas(stage, content, { enabled: true })).toHaveLength(1);
  const story = { ...content, reactions: content.reactions.map(reaction => ({ ...reaction, unless: 'safe' })) };
  expect(throwbackAreas(shaft, story, { safe: true })).toEqual([]);
});
