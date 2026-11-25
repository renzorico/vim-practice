import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, type Position } from '@escape/engine';
import { createWorldSim, type WorldState } from '@escape/world';
import { expect, it } from 'vitest';
import { stages } from '../play2/content.js';
import { signsFor } from '../play2/stageGuides.js';
import { stageZoom } from './camera.js';
import { interactionLabel, reachedEntity } from './characters.js';
import { FieldLabels } from './FieldLabels.js';
import { LABEL_HEIGHT, cellBox, labelArea, labelWidth, layoutLabels, obstaclesFor, overlap } from './labelLayout.js';
import { TILE_SIZE } from './palette.js';

const sim = createWorldSim(createEngine());
const entry = (id: string) => {
  const found = stages.find(item => item.stage.id === id);
  if (!found) throw new Error(`No stage ${id}`);
  return found;
};
const VIEWS = [{ width: 1440, height: 700 }, { width: 1024, height: 580 }, { width: 2000, height: 990 }];

/** The same stage with its empty racks stocked: the rows grow, and the labels must still find room. */
const stocked = (world: WorldState, goods: Readonly<Record<number, readonly string[]>>): WorldState => ({ ...world, engine: { ...world.engine,
  lines: world.engine.lines.map((line, index) => (goods[index] ?? []).reduce((text, item) => text.replace('[]', `[${item}]`), line)) } });
const STOCK: Readonly<Record<string, Readonly<Record<number, readonly string[]>>>> = {
  jetty: {}, warehouse: { 1: ['oooo'], 3: ['oooo'], 5: ['rrr'] }, customs: { 1: ['oooo'], 3: ['oooorrr'] },
  counter: { 7: ['oooooooo', 'rrrrrrrr', 'oooorrrr'] },
};
const CASES = ['jetty', 'warehouse', 'customs', 'counter'].flatMap(id => VIEWS.map(view => [id, view] as const));
it.each(CASES)('%s: no label covers goods, people or another label, before and after the work (%o)', (id, view) => {
  const { stage, legend } = entry(id);
  const start = sim.init(stage, legend, { learnedCommands: [], flags: {} });
  const tile = stageZoom(stage, view) * TILE_SIZE;
  for (const world of [start, stocked(start, STOCK[id] ?? {})]) {
    const signs = signsFor(world);
    expect(signs.length).toBeGreaterThan(1);
    const labels = layoutLabels(signs.map(sign => ({ id: sign.text, names: cellBox(sign.line, sign.from, sign.to, tile), width: labelWidth(sign.text), height: LABEL_HEIGHT })),
      obstaclesFor(world, legend, [], tile), labelArea(world.engine.lines, tile, view), tile);
    expect(labels).toHaveLength(signs.length);
    const area = labelArea(world.engine.lines, tile, view);
    for (const label of labels) {
      expect(overlap(label, area), label.id).toBe(label.width * label.height);
      for (const entity of world.entities) expect(overlap(label, cellBox(entity.at.line, entity.at.col, entity.at.col, tile)), `${label.id} on ${entity.id}`).toBe(0);
      for (const sign of signs) expect(overlap(label, cellBox(sign.line, sign.from, sign.to, tile)), `${label.id} on ${sign.text}`).toBe(0);
      for (const other of labels) if (other !== label) expect(overlap(label, other), `${label.id} on ${other.id}`).toBe(0);
    }
  }
});

const standing = (id: string, cursor: Position): WorldState => {
  const { stage, legend } = entry(id);
  const state = sim.init(stage, legend, { learnedCommands: [], flags: {} });
  return { ...state, engine: { ...state.engine, cursor } };
};
it.each([['quarry-road', { line: 10, col: 42 }, 'Enter: go south'], ['canopy', { line: 7, col: 27 }, 'Enter: take lift']] as const)(
  '%s: says what Enter does beside the exit', (id, cursor, text) => {
    const { stage } = entry(id);
    const state = standing(id, cursor);
    const reached = reachedEntity(stage, state);
    expect(reached && interactionLabel(reached, stage, state)).toBe(text);
  });

const render = (id: string, state: WorldState, more: object = {}): string => {
  const { stage, legend } = entry(id);
  return renderToStaticMarkup(createElement(FieldLabels, { frame: { state, events: [], stage, legend, showSource: false, ...more },
    signs: signsFor(state), named: undefined, view: { width: 1000, height: 600 }, camera: { x: 0, y: 0, zoom: 4, follow: null } }));
};
it('draws one keycap prompt beside what Enter reaches, and none while somebody speaks', () => {
  const state = standing('quarry-road', { line: 10, col: 42 });
  expect(render('quarry-road', state).match(/field-label--prompt/g)).toHaveLength(1);
  expect(render('quarry-road', state)).toContain('<kbd>Enter</kbd>go south');
  expect(render('quarry-road', state, { hideObjective: true })).not.toContain('field-label--prompt');
});
it('draws the key that lands on a tile, unless a command is half typed or the tile is dark', () => {
  const state = standing('quarry-road', { line: 10, col: 42 });
  const at = { line: 10, col: 40 };
  expect(render('quarry-road', state, { markers: [{ key: 'b', at }] })).toContain('>b</kbd>');
  expect(render('quarry-road', { ...state, pending: { type: 'key' } as unknown as WorldState['pending'] }, { markers: [{ key: 'b', at }] })).not.toContain('>b</kbd>');
  expect(render('quarry-road', state, { darkness: { radius: 1, lights: [] }, markers: [{ key: 'b', at: { line: 2, col: 2 } }] })).not.toContain('>b</kbd>');
});
