import { describe, expect, it, vi } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, type WorldEffect, type WorldSim } from '@escape/world';
import { createStoryEngine, validateContent, type StoryContent, type StoryEffect } from '@escape/story';
import { content, legend, stage } from './content.js';
import { createSession, resultData, type Session } from './session.js';

function setup(authored: StoryContent = content, simulation: WorldSim = createWorldSim(createEngine())) {
  return createSession({ sim: simulation, storyEngine: createStoryEngine(), content: authored, stage, legend });
}
const game = setup();
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length && count < 20; count += 1) next = game.reduce(next, '<CR>');
  return next;
}
function walk(keys: string, initial = dismiss(game.init())): Session {
  return [...keys].reduce((session, key) => game.reduce(dismiss(session), key), initial);
}
function dialogueId(session: Session): string | undefined {
  const first = session.queue[0];
  return first?.type === 'dialogue' ? first.dialogue : undefined;
}
function rewardContent(effects: readonly StoryEffect[]): StoryContent {
  return { ...content, dialogues: content.dialogues.map(dialogue => dialogue.id === '1-1.intro'
    ? { ...dialogue, then: effects } : dialogue) };
}
function closeIntro(controller: ReturnType<typeof setup>): Session {
  return controller.reduce(controller.reduce(controller.init(), '<CR>'), '<CR>');
}
function applyWorld(session: Session, effects: readonly WorldEffect[]): Session {
  const result = createWorldSim(createEngine()).apply(session.world, effects, stage, legend);
  return { ...session, world: result.state, lastEvents: result.events };
}

describe('real stage 1-1 session', () => {
  it('validates the real story without errors', () => expect(validateContent(content)).toEqual([]));
  it('starts at the real stage start', () => expect(game.init().world.engine.cursor).toEqual(stage.start));
  it('queues the intro without spending a turn', () => {
    const session = game.init();
    expect(dialogueId(session)).toBe('1-1.intro'); expect(session.world.turn).toBe(0);
  });
  it('blocks motion behind the intro', () => {
    const session = game.init(); expect(game.reduce(session, 'k')).toBe(session);
  });
  it('advances one line per Enter', () => {
    const next = game.reduce(game.init(), '<CR>');
    expect(next.queue[0]?.index).toBe(1); expect(next.world.turn).toBe(0);
  });
  it('accepts notation Space to advance', () => expect(game.reduce(game.init(), '<Space>').queue[0]?.index).toBe(1));
  it('accepts the input mapper literal space', () => expect(game.reduce(game.init(), ' ').queue[0]?.index).toBe(1));
  it('releases the world only after both intro lines', () => {
    const session = dismiss(game.init()); expect(session.queue).toEqual([]);
    expect(game.reduce(session, 'k').world.turn).toBe(1);
  });
  it('takes one turn for one ordinary motion', () => {
    const session = walk('k'); expect(session.world.engine.cursor).toEqual({ line: 4, col: 1 });
    expect(session.world.turn).toBe(1);
  });
  it('exposes partial keys without spending a turn', () => {
    const session = walk('4'); expect(session.world.engine.pendingKeys).toEqual(['4']); expect(session.world.turn).toBe(0);
  });
  it('lets the engine complete a counted motion as one turn', () => {
    const session = walk('4k'); expect(session.world.engine.cursor).toEqual({ line: 1, col: 1 }); expect(session.world.turn).toBe(1);
  });
  it('does not teach or allow field editing', () => {
    const session = walk('x'); expect(session.world.engine.lines).toEqual(stage.map); expect(session.world.turn).toBe(0);
  });
  it('keeps wall bumps from spending turns', () => {
    const session = walk('h'); expect(session.world.turn).toBe(0); expect(session.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump' }));
  });
  it('clears the requested seventeen-turn route', () => {
    const session = walk('kkkk' + 'l'.repeat(13));
    expect(session.world.status).toBe('cleared'); expect(resultData(session, stage)).toEqual({ turns: 17, hearts: 2, parTurns: 2 });
  });
  it('records the finished quest and queues the gate line', () => {
    const session = walk('kkkk' + 'l'.repeat(13));
    expect(session.story.quests['lowlands.warning']?.done).toBe(true); expect(dialogueId(session)).toBe('1-1.cleared');
  });
  it('dismisses the gate line before exposing results', () => {
    const session = dismiss(walk('kkkk' + 'l'.repeat(13))); expect(session.queue).toEqual([]); expect(session.world.status).toBe('cleared');
  });
  it('ignores movement on the result panel', () => {
    const session = dismiss(walk('kkkk' + 'l'.repeat(13))); expect(game.reduce(session, 'l')).toBe(session);
  });
  it('restarts on Enter without repeating the intro', () => {
    const session = game.reduce(dismiss(walk('kkkk' + 'l'.repeat(13))), '<CR>');
    expect(session.world.status).toBe('playing'); expect(session.world.turn).toBe(0);
    expect(session.queue).toEqual([]); expect(session.world.engine.cursor).toEqual(stage.start);
  });
  it('also plays the stage solution in two turns', () => {
    const session = walk('4k13l'); expect(session.world.status).toBe('cleared'); expect(session.world.turn).toBe(2);
  });
  it('shows the Blot line once', () => {
    const first = walk('kkkkllll'); expect(dialogueId(first)).toBe('1-1.blot');
    const second = walk('hl', dismiss(first)); expect(second.queue).toEqual([]);
    expect(second.story.firedReactions).toContain('1-1.blot-near');
  });
  it('shows the Save Stone line before the Blot line when both triggers fire', () => {
    const session = walk('llll'); expect(dialogueId(session)).toBe('1-1.stone'); expect(session.queue).toHaveLength(2);
  });
  it('heals on stone dismissal after a real Blot hit', () => {
    let session = applyWorld(dismiss(game.init()), [{ type: 'move-player', to: { line: 3, col: 13 } }]);
    session = walk('jk', session); expect(session.world.hearts).toBe(2);
    session = applyWorld(session, [{ type: 'move-player', to: { line: 5, col: 4 } }]);
    session = game.reduce(session, 'l'); expect(dialogueId(session)).toBe('1-1.stone'); expect(session.world.hearts).toBe(2);
    session = game.reduce(session, '<CR>'); expect(session.world.hearts).toBe(3);
    expect(session.lastEvents).toContainEqual({ type: 'checkpoint-saved' });
  });
  it('never heals above the stage maximum', () => expect(dismiss(walk('llll')).world.hearts).toBe(stage.hearts));
  it('does not repeat the stone line or heal on a revisit', () => {
    const session = walk('hl', dismiss(walk('llll'))); expect(session.queue).toEqual([]);
    expect(session.lastEvents.some(event => event.type === 'checkpoint-saved')).toBe(false);
  });
  it('dies through actual repeated contact and restores on any key', () => {
    let session = applyWorld(dismiss(game.init()), [{ type: 'move-player', to: { line: 3, col: 13 } }]);
    session = walk('jkjkjk', session); expect(session.world.status).toBe('dead');
    const checkpoint = session.world.checkpoint;
    session = game.reduce(session, 'x'); expect(session.world.status).toBe('playing');
    expect(session.world.engine).toEqual(checkpoint.engine); expect(session.world.turn).toBe(checkpoint.turn);
    expect(session.world.hearts).toBe(checkpoint.hearts); expect(session.lastEvents).toContainEqual({ type: 'checkpoint-restored' });
  });
  it('keeps fired story reactions through death', () => {
    let session = dismiss(walk('llll'));
    session = applyWorld(session, [{ type: 'move-player', to: session.world.entities[0]?.at ?? stage.start }]);
    for (let index = 0; session.world.status === 'playing' && index < 20; index += 1) {
      session = game.reduce(session, index % 2 === 0 ? 'j' : 'k');
    }
    expect(session.world.status).toBe('dead'); const story = session.story;
    session = game.reduce(session, '<CR>'); expect(session.story.firedReactions).toEqual(story.firedReactions);
    expect(session.world.firedTriggers).toContain('1-1.save-stone');
  });
  it('syncs story flags to world in one atomic effect batch', () => {
    const sim = createWorldSim(createEngine()); const apply = vi.spyOn(sim, 'apply');
    const controller = setup(rewardContent([{ type: 'set-flag', flag: 'road.open', value: true }, { type: 'world', effects: [{ type: 'heal', hearts: 1 }] }]), sim);
    const session = closeIntro(controller); expect(session.story.flags['road.open']).toBe(true); expect(session.world.flags['road.open']).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1); expect(apply.mock.calls[0]?.[1]).toHaveLength(2);
  });
  it('syncs world flags into story without echoing them', () => {
    const sim = createWorldSim(createEngine()); const apply = vi.spyOn(sim, 'apply');
    const controller = setup(rewardContent([{ type: 'world', effects: [{ type: 'set-flag', flag: 'world.fact', value: true }] }]), sim);
    const session = closeIntro(controller); expect(session.story.flags['world.fact']).toBe(true); expect(apply).toHaveBeenCalledTimes(1);
  });
  it('feeds secondary flag reactions back to the world', () => {
    const authored = rewardContent([{ type: 'world', effects: [{ type: 'set-flag', flag: 'world.fact', value: true }] }]);
    const controller = setup({ ...authored, reactions: [...authored.reactions, { id: 'answer', once: true,
      when: { type: 'flag', flag: 'world.fact', value: true }, then: [{ type: 'set-flag', flag: 'story.answer', value: true }] }] });
    const session = closeIntro(controller); expect(session.world.flags['story.answer']).toBe(true); expect(session.story.flags).toEqual(session.world.flags);
  });
  it('preserves ordered toggles in a single result', () => {
    const controller = setup(rewardContent([{ type: 'set-flag', flag: 'toggle', value: true }, { type: 'set-flag', flag: 'toggle', value: false }]));
    const session = closeIntro(controller); expect(session.world.flags['toggle']).toBe(false); expect(session.story.flags['toggle']).toBe(false);
  });
  it('does not mutate the prior snapshot', () => {
    const session = dismiss(game.init()); const before = structuredClone(session); game.reduce(session, 'k'); expect(session).toEqual(before);
  });
  it('replays identical keys deterministically', () => {
    const keys = ['<CR>', '<CR>', ...'kkkkllll', '<CR>', ...'lllllllll', '<CR>'];
    expect(keys.reduce(game.reduce, game.init())).toEqual(keys.reduce(game.reduce, game.init()));
  });
});

it('bounds cross-engine feedback loops with a useful startup error', () => {
  const authored = rewardContent([{ type: 'set-flag', flag: 'loop', value: true }]);
  const controller = setup({ ...authored, reactions: [...authored.reactions,
    { id: 'loop-off', once: false, when: { type: 'flag', flag: 'loop', value: true },
      then: [{ type: 'world', effects: [{ type: 'set-flag', flag: 'loop', value: false }] }] },
    { id: 'loop-on', once: false, when: { type: 'flag', flag: 'loop', value: false },
      then: [{ type: 'world', effects: [{ type: 'set-flag', flag: 'loop', value: true }] }] },
  ] });
  expect(() => closeIntro(controller)).toThrow('Story/world effect loop exceeded 32 rounds in 1-1');
});

it('blocks world input during cutscenes and applies then after the final beat', () => {
  const authored = rewardContent([{ type: 'cutscene', cutscene: 'test' }]);
  const controller = setup({ ...authored, cutscenes: [{ id: 'test', beats: [
    { type: 'title', text: 'First' }, { type: 'terminal', lines: ['Second'] },
  ], then: [{ type: 'set-flag', flag: 'watched', value: true }] }] });
  let session = closeIntro(controller);
  expect(controller.reduce(session, 'k')).toBe(session);
  session = controller.reduce(session, '<CR>'); expect(session.queue[0]?.index).toBe(1);
  expect(session.world.flags['watched']).toBeUndefined();
  session = controller.reduce(session, '<CR>'); expect(session.world.flags['watched']).toBe(true);
  expect(session.world.turn).toBe(0); expect(session.queue).toEqual([]);
});
