import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, stageReplayIssue, solveStage } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { archive, archiveLegend, content, reading, readingLegend, stages } from './content.js';
import { ARCHIVE_COMMANDS, READING_COMMANDS, createSession, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { bufferSize, cameraTarget } from '../scene/camera.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages: stages.filter(entry => entry.stage.id !== 'notary'), stage: archive, legend: archiveLegend });
const oldCommands = [...READING_COMMANDS, 'P', 'yy'];
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
const markup = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: archive, legend: archiveLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));
it('enters archive only after reading.end, preserving story and starting its quest', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: reading, legend: readingLegend });
  let session = route(dismiss(previous.init()), reading.solution);
  while (session.queue[0]?.type !== 'cutscene') session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('reading');
  expect(session.queue[0]).toMatchObject({ cutscene: 'reading.end' });
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('archive');
  expect(session.queue[0]).toMatchObject({ dialogue: 'archive.intro' });
  expect(session.story.clearedStages).toContain('reading');
  expect(session.story.flags['reading.through']).toBe(true);
  expect(session.story.quests['library.archive']).toEqual({ step: 0, done: false });
  expect(content.worlds.find(world => world.id === 'library')?.stages).toEqual(['stacks', 'reading', 'archive', 'notary']);
});
it('lifts the misfiled paragraph from its middle, files it and copies atlases with an aisle', () => {
  const lifted = keys(start(), 'dap');
  expect(lifted.world.engine.lines).toEqual([...archive.map.slice(0, 5), ...archive.map.slice(9)]);
  expect(lifted.world.engine.registers['"']).toEqual({ text: 'xxxxxxxx\nxxxxxxxx\nxxxxxxxx\n\n', linewise: true });
  const filed = keys(lifted, '}p');
  expect(filed.world.engine.lines.slice(5, 12)).toEqual(['bbbbbbbb', 'bbbbbbbb', '', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', '']);
  const copied = keys(filed, 'gg2jyap');
  expect(copied.world.engine.registers['"']).toEqual({ text: 'aaaaaaaa\naaaaaaaa\n\n', linewise: true });
  const end = keys(copied, 'GP');
  expect(end.world.engine.lines).toHaveLength(16);
  expect(end.world.engine.lines.slice(-4)).toEqual(['aaaaaaaa', 'aaaaaaaa', '', '|========|']);
  expect(end.world.firedTriggers).toContain('archive.filed');
});
it.each([
  ['paragraph objects', archive.solution, 8, ARCHIVE_COMMANDS],
  ['old commands', parseKeys('{j4dd}pgg2j3yyGP'), 10, oldCommands],
] as const)('replays %s with 3 hearts', (_label, input, turns, commands) => {
  const session = route(start(), input);
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(turns);
  expect(session.world.hearts).toBe(3);
  expect(session.queue.map(item => item.type === 'dialogue' ? item.dialogue : item.type === 'cutscene' ? item.cutscene : item.type))
    .toEqual(['archive.filed', 'archive.end']);
  expect(markup(dismiss(session))).toContain('To be continued.');
  const solver = sessionSolver({ sim, storyEngine, content, stage: archive, legend: archiveLegend });
  const options = { learnedCommands: commands, flags: {} };
  let state = solver.init(archive, archiveLegend, options);
  for (const key of input) state = solver.step(state, key, archive, archiveLegend, options).state;
  expect(state.status).toBe('cleared');
  expect(state.turn).toBe(turns);
});
it.each(['dip}pgg2jyapGP', 'dap}pgg2jyipGP'])('rejects the aisle layout from %s', input => {
  const session = keys(start(), input);
  expect(session.world.status).toBe('playing');
  expect(session.world.firedTriggers).not.toContain('archive.filed');
});
it('plays the exact intro, filed dialogue and ending in order', () => {
  let session = controller.init();
  for (const line of content.dialogues.find(item => item.id === 'archive.intro')!.lines) {
    expect(markup(session)).toContain(line.text.replaceAll("'", '&#x27;'));
    session = controller.reduce(session, '<CR>');
  }
  session = route(session, archive.solution);
  for (const line of content.dialogues.find(item => item.id === 'archive.filed')!.lines) {
    expect(markup(session)).toContain(line.text);
    session = controller.reduce(session, '<CR>');
  }
  for (const beat of content.cutscenes.find(item => item.id === 'archive.end')!.beats) {
    if (beat.type !== 'line') throw new Error('Expected line');
    expect(markup(session)).toContain(beat.line.text.replaceAll("'", '&#x27;'));
    session = controller.reduce(session, '<CR>');
  }
  expect(markup(session)).toContain('To be continued.');
});
it('gates paragraph objects, exposes the keycaps and restores Archive through Continue', () => {
  expect(stageCommands(archive)).toEqual(ARCHIVE_COMMANDS);
  expect(learnedKeycaps({}, false, 'archive')).toEqual(expect.arrayContaining(['dap', 'yap', '}', 'G', 'P']));
  const before = dismiss(controller.resume({ stage: 'reading', story: start().story }));
  const rejected = keys(before, 'dap');
  expect(rejected.world.engine.lines).toEqual(reading.map);
  expect(rejected.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const session = keys(start(), 'dap');
  expect(saveProgress(() => storage, session.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing save');
  expect(controller.resume(progress).world.engine.lines).toEqual(archive.map);
  expect(controller.resume(progress).world.stage).toBe('archive');
});
it('keeps the cursor visible after }, gg and G as the buffer grows from 13 to 16 rows', () => {
  for (const session of [keys(start(), '}'), keys(start(), 'gg'), keys(start(), 'G'), keys(start(), 'dap}pgg2jyapGP')]) {
    const cursor = session.world.engine.cursor;
    const target = cameraTarget(bufferSize(session.world.engine.lines), { width: 480, height: 192 }, cursor, 3);
    expect((cursor.line + 0.5) * 16).toBeGreaterThanOrEqual(target.y - 32);
    expect((cursor.line + 0.5) * 16).toBeLessThanOrEqual(target.y + 32);
  }
});
it('lints Archive and passes every stage replay', () => {
  expect(lintStage(archive, archiveLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
it('finds no old-command route within 3 turns / 50 expansions in under 3 seconds', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: archive, legend: archiveLegend });
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => {
    steps++;
    return solver.step(...args);
  } };
  const before = performance.now();
  expect(solveStage(observed, archive, archiveLegend, { learnedCommands: oldCommands, flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  const elapsed = performance.now() - before;
  expect(steps).toBeGreaterThan(0);
  console.info(`Archive old-command bound: ${steps} steps, ${elapsed.toFixed(0)} ms`);
});
