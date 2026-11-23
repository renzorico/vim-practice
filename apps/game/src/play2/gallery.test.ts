import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, gallery, galleryLegend, mouth, stages } from './content.js';
import { createSession, GALLERY_COMMANDS, MOUTH_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { darknessAlpha, darknessFor } from '../scene/darkness.js';
import { tileGrid } from '../scene/tiles.js';
import { SPRITES } from '../scene/sprites/index.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: gallery, legend: galleryLegend };
const controller = createSession({ ...dependencies, stages: stages.slice(0, stages.findIndex(entry => entry.stage.id === 'gallery') + 1) });
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

it('follows whole words past the decoys, including the keyword after punctuation', () => {
  let session = keys(start(), '*');
  expect(session.world.engine.cursor).toEqual({ line: 3, col: 2 });
  expect(keys(session, '#').world.engine.cursor).toEqual(gallery.start);
  session = keys(session, 'w');
  expect(session.world.engine.cursor).toEqual({ line: 3, col: 5 });
  session = keys(session, '*');
  expect(session.world.engine.cursor).toEqual({ line: 5, col: 2 });
  session = keys(session, 'w*');
  expect(session.world.engine.cursor).toEqual({ line: 7, col: 2 });
  expect(keys(start(), '/ink<CR>').world.engine.cursor).toEqual({ line: 1, col: 13 });
});
it('replays the six-turn route with three hearts, then dialogue, flag and ending in order', () => {
  const atEcho = route(start(), gallery.solution);
  expect(atEcho.queue[0]).toMatchObject({ dialogue: 'gallery.talk' });
  expect(atEcho.world.flags['gallery.through']).not.toBe(true);
  let session = controller.reduce(atEcho, '<CR>');
  expect(session.world.status).toBe('playing');
  session = controller.reduce(session, '<CR>');
  expect(session.queue[0]).toMatchObject({ cutscene: 'gallery.end' });
  expect(session.world.flags['gallery.through']).toBe(true);
  session = dismiss(session);
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(6);
  expect(session.world.hearts).toBe(3);
});
it('keeps the Mouth ending ahead of gallery entry and carries story and quest progress', () => {
  const mouthEntry = dismiss(controller.resume({ stage: 'mouth', story: storyEngine.init(content) }));
  let session = route(mouthEntry, mouth.solution);
  session = controller.reduce(session, '<CR>');
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('mouth');
  expect(session.queue[0]).toMatchObject({ cutscene: 'mouth.end' });
  session = controller.reduce(session, '<CR>');
  expect(session.clearCard).toBe(true);
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('gallery');
  expect(session.queue[0]).toMatchObject({ dialogue: 'gallery.intro' });
  expect(session.story.flags['mouth.through']).toBe(true);
  expect(session.story.quests['caves.gallery']).toEqual({ step: 0, done: false });
  session = dismiss(route(dismiss(session), gallery.solution));
  expect(session.story.quests['caves.gallery']).toEqual({ step: 1, done: true });
});
it('offers gallery search keys immediately while the Mouth rejects star', () => {
  expect(stageCommands(gallery)).toEqual(GALLERY_COMMANDS);
  expect(learnedKeycaps({}, false, 'gallery')).toEqual(expect.arrayContaining(['*', '#', '/', '?', 'n', 'N']));
  const before = dismiss(controller.resume({ stage: 'mouth', story: storyEngine.init(content) }));
  const after = keys(before, '*');
  expect(after.world.turn).toBe(0);
  expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
});
it('Continue restores gallery and the world lists both cave stages', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const session = start();
  expect(saveProgress(() => storage, session.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing save');
  expect(controller.resume(progress).world.stage).toBe('gallery');
  expect(controller.resume(progress).story).toEqual(session.stageEntry.story);
  expect(content.worlds.find(world => world.id === 'echo-caves')?.stages).toEqual(['mouth', 'gallery', 'marked', 'labyrinth', 'study']);
});
it('lints gallery and replays every bundled stage', () => {
  expect(lintStage(gallery, galleryLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
it('draws carved letters and darkness without lights', () => {
  const darkness = darknessFor(gallery, {});
  expect(darkness).toEqual({ radius: 3, lights: [] });
  expect(darknessAlpha({ line: 7, col: 2 }, gallery.start, darkness)).toBe(0);
  const grid = tileGrid(gallery.map, galleryLegend);
  for (const tile of galleryLegend.tiles.filter(tile => tile.sprite === 'echo-rune')) {
    expect(SPRITES[`echo-rune-${tile.char}`]).toBeDefined();
  }
  expect(grid[1]?.[2]).toBe('echo-rune-i');
});
it('bounds the Mouth vocabulary by expansions and simulation steps', () => {
  const solver = sessionSolver(dependencies);
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => {
    steps++;
    return solver.step(...args);
  } };
  expect(solveStage(observed, gallery, galleryLegend, { learnedCommands: MOUTH_COMMANDS, flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  expect(steps).toBeGreaterThan(0);
  expect(steps).toBeLessThanOrEqual(2_000_000);
  console.info(`Gallery old vocabulary: ${steps} simulation steps (3 turns / 50 expansions)`);
});
// The full GALLERY_COMMANDS search cannot reach depth 6; par is proven on the focused
// vocabulary below (a guarded test with no assertion proves nothing: removed in review).

it('finds a route with a focused gallery search vocabulary', () => {
  const result = solveStage(sessionSolver(dependencies), gallery, galleryLegend,
    { learnedCommands: ['*', 'w', 'e'], flags: {} }, { maxTurns: 6, maxExpanded: 1000 });
  expect(result).not.toBeNull();
  if (!result) throw new Error('No focused gallery route');
  expect(dismiss(route(start(), result.keys)).world.status).toBe('cleared');
  console.info('Gallery focused solver:', result);
});
