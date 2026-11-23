import { searchScript } from '../../../../packages/world/src/solver/script.js';
import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { checkGoals, SKILL_IDS } from '@escape/curriculum';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, playKeys } from '@escape/world';
import { content, ledger, ledgerLegend, shaft, shaftLegend, stages } from './content.js';
import { createSession, LEDGER_COMMANDS, type Session } from './session.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { ScriptPanel, visibleHints } from './ScriptPanel.js';
import { readProgress, saveProgress } from './progress.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => createElement('div', null, 'FIELD') }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: ledger, legend: ledgerLegend });
const book = ledger.scripts[0]!;
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count += 1) {
    if (count > 60) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
function keys(session: Session, route: string): Session {
  return parseKeys(route).reduce((next, key) => controller.reduce(next, key), session);
}
const start = () => dismiss(controller.init());
const screen = (session: Session, scriptStamp = false) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: ledger, legend: ledgerLegend, content, objectives: storyEngine.objectives(session.story, content),
  showSource: false, scriptStamp, onAdvance: () => {},
}));

it('chains the real shaft clear through its story into the open ledger and quest', () => {
  const shaftController = createSession({ sim, storyEngine, content, stages, stage: shaft, legend: shaftLegend });
  let session = dismiss(shaftController.init());
  for (const key of shaft.solution) session = shaftController.reduce(dismiss(session), key);
  session = dismiss(session);
  expect(session.world.stage).toBe('ledger');
  expect(session.world.script?.id).toBe('ledger.book');
  expect(session.story.flags['shaft.mason-cured']).toBe(true);
  expect(session.story.statues).toContain('E');
  expect(session.story.quests['quarry.ledger']).toEqual({ step: 0, done: false });
  expect(session.story.flags['ledger.knows-o']).toBe(true);
  expect(learnedKeycaps(session.story.flags).slice(-2)).toEqual(['o', 'D']);
  for (const key of book.solution) session = controller.reduce(session, key);
  expect(session.story.quests['quarry.ledger']).toEqual({ step: 1, done: true });
});
it('replays the best-known 38 keys with the real engine and clears without a field turn', () => {
  expect(book.solution).toHaveLength(38);
  const engine = createEngine();
  let buffer = engine.init(book.startLines, book.startCursor);
  for (const key of book.solution) {
    const result = engine.step(buffer, key, { allowedCommands: LEDGER_COMMANDS });
    expect(result.error).toBeNull();
    buffer = result.state;
  }
  expect(checkGoals(book.goals, buffer)).toEqual([true]);
  let session = start();
  for (const key of book.solution) session = controller.reduce(session, key);
  expect(session.world.status).toBe('cleared');
  expect(session.world.script).toBeNull();
  expect(session.world.turn).toBe(0);
  expect(session.queue[0]).toMatchObject({ type: 'cutscene', cutscene: 'ledger.end' });
  const stamp = screen(session, true);
  expect(stamp).toContain('Set right');
  expect(stamp).not.toContain('Enter to go on');
  expect(stamp).not.toContain('FIELD');
  expect(screen(controller.reduce(session, '<CR>'))).toContain('End of World 2.');
  session = dismiss(session);
  expect(session.world.stage).toBe('canopy');
  expect(screen(session)).not.toContain('To be continued.');
});
it('undo recovers a wrong edit and leaves the script open', () => {
  const session = keys(start(), 'xu');
  expect(session.world.script?.engine.lines).toEqual(book.startLines);
  expect(session.world.script?.engine.mode).toBe('normal');
});
it.each([':q<CR>', 'x:q!<CR>', 'x:e!<CR>', 'odraft<Esc>:e!<CR>'])('reopens a fresh attempt after %s', route => {
  const before = start();
  const session = keys(before, route);
  expect(session.world.status).toBe('playing');
  expect(session.world.script?.engine.lines).toEqual(book.startLines);
  expect(session.world.script?.engine.cursor).toEqual(book.startCursor);
  expect(session.world.script?.keys).toBe(0);
  expect(session.world.engine.quitRequested).toBe(false);
  expect(session.story).toEqual(before.story);
});
it('refuses :q on a modified ledger, as real Vim does', () => {
  const session = keys(start(), 'x:q<CR>');
  expect(session.world.script?.engine.lines).not.toEqual(book.startLines);
  expect(session.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
});
it('Continue reloads stage entry with the ledger open and story preserved', () => {
  const edited = keys(start(), 'x');
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, edited.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing saved ledger');
  const continued = dismiss(controller.resume(progress));
  expect(continued.world.stage).toBe('ledger');
  expect(continued.world.script?.engine.lines).toEqual(book.startLines);
  expect(continued.story.flags['ledger.knows-o']).toBe(true);
});
it('shows the goal, ghost, cursor, insert mode, and one tick per matching line', () => {
  const session = start();
  const html = screen(session);
  expect(html).toContain(book.goalText.replaceAll("'", '&#x27;'));
  expect(html).toContain('The ledger should read:');
  expect(html.match(/aria-label="Line matches"/g)).toHaveLength(1);
  expect(html).toContain('cell--cursor-block');
  expect(html).not.toContain('FIELD');
  expect(screen(keys(session, 'o'))).toContain('-- INSERT --');
  const target = book.goals.find(goal => goal.type === 'transform');
  if (!target) throw new Error('Missing transform');
  const matched = renderToStaticMarkup(createElement(ScriptPanel, { script: book, keys: 38,
    engine: createEngine().init(target.targetLines) }));
  expect(matched.match(/aria-label="Line matches"/g)).toHaveLength(6);
});
it('reveals a hint at 60 keys, then one every 30, capped at five', () => {
  for (const [count, hints] of [[59, 0], [60, 1], [89, 1], [90, 2], [120, 3], [150, 4], [180, 5], [300, 5]]) {
    expect(visibleHints(book, count!)).toHaveLength(hints!);
  }
  let session = start();
  for (let count = 0; count < 59; count += 1) session = controller.reduce(session, '<Esc>');
  expect(screen(session)).not.toContain(book.hints[0]);
  expect(screen(controller.reduce(session, '<Esc>'))).toContain(book.hints[0]);
});
it('validates content, the text-stage map and the raw world replay', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  expect(ledger.clear).toEqual([{ type: 'script-solved', script: 'ledger.book' }]);
  const replay = playKeys(sim, ledger, ledgerLegend, { learnedCommands: LEDGER_COMMANDS, flags: {} }, ledger.solution);
  expect(replay.state.status).toBe('cleared');
});

it('runs a bounded keystroke search and keeps the replayed route when its budget is exhausted', () => {
  const result = searchScript(createEngine(), book, {
    maxKeys: 38, maxExpanded: 1000,
    alphabet: [...new Set([...book.solution, ...'hjk lwbe0$xrdDuoiaAI123456789'.replaceAll(' ', ''), '<Esc>'])],
  });
  expect(result).toEqual({ solution: null, expanded: 1000, exhausted: true });
});
