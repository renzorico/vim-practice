import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { archive, archiveLegend, content, notary, notaryLegend, stages } from './content.js';
import { ARCHIVE_COMMANDS, NOTARY_COMMANDS, createSession, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { notaryClauses } from './NotaryGauge.js';
import { readProgress, saveProgress } from './progress.js';
import { bufferSize, cameraTarget } from '../scene/camera.js';
import { counterStamp } from '../scene/counterStamp.js';
import { jettyDeletion } from '../scene/jettyDeletion.js';
import { SPRITES } from '../scene/sprites/index.js';
import { plainText, visibleText } from '../test-utils/visibleText';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: notary, legend: notaryLegend });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard) && next.world.status !== 'dead'; count++) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const start = () => dismiss(controller.init());
const keys = (session: Session, input: string) => parseKeys(input).reduce(controller.reduce, session);
const route = (session: Session, input: readonly string[]) => input.reduce((current, key) =>
  current.world.status === 'dead' || current.queue.some(item => item.type === 'dialogue' && item.dialogue === 'notary.fuse')
    ? current : controller.reduce(dismiss(current), key), session);
const markup = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: notary, legend: notaryLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));

it('opens the six locks in 23 turns with 3 hearts and 5 clauses', () => {
  const session = route(start(), notary.solution);
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(23);
  expect(notary.parTurns).toBe(23);
  expect(session.world.hearts).toBe(3);
  expect(notaryClauses(session.world)).toBe(5);
  expect(session.world.engine.lines.slice(2, 13)).toEqual([
    '.......#', '.############', '.......#', '.############', '.<w></w>.#', '.############',
    '.[]......#', '.############', '.{}......#', '.############', '..#',
  ]);
  expect(session.queue).toEqual([
    { type: 'dialogue', dialogue: 'notary.open', index: 0 },
    { type: 'cutscene', cutscene: 'notary.end', index: 0 },
  ]);
  expect(session.story.statues).not.toContain('Q');
  const end = dismiss(session);
  expect(end.story.statues).toContain('Q');
  expect(end.world.stage).toBe('contract');
  expect(end.world.script?.id).toBe('contract.book');
});

it('lands inside locks; deletes around brackets, inside tags, but leaves [] with di[', () => {
  const inside = keys(start(), 'jw');
  expect(inside.world.engine.cursor).toEqual({ line: 2, col: 2 });
  const lock = keys(inside, 'da[');
  expect(lock.world.engine.lines[2]).toBe('.......#');
  expect(jettyDeletion(lock.world, lock.lastEvents)).toMatchObject({ line: 2, col: 1, junk: '[kkk]' });
  const seal = keys(lock, '02jwda{');
  expect(seal.world.engine.lines[4]).toBe('.......#');
  expect(jettyDeletion(seal.world, seal.lastEvents)?.junk).toBe('{kkk}');
  const tag = keys(seal, '02jwdit');
  expect(tag.world.engine.lines[6]).toBe('.<w></w>.#');
  expect(jettyDeletion(tag.world, tag.lastEvents)?.junk).toBe('wwww');
  const inner = route(start(), parseKeys('jwdi[02jwda{02jwdit'));
  expect(inner.world.engine.lines[2]).toBe('.[]......#');
  expect(inner.world.status).toBe('playing');
});

it('keeps the lock and seal with di[ / di{, and removes the whole tag with dat', () => {
  const lock = keys(start(), 'jw' + 'da[02jwda{02jwdit02jwdi[');
  expect(lock.world.engine.lines[8]).toBe('.[]......#');
  expect(jettyDeletion(lock.world, lock.lastEvents)?.junk).toBe('kkk');
  const seal = keys(lock, '02jwdi{');
  expect(seal.world.engine.lines[10]).toBe('.{}......#');
  const tag = keys(seal, '02jwdat');
  expect(tag.world.engine.lines[12]).toBe('..#');
  // The splash planner (scene/jettyDeletion.ts) does not match whole tags yet, so no splash plan.
  expect(jettyDeletion(tag.world, tag.lastEvents)).toBeNull();
  expect(tag.world.status).toBe('cleared');
});

it.each(['k', 'gg'])('cannot reach the Notary with %s', input => {
  const session = keys(start(), input);
  expect(session.world.engine.cursor).toEqual(notary.start);
  expect(session.world.turn).toBe(0);
  expect(session.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump' }));
});

it('2G stays on the supplied walkable start row rather than reaching the desk', () => {
  const session = keys(start(), '2G');
  expect(session.world.engine.cursor).toEqual(notary.start);
  expect(session.world.turn).toBe(1);
  expect(session.world.hearts).toBe(3);
});

it('a stalled run loses on turn 28, repeats its fuse line, and retries cleanly', () => {
  const stall = parseKeys('jk'.repeat(14));
  let attempt = start();
  for (let index = 0; index < 2; index++) {
    const fused = route(attempt, stall);
    expect(fused.world.turn).toBe(28);
    expect(fused.queue[0]).toMatchObject({ dialogue: 'notary.fuse' });
    expect(markup(fused)).toContain('Seven. Signed and sealed.');
    const dead = dismiss(fused);
    expect(dead.world.hearts).toBe(0);
    expect(dead.world.status).toBe('dead');
    expect(visibleText(markup(dead))).toContain(plainText('Each row: `0` `2j` `w`, then the edit.'));
    attempt = controller.reduce(dead, 'j');
    expect(attempt.world.engine.lines).toEqual(notary.map);
    expect(attempt.world.turn).toBe(0);
    expect(attempt.world.hearts).toBe(3);
    expect(notaryClauses(attempt.world)).toBe(0);
  }
});

it('idle turns fill the gauge and fuse at 28; signing slides one whole clause', () => {
  let session = start();
  for (let turn = 1; turn <= 28; turn++) {
    const before = session;
    session = keys(session, turn % 2 ? 'j' : 'k');
    expect(notaryClauses(session.world)).toBe(Math.floor(turn / 4));
    expect(markup(session)).toContain('Clauses ' + Math.floor(turn / 4) + '/7');
    expect(counterStamp(before.world, session.world, session.lastEvents)).toEqual(turn % 4 ? null
      : { entity: 'notary', line: 0, col: 2, length: 4 });
  }
  expect(markup(session)).toContain('data-full="true"');
  expect(dismiss(session).world.status).toBe('dead');
});

it('clear wins on clause seven: no fuse line or damage; Q lights only after the ending', () => {
  // Five safe turns (two stair trips and a `2G` on the start row) delay the 23-turn route until turn 28.
  const session = route(keys(start(), 'jkjk2G'), notary.solution);
  expect(session.world.turn).toBe(28);
  expect(notaryClauses(session.world)).toBe(7);
  expect(session.world.status).toBe('cleared');
  expect(session.queue.some(item => item.type === 'dialogue' && item.dialogue === 'notary.fuse')).toBe(false);
  expect(session.story.statues).not.toContain('Q');
  expect(dismiss(session).story.statues).toContain('Q');
  expect(dismiss(session).world.hearts).toBe(3);
});

it('archive ending enters Notary with story and quest; Continue restores the castle', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: archive, legend: archiveLegend });
  let session = route(dismiss(previous.init()), archive.solution);
  expect(session.world.stage).toBe('archive');
  expect(session.queue).toContainEqual({ type: 'cutscene', cutscene: 'archive.end', index: 0 });
  session = dismiss(session);
  expect(session.world.stage).toBe('notary');
  expect(session.story.clearedStages).toContain('archive');
  expect(session.story.flags['archive.through']).toBe(true);
  expect(session.story.quests['library.notary']).toEqual({ step: 0, done: false });
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  saveProgress(() => storage, session.stageEntry);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing save');
  const resumed = controller.resume(progress);
  expect(resumed.world.stage).toBe('notary');
  expect(resumed.world.engine.lines).toEqual(notary.map);
  expect(dismiss(route(dismiss(resumed), notary.solution)).story.quests['library.notary']?.done).toBe(true);
  expect(content.worlds.find(world => world.id === 'library')).toMatchObject({
    stages: ['stacks', 'reading', 'archive', 'notary', 'contract'], castle: 'notary', statue: 'Q',
  });
});

it('gates objects to Notary, exposes keycaps, and keeps the keeper in view horizontally', () => {
  expect(stageCommands(notary)).toEqual(NOTARY_COMMANDS);
  expect(learnedKeycaps({}, false, 'notary')).toEqual(expect.arrayContaining(['da[', 'da{', 'dit']));
  for (const input of ['da[', 'dit']) {
    const previous = createSession({ sim, storyEngine, content, stage: archive, legend: archiveLegend });
    const rejected = keys(dismiss(previous.init()), input);
    expect(rejected.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
  }
  const session = route(start(), notary.solution);
  const keeper = session.world.entities.find(entity => entity.id === 'notary')!;
  const target = cameraTarget(bufferSize(session.world.engine.lines), { width: 480, height: 384 }, session.world.engine.cursor, 3, 0, keeper.at);
  for (const cell of [session.world.engine.cursor, keeper.at]) {
    expect((cell.col + 0.5) * 16).toBeGreaterThanOrEqual(target.x - 80);
    expect((cell.col + 0.5) * 16).toBeLessThanOrEqual(target.x + 80);
  }
});

it('lints Notary, supplies every sprite, and passes all stage replays', () => {
  expect(lintStage(notary, notaryLegend)).toEqual([]);
  for (const sprite of [...notaryLegend.tiles.map(tile => tile.sprite), ...notary.entities.map(entity => entity.sprite)]) {
    expect(SPRITES[sprite], sprite).toBeDefined();
  }
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});

it('finds no Archive-command solution within 3 turns / 50 expansions', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: notary, legend: notaryLegend });
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => { steps++; return solver.step(...args); } };
  expect(solveStage(observed, notary, notaryLegend, { learnedCommands: ARCHIVE_COMMANDS, flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  expect(steps).toBeGreaterThan(0);
  console.info('Notary Archive-command bound: ' + steps + ' engine steps');
}, 15_000);
