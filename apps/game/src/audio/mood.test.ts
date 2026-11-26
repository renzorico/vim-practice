import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { content, stages, stage, legend, quarry } from '../play2/content.js';
import { moodFor, paceFor, STAGE_PACE, TEMPO_FACTOR, type MoodInput } from './mood.js';

const sim = createWorldSim(createEngine());
const base: MoodInput = { world: sim.init(stage, legend, { flags: {}, learnedCommands: [] }), stage, story: createStoryEngine().init(content), content };
it('follows the current main quest, including the last open step of longer quests', () => {
  for (const quest of content.quests.filter(quest => quest.kind === 'main')) {
    for (let step = 0; step < quest.steps.length; step++) {
      const story = { ...base.story, quests: { [quest.id]: { step, done: false } } };
      const expected = step === 0 ? 0 : quest.steps.length >= 3 && step === quest.steps.length - 1 ? 3
        : 1 + Math.floor(2 * step / quest.steps.length);
      expect(moodFor({ ...base, story }).energy).toBe(expected);
    }
  }
  expect(moodFor({ ...base, story: { ...base.story, quests: {} } }).energy).toBe(1);
  const text = stages.find(entry => entry.stage.type === 'text')!.stage;
  expect(moodFor({ ...base, stage: text }).energy).toBe(1);
});
it.each([0, 1, 2, 3, 5, 6])('measures contact damage using Manhattan distance (%s cells)', distance => {
  const spawn = quarry.entities.find(entity => entity.damage > 0)!;
  const cursor = base.world.engine.cursor;
  const world = { ...base.world, entities: [{ id: spawn.id, def: spawn, at: { line: cursor.line + Math.min(distance, 2), col: cursor.col + Math.max(0, distance - 2) }, pathIndex: 0 }] };
  expect(moodFor({ ...base, world }).danger).toBe(distance <= 2 ? 2 : distance <= 5 ? 1 : 0);
  expect(moodFor({ ...base, world: { ...world, entities: [{ ...world.entities[0]!, def: { ...spawn, damage: 0 } }] } }).danger).toBe(0);
});
it('uses remaining hearts, ignores removed enemies, and releases danger on death/clear', () => {
  const world = { ...base.world, hearts: 1, entities: [] };
  expect(moodFor({ ...base, stage: { ...stage, hearts: 2 }, world }).danger).toBe(2);
  expect(moodFor({ ...base, stage: { ...stage, hearts: 1 }, world }).danger).toBe(0);
  for (const status of ['dead', 'cleared'] as const) expect(moodFor({ ...base, world: { ...world, status } }).danger).toBe(0);
});
it('explicitly covers every shipped stage and reserves urgency for enemies, races and duels', () => {
  expect(Object.keys(STAGE_PACE).sort()).toEqual(stages.map(entry => entry.stage.id).sort());
  for (const { stage } of stages) {
    expect(['still', 'steady', 'urgent']).toContain(paceFor(stage.id));
    if (stage.type === 'text') expect(paceFor(stage.id)).toBe('still');
    if (stage.entities.some(entity => entity.damage > 0)) expect(paceFor(stage.id)).toBe('urgent');
  }
  expect(TEMPO_FACTOR).toEqual({ still: 0.92, steady: 1, urgent: 1.1 });
});
