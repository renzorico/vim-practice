import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { BUMP_LINES, blockedReason, landingMarkers, newMotionKeys, countMotionUses, solutionCaps } from './feedback.js';
import { createSession, stageCommands, type Session } from './session.js';
import { content, stages, lowlands, lowlandsLegend, gallery, stage, legend, canopy, canopyLegend, mouth, shaft, shaftLegend, ledger, ledgerLegend } from './content.js';
import { recordBest, starsFor, readProgress, saveProgress, PROGRESS_KEY } from './progress.js';
import { StageClearCard } from './StageClearCard.js';
import { ObjectiveHud } from '../story-ui/ObjectiveHud.js';

const sim = createWorldSim(createEngine());
const game = createSession({ sim, storyEngine: createStoryEngine(), stages, stage: lowlands, legend: lowlandsLegend, content });
function dismiss(session: Session): Session {
  let next = session;
  for (let i = 0; next.queue.length && next.queue[0]?.type !== 'ending' && i < 100; i++) next = game.reduce(next, '<CR>');
  return next;
}
it('previews Lowlands w and e with real world steps and leaves the session untouched', () => {
  const session = game.init(false);
  const before = structuredClone(session);
  const world = session.world;
  const markers = landingMarkers(session, lowlands, lowlandsLegend, stages);
  for (const key of ['w', 'e']) {
    const real = sim.step(world, key, lowlands, lowlandsLegend, { learnedCommands: stageCommands(lowlands), flags: session.story.flags });
    expect(markers.find(marker => marker.key === key)?.at).toEqual(real.state.engine.cursor);
  }
  expect(session.world).toBe(world);
  expect(session).toEqual(before);
  expect(landingMarkers(session, lowlands, lowlandsLegend, stages, { w: 3 }).some(marker => marker.key === 'w')).toBe(false);
  expect(landingMarkers(game.reduce(session, '3'), lowlands, lowlandsLegend, stages)).toEqual([]);
  expect(landingMarkers({ ...session, queue: [{ type: 'dialogue', dialogue: 'lowlands.intro', index: 0 }] }, lowlands, lowlandsLegend, stages)).toEqual([]);
});
it('pins every bump reason and preserves Vim search text', () => {
  expect(BUMP_LINES).toEqual({ wall: 'Blocked: a wall.', 'solid-entity': 'Blocked: someone is here.', fixed: 'That stone is fixed.', edge: 'The edge of the world.' });
  for (const [reason, line] of Object.entries(BUMP_LINES)) expect(typeof line === 'string' && reason.length > 0).toBe(true);
  const engine = createEngine();
  let state = engine.init(['stone']);
  for (const key of ['/', 'i', 'n', 'k']) state = engine.step(state, key).state;
  const error = engine.step(state, '<CR>').error;
  if (!error) throw new Error('Expected search error');
  expect(blockedReason([{ type: 'engine-error', error }])).toBe('E486: Pattern not found: ink');
  expect(blockedReason([{ type: 'engine-error', error: { code: 'nothing-to-undo', message: 'Already at oldest change' } }])).toBe('Nothing to undo.');
});
it.each([[6, 3], [7, 2], [9, 2], [10, 1]] as const)('awards %i turns against par 6: %i stars', (turns, stars) => {
  expect(starsFor(turns, 6)).toBe(stars);
});
it('rounds the two-star boundary upward for odd pars', () => {
  expect(starsFor(8, 5)).toBe(2);
  expect(starsFor(9, 5)).toBe(1);
});
it('renders the HUD par and dims it only after par', () => {
  const render = (turn: number) => renderToStaticMarkup(createElement(ObjectiveHud, { objectives: [], hearts: 3, maxHearts: 3, turn, par: 5 }));
  expect(render(3)).toContain('Turn 3');
  expect(render(3)).toContain('par 5');
  expect(render(6)).toContain('opacity:0.45');
});
it('groups engine-parsed commands into caps for a search, Enter and a count', () => {
  const examples = [
    { ...gallery, solution: ['*', 'w', '/', 'i', 'n', 'k', '<CR>', 'e', '<CR>'] },
    { ...stage, id: 'scored-fixture', solution: ['3', 'l', '<CR>'] },
    { ...lowlands, solution: ['w', 'e', '<CR>'] },
  ];
  const expected = [['*', 'w', '/ink<CR>', 'e', '<CR>'], ['3l', '<CR>'], ['w', 'e', '<CR>']];
  examples.forEach((example, index) => {
    expect(solutionCaps(example)).toEqual(expected[index]);
    const session = game.init(false);
    const html = renderToStaticMarkup(createElement(StageClearCard, { session: { ...session, world: { ...session.world, turn: 100 } }, stage: example, onContinue: () => {}, onReplay: () => {} }));
    expect((html.match(/class="learned-key"/g) ?? []).length).toBe(expected[index]?.length);
  });
});
it('holds every real clear for its card, then continues; replay restores entry and retains learning', () => {
  let session = game.init(false);
  const entry = session.stageEntry;
  for (const key of lowlands.solution) session = game.reduce(dismiss(session), key);
  session = dismiss(session);
  expect(session.clearCard).toBe(true);
  expect(session.world.stage).toBe(lowlands.id);
  expect(session.stageEntry.best?.[lowlands.id]?.turns).toBe(session.world.turn);
  const learned = [...session.story.learnedSkills, 'motion.w'];

  const replay = game.reduce({ ...session, story: { ...session.story, learnedSkills: learned } }, 'r');
  expect(replay.world.engine.cursor).toEqual(lowlands.start);
  expect(replay.world.turn).toBe(0);
  expect(replay.story.flags).toEqual(entry.story.flags);
  expect(replay.story.learnedSkills).toEqual(learned);
  expect(replay.story.clearedStages).toEqual(entry.story.clearedStages);
  expect(replay.stageEntry.best).toEqual(session.stageEntry.best);
  expect(game.reduce(session, '<CR>').world.stage).toBe('lighthouse');
});
it('persists only improving bests, loads old saves, and rejects invalid best results', () => {
  const original = recordBest(undefined, 'lowlands', 9, 6);
  expect(recordBest(original, 'lowlands', 10, 6)).toBe(original);
  expect(recordBest(original, 'lowlands', 9, 6)).toBe(original);
  const best = recordBest(original, 'lowlands', 6, 6);
  expect(best.lowlands).toEqual({ turns: 6, stars: 3 });
  let value: string | null = null;
  const storage = () => ({ getItem: () => value, setItem: (_key: string, text: string) => { value = text; }, removeItem: () => { value = null; } });
  const progress = game.init(false).stageEntry;
  saveProgress(storage, progress);
  expect(readProgress(storage, ['lowlands'])).toEqual(progress);
  saveProgress(storage, { ...progress, best });
  expect(readProgress(storage, ['lowlands'])?.best).toEqual(best);
  storage().setItem(PROGRESS_KEY, JSON.stringify({ ...progress, best: { lowlands: { turns: -1, stars: 4 } } }));
  expect(readProgress(storage, ['lowlands'])).toBeNull();
});


it('pins caps for authored Gallery, Mouth, and Margin solutions', () => {
  expect(solutionCaps(gallery)).toEqual(['*', 'w', '*', 'w', '*', 'e', '<CR>']);
  expect(solutionCaps(mouth)).toEqual(['?x<CR>', 'n', 'n', 'l', '<CR>']);
  expect(solutionCaps(stage)).toEqual(['3k', '4l', '<CR>', '6j', '5l', '<CR>', '3k', '28l']);
});
it('never labels the player cell after a completed find', () => {
  const controller = createSession({ sim, storyEngine: createStoryEngine(), stages, stage: canopy, legend: canopyLegend, content });
  const pending = controller.reduce(controller.init(false), 'f');
  expect(landingMarkers(pending, canopy, canopyLegend, stages)).toEqual([]);
  const completed = controller.reduce(pending, 'H');
  expect(landingMarkers(completed, canopy, canopyLegend, stages).some(marker => marker.key === 'fH')).toBe(false);
});
it('retires a motion marker after three committed uses in the stage', () => {
  const tile = lowlandsLegend.tiles.find(tile => tile.walkable && /^[a-z]$/i.test(tile.char));
  if (!tile) throw new Error('Expected a walkable word tile');
  const practice = { ...lowlands, map: [Array(5).fill(tile.char).join(' ')], start: { line: 0, col: 0 },
    entities: [], triggers: [], clear: [{ type: 'reach' as const, area: { from: { line: 1, col: 0 }, to: { line: 1, col: 0 } } }] };
  const ordered = [stages[0]!, { stage: practice, legend: lowlandsLegend }];
  const controller = createSession({ sim, storyEngine: createStoryEngine(), stages: ordered, stage: practice, legend: lowlandsLegend, content });
  let session = controller.init(false);
  let counts = {};
  for (let uses = 0; uses < 3; uses++) {
    session = controller.reduce(session, 'w');
    counts = countMotionUses(counts, session.lastEvents);
  }
  expect(counts).toEqual({ w: 3 });
  expect(session).not.toHaveProperty('motionUses');
  expect(landingMarkers(session, practice, lowlandsLegend, ordered, counts).some(marker => marker.key === 'w')).toBe(false);
});

it('selects new motions across worlds, prioritizes taught skills and handles reused world lists', () => {
  expect(newMotionKeys(lowlands, [{ stage: lowlands, legend: lowlandsLegend }])).toEqual(['w', 'b', 'e', '0']);
  const teaching = { ...lowlands, teaches: ['motion.e', 'motion.w'] };
  expect(newMotionKeys(teaching).slice(0, 2)).toEqual(['w', 'e']);
  expect(newMotionKeys(stages[2]!.stage)).toEqual([]);
});
it('text stages clear without recording a best or showing par and stars', () => {
  const controller = createSession({ sim, storyEngine: createStoryEngine(), stages, stage: ledger, legend: ledgerLegend, content });
  let session = controller.init(false);
  for (const key of ledger.solution) {
    while (session.queue.length) session = controller.reduce(session, '<CR>');
    session = controller.reduce(session, key);
  }
  while (session.queue.length) session = controller.reduce(session, '<CR>');
  expect(session.clearCard).toBe(true);
  expect(session.stageEntry.best?.ledger).toBeUndefined();
  const html = renderToStaticMarkup(createElement(StageClearCard, { session, stage: ledger, onContinue: () => {}, onReplay: () => {} }));
  expect(html).toContain('cleared');
  expect(html).toContain('hearts left');
  expect(html).not.toMatch(/par|stars/i);
});
it('replays Shaft with entry quests and stage-cleared reactions firing once again', () => {
  const controller = createSession({ sim, storyEngine: createStoryEngine(), stages, stage: shaft, legend: shaftLegend, content });
  const initial = controller.init(false);
  const finish = (start: Session): Session => {
    let session = start;
    for (const key of shaft.solution) {
      while (session.queue.length) session = controller.reduce(session, '<CR>');
      session = controller.reduce(session, key);
      if (session.world.status === 'playing') {
        expect(session.story.quests['quarry.ledger']).toBeUndefined();
        expect(session.story.firedReactions).not.toContain('ledger.start');
      }
      if (session.world.status === 'cleared') break;
    }
    while (session.queue.length) session = controller.reduce(session, '<CR>');
    expect(session.story.firedReactions).toContain('shaft.cleared');
    expect(session.story.firedReactions).toContain('ledger.start');
    expect(session.story.quests['quarry.ledger']).toEqual({ step: 0, done: false });
    while (session.queue.length) session = controller.reduce(session, '<CR>');
    return session;
  };
  const first = finish(initial);
  const replay = controller.reduce(first, 'r');
  expect(replay.story.clearedStages).toEqual(initial.story.clearedStages);
  expect(replay.story.quests).toEqual(initial.story.quests);
  expect(replay.story.firedReactions).toEqual(initial.story.firedReactions);
  const second = finish(replay);
  expect(second.story.quests).toEqual(first.story.quests);
  expect(second.story.firedReactions).toEqual(first.story.firedReactions);
  expect(second.story.clearedStages).toEqual(first.story.clearedStages);
  expect(second.story.firedReactions.filter(id => id === 'shaft.cleared')).toHaveLength(1);
});


it('shows only a clear and hearts on the Margin card', () => {
  const session = game.init(false);
  const html = renderToStaticMarkup(createElement(StageClearCard, { session, stage, onContinue: () => {}, onReplay: () => {} }));
  expect(html).toContain('cleared');
  expect(html).toContain('hearts left');
  expect(html).not.toMatch(/par|stars|Turns:/);
});

it.each(['note', 'sign', 'book', 'plaque', 'ash'])('names the interaction when bumping %s', sprite => {
  const spawn = stage.entities[0];
  if (!spawn) throw new Error('Missing fixture entity');
  const at = { line: 3, col: 3 };
  const entity = { ...spawn, id: 'speaker', sprite, kind: sprite === 'ash' ? 'npc' as const : 'prop' as const, at };
  const world = sim.init(stage, legend, { learnedCommands: [], flags: {} });
  const targetStage = { ...stage, triggers: [{ id: 'talk', once: false, on: 'interact' as const, target: { type: 'entity' as const, entity: 'speaker' } }] };
  const state = { ...world, entities: [{ id: 'speaker', at, def: entity, pathIndex: 0 }] };
  expect(blockedReason([{ type: 'bump', reason: 'solid-entity', at }], targetStage, state)).toBe(sprite === 'ash' ? 'Press Enter to talk.' : 'Press Enter to read.');
  expect(blockedReason([{ type: 'bump', reason: 'solid-entity', at }], { ...targetStage, triggers: [] }, state)).toBe(BUMP_LINES['solid-entity']);
});
it('names the obstacle, so water is not called a wall', () => {
  const world = sim.init(lowlands, lowlandsLegend, { learnedCommands: [], flags: {} });
  const line = world.engine.lines.findIndex(row => [...row].some(char => lowlandsLegend.tiles.some(tile => tile.char === char && !tile.walkable)));
  const row = world.engine.lines[line] ?? '';
  const col = [...row].findIndex(char => lowlandsLegend.tiles.some(tile => tile.char === char && !tile.walkable));
  const label = lowlandsLegend.tiles.find(tile => tile.char === row[col])?.label;
  const bump = [{ type: 'bump' as const, reason: 'wall' as const, at: { line, col } }];
  expect(label).toBeTruthy();
  expect(blockedReason(bump, lowlands, world, lowlandsLegend)).toBe(`Blocked: ${label}.`);
  expect(blockedReason(bump)).toBe(BUMP_LINES.wall);
});
it('Enter with nobody in reach says so instead of showing an engine error', () => {
  const error = { code: 'unknown-command' as const, message: 'Unknown command: <CR>' };
  expect(blockedReason([{ type: 'engine-error', error }])).toBe('Nothing here to talk to or read.');
});
