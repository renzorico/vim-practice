import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { createSession } from './session.js';
import { stage, legend, content, lighthouse, lighthouseLegend } from './content.js';
const storyEngine = createStoryEngine();
const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine, stage, legend, content });
it('renders the story objective rather than the stage goal', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session, stage, legend, content, showSource: false,
    objectives: storyEngine.objectives(session.story, content), onAdvance: () => {},
  }));
  expect(html).toContain('Talk to the Elder. Stand next to him, press Enter.');
});
it('shows the authored death hint and any-key recovery', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, world: { ...session.world, status: 'dead', hearts: 0 } },
    stage, legend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(html).toContain('You were unwritten.');
  expect(html).toContain('30l crosses the road in one move.');
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
it('renders Mira’s portrait from the same sprite grid as the field', () => {
  const session = controller.init(false);
  const html = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, queue: [{ type: 'dialogue', dialogue: 'margin.mira', index: 0 }] },
    stage, legend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(html).toContain('<svg width="64" height="64"');
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
  expect(dead).toContain('Fewer, bigger moves: counts, w and 0.\nOutclimb the Unwriter.');
  const talking = renderToStaticMarkup(createElement(PlayScreen, {
    session: { ...session, queue: [{ type: 'dialogue', dialogue: 'lighthouse.lamplighter', index: 0 }] },
    stage: lighthouse, legend: lighthouseLegend, content, showSource: false, objectives: [], onAdvance: () => {},
  }));
  expect(talking).toContain('The Lamplighter');
  expect(talking).toContain('<svg width="64" height="64"');
});
