import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createWorldSim, playKeys, stageReplayIssue } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { lintStage } from '../../../../tools/maps/lint.js';
import { canopy, canopyLegend, content, ledger, stages } from './content.js';
import { createSession, stageCommands, WORDWOOD_COMMANDS, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { animationSteps } from '../scene/animate.js';
import { readProgress, saveProgress } from './progress.js';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: canopy, legend: canopyLegend };
const controller = createSession({ ...dependencies, stages });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count += 1) {
    if (count > 60) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
function keys(session: Session, route: string): Session {
  return parseKeys(route).reduce((next, key) => controller.reduce(dismiss(next), key), session);
}
const start = () => dismiss(controller.init());
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: canopy, legend: canopyLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));
it('enters Canopy after ledger.end, keeping story and starting the main quest', () => {
  const before = controller.resume({ stage: ledger.id, story: { ...storyEngine.init(content), flags: { 'shaft.mason-cured': true } } });
  const cleared = keys(before, ledger.solution.join(''));
  expect(cleared.world.stage).toBe('ledger');
  expect(cleared.queue[0]).toMatchObject({ cutscene: 'ledger.end' });
  expect(cleared.story.quests['wordwood.ferry']).toEqual({ step: 0, done: false });
  const entered = dismiss(cleared);
  expect(entered.world.stage).toBe('canopy');
  expect(entered.story.flags['shaft.mason-cured']).toBe(true);
  expect(entered.world.entities.some(entity => entity.def.kind === 'dot')).toBe(false);
  expect(screen(entered)).not.toContain('To be continued.');
  expect(screen(entered)).not.toContain('>o</kbd>');
  const finished = keys(entered, canopy.solution.join(''));
  expect(finished.story.quests['wordwood.ferry']).toEqual({ step: 2, done: true });
});
it('Fern teaches once at the edge and later tells the Unwriter story', () => {
  const edge = keys(start(), 'l');
  expect(edge.queue[0]).toMatchObject({ dialogue: 'canopy.fern' });
  const taught = dismiss(edge);
  expect(taught.story.flags['canopy.knows-f']).toBe(true);
  expect(keys(taught, 'hl').queue).toEqual([]);
  const talked = keys(taught, 'h<CR>');
  expect(talked.queue[0]).toMatchObject({ dialogue: 'canopy.fern-again' });
  expect(learnedKeycaps(taught.story.flags)).toEqual(expect.arrayContaining(['f', 'fH']));
});
it('walking into the first gap bumps without a turn or heart cost', () => {
  const edge = dismiss(keys(start(), '5l'));
  expect(edge.world.engine.cursor).toEqual({ line: 1, col: 7 });
  const bumped = keys(edge, 'l');
  expect(bumped.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  expect(bumped.world.turn).toBe(edge.world.turn);
  expect(bumped.world.hearts).toBe(3);
});
it('fH arcs to the far ladder and comma returns across tier B', () => {
  const jumped = keys(start(), 'fH');
  expect(jumped.world.engine.cursor).toEqual({ line: 1, col: 30 });
  expect(animationSteps(jumped.lastEvents)).toContainEqual(expect.objectContaining({ type: 'jump' }));
  const tierB = dismiss(keys(jumped, '2j'));
  expect(tierB.story.flags['canopy.knows-repeat']).toBe(true);
  const backwards = keys(tierB, ',');
  expect(backwards.world.engine.cursor).toEqual({ line: 3, col: 1 });
  expect(keys(backwards, ';').world.engine.cursor).toEqual({ line: 3, col: 30 });
  expect(learnedKeycaps(tierB.story.flags)).toEqual(expect.arrayContaining([';', ',']));
});
it('f@ bumps on thorns, t@ stops on the branch at (5,10)', () => {
  const tierC = dismiss(keys(start(), 'fH2j,2j'));
  expect(tierC.story.flags['canopy.knows-t']).toBe(true);
  expect(learnedKeycaps(tierC.story.flags)).toEqual(expect.arrayContaining(['t', 't@']));
  expect(screen(keys(tierC, 't'))).toContain('t…');
  const bumped = keys(tierC, 'f@');
  expect(bumped.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump' }));
  expect(bumped.world.turn).toBe(tierC.world.turn);
  expect(keys(tierC, 't@').world.engine.cursor).toEqual({ line: 5, col: 10 });
});
it('shows pending f… and failed finds cost no turn', () => {
  const initial = start();
  const pending = keys(initial, 'f');
  expect(screen(pending)).toContain('f…');
  const failed = controller.reduce(pending, 'z');
  expect(failed.lastEvents).toEqual([{ type: 'bump', reason: 'edge', at: canopy.start }]);
  expect(keys(initial, 'f<Esc>').lastEvents).toEqual([]);
  expect(failed.world.turn).toBe(initial.world.turn);
  expect(failed.world.engine.cursor).toEqual(initial.world.engine.cursor);
  expect(animationSteps(failed.lastEvents)).toContainEqual(expect.objectContaining({ type: 'bump' }));
});
it('the learner route clears with all hearts, lift dialogue then canopy.end then Glades', () => {
  const cleared = keys(start(), 'f*;fH2j,2jt@2jfD<CR>');
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.world.turn).toBe(9);
  expect(cleared.world.hearts).toBe(3);
  expect(cleared.story.flags['canopy.down']).toBe(true);
  expect(cleared.queue.map(item => item.type)).toEqual(['dialogue', 'cutscene']);
  expect(cleared.queue[0]).toMatchObject({ dialogue: 'canopy.lift' });
  expect(controller.reduce(cleared, '<CR>').queue[0]).toMatchObject({ cutscene: 'canopy.end' });
  expect(dismiss(cleared).world.stage).toBe('glades');
});
it('Continue restores Canopy entry and :e! restores the current stage', () => {
  const moved = keys(start(), 'fH');
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, moved.stageEntry)).toBe(true);
  const saved = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!saved) throw new Error('Missing Canopy save');
  const restored = dismiss(controller.resume(saved));
  expect(restored.world.stage).toBe('canopy');
  expect(restored.world.engine.cursor).toEqual(canopy.start);
  expect(restored.story).toEqual(moved.stageEntry.story);
  expect(keys(moved, ':e!<CR>').world.engine.cursor).toEqual(canopy.start);
});
it.each(['i', 'o'])('rejects %s in the field, even after learning ledger insert commands', key => {
  const initial = dismiss(controller.resume({ stage: canopy.id, story: { ...storyEngine.init(content), flags: { 'ledger.knows-o': true } } }));
  const rejected = keys(initial, key);
  expect(rejected.world.engine.mode).toBe('normal');
  expect(rejected.world.engine.lines).toEqual(canopy.map);
  expect(rejected.world.turn).toBe(0);
  expect(rejected.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
});
it('Canopy lints with zero issues and the supplied solution replays in seven turns', () => {
  expect(lintStage(canopy, canopyLegend)).toEqual([]);
  const replay = sessionSolver(dependencies);
  expect(stageReplayIssue(replay, canopy, canopyLegend, { learnedCommands: WORDWOOD_COMMANDS, flags: {} })).toBeNull();
  const result = playKeys(replay, canopy, canopyLegend, { learnedCommands: WORDWOOD_COMMANDS, flags: {} }, canopy.solution);
  expect(result.state.hearts).toBe(3);
});
it('stageReplayIssue passes for every bundled stage with its own command set', () => {
  for (const entry of stages) {
    const learnedCommands = stageCommands(entry.stage);
    const replay = sessionSolver({ sim, storyEngine, content, ...entry });
    expect(stageReplayIssue(replay, entry.stage, entry.legend, { learnedCommands, flags: {} }), entry.stage.id).toBeNull();
  }
});

it('edits cannot change the canopy: every Wordwood tile is fixed', () => {
  const atLift = keys(start(), 'fH2j,2jt@2jf*5l');
  for (const input of ['x', '3x', 'rH', 'dd']) {
    const edited = keys(atLift, input);
    expect(edited.world.engine.lines, input).toEqual(canopy.map);
    expect(edited.world.entities.map(entity => entity.id), input).toEqual(expect.arrayContaining(['crack', 'lift', 'scribe-note']));
  }
  expect(keys(start(), 'xfH2j').world.engine.cursor).toEqual({ line: 3, col: 30 });
});
