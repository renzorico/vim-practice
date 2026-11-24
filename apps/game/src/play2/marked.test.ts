import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, gallery, marked, markedLegend, stages } from './content.js';
import { createSession, GALLERY_COMMANDS, MARKED_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { darknessFor } from '../scene/darkness.js';
import { SPRITES } from '../scene/sprites/index.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: marked, legend: markedLegend };
const controller = createSession({ ...dependencies, stages });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count++) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const start = () => dismiss(controller.init());
const keys = (session: Session, input: string) => parseKeys(input).reduce(controller.reduce, session);
const route = (session: Session, input: readonly string[]) => input.reduce((current, key) => controller.reduce(dismiss(current), key), session);
const lines = (id: string) => content.dialogues.find(dialogue => dialogue.id === id)?.lines.map(line => line.text);

it('marks the fork, collects a crystal and returns to the exact cell', () => {
  const pocket = keys(start(), 'ma/x<CR>');
  expect(pocket.world.engine.marks.a).toEqual(marked.start);
  expect(pocket.world.engine.cursor).toEqual({ line: 1, col: 2 });
  expect(pocket.story.flags['marked.crystal']).toBe(true);
  expect(pocket.queue).toEqual([{ type: 'dialogue', dialogue: 'marked.got-crystal', index: 0 }]);
  expect(lines('marked.got-crystal')).toEqual(['A crystal, warm in your hand.']);
  expect(keys(dismiss(pocket), '`a').world.engine.cursor).toEqual(marked.start);
});
it('keeps Vim linewise quote behavior: first nonblank is rock, so the jump bumps', () => {
  const pocket = dismiss(keys(start(), 'ma/x<CR>'));
  const result = keys(pocket, "'a");
  expect(result.world.engine.cursor).toEqual(pocket.world.engine.cursor);
  expect(result.lastEvents).toContainEqual({ type: 'bump', reason: 'wall', at: { line: 3, col: 0 } });
});
it.each([['x', 'o'], ['o', 'x']])('collects items in order %s, %s with exclusive Echo states', (first, second) => {
  let session = start();
  expect(lines('marked.intro')).toEqual([
    'A fork in the tunnel. You need a crystal and\nlamp oil, sealed somewhere in the rock.',
    'At the fork, press `ma`: it marks the spot.\nLater, `` `a `` brings you back from anywhere.',
  ]);
  for (const item of [null, first, second]) {
    if (item) session = dismiss(keys(session, `/${item}<CR>`));
    if (item) session = keys(session, '`a');
    else session = keys(session, 'ma');
    const both = item === second;
    expect(Boolean(session.story.flags['marked.both'])).toBe(both);
    session = keys(session, '<CR>');
    expect(session.queue).toEqual([{ type: 'dialogue', dialogue: both ? 'marked.echo-through' : 'marked.echo-wait', index: 0 }]);
    expect(session.story.flags['marked.through']).not.toBe(true);
    if (!both) session = dismiss(session);
  }
  expect(lines('marked.got-oil')).toEqual(['Lamp oil. Enough for a long dark.']);
  expect(lines('marked.echo-wait')).toEqual(['...crystal. ...oil. Mark, then go.']);
  expect(lines('marked.echo-through')).toEqual(['Light, and oil to keep it. Now you can\nface the labyrinth.', "It hunts by walking. You don't have to."]);
  session = controller.reduce(session, '<CR>');
  expect(session.world.status).toBe('playing');
  session = controller.reduce(session, '<CR>');
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ cutscene: 'marked.end' });
  expect(content.cutscenes.find(scene => scene.id === 'marked.end')?.beats).toEqual([
    { type: 'line', line: { speaker: 'system', text: 'Below, the labyrinth. Something heavy\nis walking its corridors.' } },
  ]);
});
it('replays the supplied solution in five turns with three hearts', () => {
  const session = route(start(), parseKeys('ma/x<CR>`a/o<CR>`a<CR>'));
  // Finish Echo's handoff, leaving the ending queued before the next stage.
  const cleared = controller.reduce(controller.reduce(session, '<CR>'), '<CR>');
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.world.turn).toBe(5);
  expect(cleared.world.hearts).toBe(3);
  expect(dismiss(cleared).world.stage).toBe('labyrinth');
});
it('enters marked after gallery.end, carrying story and both quest steps', () => {
  let session = dismiss(controller.resume({ stage: 'gallery', story: storyEngine.init(content) }));
  session = route(session, gallery.solution);
  session = controller.reduce(controller.reduce(session, '<CR>'), '<CR>');
  expect(session.world.stage).toBe('gallery');
  expect(session.queue[0]).toMatchObject({ cutscene: 'gallery.end' });
  session = controller.reduce(session, '<CR>');
  expect(session.clearCard).toBe(true);
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('marked');
  expect(session.queue[0]).toMatchObject({ dialogue: 'marked.intro' });
  expect(session.story.flags['gallery.through']).toBe(true);
  expect(session.story.quests['caves.marked']).toEqual({ step: 0, done: false });
  session = route(dismiss(session), marked.solution.slice(0, -1));
  expect(session.story.quests['caves.marked']).toEqual({ step: 1, done: false });
  session = dismiss(keys(dismiss(session), '<CR>'));
  expect(session.story.quests['caves.marked']).toEqual({ step: 2, done: true });
});
it.each(['x', 'o'])('seals the %s pocket against walking and absolute edge motions without a mark', item => {
  const pocket = dismiss(keys(start(), `/${item}<CR>`));
  // Explore all reachable walking cells using the actual reducer; no hand-coded reachability rules.
  const pending = [pocket];
  const visited = new Set<string>();
  while (pending.length) {
    const session = pending.pop()!;
    const at = session.world.engine.cursor;
    const id = `${at.line}:${at.col}`;
    if (visited.has(id)) continue;
    visited.add(id);
    expect(at.line).toBe(item === 'x' ? 1 : 3);
    expect(at.col).toBeGreaterThanOrEqual(item === 'x' ? 1 : 12);
    expect(at.col).toBeLessThanOrEqual(item === 'x' ? 3 : 14);
    for (const command of ['gg', 'G', '0']) expect(keys(session, command).world.engine.cursor).toEqual(at);
    for (const command of ['h', 'j', 'k', 'l']) pending.push(keys(session, command));
  }
  expect(visited.size).toBe(3);
  const reset = keys(pocket, ':e!<CR>');
  expect(reset.world.engine.cursor).toEqual(marked.start);
  expect(reset.world.engine.marks).toEqual({});
});
it('offers marks immediately, rejects ma in gallery, and restores marked on Continue', () => {
  expect(stageCommands(marked)).toEqual(MARKED_COMMANDS);
  expect(learnedKeycaps({}, false, 'marked')).toEqual(expect.arrayContaining(['ma', '`a', "'a", '/', '*']));
  const before = dismiss(controller.resume({ stage: 'gallery', story: storyEngine.init(content) }));
  const after = keys(before, 'ma');
  expect(after.world.engine.marks).toEqual({});
  expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, start().stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing save');
  expect(controller.resume(progress).world.stage).toBe('marked');
  expect(content.worlds.find(world => world.id === 'echo-caves')?.stages).toEqual(['mouth', 'gallery', 'marked', 'labyrinth', 'study']);
});
it('lints marked and replays every bundled stage', () => {
  expect(lintStage(marked, markedLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
it('draws the oil jar and lights both item cells once collected', () => {
  expect(SPRITES['lamp-oil']).toBeDefined();
  expect(SPRITES['mark-flag']).toBeDefined();
  expect(darknessFor(marked, {})).toEqual({ radius: 3, lights: [] });
  expect(darknessFor(marked, { 'marked.crystal': true, 'marked.oil': true })).toEqual({ radius: 3, lights: [{ line: 1, col: 2 }, { line: 3, col: 13 }] });
});
it('bounds the gallery vocabulary by expansions and simulation steps', () => {
  const solver = sessionSolver(dependencies);
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => {
    steps++;
    return solver.step(...args);
  } };
  expect(solveStage(observed, marked, markedLegend, { learnedCommands: GALLERY_COMMANDS, flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  expect(steps).toBeGreaterThan(0);
  console.info(`Marked old vocabulary: ${steps} simulation steps (3 turns / 50 expansions)`);
});
it('finds a four-turn solution with a focused marks and search vocabulary', () => {
  const result = solveStage(sessionSolver(dependencies), marked, markedLegend,
    { learnedCommands: ['m', '`', '/'], flags: {} }, { maxTurns: 5, maxExpanded: 5000 });
  expect(result).not.toBeNull();
  if (!result) throw new Error('No marked route');
  expect(result.turns).toBe(4);
  expect(marked.parTurns).toBe(result.turns);
  // Stop at marked.end; dismissing it now enters the labyrinth at turn zero.
  for (const input of [marked.solution, result.keys]) {
    let session = route(start(), input);
    for (let line = 0; line < 80 && !session.queue.some(item => item.type === 'cutscene' && item.cutscene === 'marked.end'); line++) {
      session = controller.reduce(session, '<CR>');
    }
    expect(session.queue[0]).toMatchObject({ cutscene: 'marked.end' });
    expect(session.world.turn).toBe(result.turns);
    expect(session.world.status).toBe('cleared');
  }
  console.info('Marked focused solver:', result);
});
