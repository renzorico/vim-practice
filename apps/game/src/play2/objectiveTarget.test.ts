import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine, type StoryCondition, type StoryContent } from '@escape/story';
import { createWorldSim, type Trigger } from '@escape/world';
import { content, stage, legend, stages } from './content.js';
import { objectiveTarget } from './objectiveTarget.js';

const story = createStoryEngine().init(content);
const world = createWorldSim(createEngine()).init(stage, legend, { learnedCommands: [], flags: {} });
function withCondition(condition: StoryCondition): StoryContent {
  return { ...content, quests: content.quests.map(quest => quest.id === 'margin.warning'
    ? { ...quest, steps: [{ id: 'target', objective: 'Go there', completeWhen: condition, then: [] }] } : quest) };
}
it('resolves an entity trigger at its live cell, including after it moves', () => {
  const trigger = stage.triggers.find(trigger => trigger.id === 'margin.talk-elder');
  if (!trigger || trigger.on !== 'interact' || trigger.target.type !== 'entity') throw new Error('Missing Elder trigger');
  const target = trigger.target;
  const entity = world.entities.find(entity => entity.id === target.entity);
  if (!entity) throw new Error('Missing Elder');
  const authored = withCondition({ type: 'trigger', trigger: trigger.id });
  expect(objectiveTarget(authored, story, stage, world)).toEqual(entity.at);
  const at = { line: 3, col: 7 };
  expect(objectiveTarget(authored, story, stage, { ...world,
    entities: world.entities.map(item => item.id === entity.id ? { ...item, at } : item) })).toEqual(at);
  expect(objectiveTarget(authored, story, stage, { ...world, entities: [] })).toBeNull();
});
it('resolves enter and interact areas and returns null for text triggers', () => {
  const area = { from: { line: 2, col: 3 }, to: { line: 4, col: 5 } };
  const triggers: readonly Trigger[] = [
    { id: 'target', on: 'enter', area, once: false },
    { id: 'target', on: 'interact', target: { type: 'area', area }, once: false },
    { id: 'target', on: 'text', anchor: 'elder', text: 'hello', once: false },
  ];
  for (const trigger of triggers) expect(objectiveTarget(withCondition({ type: 'trigger', trigger: 'target' }),
    story, { ...stage, triggers: [trigger] }, world)).toEqual(trigger.on === 'text' ? null : area.from);
});
it('returns null for stage-cleared objectives, unknown triggers and finished or absent main quests', () => {
  expect(objectiveTarget(withCondition({ type: 'stage-cleared', stage: 'margin' }), story, stage, world)).toBeNull();
  expect(objectiveTarget(withCondition({ type: 'trigger', trigger: 'elsewhere' }), story, stage, world)).toBeNull();
  expect(objectiveTarget(content, { ...story, quests: {} }, stage, world)).toBeNull();
  expect(objectiveTarget(content, { ...story, quests: { 'margin.warning': { step: 3, done: true } } }, stage, world)).toBeNull();
});
it('ignores side quests that appear before the main quest', () => {
  const authored = withCondition({ type: 'trigger', trigger: 'margin.talk-elder' });
  const main = authored.quests[0];
  if (!main) throw new Error('Missing main quest');
  const reordered = { ...authored, quests: [{ ...main, id: 'side', kind: 'side' as const,
    steps: [{ id: 'side-step', objective: 'Side', completeWhen: { type: 'stage-cleared' as const, stage: 'margin' }, then: [] }] }, ...authored.quests] };
  expect(objectiveTarget(reordered, { ...story, quests: { side: { step: 0, done: false }, ...story.quests } }, stage, world))
    .toEqual(objectiveTarget(authored, story, stage, world));
});

it('follows the real Margin objectives from Elder to Mira to the road', () => {
  const engine = createStoryEngine();
  const elder = world.entities.find(entity => entity.id === 'elder');
  const mira = world.entities.find(entity => entity.id === 'mira');
  expect(elder).toBeDefined();
  expect(mira).toBeDefined();
  expect(objectiveTarget(content, story, stage, world)).toEqual(elder?.at);
  const met = engine.apply(story, [{ type: 'set-flag', flag: 'margin.met-elder', value: true }], content).state;
  expect(objectiveTarget(content, met, stage, world)).toEqual(mira?.at);
  const taught = engine.apply(met, [{ type: 'set-flag', flag: 'margin.knows-counts', value: true }], content).state;
  expect(objectiveTarget(content, taught, stage, world)).toBeNull();
});

it.each(['quarry', 'wordwood', 'copper-port', 'library'] as const)(
  'resolves the first main objective in world %s from authored content', worldId => {
    const quest = content.quests.find(quest => quest.world === worldId && quest.kind === 'main');
    const entry = stages.find(entry => entry.stage.world === worldId);
    if (!quest || !entry) throw new Error(`Missing world ${worldId}`);
    const state = { ...story, quests: { [quest.id]: { step: 0, done: false } } };
    const live = createWorldSim(createEngine()).init(entry.stage, entry.legend, { learnedCommands: [], flags: {} });
    const condition = quest.steps[0]?.completeWhen;
    // Independently inspect the authored first-step trigger or direct dialogue flag setter.
    const triggerId = condition?.type === 'trigger' ? condition.trigger : content.reactions.find(reaction =>
      reaction.when.type === 'trigger' && !reaction.onlyIf && reaction.then.some(effect => {
        if (effect.type !== 'dialogue') return false;
        return content.dialogues.find(dialogue => dialogue.id === effect.dialogue)?.then.some(effect =>
          effect.type === 'set-flag' && condition?.type === 'flag' && effect.flag === condition.flag && effect.value);
      }))?.when;
    const id = typeof triggerId === 'string' ? triggerId : triggerId?.type === 'trigger' ? triggerId.trigger : undefined;
    const trigger = entry.stage.triggers.find(trigger => trigger.id === id);
    const expected = !trigger || trigger.on === 'text' ? null : trigger.on === 'enter' ? trigger.area.from
      : trigger.target.type === 'area' ? trigger.target.area.from
      : live.entities.find(entity => trigger.target.type === 'entity' && entity.id === trigger.target.entity)?.at ?? null;
    expect(objectiveTarget(content, state, entry.stage, live)).toEqual(expected);
  });

it('respects guards, stage membership and the three-hop limit through flag reactions and quest steps', () => {
  const authored = withCondition({ type: 'flag', flag: 'goal', value: true });
  const reaction = { id: 'chain', when: { type: 'trigger' as const, trigger: 'margin.talk-elder' },
    once: false, onlyIf: 'ready', unless: 'blocked', then: [{ type: 'dialogue' as const, dialogue: 'chain' }] };
  const chain: StoryContent = { ...authored, reactions: [reaction,
    { id: 'bridge', when: { type: 'flag', flag: 'bridge', value: true }, once: false,
      then: [{ type: 'set-flag', flag: 'quest-bridge', value: true }] }],
    dialogues: [{ id: 'chain', lines: [], then: [{ type: 'set-flag', flag: 'bridge', value: true }] }],
    quests: [...authored.quests, { id: 'bridge-quest', world: 'margin', kind: 'side', title: 'Bridge', steps: [{
      id: 'bridge-step', objective: 'Bridge', completeWhen: { type: 'flag', flag: 'quest-bridge', value: true },
      then: [{ type: 'set-flag', flag: 'goal', value: true }],
    }] }] };
  const ready = { ...story, quests: { ...story.quests, 'bridge-quest': { step: 0, done: false } }, flags: { ready: true } };
  expect(objectiveTarget(chain, ready, stage, world)).toEqual(world.entities.find(entity => entity.id === 'elder')?.at);
  expect(objectiveTarget(chain, story, stage, world)).toBeNull();
  expect(objectiveTarget(chain, { ...ready, flags: { ready: true, blocked: true } }, stage, world)).toBeNull();
  expect(objectiveTarget(chain, ready, { ...stage, triggers: [] }, world)).toBeNull();
  const tooDeep = { ...chain, dialogues: [{ id: 'chain', lines: [], then: [{ type: 'dialogue' as const, dialogue: 'extra' }] },
    { id: 'extra', lines: [], then: chain.dialogues[0]?.then ?? [] }] };
  expect(objectiveTarget(tooDeep, ready, stage, world)).toBeNull();
});

it('uses only the current step of an active quest as a flag source', () => {
  const authored = withCondition({ type: 'flag', flag: 'goal', value: true });
  const source = { id: 'source', world: 'margin' as const, kind: 'side' as const, title: 'Source', steps: [
    { id: 'setter', objective: 'Set goal', completeWhen: { type: 'trigger' as const, trigger: 'margin.talk-elder' },
      then: [{ type: 'set-flag' as const, flag: 'goal', value: true }] },
    { id: 'next', objective: 'Next', completeWhen: { type: 'stage-cleared' as const, stage: 'margin' }, then: [] },
  ] };
  const content = { ...authored, reactions: [], quests: [...authored.quests, source] };
  const active = { ...story, quests: { ...story.quests, source: { step: 0, done: false } } };
  expect(objectiveTarget(content, active, stage, world)).toEqual(world.entities.find(entity => entity.id === 'elder')?.at);
  expect(objectiveTarget(content, story, stage, world)).toBeNull();
  for (const progress of [{ step: 1, done: false }, { step: 2, done: true }]) {
    expect(objectiveTarget(content, { ...active, quests: { ...active.quests, source: progress } }, stage, world)).toBeNull();
  }
  const future = { ...source, steps: [...source.steps].reverse() };
  expect(objectiveTarget({ ...content, quests: [...authored.quests, future] }, active, stage, world)).toBeNull();
});
