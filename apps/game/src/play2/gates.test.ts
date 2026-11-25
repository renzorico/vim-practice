import { expect, it } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, playKeys, stageReplayIssue } from '@escape/world';
import { SKILL_IDS } from '@escape/curriculum';
import { lintLegend, lintStage } from '../../../../tools/maps/lint.js';
import { content, gates, gatesLegend, stages } from './content.js';
import { createSession, GATES_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { readProgress, saveProgress } from './progress.js';
import { learnedKeycaps } from './PlayScreen.js';
import { vi } from 'vitest';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: gates, legend: gatesLegend };
const controller = createSession({ ...dependencies, stages });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count += 1) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const keys = (session: Session, route: string) => parseKeys(route).reduce((next, key) => controller.reduce(dismiss(next), key), session);
const start = () => dismiss(controller.init());
function at(route: string, flags: Readonly<Record<string, boolean>> = {}) {
  return keys(dismiss(controller.resume({ stage: 'gates', story: { ...storyEngine.init(content), flags } })), route);
}
export const LEARNER = 'h<CR>%<CR>2l<C-d><C-d><C-d><C-d><C-u><C-u><C-d><C-d><C-d><C-d>2h<CR>%<CR>';
it('enters gates after glades.end and starts the quest', () => {
  const previous = dismiss(controller.resume({ stage: 'glades', story: storyEngine.init(content) }));
  const clear = keys(previous, 'G<CR>{{gg<CR>G<CR>');
  expect(clear.world.stage).toBe('glades');
  const ending = controller.reduce(controller.reduce(clear, '<CR>'), '<CR>');
  expect(ending.queue[0]).toMatchObject({ cutscene: 'glades.end' });
  expect(ending.story.quests['wordwood.gates']).toEqual({ step: 0, done: false });
  expect(dismiss(clear).world.stage).toBe('gates');
});
it.each([['h', 0, 3], ['2h', 32, 2]] as const)('matches the bracket reached by %s', (route, line, col) => {
  const before = keys(start(), route);
  const jumped = keys(before, '%');
  expect(jumped.world.engine.cursor).toEqual({ line, col });
  expect(keys(jumped, '%').world.engine.cursor).toEqual(before.world.engine.cursor);
});
it('failed percent bumps and spends no turn', () => {
  const before = keys(start(), 'l');
  const after = keys(before, '%');
  expect(after.world.turn).toBe(before.world.turn);
  expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump' }));
});
it('walks bump on air, scroll lands every six, and a rejected count rolls back scroll', () => {
  const top = keys(start(), 'h%2l');
  expect(top.world.engine.cursor).toEqual({ line: 0, col: 5 });
  expect(keys(top, '6j').world.turn).toBe(top.world.turn);
  const rejected = keys(top, '3<C-d>');
  expect(rejected.world.turn).toBe(top.world.turn);
  expect(keys(rejected, '<C-d>').world.engine.cursor).toEqual({ line: 6, col: 5 });
});
it('successful scroll count persists until :e! resets it even after a lamp checkpoint', () => {
  const counted = keys(start(), 'h%2l12<C-d>');
  expect(counted.world.engine.scroll).toBe(12);
  expect(keys(counted, '<C-d>').world.engine.cursor).toEqual({ line: 24, col: 5 });
  const lit = dismiss(keys(at('h%<CR>2l'), '12<C-d><C-d>'));
  expect(lit.world.engine.scroll).toBe(12);
  const reset = keys(lit, ':e!<CR>');
  expect(reset.world.engine.scroll).toBe(0);
  expect(keys(reset, '<C-u>').world.engine.cursor).toEqual({ line: 18, col: 5 });
});
it('upper lamp ignores an early visit without consuming its trigger', () => {
  const early = dismiss(keys(start(), 'h%<CR>2l12<C-d>'));
  expect(early.story.flags['gates.lamp-b']).toBeUndefined();
  expect(early.world.firedTriggers).not.toContain('gates.lamp-b');
  const lower = dismiss(keys(early, '<C-d>'));
  expect(lower.story.flags['gates.lamp-a']).toBe(true);
  const upper = dismiss(keys(lower, '<C-u>'));
  expect(upper.story.flags['gates.lamp-b']).toBe(true);
  for (const id of ['a', 'b']) expect(upper.world.entities.find(e => e.id === `lamp-${id}`)?.def.sprite).toBe('lamp-lit');
});
it.each([
  ['h<CR>', {}, 'shut-intro'],
  ['h<CR>', { 'gates.met-shut': true }, 'shut-alone'],
  ['h<CR>', { 'gates.met-shut': true, 'gates.lamp-b': true }, 'shut-sees'],
  ['h<CR>', { 'gates.met-shut': true, 'gates.lamp-b': true, 'gates.shut-ready': true }, 'shut-go'],
  ['h%<CR>', {}, 'ope-ask'],
  ['h%<CR>', { 'gates.asked': true }, 'ope-wait'],
  ['h%<CR>', { 'gates.asked': true, 'gates.shut-ready': true }, 'ope-cure'],
] as const)('selects exactly one dialogue at %s with %j', (route, flags, dialogue) => {
  const session = at(route, flags);
  expect(session.queue).toEqual([{ type: 'dialogue', dialogue: `gates.${dialogue}`, index: 0 }]);
  // Every authored line remains visible in order, including mixed speakers.
  const lines = content.dialogues.find(d => d.id === `gates.${dialogue}`)?.lines ?? [];
  let next = session;
  for (let index = 0; index < lines.length; index += 1) {
    expect(next.queue[0]?.index).toBe(index);
    next = controller.reduce(next, '<CR>');
  }
});
it.each([LEARNER, LEARNER.replace('2l<C-d>', '2l<C-d><C-u><C-d>')])('learner and wait-a-beat routes clear alive: %s', route => {
  let clear = keys(start(), route);
  while (clear.queue[0]?.type === 'dialogue') clear = controller.reduce(clear, '<CR>');
  expect(clear.world.status).toBe('cleared');
  expect(clear.world.hearts).toBeGreaterThanOrEqual(2);
  expect(clear.world.turn).toBe(route === LEARNER ? 15 : 17);
  const ended = dismiss(clear);
  expect(ended.world.stage).toBe('manifest');
  expect(ended.world.script?.id).toBe('manifest.book');
  expect(ended.world.hearts).toBeGreaterThanOrEqual(2);
  expect(ended.world.turn).toBe(0);
  expect(ended.story.statues).toContain('R');
});
it('Continue restores gates and Wordwood has castle R', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  saveProgress(() => storage, start().stageEntry);
  const saved = readProgress(() => storage, stages.map(e => e.stage.id));
  if (!saved) throw new Error('Missing save');
  expect(dismiss(controller.resume(saved)).world.stage).toBe('gates');
  expect(content.worlds.find(w => w.id === 'wordwood')).toMatchObject({ castle: 'gates', statue: 'R', stages: ['canopy', 'glades', 'gates', 'manifest'] });
});
it.each(['%', '<C-d>', '<C-u>'])('Glades rejects %s', key => {
  const before = dismiss(controller.resume({ stage: 'glades', story: storyEngine.init(content) }));
  expect(keys(before, key).lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
});
it('edits cannot change any floor, bracket, landing or sealed room', () => {
  for (const route of ['', 'h', '2h%', 'h%2l', 'h%2l<C-d>']) {
    const before = keys(start(), route);
    for (const edit of ['x', '3x', 'dd', 'r.']) expect(keys(before, edit).world.engine.lines, `${route} ${edit}`).toEqual(gates.map);
  }
});
it('teaches keys by flags and validates, lints and replays the content', () => {
  expect(learnedKeycaps({}, false, 'gates')).not.toContain('%');
  expect(learnedKeycaps({ 'gates.met-shut': true }, false, 'gates')).toContain('%');
  expect(learnedKeycaps({ 'gates.asked': true }, false, 'gates')).toEqual(expect.arrayContaining(['Ctrl-d', 'Ctrl-u']));
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  expect(lintLegend(gatesLegend)).toEqual([]);
  expect(lintStage(gates, gatesLegend)).toEqual([]);
  const replay = sessionSolver(dependencies);
  expect(stageReplayIssue(replay, gates, gatesLegend, { learnedCommands: GATES_COMMANDS, flags: {} })).toBeNull();
  expect(playKeys(replay, gates, gatesLegend, { learnedCommands: GATES_COMMANDS, flags: {} }, gates.solution).state.status).toBe('cleared');
});
it('a counted scroll that fails at the top leaves Ctrl-d working', () => {
  const top = keys(start(), 'h%2l5<C-u>');
  expect(top.world.engine.scroll).toBe(0);
  expect(keys(top, '<C-d>').world.engine.cursor).toEqual({ line: 6, col: 5 });
});
it('Shut sees the lamps without overlapping his introduction when the player skipped him', () => {
  const lit = dismiss(keys(start(), 'h%<CR>2l25G13G'));
  // Ope's errand counts as having met Shut, so the objective moves on to what Ope asked for.
  expect(lit.story.flags['gates.met-shut']).toBe(true);
  expect(keys(lit, 'G2h<CR>').queue).toEqual([{ type: 'dialogue', dialogue: 'gates.shut-sees', index: 0 }]);
});
it('every bundled stage solution replays with only that stage\'s own commands', () => {
  for (const { stage, legend } of stages) {
    const replay = sessionSolver({ sim, storyEngine, content, stage, legend });
    expect(stageReplayIssue(replay, stage, legend, { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
  }
});
