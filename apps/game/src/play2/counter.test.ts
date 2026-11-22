import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { contentSchema, createStoryEngine } from '@escape/story';
import { createWorldSim, solveStage, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, counter, counterLegend, customs, customsLegend, stages } from './content.js';
import { createSession, COUNTER_COMMANDS, CUSTOMS_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { ledgerFakes } from './CounterGauge.js';
import { saveProgress, readProgress } from './progress.js';
import { warehouseTransfer } from '../scene/warehouseTransfer.js';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: counter, legend: counterLegend });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length && next.world.status !== 'dead'; count++) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const start = () => dismiss(controller.init());
const keys = (session: Session, input: string) => parseKeys(input).reduce(controller.reduce, session);
const route = (session: Session, input: string) => parseKeys(input).reduce((s, key) => s.world.status === 'dead' || s.queue.some(item => item.type === 'dialogue' && item.dialogue === 'counter.fuse')
  ? s : controller.reduce(dismiss(s), key), session);
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: counter, legend: counterLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));
const prepared = () => route(start(), 'j"ayl2j"byl2jf[');
it.each([
  [counter.solution.join(''), 12, 6],
  ['j"ayl2j"byl2jf["a4p.f["b4p.f["a4p"b4p', 14, 7],
  ['j"ayl2j"byl2jf[8"apf[8"bpf[4"ap4"bp', 12, 6],
])('replays castle route in %s', (input, turns, fakes) => {
  const session = route(start(), input);
  expect(session.world.status).toBe('cleared');
  expect(session.world.turn).toBe(turns);
  expect(session.world.hearts).toBe(3);
  expect(ledgerFakes(session.world)).toBe(fakes);
  expect(session.world.engine.lines[7]).toBe('#.[oooooooo]..[rrrrrrrr]..[oooorrrr]#');
});
it('counted puts land on the eighth cargo; dot repeats four in one turn', () => {
  const before = prepared();
  const eight = keys(before, '"a8p');
  expect(eight.world.turn - before.world.turn).toBe(1);
  expect(eight.world.engine.cursor).toEqual({ line: 7, col: 10 });
  expect(warehouseTransfer(before.world, eight.world, eight.lastEvents)).toMatchObject({ type: 'put', length: 8 });
  const four = keys(before, '"a4p');
  const repeated = keys(four, '.');
  expect(repeated.world.turn - four.world.turn).toBe(1);
  expect(warehouseTransfer(four.world, repeated.world, repeated.lastEvents)).toMatchObject({ type: 'put', length: 4 });
  expect(repeated.world.engine.lines[7]).toBe(eight.world.engine.lines[7]);
});
it('the no-register route dies on turn 16; each retry restores crates and ledger and fires again', () => {
  const input = 'jyl4jf[8pf[f[4p3b2h2kyl2j2f[8pf[4l4p';
  for (let attempt = start(), count = 0; count < 2; count++) {
    const filed = route(attempt, input);
    expect(filed.world.turn).toBe(16);
    expect(filed.queue[0]).toMatchObject({ dialogue: 'counter.fuse' });
    expect(screen(filed)).toContain('Eight. Filed.');
    const dead = dismiss(filed);
    expect(dead.world.status).toBe('dead');
    expect(dead.world.hearts).toBe(0);
    expect(dead.lastEvents).toContainEqual({ type: 'player-hit', by: 'effect', hearts: 0 });
    attempt = controller.reduce(dead, 'j');
    expect(attempt.world.engine.lines).toEqual(counter.map);
    expect(attempt.world.turn).toBe(0);
    expect(attempt.world.hearts).toBe(3);
    expect(ledgerFakes(attempt.world)).toBe(0);
  }
});
it('empty crates lose at turn 16; the visible ledger tracks every fake', () => {
  let session = start();
  for (let turn = 1; turn <= 16; turn++) {
    session = keys(session, turn % 2 ? 'j' : 'k');
    expect(ledgerFakes(session.world)).toBe(Math.floor(turn / 2));
    expect(screen(session)).toContain(`Ledger ${Math.floor(turn / 2)}/8`);
  }
  expect(screen(session)).toContain('data-full="true"');
  expect(dismiss(session).world.status).toBe('dead');
});
it('clear wins when the last crate fills on the eighth fake; statue D lights only after the ending', () => {
  const before = route(start(), 'j"ayl2j"byl2jf["a8pf["b8pf["a4p');
  const delayed = keys(before, 'hlhl'); // four turns: last put will be turn 16
  let session = keys(delayed, '"b4p');
  expect(session.world.turn).toBe(16);
  expect(ledgerFakes(session.world)).toBe(8);
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ dialogue: 'counter.done' });
  // The fuse fires on the same turn, but its line must not play after a win.
  expect(session.queue.some(item => 'dialogue' in item && item.dialogue === 'counter.fuse')).toBe(false);
  expect(session.story.statues).not.toContain('D');
  session = dismiss(session);
  expect(session.world.hearts).toBe(3);
  expect(session.story.statues).toContain('D');
  expect(screen(session)).toContain('To be continued.');
});
it('clerk blocks walking and jumps; fixed samples cannot be deleted; only castle vocabulary is accepted', () => {
  for (const input of ['k', '2G', 'yy', 'P', 'D', 'cw']) {
    const rejected = keys(start(), input);
    expect(rejected.world.turn).toBe(0);
    expect(rejected.lastEvents.some(event => event.type === 'engine-error' || event.type === 'bump')).toBe(true);
  }
  const oil = keys(start(), 'j');
  expect(keys(oil, 'x').world.engine.lines).toEqual(oil.world.engine.lines);
  expect(keys(oil, 'x').world.turn).toBe(oil.world.turn);
  expect(stageCommands(counter)).toBe(COUNTER_COMMANDS);
  expect(COUNTER_COMMANDS).toBe(CUSTOMS_COMMANDS);
  expect(learnedKeycaps({}, false, 'counter')).toEqual(expect.arrayContaining(['"a', '"0', '8p', 'y', 'p']));
});
it('customs ending leads into counter, keeping story and starting the castle quest; Continue restores it', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: customs, legend: customsLegend });
  const session = dismiss(route(dismiss(previous.init()), customs.solution.join('')));
  expect(session.world.stage).toBe('counter');
  expect(session.story.clearedStages).toContain('customs');
  expect(session.story.quests['port.counterfeiter']).toEqual({ step: 0, done: false });
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  saveProgress(() => storage, session.stageEntry);
  const progress = readProgress(() => storage, stages.map(s => s.stage.id));
  if (!progress) throw new Error('Missing save');
  expect(controller.resume(progress).world.stage).toBe('counter');
  expect(content.worlds.find(w => w.id === 'copper-port')).toMatchObject({ castle: 'counter', statue: 'D', stages: ['jetty', 'warehouse', 'customs', 'counter'] });
});
it('bounded old-command search finds no solution in 3 turns / 50 expansions', () => {
  const solver = sessionSolver({ sim, storyEngine, content, stage: counter, legend: counterLegend });
  let steps = 0;
  const observed = { ...solver, step: (...args: Parameters<typeof solver.step>) => { steps++; return solver.step(...args); } };
  const began = performance.now();
  expect(solveStage(observed, counter, counterLegend, { learnedCommands: CUSTOMS_COMMANDS, flags: {} }, { maxTurns: 3, maxExpanded: 50 })).toBeNull();
  const elapsed = performance.now() - began;
  expect(steps).toBeGreaterThan(0);
  // Measure the wall-clock bound in isolation; parallel suite contention varies.
  console.info(`Counter old-command bound: ${steps} steps, ${Math.round(elapsed)} ms`);
}, 15_000);
it('lints Counter and replays every stage', () => {
  expect(lintStage(counter, counterLegend)).toEqual([]);
  for (const { stage, legend } of stages) expect(stageReplayIssue(sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend, { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});

it('story schema mirrors put/hit and rejects malformed effects', () => {
  const spawn = counter.entities[0];
  if (!spawn) throw new Error('Missing clerk');
  const raw = { ...content, dialogues: [{ id: 'test', lines: [{ speaker: 'system', text: 'test' }], then: [{ type: 'world', effects: [{ type: 'spawn', entity: spawn }, { type: 'hit', hearts: 3 }] }] }] };
  expect(contentSchema.safeParse(raw).success).toBe(true);
  for (const hearts of [0, -1, 1.5]) {
    expect(contentSchema.safeParse({ ...raw, dialogues: [{ ...raw.dialogues[0], then: [{ type: 'world', effects: [{ type: 'hit', hearts }] }] }] }).success).toBe(false);
  }
  for (const text of ['', 'f\nf']) {
    expect(contentSchema.safeParse({ ...raw, dialogues: [{ ...raw.dialogues[0], then: [{ type: 'world', effects: [{ type: 'spawn', entity: { ...spawn, behaviour: { type: 'put', text } } }] }] }] }).success).toBe(false);
  }
});
