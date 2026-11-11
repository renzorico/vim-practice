import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '@escape/world';
import type { StoryContent, StoryState } from '../types';
import { createStoryEngine, MAX_PASSES } from './index';
import { BRIDGE_FLAG, FIXTURE_CONTENT } from './testContent';

const engine = createStoryEngine();
const content = FIXTURE_CONTENT;

const readSign: WorldEvent = { type: 'trigger-fired', trigger: 'read-sign' };
const bridgeFlag: WorldEvent = { type: 'flag-set', flag: BRIDGE_FLAG, value: true };
const cleared: WorldEvent = { type: 'stage-cleared', stage: 'fixture-1', turns: 9 };

function start(): StoryState {
  return engine.init(content);
}

function withContent(patch: Partial<StoryContent>): StoryContent {
  return { ...content, ...patch };
}

describe('init', () => {
  it('starts the opening quests at step 0', () => {
    expect(start().quests).toEqual({ 'river-crossing': { step: 0, done: false } });
  });
  it('unlocks the opening stage only', () => {
    expect(start().unlockedStages).toEqual(['fixture-1']);
  });
  it('starts empty', () => {
    const state = start();
    expect(state.flags).toEqual({});
    expect(state.learnedSkills).toEqual([]);
    expect(state.statues).toEqual([]);
    expect(state.ending).toBeNull();
  });
  it('ignores opening quests that do not exist', () => {
    expect(engine.init(withContent({ openingQuests: ['ghost'] })).quests).toEqual({});
  });
  it('is plain JSON', () => {
    expect(JSON.parse(JSON.stringify(start()))).toEqual(start());
  });
});

describe('onEvents: quests', () => {
  it('advances a step on its trigger and lists the effects', () => {
    const result = engine.onEvents(start(), [readSign], content);
    expect(result.state.quests['river-crossing']).toEqual({ step: 1, done: false });
    expect(result.effects).toEqual([{ type: 'dialogue', dialogue: 'd-sign' }]);
  });
  it('ignores unrelated events', () => {
    const state = start();
    const result = engine.onEvents(state, [{ type: 'trigger-fired', trigger: 'other' }, { type: 'turn-ended', turn: 1 }], content);
    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
  it('does not mutate the input state', () => {
    const state = start();
    const snapshot = JSON.stringify(state);
    engine.onEvents(state, [readSign, bridgeFlag, cleared], content);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
  it('does not skip steps: the flag first leaves step 0 alone', () => {
    const result = engine.onEvents(start(), [bridgeFlag], content);
    expect(result.state.quests['river-crossing']).toEqual({ step: 0, done: false });
    expect(result.state.flags[BRIDGE_FLAG]).toBe(true);
  });
  it('completes the next step in the same call when its flag is already true', () => {
    const result = engine.onEvents(start(), [bridgeFlag, readSign], content);
    expect(result.state.quests['river-crossing']).toEqual({ step: 2, done: false });
    expect(result.effects.map((effect) => effect.type)).toEqual(['dialogue', 'dialogue']);
  });
  it('one event never completes two event steps', () => {
    const twice: StoryContent = withContent({
      quests: [
        {
          id: 'q',
          world: 'lowlands',
          title: 'q',
          kind: 'main',
          steps: [
            { id: 'a', objective: 'a', completeWhen: { type: 'trigger', trigger: 't' }, then: [] },
            { id: 'b', objective: 'b', completeWhen: { type: 'trigger', trigger: 't' }, then: [] },
          ],
        },
      ],
      openingQuests: ['q'],
    });
    const result = engine.onEvents(engine.init(twice), [{ type: 'trigger-fired', trigger: 't' }], twice);
    expect(result.state.quests['q']).toEqual({ step: 1, done: false });
  });
  it('the same trigger in a later event advances the next step', () => {
    const twice: StoryContent = withContent({
      quests: [
        {
          id: 'q',
          world: 'lowlands',
          title: 'q',
          kind: 'main',
          steps: [
            { id: 'a', objective: 'a', completeWhen: { type: 'trigger', trigger: 't' }, then: [] },
            { id: 'b', objective: 'b', completeWhen: { type: 'trigger', trigger: 't' }, then: [] },
          ],
        },
      ],
      openingQuests: ['q'],
    });
    const event: WorldEvent = { type: 'trigger-fired', trigger: 't' };
    const result = engine.onEvents(engine.init(twice), [event, event], twice);
    expect(result.state.quests['q']).toEqual({ step: 2, done: true });
  });
  it('finishes the quest and applies state effects on the last step', () => {
    const result = engine.onEvents(start(), [readSign, bridgeFlag, cleared], content);
    expect(result.state.quests['river-crossing']).toEqual({ step: 3, done: true });
    expect(result.state.unlockedStages).toEqual(['fixture-1', 'fixture-2']);
    expect(result.state.statues).toEqual(['O']);
    expect(result.state.clearedStages).toEqual(['fixture-1']);
  });
  it('lists state-only effects too', () => {
    const result = engine.onEvents(start(), [readSign, bridgeFlag, cleared], content);
    expect(result.effects).toContainEqual({ type: 'unlock-stage', stage: 'fixture-2' });
    expect(result.effects).toContainEqual({ type: 'light-statue', letter: 'O' });
  });
  it('a finished quest stays finished', () => {
    const done = engine.onEvents(start(), [readSign, bridgeFlag, cleared], content).state;
    const again = engine.onEvents(done, [readSign, cleared], content);
    expect(again.state).toBe(done);
  });
  it('a stage cleared earlier completes a later stage-cleared step', () => {
    const early = engine.onEvents(start(), [cleared], content).state;
    const result = engine.onEvents(early, [readSign, bridgeFlag], content);
    expect(result.state.quests['river-crossing']).toEqual({ step: 3, done: true });
  });
  it('a quest with no steps is marked done on its first look', () => {
    const empty: StoryContent = withContent({
      quests: [{ id: 'e', world: 'lowlands', title: 'e', kind: 'side', steps: [] }],
      openingQuests: ['e'],
    });
    const result = engine.onEvents(engine.init(empty), [readSign], empty);
    expect(result.state.quests['e']).toEqual({ step: 0, done: true });
  });
});

describe('onEvents: flags', () => {
  it('flag-set events update the flag store', () => {
    const result = engine.onEvents(start(), [{ type: 'flag-set', flag: 'x', value: true }], content);
    expect(result.state.flags['x']).toBe(true);
  });
  it('flag-set events are not echoed as effects', () => {
    const result = engine.onEvents(start(), [bridgeFlag], content);
    expect(result.effects).toEqual([]);
  });
  it('a flag can be set back to false', () => {
    const on = engine.onEvents(start(), [bridgeFlag], content).state;
    const off = engine.onEvents(on, [{ type: 'flag-set', flag: BRIDGE_FLAG, value: false }], content).state;
    expect(off.flags[BRIDGE_FLAG]).toBe(false);
  });
  it('a flag condition for false is met by a missing flag', () => {
    const falsey: StoryContent = withContent({
      reactions: [{ id: 'r', when: { type: 'flag', flag: 'never-set', value: false }, once: true, then: [{ type: 'dialogue', dialogue: 'd-save' }] }],
    });
    const result = engine.onEvents(engine.init(falsey), [readSign], falsey);
    expect(result.effects).toContainEqual({ type: 'dialogue', dialogue: 'd-save' });
  });
});

describe('onEvents: reactions', () => {
  const stone: WorldEvent = { type: 'trigger-fired', trigger: 'at-save-stone' };

  it('fires a reaction', () => {
    const result = engine.onEvents(start(), [stone], content);
    expect(result.effects).toEqual([{ type: 'dialogue', dialogue: 'd-save' }]);
  });
  it('records a once reaction and does not repeat it', () => {
    const first = engine.onEvents(start(), [stone], content);
    expect(first.state.firedReactions).toEqual(['save-stone-bark']);
    const second = engine.onEvents(first.state, [stone], content);
    expect(second.effects).toEqual([]);
  });
  it('a repeatable reaction fires every time and is not recorded', () => {
    const repeat: StoryContent = withContent({ reactions: [{ ...content.reactions[0]!, once: false }] });
    const first = engine.onEvents(engine.init(repeat), [stone], repeat);
    const second = engine.onEvents(first.state, [stone], repeat);
    expect(second.effects).toHaveLength(1);
    expect(second.state.firedReactions).toEqual([]);
  });
  it('onlyIf blocks the reaction until the flag is set', () => {
    const gated: StoryContent = withContent({ reactions: [{ ...content.reactions[0]!, onlyIf: 'gate' }] });
    expect(engine.onEvents(engine.init(gated), [stone], gated).effects).toEqual([]);
    const open = engine.onEvents(engine.init(gated), [{ type: 'flag-set', flag: 'gate', value: true }, stone], gated);
    expect(open.effects).toHaveLength(1);
  });
  it('unless blocks the reaction once the flag is set', () => {
    const gated: StoryContent = withContent({ reactions: [{ ...content.reactions[0]!, unless: 'quiet' }] });
    expect(engine.onEvents(engine.init(gated), [stone], gated).effects).toHaveLength(1);
    const quiet = engine.onEvents(engine.init(gated), [{ type: 'flag-set', flag: 'quiet', value: true }, stone], gated);
    expect(quiet.effects).toEqual([]);
  });
  it('a blocked once reaction is not used up', () => {
    const gated: StoryContent = withContent({ reactions: [{ ...content.reactions[0]!, onlyIf: 'gate' }] });
    const blocked = engine.onEvents(engine.init(gated), [stone], gated);
    expect(blocked.state.firedReactions).toEqual([]);
  });
  it('a flag reaction fires when the flag flips, once per flip when repeatable', () => {
    const flagReaction: StoryContent = withContent({
      reactions: [{ id: 'r', when: { type: 'flag', flag: 'f', value: true }, once: false, then: [{ type: 'dialogue', dialogue: 'd-save' }] }],
    });
    const on: WorldEvent = { type: 'flag-set', flag: 'f', value: true };
    const first = engine.onEvents(engine.init(flagReaction), [on], flagReaction);
    expect(first.effects).toHaveLength(1);
    const same = engine.onEvents(first.state, [on], flagReaction);
    expect(same.effects).toEqual([]);
    const off = engine.onEvents(same.state, [{ type: 'flag-set', flag: 'f', value: false }], flagReaction);
    const again = engine.onEvents(off.state, [on], flagReaction);
    expect(again.effects).toHaveLength(1);
  });
  it('a reaction effect can set a flag that completes a quest step in the same call', () => {
    const chained: StoryContent = withContent({
      reactions: [{ id: 'mend', when: { type: 'trigger', trigger: 'at-save-stone' }, once: true, then: [{ type: 'set-flag', flag: BRIDGE_FLAG, value: true }] }],
    });
    const result = engine.onEvents(engine.init(chained), [readSign, stone], chained);
    expect(result.state.quests['river-crossing']).toEqual({ step: 2, done: false });
    expect(result.state.flags[BRIDGE_FLAG]).toBe(true);
  });
});

describe('bounded loops', () => {
  it('two reactions that flip each other stop at MAX_PASSES', () => {
    const loop: StoryContent = withContent({
      reactions: [
        { id: 'on', when: { type: 'flag', flag: 'f', value: false }, once: false, then: [{ type: 'set-flag', flag: 'f', value: true }] },
        { id: 'off', when: { type: 'flag', flag: 'f', value: true }, once: false, then: [{ type: 'set-flag', flag: 'f', value: false }] },
      ],
    });
    const result = engine.onEvents(engine.init(loop), [readSign], loop);
    expect(result.effects.length).toBeLessThanOrEqual(MAX_PASSES * 2);
  });
  it('a chain of flag steps longer than one pass completes in one call', () => {
    const steps = Array.from({ length: 5 }, (_, index) => ({
      id: `s${index}`,
      objective: `step ${index}`,
      completeWhen: { type: 'flag' as const, flag: `f${index}`, value: true },
      then: [{ type: 'set-flag' as const, flag: `f${index + 1}`, value: true }],
    }));
    const chain: StoryContent = withContent({
      quests: [{ id: 'chain', world: 'lowlands', title: 'chain', kind: 'main', steps }],
      openingQuests: ['chain'],
    });
    const result = engine.onEvents(engine.init(chain), [{ type: 'flag-set', flag: 'f0', value: true }], chain);
    expect(result.state.quests['chain']).toEqual({ step: 5, done: true });
  });
});

describe('apply', () => {
  it('applies state effects and lists them', () => {
    const result = engine.apply(start(), [{ type: 'set-flag', flag: 'a', value: true }, { type: 'unlock-stage', stage: 'fixture-2' }], content);
    expect(result.state.flags['a']).toBe(true);
    expect(result.state.unlockedStages).toContain('fixture-2');
    expect(result.effects).toHaveLength(2);
  });
  it('lists presentation effects without changing state', () => {
    const state = start();
    const result = engine.apply(state, [{ type: 'dialogue', dialogue: 'd-sign' }, { type: 'teach', skill: 'motion.f' }], content);
    expect(result.state).toBe(state);
    expect(result.effects).toHaveLength(2);
  });
  it('start-quest adds the quest once and keeps its progress', () => {
    const started = engine.apply(start(), [{ type: 'start-quest', quest: 'side-stones' }], content).state;
    expect(started.quests['side-stones']).toEqual({ step: 0, done: false });
    const advanced = engine.learn(started, 'motion.w', content).state;
    const restarted = engine.apply(advanced, [{ type: 'start-quest', quest: 'side-stones' }], content).state;
    expect(restarted.quests['side-stones']).toEqual({ step: 1, done: true });
  });
  it('start-quest for an unknown quest changes nothing', () => {
    const state = start();
    expect(engine.apply(state, [{ type: 'start-quest', quest: 'ghost' }], content).state).toBe(state);
  });
  it('set-flag from apply can complete a quest step', () => {
    const atBridge = engine.onEvents(start(), [readSign], content).state;
    const result = engine.apply(atBridge, [{ type: 'set-flag', flag: BRIDGE_FLAG, value: true }], content);
    expect(result.state.quests['river-crossing']).toEqual({ step: 2, done: false });
  });
  it('lights a statue only once', () => {
    const once = engine.apply(start(), [{ type: 'light-statue', letter: 'E' }], content).state;
    expect(engine.apply(once, [{ type: 'light-statue', letter: 'E' }], content).state.statues).toEqual(['E']);
  });
  it('records the first ending only', () => {
    const first = engine.apply(start(), [{ type: 'ending', ending: 'recover' }], content).state;
    expect(engine.apply(first, [{ type: 'ending', ending: 'quit' }], content).state.ending).toBe('recover');
  });
  it('does not expand a dialogue, a cutscene or a world effect', () => {
    const effects = [
      { type: 'cutscene' as const, cutscene: 'c-intro' },
      { type: 'world' as const, effects: [{ type: 'heal' as const, hearts: 1 }] },
    ];
    expect(engine.apply(start(), effects, content).effects).toEqual(effects);
  });
});

describe('learn', () => {
  it('records the skill and advances a waiting quest', () => {
    const started = engine.apply(start(), [{ type: 'start-quest', quest: 'side-stones' }], content).state;
    const result = engine.learn(started, 'motion.w', content);
    expect(result.state.learnedSkills).toEqual(['motion.w']);
    expect(result.state.quests['side-stones']).toEqual({ step: 1, done: true });
  });
  it('is a no-op for a skill already learned', () => {
    const once = engine.learn(start(), 'motion.w', content).state;
    const twice = engine.learn(once, 'motion.w', content);
    expect(twice.state).toBe(once);
    expect(twice.effects).toEqual([]);
  });
  it('a quest started after the skill was learned completes at once', () => {
    const learned = engine.learn(start(), 'motion.w', content).state;
    const result = engine.apply(learned, [{ type: 'start-quest', quest: 'side-stones' }], content);
    expect(result.state.quests['side-stones']).toEqual({ step: 1, done: true });
  });
  it('fires a skill-learned reaction', () => {
    const skillReaction: StoryContent = withContent({
      reactions: [{ id: 'sk', when: { type: 'skill-learned', skill: 'motion.f' }, once: true, then: [{ type: 'dialogue', dialogue: 'd-bridge' }] }],
    });
    const result = engine.learn(engine.init(skillReaction), 'motion.f', skillReaction);
    expect(result.effects).toEqual([{ type: 'dialogue', dialogue: 'd-bridge' }]);
  });
});

describe('objectives', () => {
  it('shows the current step of each active quest, main first', () => {
    const state = engine.apply(start(), [{ type: 'start-quest', quest: 'side-stones' }], content).state;
    expect(engine.objectives(state, content)).toEqual(['Read the sign by the river.', 'Learn to hop with w.']);
  });
  it('puts main quests first even when a side quest is listed earlier', () => {
    const swapped: StoryContent = withContent({ quests: [...content.quests].reverse(), openingQuests: ['river-crossing', 'side-stones'] });
    expect(engine.objectives(engine.init(swapped), swapped)).toEqual(['Read the sign by the river.', 'Learn to hop with w.']);
  });
  it('follows progress', () => {
    const state = engine.onEvents(start(), [readSign], content).state;
    expect(engine.objectives(state, content)).toEqual(['Mend the bridge.']);
  });
  it('is empty when every quest is done', () => {
    const done = engine.onEvents(start(), [readSign, bridgeFlag, cleared], content).state;
    expect(engine.objectives(done, content)).toEqual([]);
  });
  it('skips quests that are not started', () => {
    expect(engine.objectives(start(), content)).toEqual(['Read the sign by the river.']);
  });
});

describe('review fixes', () => {
  const dialogueEffect = { type: 'dialogue' as const, dialogue: 'd-save' };

  it('apply keeps an intermediate flag value (set true then false)', () => {
    const atBridge = engine.onEvents(start(), [readSign], content).state;
    const result = engine.apply(
      atBridge,
      [{ type: 'set-flag', flag: BRIDGE_FLAG, value: true }, { type: 'set-flag', flag: BRIDGE_FLAG, value: false }],
      content,
    );
    expect(result.state.quests['river-crossing']).toEqual({ step: 2, done: false });
    expect(result.state.flags[BRIDGE_FLAG]).toBe(false);
  });
  it('a step then that sets a flag true then false still completes a waiting quest', () => {
    const flicker: StoryContent = withContent({
      quests: [
        {
          id: 'q',
          world: 'lowlands',
          title: 'q',
          kind: 'main',
          steps: [
            { id: 'a', objective: 'a', completeWhen: { type: 'trigger', trigger: 't' }, then: [{ type: 'set-flag', flag: 'f', value: true }, { type: 'set-flag', flag: 'f', value: false }] },
            { id: 'b', objective: 'b', completeWhen: { type: 'flag', flag: 'f', value: true }, then: [] },
          ],
        },
      ],
      openingQuests: ['q'],
    });
    const result = engine.onEvents(engine.init(flicker), [{ type: 'trigger-fired', trigger: 't' }], flicker);
    expect(result.state.quests['q']).toEqual({ step: 2, done: true });
  });
  it('one flag change fires a repeatable reaction once', () => {
    const doubled: StoryContent = withContent({
      quests: [
        {
          id: 'q',
          world: 'lowlands',
          title: 'q',
          kind: 'main',
          steps: [{ id: 'a', objective: 'a', completeWhen: { type: 'trigger', trigger: 't' }, then: [{ type: 'set-flag', flag: 'f', value: true }] }],
        },
      ],
      openingQuests: ['q'],
      reactions: [{ id: 'r', when: { type: 'flag', flag: 'f', value: true }, once: false, then: [dialogueEffect] }],
    });
    const result = engine.onEvents(engine.init(doubled), [{ type: 'trigger-fired', trigger: 't' }], doubled);
    expect(result.effects.filter((effect) => effect.type === 'dialogue')).toHaveLength(1);
  });
  it('a repeatable reaction fires when its onlyIf gate opens after the flag', () => {
    const gated: StoryContent = withContent({
      reactions: [{ id: 'r', when: { type: 'flag', flag: 'f', value: true }, onlyIf: 'gate', once: false, then: [dialogueEffect] }],
    });
    const first = engine.apply(engine.init(gated), [{ type: 'set-flag', flag: 'f', value: true }], gated);
    expect(first.effects.filter((effect) => effect.type === 'dialogue')).toHaveLength(0);
    const second = engine.apply(first.state, [{ type: 'set-flag', flag: 'gate', value: true }], gated);
    expect(second.effects.filter((effect) => effect.type === 'dialogue')).toHaveLength(1);
  });
  it('a repeatable reaction fires when its unless gate closes then reopens', () => {
    const gated: StoryContent = withContent({
      reactions: [{ id: 'r', when: { type: 'flag', flag: 'f', value: true }, unless: 'quiet', once: false, then: [dialogueEffect] }],
    });
    const quiet = engine.apply(engine.init(gated), [{ type: 'set-flag', flag: 'quiet', value: true }, { type: 'set-flag', flag: 'f', value: true }], gated);
    expect(quiet.effects.filter((effect) => effect.type === 'dialogue')).toHaveLength(0);
    const open = engine.apply(quiet.state, [{ type: 'set-flag', flag: 'quiet', value: false }], gated);
    expect(open.effects.filter((effect) => effect.type === 'dialogue')).toHaveLength(1);
  });
  it('a looping pair of reactions stops', () => {
    const loop: StoryContent = withContent({
      reactions: [
        { id: 'a', when: { type: 'trigger', trigger: 't' }, once: false, then: [{ type: 'set-flag', flag: 'on', value: true }] },
        { id: 'b', when: { type: 'flag', flag: 'f', value: true }, once: false, then: [{ type: 'set-flag', flag: 'f', value: false }] },
        { id: 'c', when: { type: 'flag', flag: 'f', value: false }, onlyIf: 'on', once: false, then: [{ type: 'set-flag', flag: 'f', value: true }] },
      ],
    });
    expect(() => engine.onEvents(engine.init(loop), [{ type: 'trigger-fired', trigger: 't' }], loop)).toThrow(/loops without end near "(b|c)"/);
  });
});

describe('round 2 fixes', () => {
  const dialogueEffect = { type: 'dialogue' as const, dialogue: 'd-save' };
  const count = (effects: readonly { readonly type: string }[]): number => effects.filter((effect) => effect.type === 'dialogue').length;

  it('a reaction sees an intermediate flag value that a quest then undoes', () => {
    const undo: StoryContent = withContent({
      quests: [
        {
          id: 'q',
          world: 'lowlands',
          title: 'q',
          kind: 'main',
          steps: [{ id: 'a', objective: 'a', completeWhen: { type: 'flag', flag: 'f', value: true }, then: [{ type: 'set-flag', flag: 'f', value: false }] }],
        },
      ],
      openingQuests: ['q'],
      reactions: [{ id: 'r', when: { type: 'flag', flag: 'f', value: true }, once: false, then: [dialogueEffect] }],
    });
    const result = engine.apply(engine.init(undo), [{ type: 'set-flag', flag: 'f', value: true }], undo);
    expect(count(result.effects)).toBe(1);
    expect(result.state.quests['q']).toEqual({ step: 1, done: true });
    expect(result.state.flags['f']).toBe(false);
  });
  it('many independent events are all handled', () => {
    const event: WorldEvent = { type: 'trigger-fired', trigger: 'at-save-stone' };
    const repeat: StoryContent = withContent({ reactions: [{ ...content.reactions[0]!, once: false }] });
    const events = Array.from({ length: MAX_PASSES + 44 }, () => event);
    expect(count(engine.onEvents(engine.init(repeat), events, repeat).effects)).toBe(events.length);
  });
  it('many independent effects in one apply are all handled', () => {
    const flips = Array.from({ length: MAX_PASSES + 44 }, (_, index) => ({ type: 'set-flag' as const, flag: 'f', value: index % 2 === 0 }));
    const watch: StoryContent = withContent({
      reactions: [{ id: 'r', when: { type: 'flag', flag: 'f', value: true }, once: false, then: [dialogueEffect] }],
    });
    expect(count(engine.apply(engine.init(watch), flips, watch).effects)).toBe(flips.length / 2);
  });
  it('names the quest when a quest loop runs away', () => {
    const loop: StoryContent = withContent({
      quests: [],
      openingQuests: [],
      reactions: [
        { id: 'ping', when: { type: 'flag', flag: 'f', value: true }, once: false, then: [{ type: 'set-flag', flag: 'f', value: false }] },
        { id: 'pong', when: { type: 'flag', flag: 'f', value: false }, onlyIf: 'go', once: false, then: [{ type: 'set-flag', flag: 'f', value: true }] },
      ],
    });
    expect(() => engine.apply(engine.init(loop), [{ type: 'set-flag', flag: 'go', value: true }], loop)).toThrow(/"(ping|pong)"/);
  });
});

describe('determinism', () => {
  it('gives the same result for the same input', () => {
    const run = () => engine.onEvents(start(), [readSign, bridgeFlag, cleared], content);
    expect(run()).toEqual(run());
  });
});
