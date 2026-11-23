import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, mouth, mouthLegend, stages } from './content.js';
import { createSession, MOUTH_COMMANDS, NOTARY_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: mouth, legend: mouthLegend };
const controller = createSession({ ...dependencies, stages: stages.slice(0, stages.findIndex(entry => entry.stage.id === 'mouth') + 1) });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length; count++) {
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
  session, stage: mouth, legend: mouthLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));
it('searches deepest first, repeats backwards and clears in four turns with three hearts', () => {
  let session = keys(start(), '?x');
  expect(session.world.engine.commandLine).toBe('?x');
  expect(screen(session)).toContain('?x');
  for (const [input, line, col, flag] of [['<CR>', 5, 14, 'deep'], ['n', 3, 13, 'middle'], ['n', 1, 13, 'top']] as const) {
    session = keys(dismiss(session), input);
    expect(session.world.engine.cursor).toEqual({ line, col });
    expect(session.world.flags['mouth.' + flag]).toBe(true);
    expect(queued(session)).toEqual(['mouth.lit-' + flag]);
  }
  session = dismiss(route(session, parseKeys('l<CR>')));
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(4);
  expect(session.world.hearts).toBe(3);
  expect(screen(session)).toContain('To be continued.');
});
it('does not consume out-of-order triggers, and N reverses a forward search', () => {
  let session = keys(start(), '/x<CR>');
  expect(session.world.engine.cursor).toEqual({ line: 1, col: 13 });
  expect(session.world.flags['mouth.top']).not.toBe(true);
  expect(session.world.firedTriggers).not.toContain('mouth.top');
  expect(queued(session)).toEqual([]);
  session = keys(session, 'N');
  expect(session.world.engine.cursor).toEqual({ line: 5, col: 14 });
  session = keys(dismiss(session), 'N');
  session = keys(dismiss(session), 'N');
  expect(session.world.flags['mouth.top']).toBe(true);
});
it.each([false, true])('shows every Echo line exclusively with top lit=%s', lit => {
  let session = lit ? dismiss(route(start(), mouth.solution.slice(0, -1))) : keys(start(), '/x<CR>l');
  session = keys(session, '<CR>');
  const id = lit ? 'mouth.echo-through' : 'mouth.echo-wait';
  expect(queued(session)).toEqual([id]);
  for (const line of content.dialogues.find(item => item.id === id)!.lines) {
    expect(screen(session)).toContain(line.text.replaceAll("'", '&#x27;'));
    session = controller.reduce(session, '<CR>');
  }
  expect(session.story.flags['mouth.through'] === true).toBe(lit);
  if (lit) expect(session.queue[0]).toMatchObject({ cutscene: 'mouth.end' });
});
it('gates search to the Mouth and keeps insert out of field stages', () => {
  expect(stageCommands(mouth)).toEqual(MOUTH_COMMANDS);
  expect(learnedKeycaps({}, false, 'mouth')).toEqual(expect.arrayContaining(['/', '?', 'n', 'N']));
  for (const stage of ['notary', 'jetty']) {
    const before = dismiss(controller.resume({ stage, story: start().story }));
    // The engine checks the allowlist when the search is submitted.
    const after = keys(before, '/x<CR>');
    expect(after.world.engine.mode).toBe('normal');
    expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
    expect(after.world.turn).toBe(0);
    expect(after.world.engine.lastSearch).toBeNull();
  }
  for (const input of ['i', 'ciw']) {
    const session = keys(start(), input);
    expect(session.world.engine.mode).toBe('normal');
    expect(session.world.engine.lines).toEqual(mouth.map);
  }
});
it('Continue restores the Mouth and lists the sixth world', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const session = start();
  expect(saveProgress(() => storage, session.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing save');
  expect(controller.resume(progress).world.stage).toBe('mouth');
  expect(controller.resume(progress).story).toEqual(session.stageEntry.story);
  expect(content.worlds.find(world => world.id === 'echo-caves')).toEqual({
    id: 'echo-caves', order: 6, name: 'The Echo Caves', stages: ['mouth', 'gallery', 'marked', 'labyrinth', 'study'], castle: 'labyrinth', statue: 'A',
  });
});
it('lints and replays every bundled stage', () => {
  expect(lintStage(mouth, mouthLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
it('bounds the old vocabulary by expansions and counts simulation steps', () => {
  const solver = sessionSolver(dependencies);
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => {
    steps++;
    return solver.step(...args);
  } };
  expect(solveStage(observed, mouth, mouthLegend, { learnedCommands: NOTARY_COMMANDS, flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  expect(steps).toBeGreaterThan(0);
  expect(steps).toBeLessThanOrEqual(1_200_000);
  console.info(`Mouth old vocabulary: ${steps} simulation steps (3 turns / 50 expansions)`);
});
// The full MOUTH_COMMANDS search exhausts memory before depth 4; par is proven on the
// focused vocabulary below (a test must not pin a solver limit: it would break when the solver improves).
it('finds and replays a four-turn route with a focused search vocabulary', () => {
  const result = solveStage(sessionSolver(dependencies), mouth, mouthLegend,
    { learnedCommands: ['?', 'n', 'l'], flags: {} }, { maxTurns: 4, maxExpanded: 1000 });
  expect(result).not.toBeNull();
  if (!result) throw new Error('No focused route');
  expect(result.turns).toBe(4);
  expect(dismiss(route(start(), result.keys)).world.status).toBe('cleared');
  console.info('Mouth focused solver:', result);
});

it('seals every crystal and the Echo off from walking', () => {
  const reachable = new Set<string>();
  const pending = [mouth.start];
  while (pending.length) {
    const at = pending.pop()!;
    const key = `${at.line}:${at.col}`;
    if (reachable.has(key)) continue;
    const char = mouth.map[at.line]?.[at.col];
    if (!char || !(mouthLegend.tiles.find(tile => tile.char === char) ?? mouthLegend.fallback).walkable) continue;
    reachable.add(key);
    for (const [line, col] of [[at.line - 1, at.col], [at.line + 1, at.col], [at.line, at.col - 1], [at.line, at.col + 1]]) {
      pending.push({ line: line!, col: col! });
    }
  }
  for (const cell of ['5:14', '3:13', '1:13', '1:14', '1:15']) expect(reachable.has(cell)).toBe(false);
});
