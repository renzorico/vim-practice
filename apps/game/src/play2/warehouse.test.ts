import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, stageReplayIssue, solveStage } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, warehouse, warehouseLegend, jetty, portLegend, stages } from './content.js';
import { createSession, PORT_COMMANDS, WAREHOUSE_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, pendingKeyLabel, PlayScreen } from './PlayScreen.js';
import { saveProgress, readProgress } from './progress.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: warehouse, legend: warehouseLegend });
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
const route = (session: Session, input: string) => parseKeys(input).reduce((current, key) => controller.reduce(dismiss(current), key), session);
function move(session: Session, line: number, col: number): Session {
  const result = sim.apply(session.world, [{ type: 'move-player', to: { line, col } }], warehouse, warehouseLegend);
  return { ...session, world: result.state, lastEvents: result.events };
}
const queued = (session: Session) => session.queue.flatMap(item => item.type === 'dialogue' ? [item.dialogue] : []);
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: warehouse, legend: warehouseLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));

it('enters the warehouse after jetty.end, keeping story and starting its quest', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: jetty, legend: portLegend });
  let session = previous.init();
  for (const key of jetty.solution) session = previous.reduce(dismiss(session), key);
  expect(session.queue[0]).toMatchObject({ dialogue: 'jetty.ream-through' });
  session = controller.reduce(controller.reduce(session, '<CR>'), '<CR>');
  expect(session.world.stage).toBe('jetty');
  expect(session.queue[0]).toMatchObject({ cutscene: 'jetty.end' });
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('warehouse');
  expect(session.queue[0]).toMatchObject({ dialogue: 'warehouse.intro' });
  expect(session.story.clearedStages).toContain('jetty');
  expect(session.story.quests['port.warehouse']).toEqual({ step: 0, done: false });
  expect(content.worlds.find(world => world.id === 'copper-port')?.stages).toEqual(['jetty', 'warehouse', 'customs']);
});
it('yw costs a turn, preserves the tally and copies only its four oil jars', () => {
  const initial = move(start(), 1, 2);
  const yanked = keys(initial, 'yw');
  expect(yanked.world.turn).toBe(1);
  expect(yanked.world.engine.lines).toEqual(initial.world.engine.lines);
  expect(yanked.world.engine.cursor).toEqual({ line: 1, col: 2 });
  expect(yanked.world.engine.registers['"']).toEqual({ text: 'oooo', linewise: false });
  expect(screen(initial)).toContain('Yanked: empty');
  expect(screen(yanked)).toContain('Yanked: oooo');
  expect(learnedKeycaps({}, false, 'warehouse')).toEqual(expect.arrayContaining(['y', 'yw', 'p']));
  expect(pendingKeyLabel(keys(initial, 'y').world.engine.pendingKeys)).toBe('y…');
});
it('yw f[ p stocks the top shelf and lands on its last jar', () => {
  const stocked = keys(move(start(), 1, 2), 'ywf[p');
  expect(stocked.world.engine.cursor).toEqual({ line: 1, col: 14 });
  expect(stocked.world.engine.lines[1]).toBe('#[oooo]___[oooo]#');
  expect(stocked.world.firedTriggers).toContain('warehouse.top');
  expect(stocked.story.flags['warehouse.top']).toBe(true);
  expect(queued(stocked)).toEqual(['warehouse.still']);
});
it('two puts overfill; undoing to exactly one put fires the text trigger only once', () => {
  // Seed an overfill before the first turn-end trigger: 2p is a single Vim command.
  const yanked = keys(move(start(), 1, 2), 'ywf[');
  const overfilled = keys(yanked, '2p');
  expect(overfilled.world.firedTriggers).not.toContain('warehouse.top');
  const empty = keys(overfilled, 'u');
  const one = keys(empty, 'p');
  expect(one.world.firedTriggers.filter(id => id === 'warehouse.top')).toHaveLength(1);
  const two = keys(dismiss(one), 'p');
  expect(two.world.engine.lines[1]).toContain('[oooooooo]#');
  const back = keys(two, 'u');
  expect(back.world.engine.lines[1]).toContain('[oooo]#');
  expect(back.world.firedTriggers.filter(id => id === 'warehouse.top')).toHaveLength(1);
  expect(queued(back)).toEqual([]);
});
it.each(['yf]f[p', 'yjf[p'])('%s bumps wall without putting cargo', input => {
  const session = keys(move(start(), 1, 2), input);
  expect(session.world.engine.lines).toEqual(warehouse.map);
  expect(session.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
});
it('4x on the tally hits its fixed lip; 3x is legal and updates the unnamed register', () => {
  const initial = move(start(), 1, 2);
  const rejected = keys(initial, '4x');
  expect(rejected.world.turn).toBe(0);
  expect(rejected.lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  const deleted = keys(initial, '3x');
  expect(deleted.world.engine.lines[1]).toBe('#[o]___[]#');
  expect(screen(deleted)).toContain('Yanked: ooo');
});
const orders = [ ['top','middle','bottom'], ['top','bottom','middle'], ['middle','top','bottom'],
  ['middle','bottom','top'], ['bottom','top','middle'], ['bottom','middle','top'] ];
it.each(orders)('sets stocked exactly on the third shelf: %s, %s, %s', (...order) => {
  let session = start();
  let still = 0;
  order.forEach((shelf, index) => {
    const rope = shelf === 'bottom';
    session = keys(move(dismiss(session), rope ? 5 : 1, 2), 'yw');
    session = keys(move(session, shelf === 'top' ? 1 : shelf === 'middle' ? 3 : 5, 10), 'p');
    still += queued(session).filter(id => id === 'warehouse.still').length;
    expect(session.story.flags['warehouse.stocked'] === true).toBe(index === 2);
    expect(session.world.flags['warehouse.stocked'] === true).toBe(index === 2);
    if (index === 2) expect(queued(session)).toContain('warehouse.stocked');
  });
  expect(still).toBe(1);
});
it('Ream touches no walkable cell initially; the middle put connects his counter', () => {
  const adjacent = [{ line: 3, col: 13 }, { line: 5, col: 13 }, { line: 4, col: 12 }, { line: 4, col: 14 }];
  const walkable = (session: Session) => adjacent.filter(at => warehouseLegend.tiles.some(tile => tile.walkable && tile.char === session.world.engine.lines[at.line]?.[at.col]));
  expect(walkable(start())).toEqual([]);
  const stocked = keys(move(keys(move(start(), 1, 2), 'yw'), 3, 10), 'p');
  expect(walkable(stocked)).toEqual([{ line: 3, col: 13 }]);
  expect(queued(keys(move(dismiss(stocked), 3, 13), '<CR>'))).toEqual(['warehouse.ream-wait']);
});
it.each([false, true])('presents every Ream line exclusively when stocked=%s', stocked => {
  let ready = dismiss(keys(move(keys(move(start(), 1, 2), 'yw'), 3, 10), 'p'));
  if (stocked) ready = dismiss(route(start(), warehouse.solution.slice(0, -1).join('')));
  let session = keys(move(ready, 3, 13), '<CR>');
  const id = stocked ? 'warehouse.ream-through' : 'warehouse.ream-wait';
  expect(queued(session)).toEqual([id]);
  for (const line of content.dialogues.find(dialogue => dialogue.id === id)!.lines) {
    expect(screen(session)).toContain(line.text.replaceAll("'", '&#x27;'));
    session = controller.reduce(session, '<CR>');
  }
});
it('replays the supplied solution in 15 turns with three hearts and ends after warehouse.end', () => {
  const local = createSession({ sim, storyEngine, content, stage: warehouse, legend: warehouseLegend });
  let session = route(start(), warehouse.solution.join(''));
  while (session.queue.length) session = local.reduce(session, '<CR>');
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(15);
  expect(session.world.hearts).toBe(3);
  expect(session.story.flags['warehouse.stocked']).toBe(true);
  expect(screen(session)).toContain('To be continued.');
});
it('keeps stage command restrictions and Continue restores warehouse', () => {
  for (const input of ['yy', 'P', 'D', 'cw']) {
    const rejected = keys(start(), input);
    expect(rejected.world.turn).toBe(0);
    expect(rejected.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
  }
  const port = dismiss(controller.resume({ stage: 'jetty', story: start().story }));
  for (const input of ['yw', 'p']) expect(keys(port, input).world.turn).toBe(0);
  expect(stageCommands(warehouse)).toEqual(WAREHOUSE_COMMANDS);
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, start().stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing warehouse save');
  expect(controller.resume(progress).world.stage).toBe('warehouse');
});
it('lints cleanly and every bundled stage solution replays', () => {
  expect(lintStage(warehouse, warehouseLegend)).toEqual([]);
  for (const { stage, legend } of stages) {
    expect(stageReplayIssue(sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
      { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
  }
});
it('finds no old-command route within 6 turns / 1,000 expansions', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: warehouse, legend: warehouseLegend });
  // All cells outside the original rack spans are fixed. Old commands cannot
  // insert; r cannot replace those fixed cells, deletes only shrink the racks,
  // and history only revisits such states. Cargo therefore stays in the racks.
  let cargoStayedInRacks = true;
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => {
    steps += 1;
    const result = solver.step(...args);
    cargoStayedInRacks &&= result.state.engine.lines.every((row, line) => !/[or]/.test(
      line === 1 ? row.slice(0, 2) + row.slice(6) : line === 5 ? row.slice(0, 2) + row.slice(5) : row));
    return result;
  } };
  expect(solveStage(observed, warehouse, warehouseLegend, { learnedCommands: PORT_COMMANDS, flags: {} },
    { maxTurns: 6, maxExpanded: 1_000 })).toBeNull();
  // The wrapper must really see the search, or the invariant below proves nothing.
  expect(steps).toBeGreaterThan(0);
  expect(cargoStayedInRacks).toBe(true);
}, 120_000);
it('old commands cannot stock shelves, though r can change cargo kind inside the tally', () => {
  // No old field command inserts text. Fixed shelf brackets are adjacent and
  // cannot be replaced/deleted: cargo cannot appear BETWEEN them without p.
  const changed = keys(move(start(), 1, 2), 'rr');
  expect(changed.world.engine.lines[1]).toBe('#[rooo]___[]#');
  expect(changed.world.engine.lines[1]?.length).toBe(warehouse.map[1]?.length);
  for (const input of ['x', '3x', 'rr', 'd3l', 'dd']) {
    const session = route(move(start(), 1, 2), input);
    for (const anchor of session.world.entities.filter(entity => entity.id.startsWith('shelf-'))) {
      expect(session.world.engine.lines[anchor.at.line]?.[anchor.at.col + 1]).toBe(']');
    }
  }
});
