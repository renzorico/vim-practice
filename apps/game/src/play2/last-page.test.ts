import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, stageReplayIssue } from '@escape/world';
import { content, lastPage, lastPageLegend, stages, study } from './content.js';
import { createSession, LAST_PAGE_COMMANDS, LABYRINTH_COMMANDS, stageCommands, type Session } from './session.js';
import { endingProgress, readProgress, saveProgress } from './progress.js';
import { PlayScreen } from './PlayScreen.js';
import { lintStage } from '../../../../tools/maps/lint.js';
import { sessionSolver } from './solver.js';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: lastPage, legend: lastPageLegend });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count++) {
    if (count > 100) throw new Error('Presentation loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
function keys(session: Session, route: string | readonly string[]): Session {
  return (typeof route === 'string' ? parseKeys(route) : route).reduce((next, key) => controller.reduce(dismiss(next), key), session);
}
const start = () => dismiss(controller.init());
const whole = () => keys(start(), 'fOxpujfhu dawjuddpu'.replaceAll(' ', ''));
function screen(session: Session): string {
  return renderToStaticMarkup(createElement(PlayScreen, { session, stage: lastPage, legend: lastPageLegend,
    content, objectives: [], showSource: false, onAdvance: () => {} }));
}
it('replays the provided solution in 15 turns with three hearts and delays recover until dismissal', () => {
  const solved = keys(start(), lastPage.solution);
  expect(solved.world.status).toBe('cleared');
  expect(solved.world.turn).toBe(15);
  expect(solved.world.hearts).toBe(3);
  expect(solved.queue[0]).toMatchObject({ type: 'cutscene', cutscene: 'last.recover' });
  expect(solved.story.ending).toBeNull();
  let next = solved;
  for (let index = 0; index < 5; index++) {
    expect(next.story.ending).toBeNull();
    next = controller.reduce(next, '<CR>');
  }
  expect(next.story.ending).toBe('recover');
  expect(next.queue[0]).toMatchObject({ type: 'ending', ending: 'recover' });
  expect(next.clearCard).toBe(true);
  expect(screen(next)).toContain('cleared');
  next = controller.reduce(next, '<CR>');
  expect(screen(next)).toContain('folio.txt written');
  expect(screen({ ...next, queue: [{ type: 'ending', ending: 'quit' }] })).not.toContain('folio.txt written');
  expect(endingProgress(next.stageEntry, next.story).story.ending).toBe('recover');
});
it('undo immediately restores torn doors; late undo restores the player’s doubled word', () => {
  const torn = keys(start(), 'fOxp');
  expect(torn.world.engine.lines).toHaveLength(6);
  expect(keys(torn, 'u').world.engine.lines[6]).toBe(lastPage.map[6]);
  const late = keys(start(), 'fOxpujfhdawu');
  expect(late.world.engine.lines[2]).toBe(lastPage.map[2]);
});
it('locks doors until whole, then removes the Unwriter and allows R followed by write', () => {
  expect(LAST_PAGE_COMMANDS).toBe(LABYRINTH_COMMANDS);
  expect(stageCommands(lastPage)).toBe(LAST_PAGE_COMMANDS);
  const early = keys(start(), '/R<CR>:w<CR>');
  expect(early.world.engine.saved).toBe(true);
  expect(early.world.status).toBe('playing');
  expect(early.story.flags['last.recover']).toBeUndefined();
  const repaired = whole();
  expect(repaired.world.turn).toBe(13);
  expect(repaired.story.flags['last.whole']).toBe(true);
  expect(repaired.world.entities.some(entity => entity.id === 'unwriter')).toBe(false);
  expect(keys(repaired, ':w<CR>').world.status).toBe('playing');
  const recovered = keys(repaired, '/R<CR>');
  expect(recovered.story.flags['last.recover']).toBe(true);
  expect(keys(recovered, ':w<CR>').world.status).toBe('cleared');
});
it.each(['Q', 'A', 'O', 'E'])('door %s returns its repeatable dialogue', letter => {
  const chosen = keys(whole(), `6j0f${letter}`);
  expect(chosen.queue[0]).toMatchObject({ dialogue: 'QA'.includes(letter) ? 'last.dialog-returns' : 'last.not-yet' });
  expect(chosen.story.ending).toBeNull();
  const again = keys(chosen, `h l`.replaceAll(' ', ''));
  expect(again.queue[0]).toMatchObject({ dialogue: 'QA'.includes(letter) ? 'last.dialog-returns' : 'last.not-yet' });
});
it('enters the Last Page after study.end, keeping story, quest and a persisted study return point', () => {
  const incoming = controller.resume({ stage: 'study', story: { ...storyEngine.init(content), statues: ['A'] } });
  const solved = keys(incoming, study.solution);
  expect(solved.queue[0]).toMatchObject({ cutscene: 'study.end' });
  const entered = dismiss(solved);
  expect(entered.world.stage).toBe('last-page');
  expect(entered.story.statues).toContain('A');
  expect(entered.story.quests['last.page']).toEqual({ step: 0, done: false });
  expect(entered.stageEntry.previous?.stage).toBe('study');
  const chosen = keys(entered, [...lastPage.solution.slice(0, 18), ...parseKeys('6j0fD')]);
  expect(chosen.queue[0]).toMatchObject({ cutscene: 'last.delete' });
  expect(chosen.story.ending).toBeNull();
  expect(endingProgress(chosen.stageEntry, chosen.story).stage).toBe('last-page');
  const ended = dismiss(chosen);
  expect(ended.story.ending).toBe('delete');
  const progress = endingProgress(ended.stageEntry, ended.story);
  expect(progress.stage).toBe('study');
  expect(controller.resume(progress).world.stage).toBe('study');
});
it('opens with the terminal E325 beat and Continue restores the Last Page mid-attempt', () => {
  const intro = controller.init();
  expect(intro.queue[0]).toMatchObject({ cutscene: 'last-page.intro' });
  expect(screen(intro)).toContain('E325: ATTENTION');
  const playing = keys(intro, 'fOxp');
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, playing.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing save');
  expect(controller.resume(progress).world.stage).toBe('last-page');
});
it('passes stageReplayIssue for every stage with real story content', () => {
  for (const { stage, legend } of stages) expect(stageReplayIssue(
    sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
    { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
});

it.each(['O', 'E', 'R', 'D', 'Q', 'A'])('door %s has no story effect before repair', letter => {
  const chosen = keys(start(), `6jf${letter}`);
  expect(chosen.queue).toEqual([]);
  expect(chosen.story.ending).toBeNull();
  expect(chosen.story.flags['last.recover']).toBeUndefined();
});
it('keeps the supplied map and legend free of lint errors', () => {
  expect(lintStage(lastPage, lastPageLegend)).toEqual([]);
});

it(':e! after the page is whole keeps it whole: the repair was saved when the Unwriter was removed (S-1)', () => {
  // The whole-page batch removes the Unwriter, which stores a checkpoint; story and world restore together.
  const whole = dismiss(keys(start(), 'fOxpujfhudawjuddpu'));
  expect(whole.story.flags['last.whole']).toBe(true);
  expect(whole.world.entities.some(entity => entity.id === 'unwriter')).toBe(false);
  const restored = dismiss(keys(whole, ':e!<CR>'));
  expect(restored.world.stage).toBe('last-page');
  expect(restored.story.flags['last.whole']).toBe(true);
  expect(restored.world.flags['last.whole']).toBe(true);
  expect(restored.world.entities.some(entity => entity.id === 'unwriter')).toBe(false);
  expect(restored.world.engine.lines[1]).toBe('E325: ATTENTION');
});

it(':e! before the page is whole restores a torn, unrepaired page and closed doors (S-1)', () => {
  const partial = dismiss(keys(start(), 'fOxpu'));
  const restored = dismiss(keys(partial, ':e!<CR>'));
  expect(restored.world.engine.lines[1]).toBe('E325: ATTENTOIN');
  expect(restored.story.flags['last.whole']).not.toBe(true);
  expect(restored.world.entities.some(entity => entity.id === 'unwriter')).toBe(true);
});
