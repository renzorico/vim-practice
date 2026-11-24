import { describe, expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import type { Legend, TileDef } from '@escape/world';
import { changedTerrainRows, edgesFor, terrainGroup, tileAt } from './edges.js';
import { decorationAt, groundVariant, particleCount, positionHash, shadowScale, titleRowGone, TITLE_ROW_CLOCK_MS } from './life.js';
import { groundArt, terrainArt } from './art.js';
import { WORLD_PALETTES, contrastRatio } from '../palette.js';

const tile = (char: string, sprite: string, kind: TileDef['kind'], walkable: boolean): TileDef =>
  ({ char, sprite, kind, walkable, fixed: false, label: sprite });
const ground = tile(' ', 'dirt', 'ground', true);
const legend: Legend = { id: 'test', tiles: [ground, tile('~', 'river', 'barrier', false),
  tile('#', 'bedrock', 'barrier', false), tile('=', 'plank', 'barrier', true), tile('x', 'rubble', 'object', false)], fallback: ground };

describe('terrain edges from the authoritative buffer', () => {
  it('finds water rectangle sides and corners, preserving interior joins', () => {
    const rows = ['     ', ' ~~~ ', ' ~~~ ', '     '];
    expect(edgesFor(rows, { line: 1, col: 1 }, legend)).toMatchObject({ group: 'water', mask: 1 | 8 | 16 | 32 | 128 });
    expect(edgesFor(rows, { line: 1, col: 2 }, legend).mask & 15).toBe(1);
    expect(edgesFor(rows, { line: 0, col: 2 }, legend).shore).toBe(4);
  });
  it('lights the wall top, shades the front and casts on the cell below', () => {
    const rows = ['   ', ' ##', ' # ', '   '];
    const edges = edgesFor(rows, { line: 1, col: 2 }, legend);
    expect(edges.mask & 5).toBe(5);
    expect(terrainArt(edges, 'quarry', 0, false, 0)).toEqual(expect.arrayContaining([
      expect.objectContaining({ y: 0, height: 4 }), expect.objectContaining({ y: 11, height: 5 }),
    ]));
    expect(edgesFor(rows, { line: 2, col: 2 }, legend).cast).toBe(true);
  });
  it('recomputes neighbours after an actual engine x shifts a row', () => {
    const engine = createEngine();
    const before = engine.init([' ~x~~ ', '      '], { line: 0, col: 2 });
    const after = engine.step(before, 'x');
    expect(after.commands[0]?.id).toBe('x');
    expect(edgesFor(before.lines, { line: 0, col: 1 }, legend).mask & 2).toBe(2);
    expect(edgesFor(after.state.lines, { line: 0, col: 1 }, legend).mask & 2).toBe(0);
    expect(edgesFor(after.state.lines, { line: 1, col: 4 }, legend).shore).toBe(0);
  });
  it('adds posts to a plank row across water and never calls ragged paper land', () => {
    const rows = ['~~~~~', '=====', '~~~~~'];
    expect(edgesFor(rows, { line: 1, col: 2 }, legend)).toMatchObject({ group: 'road', posts: true, shore: 5 });
    expect(edgesFor(['~', ''], { line: 0, col: 0 }, legend).group).toBe('water');
    expect(edgesFor(['~', ''], { line: 1, col: 0 }, legend).group).toBe('paper');
    expect(tileAt([''], { line: 0, col: 0 }, { ...legend, emptyRow: ground })).toBe(ground);
  });
});
it('decorates deterministically, below six percent, only on walkable ground', () => {
  let count = 0;
  const variants = new Set<number>();
  for (let line = 0; line < 100; line++) for (let col = 0; col < 100; col++) {
    expect(positionHash(line, col)).toBe(positionHash(line, col));
    variants.add(groundVariant(line, col));
    if (decorationAt(ground, line, col)) count++;
    for (const obstacle of legend.tiles.filter(tile => tile !== ground)) expect(decorationAt(obstacle, line, col)).toBe(false);
    expect(decorationAt({ ...ground, walkable: false }, line, col)).toBe(false);
  }
  expect(count).toBeGreaterThan(350); expect(count).toBeLessThan(600); expect(variants.size).toBe(4);
});
it('caps ambient particles and suppresses motion in dark or reduced-motion stages', () => {
  expect(particleCount(false, false, 'quarry')).toBe(24);
  expect(particleCount(true, false, 'quarry')).toBe(0);
  expect(particleCount(false, true, 'quarry')).toBe(0);
  expect(shadowScale(30)).toBeLessThan(shadowScale(0));
});
it('keeps foreground pigments and the title menu readable over each world ground', () => {
  for (const palette of Object.values(WORLD_PALETTES)) {
    expect(Object.keys(palette)).toHaveLength(12);
    for (const background of [palette.ground, palette.grain, palette.light]) expect(contrastRatio(palette.accent, background)).toBeGreaterThanOrEqual(3);
  }
  expect(contrastRatio(0xf6efd4, 0x182523)).toBeGreaterThanOrEqual(4.5);
});
it('keeps decoration within a five-pixel band and foam phase deterministic', () => {
  const edges = edgesFor([' ~'], { line: 0, col: 0 }, legend);
  const water = edgesFor([' ~'], { line: 0, col: 1 }, legend);
  expect(terrainArt(edges, 'margin', 0, true, 0)).toEqual(terrainArt(edges, 'margin', 0, true, 1));
  expect(terrainArt(water, 'margin', 0, false, 0)).toEqual(terrainArt(water, 'margin', 0, false, 0));
  expect(terrainArt(water, 'margin', 0, false, 0)).not.toEqual(terrainArt(water, 'margin', 0, false, 1));
});

it('uses the tested foreground pigment for real actor and item outlines', async () => {
  const { outlineArt } = await import('./outline.js');
  const { SPRITES } = await import('../sprites/index.js');
  for (const palette of Object.values(WORLD_PALETTES)) for (const name of ['player', 'blot', 'dot', 'save-stone']) {
    const outline = outlineArt(SPRITES[name], palette.ink);
    expect(outline.length).toBeGreaterThan(0);
    for (const pixel of outline) expect(contrastRatio(pixel.color, palette.ground)).toBeGreaterThanOrEqual(3);
  }
});

it('alternates the title row on an eight-second clock and keeps paper still with reduced motion', () => {
  expect(TITLE_ROW_CLOCK_MS).toBe(8000);
  expect([0, 1, 2, 3].map(tick => titleRowGone(tick, false))).toEqual([false, true, false, true]);
  expect([0, 1, 2, 3].every(tick => !titleRowGone(tick, true))).toBe(true);
});
it('puts an opaque ground under see-through objects, and leaves drops and blanks to their own sprite', () => {
  expect(groundArt('quarry', 0)[0]).toMatchObject({ x: 0, y: 0, width: 16, height: 16, color: WORLD_PALETTES.quarry.ground, alpha: 1 });
  const chasm = { ...legend, tiles: [...legend.tiles, tile('c', 'chasm', 'barrier', false)] };
  const edges = edgesFor(['c '], { line: 0, col: 0 }, chasm);
  expect(edges.group).toBe('open');
  expect(terrainArt(edges, 'quarry', 0, false, 0)).toEqual([]);
  expect(edgesFor([' '], { line: 0, col: 3 }, chasm).group).toBe('paper');
});

it('limits cast shadows to receiving ground, road, water and objects', () => {
  const types = ['dirt', 'plank', 'river', 'stone', 'bedrock', 'house-roof', 'air'];
  for (const above of ['bedrock', 'house-roof']) for (const sprite of types) {
    const local: Legend = { ...legend, tiles: [tile('#', above, 'barrier', false), tile('x', sprite, sprite === 'dirt' ? 'ground' : 'object', true)] };
    expect(edgesFor(['#', 'x'], { line: 1, col: 0 }, local).cast, `${above} -> ${sprite}`)
      .toBe(['dirt', 'plank', 'river', 'stone'].includes(sprite));
    expect(edgesFor(['#', ''], { line: 1, col: 1 }, local).cast).toBe(false);
  }
});
it('rebuilds only changed rows and adjacent joins, or the suffix when row count changes', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'];
  expect([...changedTerrainRows(rows, [...rows])]).toEqual([]);
  expect([...changedTerrainRows(rows, ['a', 'b', 'X', 'd', 'e', 'f'])]).toEqual([1, 2, 3]);
  expect([...changedTerrainRows(rows, ['a', 'b', 'c', 'e', 'f'])]).toEqual([2, 3, 4]);
  expect([...changedTerrainRows(rows, ['a', 'b', 'X', 'c', 'd', 'e', 'f'])]).toEqual([1, 2, 3, 4, 5, 6]);
});
it('keeps ground and paper out of edge overlays; decoration belongs to ground art', () => {
  for (const group of ['ground', 'paper'] as const) expect(terrainArt({ group, mask: 0, shore: 0, cast: false, posts: false }, 'margin', 0, true, 0)).toEqual([]);
  expect(groundArt('margin', 0, true).length).toBeGreaterThan(groundArt('margin', 0).length);
});
it('builds a distinct outline for every drawn idle frame', async () => {
  const { outlineArt } = await import('./outline.js');
  const art = { palette: { x: '#ffffff' }, frames: [[' x '], ['   ', ' x ']] };
  expect(outlineArt(art, 0)).not.toEqual(outlineArt(art, 0, 1));
});
it('provides 3:1 fills or a 3:1 ink silhouette for obstacles on every ground', async () => {
  const { SPRITES } = await import('../sprites/index.js');
  const { outlineArt } = await import('./outline.js');
  for (const [world, palette] of Object.entries(WORLD_PALETTES)) {
    const fills = [palette.face, palette.wall, palette.water, ...['house-roof', 'gate', 'tree', 'stone', 'blot'].flatMap(name =>
      Object.values(SPRITES[name]?.palette ?? {}).filter(color => color !== 'transparent').map(color => Number.parseInt(color.slice(1), 16)))];
    for (const ground of [palette.ground, palette.grain, palette.light]) for (const fill of fills) {
      expect(Math.max(contrastRatio(fill, ground), contrastRatio(palette.ink, ground)), `${world}: ${fill}`).toBeGreaterThanOrEqual(3);
    }
    for (const name of ['gate', 'tree', 'stone', 'blot']) expect(outlineArt(SPRITES[name], palette.ink).length).toBeGreaterThan(0);
    for (const group of ['wall', 'roof', 'water'] as const) expect(terrainArt({ group, mask: 15, shore: 0, cast: false, posts: false }, world as keyof typeof WORLD_PALETTES, 0, false, 0)).toContainEqual(expect.objectContaining({ color: palette.ink, alpha: 1 }));
  }
});
it('classifies every shipped legend sprite explicitly, without substring matches', () => {
  const intended = {
    ground: ["archive-aisle", "clearing", "dirt", "grass", "page-paper", "shelf-gap", "stone-floor"],
    object: ["archive-post", "archive-rail", "atlas-shelf", "bible-shelf", "book", "bramble", "cave-floor", "chain", "clause-quote", "clause-text", "clerk-desk", "counter-floor", "crate-end", "crate-lip", "crates", "crystal-dark", "customs-floor", "customs-post", "dust", "echo-rune", "fake", "fern", "gallery", "gate", "gate-close", "gate-open", "gravel", "hollow", "hoofprint", "keys", "knot", "ladder", "lamp", "lamp-oil", "leaves", "lighthouse-door", "lock-left", "lock-right", "minotaur-lair", "misfiled-shelf", "mortar", "moss", "nets", "notary-desk", "oil", "page-ink", "page-margin", "pier-post", "pillar", "reading-floor", "reading-post", "rock", "rope", "rubble", "rune-lever", "save-stone", "scaffold", "seal-left", "seal-right", "shackle-open-left", "shackle-open-right", "shelf-end", "shelf-lip", "shelf-post", "stone", "stone-floor", "tag-close", "tag-open", "tag-slash", "tent", "thorns", "tree", "unknown", "vault-floor", "warehouse", "warehouse-floor", "wax", "well"],
    open: ["air", "blank", "chasm", "clause-gap", "page-blank", "page-void"],
    road: ["boards", "branch", "crystal-ledge", "jetty", "ledge", "plank", "platform", "road"],
    wall: ["bedrock", "cave-rock", "counter-wall", "customs-wall", "heartwood", "house-wall", "library-wall", "tower-wall", "trunk", "vault-wall", "warehouse-wall"],
    water: ["river", "water"],
  };
  const legends = import.meta.glob<Legend>('../../../../../packages/world/content/**/*.legend.json', { eager: true, import: 'default' });
  expect(Object.keys(legends).length).toBeGreaterThan(20);
  for (const legend of Object.values(legends)) for (const tile of [...legend.tiles, legend.fallback, ...(legend.emptyRow ? [legend.emptyRow] : [])]) {
    // stone-floor appears as both a ground character and a barrier character in the source legends.
    const expected = tile.sprite === 'stone-floor' ? (tile.kind === 'ground' ? 'ground' : 'object')
      : Object.entries(intended).find(([, sprites]) => (sprites as readonly string[]).includes(tile.sprite))?.[0];
    expect(expected, tile.sprite).toBeDefined();
    expect(terrainGroup(tile), `${legend.id}: ${tile.sprite}`).toBe(expected);
  }
  for (const sprite of ['stairs', 'minotaur-lair', 'waterfall-sign', 'wallflower', 'roadside-sign']) {
    expect(terrainGroup(tile('x', sprite, 'object', true))).toBe('object');
  }
});
