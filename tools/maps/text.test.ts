import { expect, it } from 'vitest';
import { FIXTURE_STAGE, FIXTURE_LEGEND } from '@escape/world';
import { lintStage } from './lint.js';

it.each(['oil', 'oil\nrope'])('checks anchors and warns only for deletable cells with text %j', text => {
  const trigger = { id: 'cargo', on: 'text', anchor: 'sign-1', text, once: true } as const;
  const room = { ...FIXTURE_STAGE, triggers: [trigger] };
  expect(lintStage(room, FIXTURE_LEGEND)).toContainEqual(expect.objectContaining({ rule: 'text-anchor-not-fixed', severity: 'warning' }));
  expect(lintStage({ ...room, triggers: [{ ...trigger, anchor: 'missing' }] }, FIXTURE_LEGEND))
    .toContainEqual(expect.objectContaining({ rule: 'missing-entity', severity: 'error' }));
  const fixed = { ...room, entities: room.entities.map(entity => entity.id === 'sign-1' ? { ...entity, at: { line: 2, col: 7 } } : entity) };
  expect(lintStage(fixed, FIXTURE_LEGEND).some(issue => issue.rule === 'text-anchor-not-fixed')).toBe(false);
});
