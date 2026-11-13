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
  return { ...content, dialogues: content.dialogues.map(dialogue => dialogue.id === 'margin.intro'
    ? { ...dialogue, then: effects } : dialogue) };
}
function closeIntro(controller: ReturnType<typeof setup>): Session {
  return controller.reduce(controller.reduce(controller.init(), '<CR>'), '<CR>');
}
function applyWorld(session: Session, effects: readonly WorldEffect[]): Session {
  const result = createWorldSim(createEngine()).apply(session.world, effects, stage, legend);
  return { ...session, world: result.state, lastEvents: result.events };
}

describe('Margin session', () => {
  it('starts with the intro and blocks movement until dismissal', () => {
    const initial = game.init();
    expect(dialogueId(initial)).toBe('margin.intro');
    expect(game.reduce(initial, 'l')).toBe(initial);
    expect(dismiss(initial).world.engine.cursor).toEqual(stage.start);
  });
  it('takes counts from the engine as one turn', () => {
    const session = walk('4k');
    expect(session.world.engine.cursor).toEqual({ line: 3, col: 2 });
    expect(session.world.turn).toBe(1);
    expect(resultData(session).keys).toBe(2);
  });
  it('rejects editing and blocks Bram before the lesson', () => {
    const edited = walk('x');
    expect(edited.world.engine.lines).toEqual(stage.map);
    const blocked = walk('14l');
    expect(blocked.world.engine.cursor).toEqual({ line: 7, col: 16 });
    expect(game.reduce(blocked, 'l').lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'solid-entity' }));
  });
  it('Mira asks for the Elder first', () => {
    const early = game.reduce(walk('8l3j'), '<CR>');
    expect(dialogueId(early)).toBeUndefined();
    const next = game.reduce(walk('l', walk('8l3j')), '<CR>');
    expect(dialogueId(next)).toBe('margin.mira-early');
    expect(dismiss(next).story.flags['margin.knows-counts']).not.toBe(true);
  });
  it('walks to the Elder, learns counts from Mira, and clears with three hearts', () => {
    let session = walk('kkkklll');
    session = game.reduce(session, '<CR>');
    expect(dialogueId(session)).toBe('margin.elder');
    session = dismiss(session);
    expect(session.story.flags['margin.met-elder']).toBe(true);
    session = walk('jlllljjjjjjll', session);
    session = game.reduce(session, '<CR>');
    expect(dialogueId(session)).toBe('margin.mira');
    session = dismiss(session);
    expect(session.story.flags['margin.knows-counts']).toBe(true);
    expect(session.world.entities.some(entity => entity.id === 'bram')).toBe(false);
    session = walk('kkk8l', session);
    expect(dialogueId(session)).toBe('margin.road');
    session = dismiss(session);
    expect(session.world.entities.filter(entity => entity.def.kind === 'blot')).toHaveLength(5);
    session = walk('30l', session);
    expect(session.world.status).toBe('cleared');
    expect(session.world.hearts).toBe(3);
    expect(session.story.quests['margin.warning']?.done).toBe(true);
    session = game.reduce(dismiss(session), '<CR>');
    expect(session.world.engine.cursor).toEqual(stage.start);
    expect(dialogueId(session)).toBe('margin.intro');
  });
  it('single steps on the road cost hearts and each Blot bursts once', () => {
    let session = applyWorld(dismiss(game.init()), [{ type: 'remove-entity', entity: 'bram' }, { type: 'move-player', to: { line: 7, col: 18 } }]);
    session = dismiss(game.reduce(session, 'l'));
    const hits: string[] = [];
    for (let index = 0; index < 20 && session.world.status === 'playing'; index += 1) {
      session = game.reduce(session, 'l');
      for (const event of session.lastEvents) if (event.type === 'player-hit') hits.push(event.by);
    }
    expect(session.world.status).toBe('dead');
    expect(hits).toHaveLength(3);
    expect(new Set(hits).size).toBe(3);
    const checkpoint = session.world.checkpoint;
    session = game.reduce(session, 'x');
    expect(session.world.status).toBe('playing');
    expect(session.world.hearts).toBe(checkpoint.hearts);
    expect(session.world.engine).toEqual(checkpoint.engine);
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
  expect(() => closeIntro(controller)).toThrow('Story/world effect loop exceeded 32 rounds in margin');
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
