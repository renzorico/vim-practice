import { afterEach, expect, it, vi } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { content, lowlands, lowlandsLegend } from './content.js';
import { createSession } from './session.js';

const hook = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('react', () => ({
  useState: (init: () => unknown) => {
    hook.value ??= init();
    return [hook.value, (value: unknown) => { hook.value = value; }];
  },
}));
import { useMotionUses } from './useMotionUses.js';
afterEach(() => { hook.value = undefined; });

it('counts each event batch once, caps uses and resets on replay or stage change', () => {
  const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(),
    stage: lowlands, legend: lowlandsLegend, content });
  const initial = controller.init(false);
  let session = initial;
  expect(useMotionUses(session)).toEqual({});
  for (let count = 1; count <= 4; count++) {
    session = controller.reduce(session, 'w');
    const uses = useMotionUses(session);
    expect(uses.w).toBe(Math.min(count, 3));
    expect(useMotionUses(session)).toBe(uses);
    expect(useMotionUses({ ...session, queue: [] })).toBe(uses);
  }
  const replay = { ...initial, stageEntry: { ...initial.stageEntry, story: { ...initial.stageEntry.story } } };
  expect(useMotionUses(replay)).toEqual({});
  expect(useMotionUses(session).w).toBe(1);
  expect(useMotionUses({ ...session, world: { ...session.world, stage: 'lighthouse' }, lastEvents: [] })).toEqual({});
});
