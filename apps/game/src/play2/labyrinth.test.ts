import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, labyrinth, labyrinthLegend, marked, stages } from './content.js';
import { createSession, LABYRINTH_COMMANDS, MARKED_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { hoofprints } from './HoofprintGauge.js';
import { readProgress, saveProgress } from './progress.js';
import { darknessFor } from '../scene/darkness.js';
import { tileGrid } from '../scene/tiles.js';
import { SPRITES } from '../scene/sprites/index.js';
import { plainText, visibleText } from '../test-utils/visibleText';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: labyrinth, legend: labyrinthLegend };
const controller = createSession({ ...dependencies, stages });
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
  current.world.status === 'dead' || current.queue.some(item => item.type === 'dialogue' && item.dialogue === 'labyrinth.fuse')
    ? current : controller.reduce(dismiss(current), key), session);
const markup = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: labyrinth, legend: labyrinthLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));
const flags = (session: Session) => ['x', 'y', 'z'].map(rune => Boolean(session.story.flags[`labyrinth.${rune}`]));

it('replays ma ?x ?y ?z `a in five turns, three hearts and two prints; A lights after the ending', () => {
  const result = route(start(), labyrinth.solution);
  expect(result.world.status).toBe('cleared');
  expect(result.world.turn).toBe(5);
  expect(result.world.hearts).toBe(3);
  expect(hoofprints(result.world)).toBe(2);
  expect(flags(result)).toEqual([true, true, true]);
  expect(result.queue).toEqual([{ type: 'dialogue', dialogue: 'labyrinth.home', index: 0 },
    { type: 'cutscene', cutscene: 'labyrinth.end', index: 0 }]);
  expect(result.story.statues).not.toContain('A');
  const end = dismiss(result);
  expect(end.story.statues).toContain('A');
  expect(end.world.stage).toBe('study');
  expect(end.world.script?.id).toBe('study.book');
});
it('clears with forward search plus n in eight turns and four prints', () => {
  const result = route(start(), parseKeys('ma/x<CR>n/y<CR>n/z<CR>n`a'));
  expect(result.world.status).toBe('cleared');
  expect(result.world.turn).toBe(8);
  expect(result.world.hearts).toBe(3);
  expect(hoofprints(result.world)).toBe(4);
});
it('finds the real x behind the stair and a false x ahead; only real runes light', () => {
  const real = keys(start(), 'ma?x<CR>');
  expect(real.world.engine.marks.a).toEqual(labyrinth.start);
  expect(real.world.engine.cursor).toEqual({ line: 4, col: 8 });
  expect(flags(real)).toEqual([true, false, false]);
  expect(real.queue[0]).toMatchObject({ dialogue: 'labyrinth.lever-x' });
  const falseX = keys(start(), '/x<CR>');
  expect(falseX.world.engine.cursor).toEqual({ line: 2, col: 2 });
  expect(flags(falseX)).toEqual([false, false, false]);
  // False copies of y and z do not satisfy their real-cell triggers either.
  expect(flags(route(real, parseKeys('/y<CR>/z<CR>')))).toEqual([true, false, false]);
});
it('lights levers only in order, wraps backward to z, and requires a return to the stair', () => {
  let session = route(start(), parseKeys('ma?y<CR>?z<CR>'));
  expect(flags(session)).toEqual([false, false, false]);
  session = route(session, parseKeys('`a?x<CR>?y<CR>?z<CR>'));
  expect(session.world.engine.cursor).toEqual({ line: 8, col: 2 });
  expect(flags(session)).toEqual([true, true, true]);
  expect(session.world.status).toBe('playing');
  expect(keys(dismiss(session), '`a').world.status).toBe('cleared');
});
it('all real and false rune chambers are sealed against walking, gg and G', () => {
  // Use the real simulation; deduplicate positions so the fuse cannot hide reachability.
  for (const input of ['?x<CR>', '?y<CR>', '?z<CR>', '/x<CR>', '/y<CR>', '/z<CR>']) {
    const pocket = dismiss(keys(start(), input));
    const pending = [pocket];
    const visited = new Set<string>();
    while (pending.length) {
      const session = pending.pop()!;
      const at = session.world.engine.cursor;
      const id = `${at.line}:${at.col}`;
      if (visited.has(id)) continue;
      visited.add(id);
      expect(at.line).toBe(pocket.world.engine.cursor.line);
      expect(Math.abs(at.col - pocket.world.engine.cursor.col)).toBeLessThanOrEqual(1);
      for (const command of ['gg', 'G', '0']) expect(keys(session, command).world.engine.cursor).toEqual(at);
      for (const command of ['h', 'j', 'k', 'l']) pending.push(keys(session, command));
    }
    expect(visited.size).toBe(3);
  }
});
it('loses without a mark on turn 12; each retry resets levers, marks, story reactions and prints', () => {
  let attempt = start();
  for (let index = 0; index < 2; index++) {
    let session = dismiss(keys(attempt, '?x<CR>'));
    expect(flags(session)).toEqual([true, false, false]);
    for (let turn = 2; turn <= 12; turn++) session = keys(session, turn % 2 ? 'l' : 'h');
    expect(session.world.turn).toBe(12);
    expect(session.queue[0]).toMatchObject({ dialogue: 'labyrinth.fuse' });
    expect(markup(session)).toContain('Hooves, right behind you. He found you.');
    session = controller.reduce(session, '<CR>');
    expect(markup(session)).toContain('...walked too far. ...too far.');
    const dead = dismiss(session);
    expect(dead.world.status).toBe('dead');
    expect(dead.world.hearts).toBe(0);
    expect(visibleText(markup(dead))).toContain(plainText('Mark the stair: `ma`. Search each rune: `?x`,'));
    attempt = controller.reduce(dead, 'j');
    expect(attempt.world.turn).toBe(0);
    expect(attempt.world.hearts).toBe(3);
    expect(attempt.world.engine.lines).toEqual(labyrinth.map);
    expect(attempt.world.engine.cursor).toEqual(labyrinth.start);
    expect(attempt.world.engine.marks).toEqual({});
    expect(flags(attempt)).toEqual([false, false, false]);
    expect(hoofprints(attempt.world)).toBe(0);
  }
  expect(route(attempt, labyrinth.solution).world.status).toBe('cleared');
});
it('fills six gauge slots on idle turns and narrates death at turn 12', () => {
  let session = start();
  for (let turn = 1; turn <= 12; turn++) {
    session = keys(session, turn % 2 ? 'k' : 'j');
    expect(session.world.turn).toBe(turn);
    expect(hoofprints(session.world)).toBe(Math.floor(turn / 2));
    expect(markup(session)).toContain(`Hoofprints ${Math.floor(turn / 2)}/6`);
  }
  expect(markup(session)).toContain('data-full="true"');
  expect(dismiss(session).world.status).toBe('dead');
});
it('clearing on print six wins over the fuse', () => {
  // Six safe movements and an extra mark before the five-turn solution: all complete on turn 12.
  const result = route(keys(start(), 'kjkjkjma'), labyrinth.solution);
  expect(result.world.turn).toBe(12);
  expect(hoofprints(result.world)).toBe(6);
  expect(result.world.status).toBe('cleared');
  expect(result.world.hearts).toBe(3);
  expect(result.queue.some(item => item.type === 'dialogue' && item.dialogue === 'labyrinth.fuse')).toBe(false);
  expect(dismiss(result).story.statues).toContain('A');
});
it('restarts a partial attempt cleanly with :e!', () => {
  const reset = keys(dismiss(keys(start(), 'ma?x<CR>')), ':e!<CR>');
  expect(reset.world.engine.lines).toEqual(labyrinth.map);
  expect(reset.world.engine.marks).toEqual({});
  expect(flags(reset)).toEqual([false, false, false]);
  expect(route(reset, labyrinth.solution).world.status).toBe('cleared');
});
it('marked leads into labyrinth, keeping story and starting the main quest; Continue restores it', () => {
  let session = dismiss(controller.resume({ stage: 'marked', story: storyEngine.init(content) }));
  session = dismiss(route(session, marked.solution));
  expect(session.world.stage).toBe('labyrinth');
  expect(session.story.clearedStages).toContain('marked');
  expect(session.story.flags['marked.through']).toBe(true);
  expect(session.story.quests['caves.labyrinth']).toEqual({ step: 0, done: false });
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  saveProgress(() => storage, session.stageEntry);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing save');
  session = dismiss(controller.resume(progress));
  expect(session.world.stage).toBe('labyrinth');
  expect(session.world.engine.lines).toEqual(labyrinth.map);
  const end = dismiss(route(session, labyrinth.solution));
  expect(end.story.quests['caves.labyrinth']?.done).toBe(true);
  expect(content.worlds.find(world => world.id === 'echo-caves')).toMatchObject({
    stages: ['mouth', 'gallery', 'marked', 'labyrinth', 'study'], castle: 'labyrinth', statue: 'A',
  });
});
it('inherits the marked commands and keycaps, uses darker caves, and supplies distinct rune art', () => {
  expect(stageCommands(labyrinth)).toBe(LABYRINTH_COMMANDS);
  expect(LABYRINTH_COMMANDS).toBe(MARKED_COMMANDS);
  expect(learnedKeycaps({}, false, 'labyrinth')).toEqual(expect.arrayContaining(['ma', '`a', '?']));
  expect(darknessFor(labyrinth, {})).toEqual({ radius: 2, lights: [] });
  expect(darknessFor(labyrinth, { 'labyrinth.x': true })).toEqual({ radius: 2, lights: [{ line: 4, col: 8 }] });
  const tiles = tileGrid(labyrinth.map, labyrinthLegend);
  for (const [line, col, rune] of [[4, 8, 'x'], [2, 9, 'y'], [8, 2, 'z']] as const) {
    expect(tiles[line]?.[col]).toBe(`rune-lever-${rune}`);
    expect(SPRITES[`rune-lever-${rune}-lit`]).toBeDefined();
  }
  expect(SPRITES['rune-lever-x']).not.toEqual(SPRITES['rune-lever-y']);
  expect(SPRITES['rune-lever-y']).not.toEqual(SPRITES['rune-lever-z']);
});
it('lints labyrinth with no errors and replays every bundled stage', () => {
  expect(lintStage(labyrinth, labyrinthLegend)).toEqual([]);
  for (const sprite of [...labyrinthLegend.tiles.map(tile => tile.sprite), ...labyrinth.entities.map(entity => entity.sprite)]) {
    expect(SPRITES[sprite], sprite).toBeDefined();
  }
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
it('finds no route without ? within 3 turns / 50 expansions, counted by simulation steps', () => {
  const solver = sessionSolver(dependencies);
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => { steps++; return solver.step(...args); } };
  expect(solveStage(observed, labyrinth, labyrinthLegend, { learnedCommands: MARKED_COMMANDS.filter(command => command !== '?'), flags: {} },
    { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  expect(steps).toBeGreaterThan(0);
  console.info(`Labyrinth without ?: ${steps} simulation steps (3 turns / 50 expansions)`);
});
it('keeps the supplied dialogue and ending wording, including line breaks', () => {
  const lines = (id: string) => content.dialogues.find(dialogue => dialogue.id === `labyrinth.${id}`)?.lines;
  expect(lines('intro')).toEqual([
    { speaker: 'system', text: 'The labyrinth. You need three levers pulled,\nthen the stair. Hooves, getting closer.' },
    { speaker: 'system', text: 'On the stair, press `ma`: it marks the way home.\nLater, `` `a `` brings you back.' },
  ]);
  for (const [id, text] of [
    ['lever-x', 'The first lever drops. Far off, a grind.'],
    ['lever-y', 'The second lever. The grind gets louder.'],
    ['lever-z', 'The third. Now home, before he finds you.'],
    ['home', 'The stair shudders. A way down opens\nbehind it, and the hooves stop.'],
    ['death-hint', 'Mark the stair: `ma`. Search each rune: `?x`,\n`?y`, `?z` (+ `Enter`). Home: `` `a ``.'],
  ] as const) expect(lines(id)).toEqual([{ speaker: 'system', text }]);
  expect(content.cutscenes.find(scene => scene.id === 'labyrinth.end')).toEqual({
    id: 'labyrinth.end', beats: [
      { type: 'title', text: 'Behind the stair, a door. On it, carved:' },
      { type: 'title', text: 'The Scribe is in another buffer.' },
      { type: 'line', line: { speaker: 'npc', name: 'Echo', text: '...the Minotaur never caught the Scribe either.\nThe Scribe never walked. Only searched.' } },
      { type: 'line', line: { speaker: 'system', text: 'One letter under the carving: A.' } },
      { type: 'line', line: { speaker: 'npc', name: 'Dot', text: 'Almost. ...almost.' } },
    ], then: [{ type: 'light-statue', letter: 'A' }],
  });
});
