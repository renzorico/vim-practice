import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, customs, customsLegend, warehouse, warehouseLegend, stages } from './content.js';
import { createSession, CUSTOMS_COMMANDS, WAREHOUSE_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { saveProgress, readProgress } from './progress.js';
import { warehouseTransfer } from '../scene/warehouseTransfer.js';
import { jettyDeletion } from '../scene/jettyDeletion.js';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: customs, legend: customsLegend });
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
const route = (session: Session, input: string) => parseKeys(input).reduce((s, key) => controller.reduce(dismiss(s), key), session);
function move(session: Session, line: number, col: number): Session {
  const result = sim.apply(session.world, [{ type: 'move-player', to: { line, col } }], customs, customsLegend);
  return { ...session, world: result.state, lastEvents: result.events };
}
const queued = (s: Session) => s.queue.flatMap(item => item.type === 'dialogue' ? [item.dialogue] : []);
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: customs, legend: customsLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));
const rope = () => keys(move(start(), 5, 2), '"byw');
const oil = () => keys(move(rope(), 1, 2), 'yw');
const clearedNets = () => keys(oil(), '3wdb');
function fill(session: Session, crate: string, reverse = false): Session {
  return crate === 'oil' ? keys(move(dismiss(session), 1, 12), '"0p')
    : route(move(dismiss(session), 3, 11), reverse ? '"bp3h"0p' : '"0p"bp');
}
it('warehouse.end precedes customs.intro, retaining story and starting Customs', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: warehouse, legend: warehouseLegend });
  let session = route(dismiss(previous.init()), warehouse.solution.join(''));
  expect(queued(session)).toEqual(['warehouse.ream-through']);
  session = controller.reduce(controller.reduce(session, '<CR>'), '<CR>');
  expect(session.world.stage).toBe('warehouse');
  expect(session.queue[0]).toMatchObject({ cutscene: 'warehouse.end' });
  session = controller.reduce(session, '<CR>');
  expect(session.clearCard).toBe(true);
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('customs');
  expect(queued(session)).toEqual(['customs.intro']);
  expect(session.story.clearedStages).toContain('warehouse');
  expect(session.story.quests['port.customs']).toEqual({ step: 0, done: false });
  expect(content.worlds.find(w => w.id === 'copper-port')?.stages).toEqual(['jetty', 'warehouse', 'customs', 'counter', 'harbour']);
});
it('named yank preserves zero; deletion replaces unnamed, and plain p bumps free', () => {
  const yanked = oil();
  expect(yanked.world.engine.registers.b?.text).toBe('rrr');
  expect(yanked.world.engine.registers['0']?.text).toBe('oooo');
  const deleted = clearedNets();
  expect(deleted.world.engine.registers['"']?.text).toBe('nnn');
  expect(deleted.world.engine.registers['0']?.text).toBe('oooo');
  expect(queued(deleted)).toEqual(['customs.nets-gone']);
  expect(jettyDeletion(deleted.world, deleted.lastEvents)?.junk).toBe('nnn');
  const ready = dismiss(deleted);
  const bumped = keys(ready, 'p');
  expect(bumped.world.turn).toBe(ready.world.turn);
  expect(bumped.world.engine.lines).toEqual(ready.world.engine.lines);
  expect(bumped.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  const before = keys(ready, 'f[');
  const filled = keys(before, '"0p');
  expect(filled.world.firedTriggers).toContain('customs.oil');
  expect(warehouseTransfer(before.world, filled.world, filled.lastEvents)).toMatchObject({ type: 'put', length: 4 });
  expect(screen(deleted)).toContain('Register &quot;: nnn');
  expect(screen(deleted)).toContain('Register &quot;0: oooo');
});
it.each([false, true])('both put orders produce mixed cargo (rope first=%s)', reverse => {
  const session = fill(oil(), 'mixed', reverse);
  expect(session.world.engine.lines[3]).toBe('#..........[oooorrr]#');
  expect(session.world.firedTriggers).toContain('customs.mixed');
  expect(queued(session)).toEqual(['customs.mixed']);
});
it.each([['oil', 'mixed'], ['mixed', 'oil']])('both crate orders set cleared: %s, %s', (first, second) => {
  let session = fill(clearedNets(), first);
  expect(session.story.flags['customs.cleared']).not.toBe(true);
  expect(queued(session)).toEqual(['customs.' + first]);
  session = fill(session, second);
  expect(session.story.flags['customs.cleared']).toBe(true);
  expect(session.world.flags['customs.cleared']).toBe(true);
  expect(queued(session)).toEqual(['customs.' + second]);
});
it('nets dialogue plays once across undo and a second delete', () => {
  const first = clearedNets();
  const again = keys(dismiss(first), 'udb');
  expect(again.world.engine.lines).toEqual(first.world.engine.lines);
  expect(queued(again)).toEqual([]);
});
it('seven cargo connect Tare, and every Tare line plays exclusively in its state', () => {
  const adjacent = [{ line: 3, col: 18 }, { line: 5, col: 18 }, { line: 4, col: 17 }, { line: 4, col: 19 }];
  const reachable = (s: Session) => adjacent.filter(at => customsLegend.tiles.some(t => t.walkable && t.char === s.world.engine.lines[at.line]?.[at.col]));
  expect(reachable(start())).toEqual([]);
  const partial = keys(move(oil(), 3, 11), '"0p');
  expect(reachable(partial)).toEqual([]);
  const mixed = fill(oil(), 'mixed');
  expect(reachable(mixed)).toEqual([{ line: 3, col: 18 }]);
  for (const cleared of [false, true]) {
    const ready = cleared ? fill(fill(clearedNets(), 'mixed'), 'oil') : mixed;
    let session = keys(move(dismiss(ready), 3, 18), '<CR>');
    const id = cleared ? 'customs.tare-through' : 'customs.tare-wait';
    expect(queued(session)).toEqual([id]);
    for (const line of content.dialogues.find(d => d.id === id)!.lines) {
      expect(screen(session)).toContain(line.text.replaceAll("'", '&#x27;'));
      session = controller.reduce(session, '<CR>');
    }
  }
});
it('par replays in 16 turns / three hearts, then customs.end and continuation', () => {
  let session = route(start(), customs.solution.join(''));
  for (let i = 0; i < 3; i++) session = controller.reduce(session, '<CR>');
  expect(session.queue[0]).toMatchObject({ cutscene: 'customs.end' });
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(16);
  expect(session.world.hearts).toBe(3);
  session = controller.reduce(session, '<CR>');
  expect(session.clearCard).toBe(true);
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('counter');
  expect(queued(session)).toEqual(['counter.intro']);
});
it('old vocabulary replays the 20-turn route', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: customs, legend: customsLegend });
  let state = solver.init(customs, customsLegend, { learnedCommands: WAREHOUSE_COMMANDS, flags: {} });
  for (const key of parseKeys('3k4wdb2bywf[p8h2jf[p14h2jlywh2kf[4lp<CR>')) {
    state = solver.step(state, key, customs, customsLegend, { learnedCommands: WAREHOUSE_COMMANDS, flags: {} }).state;
  }
  expect(state.status).toBe('cleared');
  expect(state.turn).toBe(20);
  expect(state.hearts).toBe(3);
});
it('old vocabulary finds nothing in 5 turns / 300 expansions', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: customs, legend: customsLegend });
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => { steps++; return solver.step(...args); } };
  const began = performance.now();
  expect(solveStage(observed, customs, customsLegend, { learnedCommands: WAREHOUSE_COMMANDS, flags: {} }, { maxTurns: 5, maxExpanded: 300 })).toBeNull();
  expect(steps).toBeGreaterThan(0);
  console.info(`Customs old-command bound: ${steps} steps, ${Math.round(performance.now() - began)} ms`);
}, 15_000);
it('restricts commands, shows register prefixes and restores Continue', () => {
  for (const input of ['yy', 'P', 'D', 'cw']) {
    const rejected = keys(start(), input);
    expect(rejected.world.turn).toBe(0);
    expect(rejected.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
  }
  expect(stageCommands(customs)).toEqual(CUSTOMS_COMMANDS);
  const previous = dismiss(controller.resume({ stage: 'warehouse', story: start().story }));
  expect(keys(previous, '"').lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
  expect(learnedKeycaps({}, false, 'customs')).toEqual(expect.arrayContaining(['y', 'p', '"', '"a', '"0']));
  expect(keys(start(), '"').world.engine.pendingKeys.join('')).toBe('"');
  expect(keys(start(), '"b').world.engine.pendingKeys.join('')).toBe('"b');
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  saveProgress(() => storage, start().stageEntry);
  const progress = readProgress(() => storage, stages.map(s => s.stage.id));
  if (!progress) throw new Error('Missing save');
  expect(controller.resume(progress).world.stage).toBe('customs');
});
it('lints Customs and replays every stage', () => {
  expect(lintStage(customs, customsLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend, { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});
