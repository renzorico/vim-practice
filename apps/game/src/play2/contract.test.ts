import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { SKILL_IDS } from '@escape/curriculum';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, stageReplayIssue } from '@escape/world';
import { content, contract, contractLegend, notary, notaryLegend, stages } from './content.js';
import { CONTRACT_COMMANDS, HARBOUR_COMMANDS, createSession, stageCommands, type Session } from './session.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { sessionSolver } from './solver.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: contract, legend: contractLegend });
const book = contract.scripts[0]!;
const target = book.goals.find(goal => goal.type === 'transform')!.targetLines;
const PROVIDED = '2jci"the Librarians<Esc>9j.j.j.gg2j3f"ci"the Readers<Esc>2j0f(ci(unless they want to<Esc>j0f[ci[until the Scribe returns<Esc>}jdapf<citTilde<Esc>}jcipGuardian of the caves: the Minotaur.<Esc>';
const SHORTER = PROVIDED.replace('gg2j3f"', '3G$');
const OLD_TOOLS = '2jf"lct"the Librarians<Esc>9j0f"l.j0f"l.j0f"l.gg2j0f";;lct"the Readers<Esc>2j0f(lc2t)unless they want to<Esc>j0f[lct]until the Scribe returns<Esc>}j3ddf>lct<Tilde<Esc>}jddCGuardian of the caves: the Minotaur.<Esc>';
// Sign and name the guardian first, then change the parties/seals and clauses.
// G and paragraph objects make the notes independent of row deletions; strike Clause 3 last.
const REORDERED = '10jf<citTilde<Esc>G2kcipGuardian of the caves: the Minotaur.<Esc>gg0'
  + PROVIDED.split('}jdap')[0] + '}jdap';
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length; count++) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const keys = (session: Session, route: string) => parseKeys(route).reduce(controller.reduce, session);
const start = () => dismiss(controller.init());
function screen(session: Session): string {
  const entry = stages.find(item => item.stage.id === session.world.stage)!;
  return renderToStaticMarkup(createElement(PlayScreen, {
    session, ...entry, content, objectives: storyEngine.objectives(session.story, content),
    showSource: false, onAdvance: () => {},
  }));
}

it('enters contract after notary.end with statue Q, retained story and the contract quest', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: notary, legend: notaryLegend });
  let session = dismiss(previous.init());
  for (const key of notary.solution) session = previous.reduce(dismiss(session), key);
  while (session.queue[0]?.type === 'dialogue') session = previous.reduce(session, '<CR>');
  expect(session.world.stage).toBe('notary');
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ cutscene: 'notary.end' });
  expect(session.story.statues).not.toContain('Q');
  session = dismiss(session);
  expect(session.world.stage).toBe('contract');
  expect(session.world.script?.id).toBe(book.id);
  expect(session.story.statues).toContain('Q');
  expect(session.story.flags['notary.through']).toBe(true);
  expect(session.story.clearedStages).toContain('notary');
  expect(session.story.unlockedStages).toContain('contract');
  expect(session.story.quests['library.contract']).toEqual({ step: 0, done: false });
  expect(storyEngine.objectives(session.story, content)).toContain('Rewrite the founding contract.');
  expect(keys(session, SHORTER).story.quests['library.contract']).toEqual({ step: 1, done: true });
});

it.each([PROVIDED, SHORTER, OLD_TOOLS, REORDERED])('accepts the exact target through route %s', route => {
  const engine = createEngine();
  let buffer = engine.init(book.startLines, book.startCursor);
  for (const key of parseKeys(route)) {
    const result = engine.step(buffer, key, { allowedCommands: route === OLD_TOOLS ? HARBOUR_COMMANDS : CONTRACT_COMMANDS });
    expect(result.error).toBeNull();
    buffer = result.state;
  }
  expect(buffer.lines).toEqual(target);
  const clear = keys(start(), route);
  expect(clear.world.status).toBe('cleared');
  expect(clear.world.turn).toBe(0);
  expect(clear.world.solvedScripts[book.id]).toEqual(target);
  expect(clear.queue[0]).toMatchObject({ cutscene: 'contract.end' });
});

it('finds the first quote from Parties column zero and repeats the whole change on a seal', () => {
  const initial = start();
  const parties = keys(initial, '2jci"the Librarians<Esc>');
  expect(parties.world.script?.engine.lines[2]).toBe('Parties: "the Librarians" and "the clerk"');
  const seal = keys(parties, '9j0.');
  expect(seal.world.script?.engine.lines[11]).toBe('Seal: "the Librarians"');
  expect(seal.world.script?.engine.lastChange).toEqual(parseKeys('ci"the Librarians<Esc>'));
  expect(initial.world.script?.engine.lines).toEqual(book.startLines);
});

it('changes the entire outer nested brackets and keeps the paragraph blank row', () => {
  const nested = keys(start(), '4j0f(ci(unless they want to<Esc>');
  expect(nested.world.script?.engine.lines[4]).toBe('Clause 1: no one may read (unless they want to).');
  const notes = keys(start(), 'G2kcipGuardian of the caves: the Minotaur.<Esc>');
  expect(notes.world.script?.engine.lines.slice(-3)).toEqual([
    'Guardian of the caves: the Minotaur.', '', '</contract>',
  ]);
});

it('cit outside name rewrites the whole contract body, and u restores it', () => {
  const trap = keys(start(), '10j0citTilde<Esc>');
  // Neovim gives the single line <contract>Tilde</contract>; the engine keeps two line breaks
  // (known engine gap, BITACORA parking lot). Assert only what the lesson needs: the whole
  // body is gone, the outer tags stay, and u brings it back.
  const lines = trap.world.script?.engine.lines ?? [];
  expect(lines.join('\n')).not.toContain('THE FOUNDING CONTRACT');
  expect(lines[0]?.startsWith('<contract>')).toBe(true);
  expect(lines.at(-1)?.endsWith('</contract>')).toBe(true);
  expect(trap.world.status).toBe('playing');
  expect(keys(trap, 'u').world.script?.engine.lines).toEqual(book.startLines);
  const signed = keys(start(), '10j0f<citTilde<Esc>');
  expect(signed.world.script?.engine.lines[10]).toBe('Witness: <name>Tilde</name>');
  expect(signed.world.script?.engine.lines).toHaveLength(book.startLines.length);
});

it('permits insert and change here while notary rejects both', () => {
  expect(stageCommands(contract)).toEqual(CONTRACT_COMMANDS);
  expect(keys(start(), 'i').world.script?.engine.mode).toBe('insert');
  expect(keys(start(), '2jci"').world.script?.engine.mode).toBe('insert');
  for (const route of ['i', 'ciw', 'C']) {
    const before = dismiss(controller.resume({ stage: 'notary', story: start().story }));
    const after = keys(before, route);
    expect(after.world.engine.mode).toBe('normal');
    expect(after.world.engine.lines).toEqual(before.world.engine.lines);
    expect(after.lastEvents).toContainEqual(expect.objectContaining({
      type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }),
    }));
  }
});

it('Continue restores contract with its introduction and statue Q', () => {
  const incoming = controller.resume({ stage: 'contract', story: { ...start().story, flags: {}, statues: ['Q'] } });
  const edited = keys(dismiss(incoming), 'x');
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, edited.stageEntry)).toBe(true);
  const saved = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!saved) throw new Error('Missing contract save');
  const resumed = controller.resume(saved);
  expect(resumed.world.stage).toBe('contract');
  expect(resumed.world.script?.engine.lines).toEqual(book.startLines);
  expect(resumed.story.statues).toContain('Q');
  expect(resumed.queue[0]).toMatchObject({ dialogue: 'contract.intro' });
  expect(dismiss(resumed).story).toEqual(edited.story);
});

it('shows a Library parchment contract, target, existing portrait, and its lesson keys', () => {
  expect(screen(controller.init())).toContain('<svg width="64" height="64"');
  const html = screen(start());
  expect(html).toContain('script-panel--contract');
  expect(html).toContain('The contract should read:');
  expect(html).toContain('aria-label="Target text"');
  expect(html).toContain('cell--cursor-block');
  expect(html).toContain('Guardian of the caves: the Minotaur.');
  expect(learnedKeycaps({}, true, 'contract')).toEqual(expect.arrayContaining(['ci"', 'ci(', 'ci[', 'cit', 'cip', 'dap', '.']));
});

it('presents the exact ending including End of World 5 before To be continued', () => {
  let session = keys(start(), SHORTER);
  const ending = content.cutscenes.find(item => item.id === 'contract.end')!;
  for (const beat of ending.beats) {
    expect(beat.type).toBe('line');
    if (beat.type === 'line') expect(screen(session)).toContain(beat.line.text.replaceAll("'", '&#x27;'));
    expect(screen(session)).not.toContain('To be continued.');
    session = controller.reduce(session, '<CR>');
  }
  expect(session.world.stage).toBe('contract');
  expect(screen(session)).toContain('To be continued.');
});

it('validates content and replays every bundled stage with its own commands', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  for (const { stage, legend } of stages) {
    expect(stageReplayIssue(sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
      { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
  }
});

it('stores the 163-key best-known route and preserves the 167/189-key comparison', () => {
  expect(parseKeys(PROVIDED)).toHaveLength(167);
  expect(parseKeys(OLD_TOOLS)).toHaveLength(189);
  expect(book.par).toBe(163);
  expect(book.solution).toEqual(parseKeys(SHORTER));
  expect(contract.solution).toEqual(book.solution);
});
