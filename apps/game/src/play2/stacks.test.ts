import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, stageReplayIssue, solveStage } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, stacks, stacksLegend, harbour, harbourLegend, stages } from './content.js';
import { createSession, COUNTER_COMMANDS, STACKS_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages: stages.filter(entry => !['reading', 'archive', 'notary'].includes(entry.stage.id)), stage: stacks, legend: stacksLegend });
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
function move(session: Session, line: number, col: number): Session {
  const result = sim.apply(session.world, [{ type: 'move-player', to: { line, col } }], stacks, stacksLegend);
  return { ...session, world: result.state, lastEvents: result.events };
}
const queued = (session: Session) => session.queue.flatMap(item => item.type === 'dialogue' ? [item.dialogue] : []);
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: stacks, legend: stacksLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));

it('enters stacks after all harbour.end lines, keeping story and starting the Library quest', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: harbour, legend: harbourLegend });
  let session = route(dismiss(previous.init()), harbour.solution);
  expect(session.world.stage).toBe('harbour');
  expect(session.queue[0]).toMatchObject({ cutscene: 'harbour.end' });
  const ending = content.cutscenes.find(item => item.id === 'harbour.end')!;
  for (const [index] of ending.beats.entries()) {
    expect(session.world.stage).toBe('harbour');
    expect(session.queue[0]?.index).toBe(index);
    session = controller.reduce(session, '<CR>');
  }
  expect(ending.beats.at(-1)).toMatchObject({ line: { text: 'End of World 4.' } });
  expect(session.world.stage).toBe('stacks');
  expect(queued(session)).toEqual(['stacks.intro']);
  expect(session.story.clearedStages).toContain('harbour');
  expect(session.story.quests['library.stacks']).toEqual({ step: 0, done: false });
  expect(content.worlds.find(world => world.id === 'library')).toEqual({
    id: 'library', order: 5, name: 'The Library', stages: ['stacks', 'reading', 'archive', 'notary'], castle: 'notary', statue: 'Q',
  });
});
it('drops into the middle of dust, then daw and dot align all three shelves', () => {
  let session = keys(start(), 'j');
  expect(session.world.engine.cursor).toEqual({ line: 1, col: 12 });
  session = keys(session, 'daw');
  expect(session.world.engine.cursor).toEqual({ line: 1, col: 10 });
  expect(session.world.firedTriggers).toContain('stacks.shelf-1');
  expect(queued(session)).toEqual(['stacks.down']);
  session = keys(dismiss(session), 'j.');
  expect(session.world.engine.cursor).toEqual({ line: 2, col: 8 });
  expect(session.world.firedTriggers).toContain('stacks.shelf-2');
  expect(queued(session)).toEqual([]);
  session = keys(session, 'j.');
  expect(session.world.engine.cursor).toEqual({ line: 3, col: 7 });
  expect(session.world.firedTriggers).toContain('stacks.shelf-3');
  expect(queued(session)).toEqual(['stacks.dusted']);
  expect(session.world.turn).toBe(6);
});
it('diw leaves two spaces; x removes the extra space and fires shelf 1', () => {
  const session = keys(start(), 'jdiw');
  expect(session.world.engine.lines[1]).toBe('|bbb bbbb  bb|');
  expect(session.world.firedTriggers).not.toContain('stacks.shelf-1');
  expect(keys(session, 'x').world.firedTriggers).toContain('stacks.shelf-1');
});
it.each([
  ['text objects', stacks.solution, 6],
  ['World 4 tools', parseKeys('2hjdwjb.jb.<CR>'), 9],
] as const)('replays %s with 3 hearts (%i turns)', (_label, input, turns) => {
  const session = dismiss(route(start(), input));
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(turns);
  expect(session.world.hearts).toBe(3);
  expect(session.story.flags['stacks.through']).toBe(true);
  expect(screen(session)).toContain('To be continued.');
  if (turns === 9) {
    const old = sessionSolver({ sim, storyEngine, content, stage: stacks, legend: stacksLegend });
    let state = old.init(stacks, stacksLegend, { learnedCommands: COUNTER_COMMANDS, flags: {} });
    for (const key of input) state = old.step(state, key, stacks, stacksLegend, { learnedCommands: COUNTER_COMMANDS, flags: {} }).state;
    expect(state.status).toBe('cleared');
    expect(state.turn).toBe(9);
  }
});
const orders = [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]];
it.each(orders)('cascades dusted on the third shelf only: %i, %i, %i', (...order) => {
  let session = start();
  let down = 0;
  order.forEach((shelf, index) => {
    session = keys(move(dismiss(session), shelf, shelf === 1 ? 12 : shelf === 2 ? 10 : 8), 'daw');
    down += queued(session).filter(id => id === 'stacks.down').length;
    expect(session.story.flags['stacks.dusted'] === true).toBe(index === 2);
    expect(session.world.flags['stacks.dusted'] === true).toBe(index === 2);
    if (index === 2) expect(queued(session)).toContain('stacks.dusted');
  });
  expect(down).toBe(1);
});
it.each([false, true])('presents every Quire line exclusively when dusted=%s', dusted => {
  let session = dusted ? dismiss(route(start(), stacks.solution.slice(0, -1))) : start();
  session = keys(move(session, 3, 7), '<CR>');
  const id = dusted ? 'stacks.quire-through' : 'stacks.quire-wait';
  expect(queued(session)).toEqual([id]);
  for (const line of content.dialogues.find(item => item.id === id)!.lines) {
    expect(screen(session)).toContain(line.text.replaceAll("'", '&#x27;'));
    session = controller.reduce(session, '<CR>');
  }
  expect(session.story.flags['stacks.through'] === true).toBe(dusted);
  if (dusted) {
    expect(session.queue[0]).toMatchObject({ cutscene: 'stacks.end' });
    expect(screen(session)).toContain('Past the stacks, the reading room.\nChains across the floor, ( to ).');
    expect(screen(controller.reduce(session, '<CR>'))).toContain('To be continued.');
  }
});
it('teaches the HUD objects immediately, rejects insert/change, and keeps earlier stages gated', () => {
  expect(stageCommands(stacks)).toEqual(STACKS_COMMANDS);
  expect(learnedKeycaps({}, false, 'stacks')).toEqual(expect.arrayContaining(['diw', 'daw', '.']));
  for (const input of ['i', 'ciw', 'caw']) {
    const session = keys(start(), input);
    expect(session.world.turn).toBe(0);
    expect(session.world.engine.mode).toBe('normal');
    expect(session.world.engine.lines).toEqual(stacks.map);
  }
  for (const stage of ['counter', 'jetty']) for (const input of ['diw', 'daw']) {
    const before = dismiss(controller.resume({ stage, story: start().story }));
    const after = keys(before, input);
    expect(after.world.turn).toBe(0);
    expect(after.world.engine.lines).toEqual(before.world.engine.lines);
    expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
  }
});
it('Continue restores stacks with story kept', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const session = keys(start(), 'jdaw');
  expect(saveProgress(() => storage, session.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing stacks save');
  const continued = controller.resume(progress);
  expect(continued.world.stage).toBe('stacks');
  expect(continued.story).toEqual(session.stageEntry.story);
  expect(continued.world.engine.lines).toEqual(stacks.map);
});
it('lints with zero issues and stageReplayIssue accepts every bundled solution', () => {
  expect(lintStage(stacks, stacksLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
it('finds no COUNTER_COMMANDS route within 3 turns / 50 expansions in under 3 seconds', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: stacks, legend: stacksLegend });
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => {
    steps += 1;
    return solver.step(...args);
  } };
  const before = performance.now();
  expect(solveStage(observed, stacks, stacksLegend, { learnedCommands: COUNTER_COMMANDS, flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  const elapsed = performance.now() - before;
  expect(steps).toBeGreaterThan(0);
  console.info(`Stacks old-command bound: ${steps} steps, ${elapsed.toFixed(0)} ms`);
});
