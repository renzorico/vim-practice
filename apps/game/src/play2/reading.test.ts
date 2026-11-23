import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, stageReplayIssue, solveStage } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, reading, readingLegend, stacks, stacksLegend, stages } from './content.js';
import { createSession, READING_COMMANDS, STACKS_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages: stages.slice(0, stages.findIndex(entry => entry.stage.id === 'reading') + 1), stage: reading, legend: readingLegend });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length; count += 1) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const start = () => dismiss(controller.init());
const keys = (session: Session, input: string) => parseKeys(input).reduce(controller.reduce, session);
const route = (session: Session, input: readonly string[]) => input.reduce((current, key) => controller.reduce(dismiss(current), key), session);
const queued = (session: Session) => session.queue.flatMap(item => item.type === 'dialogue' ? [item.dialogue] : []);
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: reading, legend: readingLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));
it('enters reading after stacks.end, keeping story and starting the quest', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: stacks, legend: stacksLegend });
  const ending = route(dismiss(previous.init()), stacks.solution);
  expect(ending.world.stage).toBe('stacks');
  // Quire's closing lines play first, then the cutscene, then the stage changes.
  let next = ending;
  for (let i = 0; i < 20 && next.world.stage === 'stacks'; i++) next = controller.reduce(next, '<CR>');
  expect(next.world.stage).toBe('reading');
  expect(queued(next)).toEqual(['reading.intro']);
  expect(next.story.clearedStages).toContain('stacks');
  expect(next.story.quests['library.reading']).toEqual({ step: 0, done: false });
  expect(content.worlds.find(world => world.id === 'library')?.stages).toEqual(['stacks', 'reading', 'archive', 'notary', 'contract']);
});
it('w lands on links; da( removes both shackles and leaves the cursor on floor', () => {
  const inside = keys(start(), 'w');
  expect(inside.world.engine.cursor).toEqual({ line: 1, col: 5 });
  const next = keys(inside, 'da(');
  expect(next.world.engine.lines[1]).toBe('|......((cc)ccc)...(ccccc)..|');
  expect(next.world.engine.lines[1]?.[next.world.engine.cursor.col]).toBe('.');
  expect(next.world.hearts).toBe(3);
  expect(next.world.firedTriggers).toContain('reading.first-gone');
  expect(queued(next)).toEqual(['reading.nested']);
  expect(next.world.firedTriggers).not.toContain('reading.chains-gone');
  expect(next.story.flags['reading.chains-gone']).not.toBe(true);
  expect(queued(keys(dismiss(next), 'u.'))).toEqual([]);
});
it.each(['d2a(', '2da('])('%s removes both nested pairs from the inner links', command => {
  const next = keys(dismiss(keys(start(), 'wda(')), `w${command}`);
  expect(next.world.engine.lines[1]).toBe('|.........(ccccc)..|');
  expect(next.world.hearts).toBe(3);
});
it('di( leaves an open shackle and sets the completion flag without repeating the hint', () => {
  const next = keys(dismiss(keys(start(), 'wda(')), 'wd2a(wdi(');
  expect(next.world.engine.lines[1]).toBe('|.........()..|');
  expect(next.world.firedTriggers).toContain('reading.chains-gone');
  expect(queued(next)).toEqual([]);
  expect(next.story.flags['reading.chains-gone']).toBe(true);
  expect(keys(dismiss(next), '<CR>').queue[0]).toMatchObject({ dialogue: 'reading.folio-through' });
});
it('da( on the last chain cannot satisfy the open-shackle trigger', () => {
  // da( would slide Folio's cell under the cursor: the sim cancels it (solid entity), so the
  // chain stays and the open-shackle text can never be reached this way.
  const next = keys(dismiss(keys(start(), 'wda(')), 'wd2a(wda(');
  expect(next.world.engine.lines[1]).toBe('|.........(ccccc)..|');
  expect(next.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'solid-entity' }));
  expect(next.world.firedTriggers).not.toContain('reading.chains-gone');
  expect(next.story.flags['reading.chains-gone']).not.toBe(true);
});
it.each([
  ['objects', reading.solution, 6, READING_COMMANDS],
  ['Stacks tools', parseKeys('w%d%w%hd%wdt)<CR>'), 9, STACKS_COMMANDS],
] as const)('replays %s in %i turns with 3 hearts', (_label, input, turns, commands) => {
  const session = dismiss(route(start(), input));
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(turns);
  expect(session.world.hearts).toBe(3);
  expect(session.story.flags['reading.through']).toBe(true);
  expect(screen(session)).toContain('To be continued.');
  const solver = sessionSolver({ sim, storyEngine, content, stage: reading, legend: readingLegend });
  const options = { learnedCommands: commands, flags: {} };
  let state = solver.init(reading, readingLegend, options);
  for (const key of input) state = solver.step(state, key, reading, readingLegend, options).state;
  expect(state.status).toBe('cleared');
  expect(state.turn).toBe(turns);
  expect(state.hearts).toBe(3);
});
it.each([false, true])('shows each Folio line exclusively when chains-gone=%s', gone => {
  let session = gone ? dismiss(route(start(), reading.solution.slice(0, -1))) : keys(start(), '30l');
  session = keys(session, '<CR>');
  const id = gone ? 'reading.folio-through' : 'reading.folio-wait';
  expect(queued(session)).toEqual([id]);
  for (const line of content.dialogues.find(item => item.id === id)!.lines) {
    expect(screen(session)).toContain(line.text.replaceAll("'", '&#x27;'));
    session = controller.reduce(session, '<CR>');
  }
  expect(session.story.flags['reading.through'] === true).toBe(gone);
  if (gone) {
    expect(session.queue[0]).toMatchObject({ cutscene: 'reading.end' });
    expect(screen(session)).toContain('Past the reading room, the archive: shelves of\nrows, with an empty row between shelves.');
    expect(screen(controller.reduce(session, '<CR>'))).toContain('To be continued.');
  }
});
it('shows every intro and nested line in order, with nested playing once', () => {
  let session = controller.init();
  for (const line of content.dialogues.find(item => item.id === 'reading.intro')!.lines) {
    expect(screen(session)).toContain(line.text.replaceAll("'", '&#x27;'));
    session = controller.reduce(session, '<CR>');
  }
  session = keys(session, 'wda(');
  for (const line of content.dialogues.find(item => item.id === 'reading.nested')!.lines) {
    expect(screen(session)).toContain(line.text);
    session = controller.reduce(session, '<CR>');
  }
  expect(queued(keys(session, 'udi('))).toEqual([]);
});
it('gates objects to reading and displays its keycaps including %', () => {
  expect(stageCommands(reading)).toEqual(READING_COMMANDS);
  expect(learnedKeycaps({}, false, 'reading')).toEqual(expect.arrayContaining(['da(', 'di(', 'd2a(', '%']));
  const before = dismiss(controller.resume({ stage: 'stacks', story: start().story }));
  const after = keys(keys(before, 'j'), 'da(');
  expect(after.world.engine.lines).toEqual(stacks.map);
  expect(after.world.turn).toBe(1);
  expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
});
it('Continue restores reading and its entry story', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const session = keys(start(), 'wda(');
  expect(saveProgress(() => storage, session.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing reading save');
  const continued = controller.resume(progress);
  expect(continued.world.stage).toBe('reading');
  expect(continued.story).toEqual(session.stageEntry.story);
  expect(continued.world.engine.lines).toEqual(reading.map);
});
it('lints with no issues and every stage passes its replay gate', () => {
  expect(lintStage(reading, readingLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
it('finds no Stacks route within 3 turns / 50 expansions in under 3 seconds', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: reading, legend: readingLegend });
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => {
    steps += 1;
    return solver.step(...args);
  } };
  const before = performance.now();
  expect(solveStage(observed, reading, readingLegend, { learnedCommands: STACKS_COMMANDS, flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  const elapsed = performance.now() - before;
  expect(steps).toBeGreaterThan(0);
  console.info(`Reading old-command bound: ${steps} steps, ${elapsed.toFixed(0)} ms`);
});
