import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
vi.mock('./objectiveTarget.js', () => ({ objectiveTarget: vi.fn(() => null) }));
import { objectiveTarget } from './objectiveTarget.js';
import { deathHint, learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { createSession } from './session.js';
import { stage, legend, content, lighthouse, lighthouseLegend, quarry, quarryLegend, ledger, ledgerLegend } from './content.js';
const storyEngine = createStoryEngine();
const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine, stage, legend, content });
it('renders the story objective rather than the stage goal', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session, stage, legend, content, showSource: false,
    objectives: storyEngine.objectives(session.story, content), onAdvance: () => {},
  }));
  expect(html).toContain('Meet the Elder: walk `h` `j` `k` `l`, talk `Enter`.');
});
it('shows the authored death hint and any-key recovery', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, world: { ...session.world, status: 'dead', hearts: 0 } },
    stage, legend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(html).toContain('You were unwritten.');
  expect(html).toContain('`30l`: one move');
  expect(html).toContain('Press any key to return');
});
it('shows keys and hearts on clear, with no unteachable best score', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, keys: 42, world: { ...session.world, status: 'cleared' } },
    stage, legend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(html).toContain('To be continued.');
  expect(html).toContain('42 keys typed.');
  expect(html).toContain('3 of 3 hearts left.');
  expect(html).not.toContain('best');
});
it('renders Mira’s dedicated 32px portrait at 96px', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, queue: [{ type: 'dialogue', dialogue: 'margin.mira', index: 0 }] },
    stage, legend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(html).toContain('<svg width="96" height="96"');
  expect(html).toContain('Mira');
});

it('reveals keycaps only as story flags are learned', () => {
  expect(learnedKeycaps({})).toEqual(['h', 'j', 'k', 'l']);
  expect(learnedKeycaps({ 'margin.knows-counts': true, 'lowlands.knows-w': true }))
    .toEqual(['h', 'j', 'k', 'l', '3l', 'w', 'b']);
  expect(learnedKeycaps({ 'lowlands.knows-dollar': true }).slice(-2)).toEqual(['$', '0']);
});

it('shows the Lighthouse death hint and Lamplighter portrait', () => {
  const session = controller.init(false);
  const dead = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, world: { ...session.world, stage: 'lighthouse', status: 'dead', hearts: 0 } },
    stage: lighthouse, legend: lighthouseLegend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(dead).toContain('Climb in big jumps: `8k` goes up eight rows.\n`w` and `0` jump along a row.');
  const talking = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, queue: [{ type: 'dialogue', dialogue: 'lighthouse.lamplighter', index: 0 }] },
    stage: lighthouse, legend: lighthouseLegend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(talking).toContain('The Lamplighter');
  expect(talking).toContain('<svg width="96" height="96"');
});

it('reveals Quarry keycaps from flags and selects its authored death hint', () => {
  expect(learnedKeycaps({ 'quarry.knows-x': true }).slice(-2)).toEqual(['x', '4x']);
  expect(learnedKeycaps({ 'quarry.knows-r': true }).slice(-2)).toEqual(['r', '5r=']);
  expect(deathHint(content, 'quarry-road')).toBe('Rubble: `4x` from the last gravel before it.\nRiver: `5r=` from the last dirt before it.');
  expect(deathHint(content, 'unknown')).toBe(deathHint(content, 'margin'));
});

it('shows start over from the Quarry onward', () => {
  const session = controller.init(false);
  for (const entry of [{ stage, legend }, { stage: quarry, legend: quarryLegend }]) {
    const html = renderToStaticMarkup(createElement(PlayScreen, {
      session, ...entry, content, showSource: false, objectives: [], onAdvance: () => {},
    }));
    expect(html.includes('<kbd>:e!</kbd> start over')).toBe(entry.stage.world === 'quarry');
  }
});

it('hides HUD par for text stages and announces only blocked reasons', () => {
  const session = controller.init(false);
  const render = (blocked: boolean) => renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, lastEvents: blocked ? [{ type: 'bump', reason: 'edge', at: { line: 0, col: 0 } }] : [] },
    stage: ledger, legend: ledgerLegend, content, objectives: [], showSource: false, onAdvance: () => {},
  }));
  expect(render(false)).not.toContain('par 0');
  expect(render(false)).toContain('aria-live="off"');
  expect(render(true)).toContain('aria-live="polite"');
  expect(render(true)).toContain('The edge of the world.');
});


it('hides the Margin par and explains the Tab view', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session, stage, legend, content, objectives: [], showSource: false, onAdvance: () => {},
  }));
  expect(html).not.toContain(' · par');
  expect(html).toContain('Hold <kbd>Tab</kbd> to see the file');
});

it('resolves objective targets only when an arrow can show', () => {
  const session = controller.init(false);
  const render = (changes: Partial<typeof session>, selectedStage = stage) => {
    vi.mocked(objectiveTarget).mockClear();
    renderToStaticMarkup(createElement(PlayScreen, {
      session: { ...session, ...changes }, stage: selectedStage, legend, content,
      objectives: [], showSource: false, onAdvance: () => {},
    }));
  };
  render({});
  expect(objectiveTarget).toHaveBeenCalledOnce();
  render({}, { ...stage, id: 'mouth' });
  expect(objectiveTarget).not.toHaveBeenCalled();
  render({}, ledger);
  expect(objectiveTarget).not.toHaveBeenCalled();
  render({ queue: [{ type: 'dialogue', dialogue: 'margin.mira', index: 0 }] });
  expect(objectiveTarget).not.toHaveBeenCalled();
  render({ clearCard: true });
  expect(objectiveTarget).not.toHaveBeenCalled();
  render({ world: { ...session.world, status: 'dead' } });
  expect(objectiveTarget).not.toHaveBeenCalled();
});

it('shows Quarry instructions after its intro, and never on a cleared replay', () => {
  const quarryGame = createSession({ sim: createWorldSim(createEngine()), storyEngine, stage: quarry, legend: quarryLegend, content });
  const session = quarryGame.init(false);
  const render = (current: typeof session) => renderToStaticMarkup(createElement(PlayScreen, {
    session: current, stage: quarry, legend: quarryLegend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  const html = render(session);
  expect(html).toContain('Your new keys');
  expect(html).toContain('Delete the character under you.');
  expect(html).toContain('Replace one character');
  expect(html).not.toContain('Delete the whole line.');
  expect(render({ ...session, queue: [{ type: 'dialogue', dialogue: 'quarry-road.intro', index: 0 }] })).not.toContain('Your new keys');
  expect(render({ ...session, story: { ...session.story, clearedStages: ['quarry-road'] } })).not.toContain('Your new keys');
  const replayed = renderToStaticMarkup(createElement(PlayScreen, {
    session, stage: quarry, legend: quarryLegend, content, showSource: false, objectives: [], onAdvance: () => {}, clearedStages: ['quarry-road'],
  }));
  expect(replayed).not.toContain('Your new keys');
  expect(session.world.turn).toBe(0);
});
it('renders the current guide as keycaps under the objective', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, story: { ...session.story, clearedStages: ['margin'] } },
    stage, legend, content, showSource: false,
    objectives: storyEngine.objectives(session.story, content), onAdvance: () => {},
  }));
  expect(html).toContain('Do:');
  expect(html).toContain('Stand on the marker');
  expect(html).toContain('<kbd>Enter</kbd>');
});
