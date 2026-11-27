import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, gallery, marked, markedLegend, stages } from './content.js';
import { createSession, MARKED_COMMANDS, stageCommands, type Session } from './session.js';
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

const TUNNEL = '3h2k7l4j11h';
it('marks the fork, walks the tunnel to the crystal and returns to the exact cell', () => {
  const pocket = keys(start(), `ma${TUNNEL}`);
  expect(pocket.world.engine.marks.a).toEqual(marked.start);
  expect(pocket.world.engine.cursor).toEqual({ line: 5, col: 2 });
  expect(pocket.story.flags['marked.crystal']).toBe(true);
  expect(pocket.queue).toEqual([{ type: 'dialogue', dialogue: 'marked.got-crystal', index: 0 }]);
  expect(lines('marked.got-crystal')).toEqual(['A crystal, warm in your hand.']);
  expect(keys(dismiss(pocket), '`a').world.engine.cursor).toEqual(marked.start);
});
it("keeps Vim linewise quote behavior: 'a lands on the first nonblank of the marked line, the oil", () => {
  const pocket = dismiss(keys(start(), `ma${TUNNEL}`));
  const result = keys(pocket, "'a");
  expect(result.world.engine.cursor).toEqual({ line: 3, col: 1 });
  expect(result.story.flags['marked.oil']).toBe(true);
  expect(result.lastEvents).not.toContainEqual(expect.objectContaining({ type: 'bump' }));
});
it.each([['x', 'o'], ['o', 'x']])('collects items in order %s, %s with exclusive Echo states', (first, second) => {
  let session = start();
  expect(lines('marked.intro')).toEqual([
    'A fork in the tunnel. Too dark to search.\nYou need a crystal and lamp oil.',
    'At the fork, press `ma`: it marks the spot.\nLater, `` `a `` brings you back from anywhere.',
    "`'a` goes to the start of the marked line:\nthe oil is there. `` `a `` is the exact spot.",
    'The crystal is at the end of the tunnel.\nWalk there; the mark will bring you home.',
  ]);
  for (const item of [null, first, second]) {
    if (item) session = dismiss(keys(session, item === 'x' ? TUNNEL : "'a"));
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
it('replays the supplied solution in par turns with three hearts', () => {
  const session = route(start(), marked.solution);
  // Finish Echo's handoff, leaving the ending queued before the next stage.
  const cleared = controller.reduce(controller.reduce(session, '<CR>'), '<CR>');
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.world.turn).toBe(marked.parTurns);
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
it('turns row 3 column 0 into non-walkable darkness rock', () => {
  const tile = markedLegend.tiles.find(entry => entry.char === ' ' && entry.kind === 'ground');
  expect(tile).toMatchObject({ label: 'darkness', walkable: false, fixed: true, sprite: 'cave-rock' });
  expect(marked.map[3]?.[0]).toBe(' ');
});
it("jumps from the crystal to the oil with 'a and fires marked.oil", () => {
  const crystal = dismiss(keys(start(), `ma${TUNNEL}`));
  expect(crystal.world.engine.cursor).toEqual({ line: 5, col: 2 });
  expect(crystal.story.flags['marked.oil']).not.toBe(true);
  const oil = keys(crystal, "'a");
  expect(oil.world.engine.cursor).toEqual({ line: 3, col: 1 });
  expect(oil.story.flags['marked.oil']).toBe(true);
});
it('seals the oil: no walk or run leaves it, only the mark does', () => {
  const oil = dismiss(keys(start(), "ma'a"));
  expect(oil.world.engine.cursor).toEqual({ line: 3, col: 1 });
  for (const command of ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', '9w', '9e', '9b']) {
    expect(keys(oil, command).world.engine.cursor, command).toEqual({ line: 3, col: 1 });
  }
  expect(keys(oil, '`a').world.engine.cursor).toEqual(marked.start);
  const reset = keys(oil, ':e!<CR>');
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
  expect(darknessFor(marked, { 'marked.crystal': true, 'marked.oil': true })).toEqual({ radius: 3, lights: [{ line: 5, col: 2 }, { line: 3, col: 1 }] });
});
it('proves par over the whole vocabulary, and no clear without each mark key', () => {
  const solver = sessionSolver(dependencies);
  const limits = { maxExpanded: 2_000_000 };
  const learned = (commands: readonly string[]) => ({ learnedCommands: commands, flags: {} });
  expect(solveStage(solver, marked, markedLegend, learned(MARKED_COMMANDS), { ...limits, maxTurns: marked.parTurns - 1 })).toBeNull();
  expect(solveStage(solver, marked, markedLegend, learned(MARKED_COMMANDS), { ...limits, maxTurns: marked.parTurns })?.turns).toBe(marked.parTurns);
  // Search, counted G and gg are not allowed here, so nothing but a mark reaches the oil or leaves it.
  for (const key of ['m', '`', "'"]) {
    expect(solveStage(solver, marked, markedLegend, learned(MARKED_COMMANDS.filter(command => command !== key)),
      { ...limits, maxTurns: 2 * marked.parTurns }), key).toBeNull();
  }
}, 120_000);
