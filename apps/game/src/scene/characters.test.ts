import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { stages } from '../play2/content.js';
import { movementFacing, playerFrame, npcFacing, personIdleFrame, interactionLabel, isPerson } from './characters.js';
import { blockedReason } from '../play2/feedback.js';

it('faces the dominant movement axis and preserves facing for directionless bumps', () => {
  const from = { line: 3, col: 3 };
  expect(movementFacing(from, { line: 4, col: 8 })).toBe('right');
  expect(movementFacing(from, { line: 2, col: 0 })).toBe('left');
  expect(movementFacing(from, { line: 0, col: 4 })).toBe('up');
  expect(movementFacing(from, { line: 5, col: 3 })).toBe('down');
  for (const facing of ['up', 'down', 'left', 'right'] as const) expect(movementFacing(from, from, facing)).toBe(facing);
});
it('alternates two walk frames every half cell and stands with reduced motion', () => {
  for (const facing of ['up', 'down', 'left', 'right'] as const) {
    const first = playerFrame(facing, 0, true);
    const second = playerFrame(facing, 0.5, true);
    expect(second).toBe(first + 1);
    expect(playerFrame(facing, 1, true)).toBe(first);
    expect(playerFrame(facing, 0.5, true, true)).toBe(playerFrame(facing));
    expect(first).not.toBe(playerFrame(facing));
  }
  expect(playerFrame('left')).toBe(playerFrame('right'));
});
it('turns people within three columns and one row, retaining their far-away facing', () => {
  const at = { line: 3, col: 5 };
  expect(npcFacing(at, { line: 4, col: 2 })).toBe(true);
  expect(npcFacing(at, { line: 2, col: 8 }, true)).toBe(false);
  expect(npcFacing(at, { line: 1, col: 2 })).toBe(false);
  expect(npcFacing(at, { line: 3, col: 9 }, true)).toBe(true);
  expect(npcFacing(at, at, true)).toBe(true);
  expect(personIdleFrame('elder', 0)).not.toBe(personIdleFrame('elder', 600));
  expect(personIdleFrame('elder', 0)).toBe(personIdleFrame('elder', 1200));
  expect(personIdleFrame('elder', 600, true)).toBe(0);
});
it('uses feedback classification for every interactable entity in every stage', () => {
  const sim = createWorldSim(createEngine());
  let checked = 0;
  for (const { stage, legend } of stages) for (const trigger of stage.triggers) {
    if (trigger.on !== 'interact' || trigger.target.type !== 'entity') continue;
    const id = trigger.target.entity;
    const def = stage.entities.find(entity => entity.id === id);
    if (!def) continue;
    const entity = { id, def, at: def.at, pathIndex: 0 };
    const state = { ...sim.init(stage, legend, { learnedCommands: [], flags: {} }), entities: [entity],
      flags: { ...(trigger.onlyIf ? { [trigger.onlyIf]: true } : {}), ...(trigger.unless ? { [trigger.unless]: false } : {}) } };
    const reason = blockedReason([{ type: 'bump', at: entity.at, reason: 'solid-entity' }], stage, state);
    const label = interactionLabel(entity, stage, state);
    if (def.sprite === 'quarry-gate' || def.sprite === 'lift') { expect(label).toMatch(/^Enter: (go south|take lift)$/); continue; }
    expect(label).toBe(reason === 'Press Enter to read.' ? 'Enter: read'
      : reason === 'Press Enter to talk.' || isPerson(def.kind) ? 'Enter: talk' : 'Enter: use');
    if (def.kind === 'prop' && ['note', 'sign', 'book', 'plaque'].includes(def.sprite)) expect(label).toBe('Enter: read');
    checked++;
  }
  expect(checked).toBeGreaterThan(20);
});
