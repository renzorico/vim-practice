import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { content, ledger, ledgerLegend, stages } from './content.js';
import { createSession, type Session } from './session.js';
import { PlayScreen } from './PlayScreen.js';
import { StageClearCard } from './StageClearCard.js';
import { isScoredStage, scoreUnit, stagePar } from './stageScoring.js';
import { starsFor } from './progress.js';
import { plainText } from '../test-utils/visibleText';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const storyEngine = createStoryEngine();
const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine, content, stages, stage: ledger, legend: ledgerLegend });
const book = ledger.scripts[0]!;
const start = (): Session => {
  let session = controller.init();
  for (let count = 0; session.queue.length > 0; count += 1) {
    if (count > 60) throw new Error('Dialogue loop');
    session = controller.reduce(session, '<CR>');
  }
  return session;
};
const type = (session: Session, keys: readonly string[]) => keys.reduce(controller.reduce, session);
/** Advance through the ending to the clear card, without accepting it. */
function toClearCard(session: Session): Session {
  let next = session;
  for (let count = 0; !next.clearCard; count += 1) {
    if (count > 60) throw new Error('No clear card');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const card = (session: Session) => plainText(renderToStaticMarkup(createElement(StageClearCard, {
  session, stage: ledger, onContinue: () => {}, onReplay: () => {} })));

it('scores every text stage in keys against its script par', () => {
  for (const { stage } of stages.filter(entry => entry.stage.type === 'text')) {
    expect(isScoredStage(stage), stage.id).toBe(true);
    expect(scoreUnit(stage)).toBe('keys');
    expect(stagePar(stage)).toBe(stage.scripts[0]?.par);
  }
});

it('a par solve earns three stars, shows keys against par and records the best', () => {
  const cleared = toClearCard(type(start(), book.solution));
  expect(cleared.clearedKeys).toBe(book.par);
  expect(card(cleared)).toContain(`Keys: ${book.par} · par ${book.par}`);
  expect(card(cleared)).toContain('Par route found.');
  expect(cleared.stageEntry.best?.ledger).toEqual({ turns: book.par, stars: 3 });
});

it('a longer solve scores its keys, shows the par route and keeps the better best', () => {
  // Two wasted keys at the start: a step right and back.
  const longer = [...parseKeys('lh'), ...book.solution];
  const cleared = toClearCard(type(start(), longer));
  expect(cleared.clearedKeys).toBe(book.par + 2);
  expect(card(cleared)).toContain(`Keys: ${book.par + 2} · par ${book.par}`);
  expect(card(cleared)).toContain('Par route:');
  expect(cleared.stageEntry.best?.ledger).toEqual({ turns: book.par + 2, stars: starsFor(book.par + 2, book.par) });
});

it('the HUD counts keys while the script is open', () => {
  const session = type(start(), parseKeys('iTH'));
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session, stage: ledger, legend: ledgerLegend, content, objectives: storyEngine.objectives(session.story, content),
    showSource: false, onAdvance: () => {} }));
  expect(html.replace(/<[^>]+>/g, '')).toContain(`Keys 3 · par ${book.par}`);
});
