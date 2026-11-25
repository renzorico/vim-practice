import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldSim, playKeys, FIXTURE_LEGEND, FIXTURE_STAGE, type WorldStepResult } from '@escape/world';
import { FIXTURE_INITIAL_STATE } from './fixtureFrames.js';

const fake = vi.hoisted(() => {
  /** Mocks are made on first use: vitest keeps every mock alive, and a terrain map has thousands of images. */
  const lazyMocks = <Name extends string>(target: object, names: readonly Name[], make: () => ReturnType<typeof vi.fn>) => {
    for (const name of names) Object.defineProperty(target, name, { configurable: true, enumerable: true, get() {
      const value = make();
      Object.defineProperty(target, name, { value, configurable: true, enumerable: true, writable: true });
      return value;
    } });
    return target as Record<Name, ReturnType<typeof vi.fn>>;
  };
  const CHAINED = ['setAngle', 'setFlipX', 'setDisplaySize', 'setScale', 'setScrollFactor', 'setOrigin', 'setTintFill',
    'setBlendMode', 'sort', 'clearTint', 'addAt', 'setTint', 'add', 'setStroke'] as const;
  const object = () => {
    const base = {
      x: 0, y: 0, alpha: 1, depth: 0, texture: '', text: '', visible: true,
      setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
      setAlpha(value: number) { this.alpha = value; return this; },
      setDepth(value: number) { this.depth = value; return this; },
      setVisible(value: boolean) { this.visible = value; return this; },
      setText(value: string) { this.text = value; return this; },
    };
    lazyMocks(base, CHAINED, () => vi.fn().mockReturnThis());
    lazyMocks(base, ['removeAll', 'destroy'], () => vi.fn());
    lazyMocks(base, ['setTexture'], () => vi.fn(function (this: { texture: string }, value: string) { this.texture = value; return this; }));
    return base as typeof base & Record<typeof CHAINED[number] | 'removeAll' | 'destroy' | 'setTexture', ReturnType<typeof vi.fn>>;
  };
  return { object, images: [] as ReturnType<typeof object>[], texts: [] as ReturnType<typeof object>[],
    containers: [] as ReturnType<typeof object>[], killAll: vi.fn(), tween: vi.fn(),
    pixels: new Map<string, number[][]>(), colors: new Map<string, Set<number>>(), background: vi.fn(), strokeText: vi.fn(), fillText: vi.fn(), idle: vi.fn(),
    scale: { width: 900, height: 600 }, centerOn: vi.fn(), on: vi.fn(), off: vi.fn(), once: vi.fn(), textures: new Set<string>() };
});
vi.mock('phaser', () => ({ default: {
  BlendModes: { ADD: 1 },
  Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Scale: { Events: { RESIZE: 'resize' } },
  Scene: class {
    add = {
      image: (x: number, y: number, texture: string) => {
        const result = fake.object(); result.setPosition(x, y); result.texture = texture; fake.images.push(result); return result;
      },
      text: (_x: number, _y: number, text: string, style: { backgroundColor?: string }) => {
        const result = Object.assign(fake.object(), { style }); result.text = text; fake.texts.push(result); return result;
      },
      container: () => { const result = fake.object(); fake.containers.push(result); return result; },
      rectangle: (x: number, y: number) => {
        const result = fake.object(); result.setPosition(x, y); result.texture = 'rectangle'; fake.images.push(result); return result;
      },
    };
    make = { graphics: () => {
      const pixels: number[][] = [];
      const colors = new Set<number>();
      return { fillStyle(color: number, alpha = 1) { if (alpha > 0) colors.add(color); return this; }, fillRect(...rect: number[]) { pixels.push(rect); return this; },
        generateTexture: (key: string) => { fake.textures.add(key); fake.pixels.set(key, pixels); fake.colors.set(key, colors); }, destroy: vi.fn() };
    },
      text: () => ({ setOrigin() { return this; }, generateTexture: (key: string) => fake.textures.add(key), destroy: vi.fn() }) };
    textures = { exists: vi.fn((key: string) => fake.textures.has(key)),
      createCanvas: (key: string) => { fake.textures.add(key); return { context: { font: '', textAlign: '', textBaseline: '', strokeStyle: '', lineWidth: 0, fillStyle: '', strokeText: fake.strokeText, fillText: fake.fillText }, refresh: vi.fn() }; } };
    cameras = { main: { setBackgroundColor: fake.background.mockReturnThis(), setZoom() { return this; }, setRoundPixels() { return this; }, centerOn: fake.centerOn, getWorldPoint: (x: number, y: number) => ({ x, y }) } };
    tweens = { killAll: fake.killAll, add: fake.tween };
    scale = Object.assign(fake.scale, { on: fake.on, off: fake.off });
    events = { once: fake.once };
    time = { addEvent: fake.idle };
  },
} }));
import { FieldScene } from './FieldScene.js';
import { GLOW_ALPHA } from './terrain/AtmosphereLayer.js';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createSession } from '../play2/session.js';
import { content } from '../play2/content.js';
import { lastPage, lastPageLegend } from '../play2/content.js';
import { LAST_PAGE_COMMANDS, QUARRY_COMMANDS } from '../play2/session.js';
import { quarry, quarryLegend, lighthouse, lighthouseLegend, cut, cutLegend, shaft, shaftLegend } from '../play2/content.js';

const frame = { state: FIXTURE_INITIAL_STATE, events: [], legend: FIXTURE_LEGEND, stage: FIXTURE_STAGE, showSource: true };
const moving = { ...frame, state: { ...frame.state, turn: 1 }, events: [
  { type: 'player-moved' as const, from: { line: 2, col: 0 }, to: { line: 2, col: 40 }, style: 'walk' as const },
] };

beforeEach(() => {
  vi.clearAllMocks(); fake.scale.width = 900; fake.scale.height = 600; fake.images.length = 0; fake.texts.length = 0; fake.containers.length = 0; fake.textures.clear(); fake.pixels.clear(); fake.colors.clear();
});
describe('FieldScene without canvas', () => {
  it('centres the fixture and recomputes camera bounds after resize and buffer edits', () => {
    const scene = new FieldScene(frame, false); scene.create();
    expect(fake.centerOn).toHaveBeenLastCalledWith(128, 32);
    const resize = fake.on.mock.calls[0]?.[1];
    fake.scale.width = 300;
    if (typeof resize === 'function') resize.call(scene);
    expect(fake.centerOn).toHaveBeenLastCalledWith(50, 32);
    scene.present({ ...frame, state: { ...frame.state, engine: { ...frame.state.engine, lines: ['short'] } } });
    expect(fake.centerOn).toHaveBeenLastCalledWith(40, 8);
  });
  it('leaves identical frames completely untouched during playback', () => {
    const scene = new FieldScene(frame, false); scene.create(); scene.present(moving);
    const kills = fake.killAll.mock.calls.length; const images = fake.images.length;
    scene.present({ ...moving });
    expect(fake.killAll).toHaveBeenCalledTimes(kills);
    expect(fake.images).toHaveLength(images);
  });
  it('uses one clock for a forty-cell walk', () => {
    const scene = new FieldScene(frame, false); scene.create(); scene.present(moving);
    expect(fake.tween).toHaveBeenCalledTimes(1);
    expect(fake.tween.mock.calls[0]?.[0]).toMatchObject({ duration: 420 });
  });
  it('places actors over transparent glyph images and caches glyph textures', () => {
    const scene = new FieldScene(frame, false); scene.create();
    expect(fake.containers[1]?.depth).toBeGreaterThan(fake.containers[2]?.depth ?? 0);
    expect(fake.texts).toHaveLength(1);
    expect([...fake.textures].filter(key => key.startsWith('glyph:')).length).toBeGreaterThan(0);
  });
  it('reuses unchanged cell images across new states and source toggles', () => {
    const scene = new FieldScene(frame, false); scene.create();
    const cells = fake.images.filter(image => image.texture.startsWith('terrain:ground-tile:'));
    scene.present({ ...frame, state: { ...frame.state, turn: 1 }, showSource: false });
    for (const cell of cells) expect(cell.destroy).not.toHaveBeenCalled();
    expect(fake.containers[0]?.removeAll).not.toHaveBeenCalled();
  });
  it('registers resize positioning and removes it on shutdown', () => {
    const scene = new FieldScene(frame, false); scene.create();
    expect(fake.on).toHaveBeenCalledWith('resize', expect.any(Function), scene);
    const resize = fake.on.mock.calls[0]?.[1];
    fake.scale.width = 1200;
    if (typeof resize === 'function') resize.call(scene);
    expect(fake.texts[0]?.x).toBeCloseTo(1200 / 3 + 8 / 3);
    const shutdown = fake.once.mock.calls[0]?.[1];
    if (typeof shutdown === 'function') shutdown();
    expect(fake.off).toHaveBeenCalledWith('resize', resize, scene);
  });
  it('creates a removal ghost at the last preceding move destination', () => {
    const scene = new FieldScene(frame, false); scene.create();
    scene.present({ ...frame, state: { ...frame.state, entities: [] }, events: [
      { type: 'entity-moved', entity: 'blot-1', from: { line: 3, col: 14 }, to: { line: 3, col: 13 } },
      { type: 'entity-moved', entity: 'blot-1', from: { line: 3, col: 13 }, to: { line: 2, col: 13 } },
      { type: 'entity-removed', entity: 'blot-1', cause: 'effect' },
    ] });
    const ghost = fake.images.filter(image => image.texture === 'field:blot').at(-1);
    // Frame 0 is drawn at once (start of the move); by the end of the move it is at the destination.
    const config = fake.tween.mock.calls[0]?.[0];
    config.targets.value = 0.65; config.onUpdate();
    expect(ghost?.x).toBe(13 * 16 + 8); expect(ghost?.y).toBe(2 * 16 + 8);
  });
});

it('flashes only effect-driven affected rows and restores them on completion', () => {
  const scene = new FieldScene(frame, false); scene.create();
  scene.present({ ...frame, state: { ...frame.state, turn: 1 }, events: [
    { type: 'rows-changed', fromLine: 1, toLine: 1, lineDelta: 0, by: 'effect' },
  ] });
  const config = fake.tween.mock.calls[0]?.[0];
  config.targets.value = 0.5;
  config.onUpdate();
  const tiles = fake.images.filter(image => image.texture.startsWith('field:') && image.texture !== 'field:player' && image.texture !== 'field:blot' && image.texture !== 'field:sign');
  for (const tile of tiles) {
    if (tile.y === 24) expect(tile.setTintFill).toHaveBeenCalledWith(0xffffff);
    else expect(tile.setTintFill).not.toHaveBeenCalled();
  }
  config.onComplete();
  expect(fake.containers[0]?.alpha).toBe(1);
  for (const tile of tiles) expect(tile.clearTint).toHaveBeenCalled();
});
it('updates only changed cell textures and removes only vanished cells', () => {
  const scene = new FieldScene(frame, false); scene.create();
  const grass = fake.images.find(image => image.texture.startsWith('terrain:ground-tile:') && image.x === 8 && image.y === 8);
  const glyph = fake.images.find(image => image.texture.startsWith('glyph:') && image.x === 8 && image.y === 8);
  const vanished = fake.images.filter(image => image.y === 56 && (image.texture.startsWith('glyph:') || image.texture.startsWith('terrain:ground-tile:') || image.texture === 'field:tree'));
  scene.present({ ...frame, state: { ...frame.state, engine: { ...frame.state.engine, lines: ['o' + FIXTURE_STAGE.map[0]?.slice(1), ...FIXTURE_STAGE.map.slice(1, 3)] } } });
  expect(grass?.setTexture).toHaveBeenCalledOnce();
  expect(grass?.setTexture).toHaveBeenCalledWith('field:stone');
  expect(glyph?.setTexture).toHaveBeenCalledOnce();
  expect(glyph?.setTexture).toHaveBeenCalledWith('glyph:111');
  for (const cell of vanished) expect(cell.destroy).toHaveBeenCalledOnce();
});
it('keeps ghosts visible through movement and fades after the move span', () => {
  const scene = new FieldScene(frame, false); scene.create();
  scene.present({ ...frame, state: { ...frame.state, entities: [] }, events: [
    { type: 'entity-moved', entity: 'blot-1', from: { line: 3, col: 14 }, to: { line: 3, col: 13 } },
    { type: 'entity-removed', entity: 'blot-1', cause: 'effect' },
  ] });
  const ghost = fake.images.filter(image => image.texture === 'field:blot').at(-1);
  const config = fake.tween.mock.calls[0]?.[0];
  config.targets.value = 0.325; config.onUpdate();
  expect(ghost?.alpha).toBe(1); expect(ghost?.x).toBe(220);
  config.targets.value = 0.825; config.onUpdate();
  expect(ghost?.alpha).toBeCloseTo(0.5); expect(ghost?.x).toBe(216);
});

it('scrolls the camera with the player during playback and ends on the final cell', () => {
  fake.scale.width = 150; // narrower than the map, so the camera has to scroll
  const arrived = { ...moving, state: { ...moving.state, engine: { ...moving.state.engine, cursor: { line: 2, col: 40 } } } };
  const scene = new FieldScene(frame, false); scene.create(); scene.present(arrived);
  // The first frame is drawn at once: the camera starts at the old cell, not the new one.
  const start = fake.centerOn.mock.calls.at(-1) as number[];
  const config = fake.tween.mock.calls[0]?.[0];
  config.targets.value = 0.5; config.onUpdate();
  const middle = fake.centerOn.mock.calls.at(-1) as number[];
  config.targets.value = 1; config.onUpdate();
  const end = fake.centerOn.mock.calls.at(-1) as number[];
  scene.finish();
  expect(fake.centerOn.mock.calls.at(-1)).toEqual(end);
  expect(start[0]).toBeLessThan(middle[0] as number);
  expect(middle[0]).toBeLessThanOrEqual(end[0] as number); // the camera clamps at the map edge
});

it('refreshes cell textures when only the legend changes', () => {
  const scene = new FieldScene(frame, false); scene.create();
  const grass = fake.images.find(image => image.texture.startsWith('terrain:ground-tile:'));
  scene.present({ ...frame, legend: { ...frame.legend, tiles: frame.legend.tiles.map(tile =>
    tile.sprite === 'grass' ? { ...tile, sprite: 'stone', kind: 'object' as const } : tile) } });
  expect(grass?.setTexture).toHaveBeenCalledWith('field:stone');
});

it('does not rebuild actors or prompts when finish has no active tween', () => {
  const scene = new FieldScene(frame, false); scene.create();
  const images = fake.images.length;
  const resets = fake.containers[3]?.removeAll.mock.calls.length;
  scene.finish(); scene.finish();
  expect(fake.images).toHaveLength(images);
  expect(fake.containers[3]?.removeAll).toHaveBeenCalledTimes(resets ?? 0);
  expect(fake.killAll).not.toHaveBeenCalled();
  scene.present(moving); scene.finish();
  const finishedImages = fake.images.length;
  scene.finish();
  expect(fake.images).toHaveLength(finishedImages);
  expect(fake.killAll).toHaveBeenCalledOnce();
});
it('draws each tab as a single source arrow', () => {
  const scene = new FieldScene({ ...frame, state: { ...frame.state,
    engine: { ...frame.state.engine, lines: ['\t'] } } }, false);
  scene.create();
  expect(fake.fillText).toHaveBeenCalledWith('→', 8, 8);
  expect(fake.strokeText).toHaveBeenCalledWith('→', 8, 8);
  expect(fake.fillText).not.toHaveBeenCalledWith('\t', 8, 8);
});

it('retains a deleted row as ghosts and wipes left to right within 180 ms, then cleans up', () => {
  const scene = new FieldScene(frame, false); scene.create();
  scene.present({ ...frame, state: { ...frame.state, engine: {
    ...frame.state.engine, lines: frame.state.engine.lines.slice(0, -1),
  } }, events: [{ type: 'rows-changed', fromLine: 3, toLine: 3, lineDelta: -1, by: 'entity' }] });
  const ghosts = fake.images.filter(image => image.depth === 1 && image.y === 56);
  expect(ghosts).toHaveLength(16);
  const config = fake.tween.mock.calls[0]?.[0];
  expect(config.duration).toBe(180);
  config.targets.value = 0.5; config.onUpdate();
  expect(ghosts[0]?.alpha).toBe(0);
  expect(ghosts.at(-1)?.alpha).toBe(1);
  scene.finish();
  for (const ghost of ghosts) expect(ghost.destroy).toHaveBeenCalledOnce();
});
it('skips deleted row ghosts with reduced motion', () => {
  const scene = new FieldScene(frame, true); scene.create();
  scene.present({ ...frame, state: { ...frame.state, engine: {
    ...frame.state.engine, lines: frame.state.engine.lines.slice(0, -1),
  } }, events: [{ type: 'rows-changed', fromLine: 3, toLine: 3, lineDelta: -1, by: 'entity' }] });
  expect(fake.tween).not.toHaveBeenCalled();
  expect(fake.images.filter(image => image.depth === 1 && image.y === 56)).toEqual([]);
});
it('shows the dark bottom edge while the Unwriter is present and removes it when gone', () => {
  const unwriter = { id: 'unwriter', at: { line: 1, col: 1 }, pathIndex: 0, def: {
    id: 'unwriter', kind: 'unwriter' as const, sprite: 'unwriter', at: { line: 1, col: 1 },
    behaviour: { type: 'unwrite' as const, path: [{ line: 3, col: 0 }] }, every: 1, damage: 0, solid: true,
  } };
  const scene = new FieldScene({ ...frame, state: { ...frame.state, entities: [unwriter] } }, false);
  scene.create();
  const edge = fake.images.find(image => image.texture === 'field:unwrite-edge');
  expect(edge?.visible).toBe(true);
  scene.present({ ...frame, state: { ...frame.state, entities: [] } });
  expect(edge?.visible).toBe(false);
});

it('swaps the lamp sprite when lighthouse.lit changes without a buffer edit', () => {
  const initial = { ...frame, stage: lighthouse, legend: lighthouseLegend, state: {
    ...frame.state, stage: lighthouse.id, flags: {}, entities: [],
    engine: { ...frame.state.engine, lines: lighthouse.map, cursor: lighthouse.start },
  } };
  const scene = new FieldScene(initial, false); scene.create();
  const lamp = fake.images.find(image => image.texture === 'field:lamp');
  expect(lamp).toBeDefined();
  scene.present({ ...initial, state: { ...initial.state, flags: { 'lighthouse.lit': true } },
    events: [{ type: 'flag-set', flag: 'lighthouse.lit', value: true }] });
  expect(lamp?.setTexture).toHaveBeenCalledWith('field:lamp-lit');
  expect(lamp?.destroy).not.toHaveBeenCalled();
});

it.each([
  { command: 'x', approach: '13l', removed: 0 },
  { command: '4x', approach: '13l', removed: 4 },
  { command: '5r=', approach: '13l4x8l2j7l', removed: 5 },
  { command: '5x', approach: '13l4x8l2j7l', removed: 5 },
])('redraws $command immediately with one dust frame and no white flash', ({ command, approach, removed }) => {
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
  const before = playKeys(sim, quarry, quarryLegend, options, [...approach]).state;
  const initial = { state: before, events: [], stage: quarry, legend: quarryLegend, showSource: true };
  const scene = new FieldScene(initial, false); scene.create();
  let state = before;
  for (const key of command) {
    const result = sim.step(state, key, quarry, quarryLegend, options);
    state = result.state;
    scene.present({ ...initial, ...result });
  }
  const dust = fake.images.filter(image => image.texture === 'field:dust');
  expect(dust).toHaveLength(removed);
  for (const [offset, image] of dust.entries()) {
    expect(image.x).toBe((before.engine.cursor.col + offset) * 16 + 8);
    expect(image.y).toBe(before.engine.cursor.line * 16 + 8);
  }
  const row = state.engine.cursor.line;
  const tiles = fake.images.filter(image => (image.texture.startsWith('terrain:ground-tile:') || quarryLegend.tiles.some(tile => image.texture.startsWith(`field:${tile.sprite}`)))
    && image.depth === 0 && image.y === row * 16 + 8 && image.destroy.mock.calls.length === 0);
  expect(tiles).toHaveLength(state.engine.lines[row]?.length ?? 0);
  for (const [col, char] of [...state.engine.lines[row] ?? ''].entries()) {
    const tile = tiles.find(image => image.x === col * 16 + 8);
    const sprite = quarryLegend.tiles.find(tile => tile.char === char)?.sprite;
    expect(tile?.texture).toMatch(sprite === 'dirt' ? /^terrain:ground-tile:/ : new RegExp(`^field:${sprite}`));
  }
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  expect(clock.duration).toBeLessThanOrEqual(180);
  if (removed) {
    clock.targets.value = 59 / clock.duration; clock.onUpdate();
    for (const image of dust) expect(image.destroy).not.toHaveBeenCalled();
    clock.targets.value = 60 / clock.duration; clock.onUpdate();
    for (const image of dust) expect(image.destroy).toHaveBeenCalledOnce();
  }
  for (const tile of tiles) expect(tile.setTintFill).not.toHaveBeenCalled();
});

it('draws missing row ends as unwritten paper without source glyphs', () => {
  const initial = { ...frame, state: { ...frame.state, engine: { ...frame.state.engine, lines: ['ooo', 'o'] } } };
  const scene = new FieldScene(initial, false); scene.create();
  const paper = fake.images.find(image => image.x === 24 && image.y === 24 && image.texture.startsWith('terrain:paper-tile:'));
  expect(paper).toBeDefined();
  const source = fake.images.find(image => image.x === 24 && image.y === 24 && image.texture.startsWith('glyph:'));
  expect(source?.visible).toBe(false);
  expect(initial.state.engine.lines[1]).toHaveLength(1);
});
it('draws nothing past the end of an authored row: only deleted text leaves paper', () => {
  const uneven = { ...frame, stage: { ...frame.stage, map: ['ooo', 'o'] },
    state: { ...frame.state, engine: { ...frame.state.engine, lines: ['ooo', 'o'] } } };
  const scene = new FieldScene(uneven, false); scene.create();
  expect(fake.images.some(image => image.texture.startsWith('terrain:paper-tile:'))).toBe(false);
  scene.present({ ...uneven, state: { ...uneven.state, turn: 1, engine: { ...uneven.state.engine, lines: ['oo', 'ooo'] } } });
  expect(fake.images.some(image => image.x === 40 && image.y === 8 && image.texture.startsWith('terrain:paper-tile:'))).toBe(true);
});
it('uses sequential edit offsets for dust, including edits across rows', () => {
  const lines = ['abcd', 'efgh'];
  const initial = { ...frame, state: { ...frame.state, engine: { ...frame.state.engine, lines } } };
  const scene = new FieldScene(initial, false); scene.create();
  scene.present({ ...initial, state: { ...initial.state, engine: { ...initial.state.engine,
    lines: ['cd', 'gh'], undoStack: [{ lines, cursor: { line: 0, col: 0 }, seq: 0,
      edits: [{ start: 0, removed: 2, inserted: '' }, { start: 3, removed: 2, inserted: '' }] }],
  } }, events: [{ type: 'rows-changed', fromLine: 0, toLine: 1, lineDelta: 0, by: 'player' }] });
  expect(fake.images.filter(image => image.texture === 'field:dust').map(image => [image.x, image.y]))
    .toEqual([[8, 8], [24, 8], [8, 24], [24, 24]]);
});
it('re-creates river tiles at the current idle frame', () => {
  const initial = { ...frame, stage: quarry, legend: quarryLegend,
    state: { ...frame.state, stage: quarry.id, engine: { ...frame.state.engine, lines: ['=~'] } } };
  const scene = new FieldScene(initial, false); scene.create();
  fake.idle.mock.calls[0]?.[0].callback();
  scene.present({ ...initial, state: { ...initial.state, engine: { ...initial.state.engine, lines: ['~~'] } } });
  const river = fake.images.find(image => image.x === 8 && image.y === 8 && image.texture === 'field:river:1');
  expect(river).toBeDefined();
});
it('prompts Enter to go south beside the quarry gate', () => {
  const sim = createWorldSim(createEngine());
  const state = sim.init(quarry, quarryLegend, { learnedCommands: QUARRY_COMMANDS, flags: {} });
  const scene = new FieldScene({ ...frame, stage: quarry, legend: quarryLegend,
    state: { ...state, engine: { ...state.engine, cursor: { line: 10, col: 42 } } } }, false);
  scene.create();
  expect(fake.texts.some(text => text.text === 'Enter: go south')).toBe(true);
});

it.each(['dd', 'u'])('slides whole rows for %s and leaves no stale tiles after the clock', command => {
  const tiles = { ...FIXTURE_LEGEND, tiles: FIXTURE_LEGEND.tiles.map(tile => ({ ...tile, fixed: false })) };
  const stage = { ...FIXTURE_STAGE, map: ['oooo', '    ', 'oooo'], start: { line: 0, col: 0 },
    entities: [], triggers: [], scripts: [], clear: [{ type: 'flag' as const, flag: 'unreachable' }] };
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: ['dd', 'u'], flags: {} };
  const deleted = playKeys(sim, stage, tiles, options, ['d', 'd']).state;
  const before = command === 'dd' ? sim.init(stage, tiles, options) : deleted;
  const scene = new FieldScene({ state: before, events: [], stage, legend: tiles, showSource: true }, false);
  scene.create();
  let state = before;
  for (const key of command) {
    const result = sim.step(state, key, stage, tiles, options);
    state = result.state;
    scene.present({ ...result, stage, legend: tiles, showSource: true });
  }
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  expect(clock.duration).toBeLessThanOrEqual(180);
  clock.targets.value = 0.5; clock.onUpdate();
  const shifted = fake.images.filter(image => image.texture === 'field:stone' && image.destroy.mock.calls.length === 0);
  expect(shifted.some(image => image.y % 16 !== 8)).toBe(true);
  clock.onComplete();
  const liveTiles = fake.images.filter(image => (image.texture === 'field:stone' || image.texture.startsWith('terrain:ground-tile:'))
    && image.destroy.mock.calls.length === 0);
  expect(liveTiles).toHaveLength(state.engine.lines.reduce((total, row) => total + row.length, 0));
  for (const image of liveTiles) expect(image.y % 16).toBe(8);
  if (command === 'dd') expect(fake.images.filter(image => image.texture === 'field:dust')).toHaveLength(4);
  else expect(fake.images.filter(image => image.texture === 'field:dust')).toHaveLength(0);
});

it.each([true, false])('draws the three cage guards as a 3 px pile (reduced motion: %s)', reducedMotion => {
  const sim = createWorldSim(createEngine());
  const state = sim.init(cut, cutLegend, { learnedCommands: QUARRY_COMMANDS, flags: {} });
  const initial = { state, events: [], stage: cut, legend: cutLegend, showSource: true };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  const guards = fake.images.filter(image => image.texture.startsWith('field:blot'));
  expect(guards.map(image => [image.x, image.y])).toEqual([[472, 88], [469, 85], [466, 82]]);
  // Once the top two disappear, the remaining entity returns to the cell centre.
  scene.present({ ...initial, state: { ...state, entities: state.entities.filter(entity => !['guard-1', 'guard-2'].includes(entity.id)) } });
  const remaining = fake.images.filter(image => image.texture.startsWith('field:blot') && image.destroy.mock.calls.length === 0);
  expect(remaining.map(image => [image.x, image.y])).toEqual([[472, 88]]);
});
it('keeps the deleted cage guards piled during their burst', () => {
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: QUARRY_COMMANDS, flags: {} };
  const before = playKeys(sim, cut, cutLegend, options, ['3', 'j']).state;
  const initial = { state: before, events: [], stage: cut, legend: cutLegend, showSource: true };
  const scene = new FieldScene(initial, false); scene.create();
  const deleted = sim.step(sim.step(before, 'd', cut, cutLegend, options).state, 'd', cut, cutLegend, options);
  scene.present({ ...initial, ...deleted });
  const guards = fake.images.filter(image => image.texture.startsWith('field:blot') && image.destroy.mock.calls.length === 0);
  expect(guards.map(image => [image.x, image.y])).toEqual([[472, 88], [469, 85], [466, 82]]);
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  clock.targets.value = 0.5; clock.onUpdate();
  for (const guard of guards) expect(guard.alpha).toBeLessThan(1);
  clock.onComplete();
  for (const guard of guards) expect(guard.destroy).toHaveBeenCalled();
});

it('shades hazard cells, adds sheen only on existing walkable cells and marks the top edge', () => {
  const sim = createWorldSim(createEngine());
  const state = sim.init(shaft, shaftLegend, { learnedCommands: QUARRY_COMMANDS, flags: {} });
  const scene = new FieldScene({ ...frame, stage: shaft, legend: shaftLegend, state,
    hazards: [{ from: { line: 4, col: 0 }, to: { line: 26, col: 8 } }] }, true);
  scene.create();
  const sheen = fake.images.filter(image => image.texture === 'field:wet-sheen');
  const edges = fake.images.filter(image => image.texture === 'field:wet-edge');
  expect(sheen).toHaveLength(91);
  expect(sheen.every(image => image.alpha === 0.6)).toBe(true);
  expect(fake.images.filter(image => image.texture === 'rectangle')).toHaveLength(91);
  expect(edges).toHaveLength(9);
  expect(edges.every(image => image.y === 4 * 16 + 8)).toBe(true);
  expect(sheen.every(image => image.y >= 4 * 16 + 8 && image.y <= 14 * 16 + 8)).toBe(true);
});

it('draws Canopy actors, hashed branch variants, lift prompt and an arc from the real fH event', async () => {
  const { canopy, canopyLegend } = await import('../play2/content.js');
  const { WORDWOOD_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: WORDWOOD_COMMANDS, flags: {} };
  const state = sim.init(canopy, canopyLegend, options);
  const initial = { state, stage: canopy, legend: canopyLegend, events: [], showSource: false };
  const scene = new FieldScene(initial, false); scene.create();
  expect(fake.images.some(image => image.texture === 'field:air')).toBe(true);
  expect(fake.images.some(image => image.texture === 'field:branch:1')).toBe(true);
  for (const sprite of ['fern', 'knothole', 'lift']) expect(fake.images.some(image => image.texture === `field:${sprite}`), sprite).toBe(true);
  const pending = sim.step(state, 'f', canopy, canopyLegend, options);
  scene.present({ ...initial, ...pending });
  const jumped = sim.step(pending.state, 'H', canopy, canopyLegend, options);
  scene.present({ ...initial, ...jumped });
  expect(fake.tween).toHaveBeenCalled();
  const playback = fake.tween.mock.calls.at(-1)?.[0];
  playback.targets.value = 0.5; playback.onUpdate();
  const player = fake.images.find(image => image.texture === 'field:player:7');
  expect(player?.y).toBeLessThan(24);
  scene.finish();
  expect(player?.x).toBe(30 * 16 + 8);
  const liftState = sim.apply(jumped.state, [{ type: 'move-player', to: { line: 7, col: 27 } }], canopy, canopyLegend);
  scene.present({ ...initial, ...liftState });
  expect(fake.texts.some(text => text.text === 'Enter: take lift')).toBe(true);
});

it('renders Glades terrain and actors and follows G and gg over all eighteen rows', async () => {
  const { glades, gladesLegend } = await import('../play2/content.js');
  const { GLADES_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: GLADES_COMMANDS, flags: {} };
  let state = sim.init(glades, gladesLegend, options);
  const initial = { state, stage: glades, legend: gladesLegend, events: [], showSource: false };
  fake.scale.height = 300;
  const scene = new FieldScene(initial, false); scene.create();
  for (const sprite of ['pilcrow', 'rope', 'stump', 'glade-lamp-lit', 'lamp-out', 'fern-fronds', 'bramble']) {
    expect(fake.images.some(image => image.texture === `field:${sprite}`), sprite).toBe(true);
  }
  expect(fake.images.some(image => image.texture === 'field:clearing')).toBe(true);
  const player = fake.images.find(image => image.texture === 'field:player');
  for (const keys of [['G'], ['g', 'g']]) {
    let jumped: WorldStepResult = { state, events: [] };
    for (const key of keys) {
      const result = sim.step(jumped.state, key, glades, gladesLegend, options);
      jumped = result;
    }
    scene.present({ ...initial, ...jumped });
    const playback = fake.tween.mock.calls.at(-1)?.[0];
    expect(playback.duration).toBeLessThanOrEqual(360);
    playback.targets.value = (playback.duration - 90) / (2 * playback.duration); playback.onUpdate();
    expect(fake.centerOn).toHaveBeenLastCalledWith(72, keys[0] === 'G' ? 212 : 76);
    expect(player?.y).toBeCloseTo(134); // long vertical jumps flatten the capped arc to ten pixels
    playback.targets.value = 1; playback.onUpdate(); scene.finish();
    expect(player?.y).toBe(jumped.state.engine.cursor.line * 16 + 8);
    expect(fake.centerOn).toHaveBeenLastCalledWith(72, keys[0] === 'G' ? 238 : 50);
    state = jumped.state;
  }
});

it('blinks between real bracket partners, cuts the camera and settles on interruption', async () => {
  const { gates, gatesLegend } = await import('../play2/content.js');
  const { GATES_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: GATES_COMMANDS, flags: {} };
  const state = playKeys(sim, gates, gatesLegend, options, ['h']).state;
  const initial = { state, stage: gates, legend: gatesLegend, events: [], showSource: false };
  const scene = new FieldScene(initial, false); scene.create();
  const player = fake.images.find(image => image.texture === 'field:player');
  const jumped = sim.step(state, '%', gates, gatesLegend, options);
  scene.present({ ...initial, ...jumped });
  const playback = fake.tween.mock.calls.at(-1)?.[0];
  expect(playback.duration).toBe(360);
  playback.targets.value = 0.25; playback.onUpdate();
  expect(player?.y).toBe(36 * 16 + 8);
  expect(player?.alpha).toBe(0.5);
  playback.targets.value = 0.5; playback.onUpdate();
  expect(player?.alpha).toBe(0);
  expect(player?.y).toBe(8);
  expect(fake.centerOn).toHaveBeenLastCalledWith(72, 96);
  playback.targets.value = 0.75; playback.onUpdate();
  expect(player?.alpha).toBe(0.5);
  scene.finish();
  expect(player?.alpha).toBe(1);
  expect(player?.y).toBe(8);
});
it.each([false, true])('scrolls exactly half the twelve-row window with no arc (reduced motion: %s)', async reducedMotion => {
  const { gates, gatesLegend } = await import('../play2/content.js');
  const { GATES_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: GATES_COMMANDS, flags: {} };
  const state = playKeys(sim, gates, gatesLegend, options, ['h', '%', '2', 'l']).state;
  const initial = { state, stage: gates, legend: gatesLegend, events: [], showSource: false };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  const player = fake.images.find(image => image.texture === 'field:player');
  const jumped = sim.step(state, '<C-d>', gates, gatesLegend, options);
  scene.present({ ...initial, ...jumped });
  if (!reducedMotion) {
    const playback = fake.tween.mock.calls.at(-1)?.[0];
    playback.targets.value = 0.5; playback.onUpdate();
    expect(player?.y).toBe(3 * 16 + 8);
    expect(fake.centerOn).toHaveBeenLastCalledWith(72, 9 * 16);
    playback.targets.value = 1; playback.onUpdate(); scene.finish();
  }
  expect(player?.y).toBe(6 * 16 + 8);
  expect(fake.centerOn).toHaveBeenLastCalledWith(72, 12 * 16);
});

it.each([false, true])('tips Jetty junk, splashes, then slides the row and actors (reduced motion: %s)', async reducedMotion => {
  const { jetty, portLegend } = await import('../play2/content.js');
  const { PORT_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: PORT_COMMANDS, flags: {} };
  const before = playKeys(sim, jetty, portLegend, options, ['b']).state;
  const initial = { state: before, stage: jetty, legend: portLegend, events: [], showSource: true };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  for (const sprite of ['port-water', 'port-ladder', 'boards', 'boards:1', 'pier-post', 'warehouse', 'crates', 'nets', 'bitt', 'ream', 'cart']) {
    expect(fake.images.some(image => image.texture === `field:${sprite}`), sprite).toBe(true);
  }
  const pending = sim.step(before, 'd', jetty, portLegend, options);
  scene.present({ ...initial, ...pending });
  const deleted = sim.step(pending.state, 'b', jetty, portLegend, options);
  scene.present({ ...initial, ...deleted });
  const junk = fake.images.filter(image => image.texture === 'field:nets' && image.depth === 3);
  const splashes = fake.images.filter(image => image.texture === 'field:splash');
  const player = fake.images.find(image => image.texture === 'field:player:7');
  const post = fake.images.find(image => image.texture === 'field:pier-post' && image.x === (reducedMotion ? 23 : 29) * 16 + 8 && image.y === 56);
  if (reducedMotion) {
    expect(fake.tween).not.toHaveBeenCalled();
    expect(junk).toHaveLength(0);
  } else {
    expect(junk).toHaveLength(6);
    expect(splashes).toHaveLength(6);
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(180);
    expect(player?.x).toBe(20 * 16 + 8);
    expect(post?.x).toBe(29 * 16 + 8);
    const movingBitt = fake.images.filter(image => image.texture === 'field:bitt' && !image.destroy.mock.calls.length)[0];
    expect(movingBitt?.x).toBe(28 * 16 + 8);
    clock.targets.value = 0.2; clock.onUpdate();
    expect(junk[0]?.y).toBeGreaterThan(56);
    expect(junk[0]?.alpha).toBeLessThan(1);
    expect(splashes[0]?.alpha).toBeGreaterThan(0);
    expect(player?.x).toBe(20 * 16 + 8);
    clock.targets.value = 0.7; clock.onUpdate();
    expect(junk[0]?.alpha).toBe(0);
    expect(player?.x).toBeGreaterThan(14 * 16 + 8);
    expect(player?.x).toBeLessThan(20 * 16 + 8);
    expect(player?.y).toBe(56);
    expect(post?.x).toBeGreaterThan(23 * 16 + 8);
    expect(post?.x).toBeLessThan(29 * 16 + 8);
    expect(movingBitt?.x).toBeGreaterThan(22 * 16 + 8);
    expect(movingBitt?.x).toBeLessThan(28 * 16 + 8);
    scene.finish();
    for (const image of [...junk, ...splashes]) expect(image.destroy).toHaveBeenCalledOnce();
  }
  expect(player?.x).toBe(14 * 16 + 8);
  expect(post?.x).toBe(23 * 16 + 8);
  const bitt = fake.images.filter(image => image.texture === 'field:bitt' && image.destroy.mock.calls.length === 0);
  expect(bitt.map(image => image.x)).toEqual([22 * 16 + 8]);
  for (const tile of fake.images.filter(image => image.texture.startsWith('field:boards') && !image.destroy.mock.calls.length)) {
    expect(tile.x % 16).toBe(8);
  }
});
it('highlights the fixed tile which rejects a Jetty delete without splashing', async () => {
  const { jetty, portLegend } = await import('../play2/content.js');
  const { PORT_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: PORT_COMMANDS, flags: {} };
  const state = sim.init(jetty, portLegend, options);
  const initial = { state, stage: jetty, legend: portLegend, events: [], showSource: false };
  const scene = new FieldScene(initial, false); scene.create();
  const result = sim.step(sim.step(state, 'd', jetty, portLegend, options).state, 'w', jetty, portLegend, options);
  scene.present({ ...initial, ...result });
  const bump = result.events.find(event => event.type === 'bump');
  if (bump?.type !== 'bump') throw new Error('Expected fixed bump');
  const tile = fake.images.find(image => image.x === bump.at.col * 16 + 8 && image.y === bump.at.line * 16 + 8 && image.texture.startsWith('field:boards'));
  expect(tile?.setTintFill).toHaveBeenCalledWith(0xd39b69);
  expect(fake.images.some(image => image.texture === 'field:splash')).toBe(false);
  scene.finish();
  expect(tile?.clearTint).toHaveBeenCalled();
});

it.each([false, true])('draws warehouse cargo, stencils, tally plates and remote counter; animates put (reduced=%s)', async reducedMotion => {
  const { warehouse, warehouseLegend } = await import('../play2/content.js');
  const { WAREHOUSE_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: WAREHOUSE_COMMANDS, flags: {} };
  const stage = { ...warehouse, start: { line: 1, col: 2 } };
  let state = sim.init(stage, warehouseLegend, options);
  const initial = { state, stage, legend: warehouseLegend, events: [], showSource: true, registerTarget: { x: 300, y: -20 } };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  for (const sprite of ['warehouse-floor', 'warehouse-floor:1', 'warehouse-wall', 'oil', 'cargo-rope', 'shelf-end', 'shelf-lip', 'shelf-top', 'shelf-middle', 'shelf-bottom', 'counter-end']) {
    expect(fake.images.some(image => image.texture === `field:${sprite}`), sprite).toBe(true);
  }
  expect(fake.texts.filter(text => text.text === 'TALLY')).toHaveLength(2);
  for (const key of ['y', 'w']) {
    const result = sim.step(state, key, stage, warehouseLegend, options);
    state = result.state; scene.present({ ...initial, ...result });
  }
  const glints = fake.images.filter(image => image.depth === 5 && image.texture === 'field:oil');
  expect(glints).toHaveLength(reducedMotion ? 0 : 4);
  if (!reducedMotion) expect(glints.every(image => image.setTintFill.mock.calls.length > 0)).toBe(true);
  if (!reducedMotion) {
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    clock.targets.value = 0.7; clock.onUpdate();
    expect(glints[0]?.x).toBeGreaterThan(2 * 16 + 8);
    expect(glints[0]?.y).toBeLessThan(24);
  }
  scene.finish();
  for (const image of glints) expect(image.destroy).toHaveBeenCalledOnce();
  for (const key of ['f', '[']) {
    const result = sim.step(state, key, stage, warehouseLegend, options);
    state = result.state; scene.present({ ...initial, ...result });
  }
  const result = sim.step(state, 'p', stage, warehouseLegend, options);
  scene.present({ ...initial, ...result });
  const lip = fake.images.find(image => image.texture === 'field:shelf-lip' && image.y === 24 && image.x === (reducedMotion ? 15 : 11) * 16 + 8 && !image.destroy.mock.calls.length);
  expect(lip).toBeDefined();
  if (!reducedMotion) {
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(180);
    clock.targets.value = 0.5; clock.onUpdate();
    expect(lip?.x).toBe(13 * 16 + 8);
    scene.finish();
  }
  expect(lip?.x).toBe(15 * 16 + 8);
  expect(result.state.engine.lines[1]).toBe('#[oooo]___[oooo]#');
  expect(fake.images.filter(image => image.visible && !image.destroy.mock.calls.length).every(image => image.alpha === 1)).toBe(true);
});
it('lights the cell which rejects a warehouse put, without cargo growth', async () => {
  const { warehouse, warehouseLegend } = await import('../play2/content.js');
  const { WAREHOUSE_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: WAREHOUSE_COMMANDS, flags: {} };
  const stage = { ...warehouse, start: { line: 1, col: 2 } };
  const before = playKeys(sim, stage, warehouseLegend, options, ['y', 'f', ']', 'f', '[']).state;
  const initial = { state: before, events: [], stage, legend: warehouseLegend, showSource: false };
  const scene = new FieldScene(initial, false); scene.create();
  const rejected = sim.step(before, 'p', stage, warehouseLegend, options);
  scene.present({ ...initial, ...rejected });
  expect(rejected.state.turn).toBe(before.turn);
  expect(rejected.events).toContainEqual({ type: 'bump', reason: 'wall', at: { line: 1, col: 15 } });
  expect(fake.images.some(image => image.texture === 'field:warehouse-wall' && image.depth === 3
    && image.x === 15 * 16 + 8 && image.setTintFill.mock.calls.length > 0)).toBe(true);
  scene.finish();
});

it.each([false, true])('stamps and slides the clerk fake on the shared clock, finishing cleanly (reduced=%s)', async reducedMotion => {
  const { counter, counterLegend } = await import('../play2/content.js');
  const { COUNTER_COMMANDS } = await import('../play2/session.js');
  const { parseKeys } = await import('@escape/engine');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: COUNTER_COMMANDS, flags: {} };
  let state = sim.step(sim.init(counter, counterLegend, options), 'j', counter, counterLegend, options).state;
  const initial = { state, stage: counter, legend: counterLegend, events: [], showSource: false };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  for (const key of parseKeys('"ayl')) {
    const result = sim.step(state, key, counter, counterLegend, options);
    state = result.state;
    scene.present({ ...initial, ...result });
  }
  const fakeCrate = fake.images.find(image => image.texture === 'field:fake' && !image.destroy.mock.calls.length);
  const clerk = fake.images.find(image => image.texture === 'field:counterfeiter' && !image.destroy.mock.calls.length);
  expect(fakeCrate).toBeDefined();
  expect(fakeCrate?.x).toBe(reducedMotion ? 40 : 24);
  if (!reducedMotion) {
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(180);
    clock.targets.value = 0.5; clock.onUpdate();
    expect(fakeCrate?.x).toBeGreaterThan(24);
    expect(fakeCrate?.x).toBeLessThan(40);
    expect(clerk?.y).toBeGreaterThan(24);
    scene.finish();
  }
  expect(fakeCrate?.x).toBe(40);
  expect(fakeCrate?.alpha).toBe(1);
  expect(fake.images.find(image => image.texture === 'field:counterfeiter' && !image.destroy.mock.calls.length)?.y).toBe(24);
  expect(state.engine.lines[1]).toBe('#|f...................');
});

it.each([false, true])('renders shelf spaces, posts and Quire; puffs dust before sliding (reduced=%s)', async reducedMotion => {
  const { stacks, stacksLegend } = await import('../play2/content.js');
  const { STACKS_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: STACKS_COMMANDS, flags: {} };
  const before = playKeys(sim, stacks, stacksLegend, options, ['j']).state;
  const initial = { state: before, stage: stacks, legend: stacksLegend, events: [], showSource: true };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  for (const sprite of ['gallery', 'library-wall', 'shelf-post', 'library-dust', 'quire', 'book', 'book:1', 'book:2']) {
    expect(fake.images.some(image => image.texture === `field:${sprite}`), sprite).toBe(true);
  }
  expect(fake.images.some(image => image.texture === 'field:shelf-end')).toBe(false);
  expect(fake.centerOn).toHaveBeenLastCalledWith(154, 40);
  let state = before;
  for (const key of ['d', 'a', 'w']) {
    const result = sim.step(state, key, stacks, stacksLegend, options);
    state = result.state;
    scene.present({ ...initial, ...result });
  }
  const puffs = fake.images.filter(image => image.texture === 'field:dust-puff');
  if (reducedMotion) {
    expect(puffs).toHaveLength(0);
    expect(fake.tween).not.toHaveBeenCalled();
  } else {
    expect(puffs).toHaveLength(6);
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(180);
    const post = fake.images.find(image => image.texture === 'field:shelf-post'
      && image.y === 24 && image.x === (stacks.map[1]!.length - 1) * 16 + 8 && !image.destroy.mock.calls.length);
    const originalX = post?.x;
    clock.targets.value = 0.2; clock.onUpdate();
    expect(puffs[0]?.alpha).toBeGreaterThan(0);
    expect(post?.x).toBe(originalX);
    clock.targets.value = 0.7; clock.onUpdate();
    expect(post?.x).toBeLessThan(originalX ?? 0);
    scene.finish();
    expect(post?.x).toBe((state.engine.lines[1]!.length - 1) * 16 + 8);
    for (const puff of puffs) expect(puff.destroy).toHaveBeenCalledOnce();
  }
  expect(fake.centerOn).toHaveBeenLastCalledWith(154, 40);
});

it.each([false, true])('folds Archive rows before sliding, unfolds puts and cleans up on rapid input (reduced=%s)', async reducedMotion => {
  const { archive, archiveLegend } = await import('../play2/content.js');
  const { ARCHIVE_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: ARCHIVE_COMMANDS, flags: {} };
  let state = sim.init(archive, archiveLegend, options);
  const initial = { state, stage: archive, legend: archiveLegend, events: [], showSource: true };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  for (const sprite of ['catalogue', 'index', 'filed-stamp', 'archive-rail', 'atlas-shelf', 'bible-shelf', 'misfiled-shelf']) {
    expect(fake.images.some(image => image.texture === `field:${sprite}`), sprite).toBe(true);
  }
  const firstGhost = fake.images.length;
  for (const key of ['d', 'a', 'p']) {
    const result = sim.step(state, key, archive, archiveLegend, options);
    state = result.state;
    scene.present({ ...initial, ...result });
  }
  const ghosts = fake.images.slice(firstGhost).filter(image => image.depth === 1 && image.texture === 'field:misfiled-shelf');
  expect(ghosts).toHaveLength(reducedMotion ? 0 : 24);
  const bible = fake.images.find(image => image.texture === 'field:bible-shelf' && !image.destroy.mock.calls.length);
  if (!reducedMotion) {
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(180);
    expect(bible?.y).toBe(9 * 16 + 8);
    clock.targets.value = 0.2; clock.onUpdate();
    expect(ghosts[0]?.alpha).toBeLessThan(1);
    expect(bible?.y).toBe(9 * 16 + 8);
    clock.targets.value = 0.8; clock.onUpdate();
    expect(bible?.y).toBeLessThan(9 * 16 + 8);
  }
  scene.finish();
  for (const ghost of ghosts) expect(ghost.destroy).toHaveBeenCalledOnce();
  expect(bible?.y).toBe(5 * 16 + 8);
  for (const key of ['}', 'p']) {
    const result = sim.step(state, key, archive, archiveLegend, options);
    state = result.state;
    scene.present({ ...initial, ...result });
  }
  if (!reducedMotion) {
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(180);
    const shelf = fake.images.find(image => image.texture === 'field:misfiled-shelf' && !image.destroy.mock.calls.length);
    expect(shelf?.setScale).toHaveBeenLastCalledWith(1, 0);
    clock.targets.value = 0.5; clock.onUpdate();
    expect(shelf?.setScale).toHaveBeenLastCalledWith(1, 0.875);
  }
  scene.finish();
  expect(fake.images.filter(image => image.visible && !image.destroy.mock.calls.length).every(image => image.alpha === 1)).toBe(true);
});

it.each([false, true])('renders Notary signing, lock shards and wax melting, with reduced motion=%s', async reduced => {
  const { notary, notaryLegend } = await import('../play2/content.js');
  const { NOTARY_COMMANDS } = await import('../play2/session.js');
  const { parseKeys } = await import('@escape/engine');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: NOTARY_COMMANDS, flags: {} };
  let state = sim.init(notary, notaryLegend, options);
  const initial = { state, stage: notary, legend: notaryLegend, events: [], showSource: true };
  const scene = new FieldScene(initial, reduced); scene.create();
  for (const sprite of ['vault-door', 'notary', 'vault-floor', 'vault-wall', 'notary-desk', 'lock-left', 'seal-left', 'tag-open', 'keys', 'wax']) {
    expect(fake.images.some(image => image.texture === 'field:' + sprite), sprite).toBe(true);
  }
  for (const key of parseKeys('jw')) {
    const result = sim.step(state, key, notary, notaryLegend, options);
    state = result.state;
    scene.present({ ...initial, ...result });
  }
  const quote = fake.images.find(image => image.texture === 'field:clause-quote' && !image.destroy.mock.calls.length);
  const actor = fake.images.find(image => image.texture === 'field:notary' && !image.destroy.mock.calls.length);
  expect(quote?.x).toBe(reduced ? 40 : 24);
  if (!reduced) {
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    clock.targets.value = 0.25; clock.onUpdate();
    expect(actor?.setAngle).toHaveBeenLastCalledWith(9);
  }
  scene.finish();
  expect(quote?.x).toBe(40);
  if (!reduced) expect(actor?.setAngle).toHaveBeenLastCalledWith(0);
  const advance = (input: string) => {
    for (const key of parseKeys(input)) {
      const result = sim.step(state, key, notary, notaryLegend, options);
      state = result.state;
      scene.present({ ...initial, ...result });
    }
  };
  advance('da[');
  if (!reduced) {
    expect(fake.images.some(image => image.texture === 'field:lock-shards')).toBe(true);
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(180);
    clock.targets.value = 0.2; clock.onUpdate();
  }
  scene.finish();
  advance('02jwda{02jwdit');
  if (!reduced) {
    expect(fake.images.some(image => image.texture === 'field:wax-melt')).toBe(true);
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    clock.targets.value = 0.2; clock.onUpdate();
    const wax = fake.images.filter(image => image.texture === 'field:wax').at(-1);
    expect(wax?.setScale).toHaveBeenCalled();
  }
  scene.finish();
  expect(state.engine.lines[6]).toBe('.<w></w>.#');
  expect(fake.images.some(image => image.texture === 'field:unknown')).toBe(false);
});

it('hides distant Mouth tiles, source glyphs and Echo, while lit crystals keep their neighbours visible', async () => {
  const { mouth, mouthLegend } = await import('../play2/content.js');
  const { MOUTH_COMMANDS } = await import('../play2/session.js');
  const sim = createWorldSim(createEngine());
  const state = sim.init(mouth, mouthLegend, { learnedCommands: MOUTH_COMMANDS, flags: {} });
  const initial = { state, stage: mouth, legend: mouthLegend, events: [], showSource: true,
    darkness: { radius: 3, lights: [] } };
  const scene = new FieldScene(initial, true); scene.create();
  const at = (texture: string, line: number, col: number) => fake.images.find(image =>
    image.texture.startsWith(texture) && image.x === col * 16 + 8 && image.y === line * 16 + 8 && !image.destroy.mock.calls.length);
  expect(at('field:cave-floor', 1, 1)?.alpha).toBe(1);
  expect(at('field:cave-floor', 1, 4)?.alpha).toBe(1); // Smooth darkness is a pooled pixel overlay.
  expect(at('field:crystal-dark', 5, 14)?.alpha).toBe(0);
  expect(at('glyph:120', 5, 14)?.alpha).toBe(0);
  expect(at('field:echo', 1, 15)?.alpha).toBe(0);
  const lit = { ...state, flags: { ...state.flags, 'mouth.deep': true } };
  scene.present({ ...initial, state: lit, darkness: { radius: 3, lights: [{ line: 5, col: 14 }] } });
  expect(at('field:crystal-lit', 5, 14)?.alpha).toBe(1);
  expect(at('field:crystal-ledge', 5, 13)?.alpha).toBe(1);
  expect(at('field:crystal-dark', 3, 13)?.alpha).toBe(0);
  expect(at('field:echo', 1, 15)?.alpha).toBe(0);
});

it('pulses a newly lit crystal for 150 ms and settles it on the next key', async () => {
  const { mouth, mouthLegend } = await import('../play2/content.js');
  const { MOUTH_COMMANDS } = await import('../play2/session.js');
  const state = createWorldSim(createEngine()).init(mouth, mouthLegend, { learnedCommands: MOUTH_COMMANDS, flags: {} });
  const initial = { state, stage: mouth, legend: mouthLegend, events: [], showSource: false,
    darkness: { radius: 3, lights: [] } };
  const scene = new FieldScene(initial, false); scene.create();
  scene.present({ ...initial, state: { ...state, flags: { 'mouth.deep': true } },
    darkness: { radius: 3, lights: [{ line: 5, col: 14 }] } });
  const pulse = fake.tween.mock.calls.at(-1)?.[0];
  expect(pulse).toMatchObject({ duration: 75, yoyo: true, scaleX: 1.2, scaleY: 1.2 });
  scene.finish();
  expect(pulse.targets.setScale).toHaveBeenLastCalledWith(1);
  expect(pulse.targets.alpha).toBe(1);
});

it('draws distinct carved gallery letters and keeps distant chambers dark after a search jump', async () => {
  const { gallery, galleryLegend } = await import('../play2/content.js');
  const { GALLERY_COMMANDS } = await import('../play2/session.js');
  const { darknessFor } = await import('./darkness.js');
  const sim = createWorldSim(createEngine());
  const state = sim.init(gallery, galleryLegend, { learnedCommands: GALLERY_COMMANDS, flags: {} });
  const initial = { state, stage: gallery, legend: galleryLegend, events: [], showSource: false,
    darkness: darknessFor(gallery, {})! };
  const scene = new FieldScene(initial, true); scene.create();
  const at = (letter: string, line: number, col: number) => fake.images.find(image =>
    image.texture.startsWith(`field:echo-rune-${letter}`) && image.x === col * 16 + 8 && image.y === line * 16 + 8);
  expect(at('i', 1, 2)?.alpha).toBe(1);
  expect(at('n', 1, 3)?.alpha).toBe(1);
  expect(at('k', 7, 2)?.alpha).toBe(0);
  const jumped = sim.step(state, '*', gallery, galleryLegend, { learnedCommands: GALLERY_COMMANDS, flags: {} });
  scene.present({ ...initial, state: jumped.state, events: jumped.events });
  expect(at('i', 3, 2)?.alpha).toBe(1);
  expect(at('k', 7, 2)?.alpha).toBe(0);
});

it('draws an amber flag from engine marks and clears it when marks disappear', () => {
  const markedFrame = { ...frame, state: { ...frame.state, engine: { ...frame.state.engine,
    marks: { a: { line: 2, col: 4 } } } } };
  const scene = new FieldScene(markedFrame, true);
  scene.create();
  const flag = fake.images.find(image => image.texture === 'field:mark-flag');
  expect(flag).toMatchObject({ x: 72, y: 34, alpha: 1 });
  const container = fake.containers.find(item => item.depth === 2.5);
  expect(container?.add).toHaveBeenCalledWith(flag);
  scene.present({ ...frame, state: { ...frame.state, turn: 1 } });
  expect(container?.removeAll).toHaveBeenLastCalledWith(true);
  expect(container?.add).toHaveBeenCalledTimes(1);
});

it('draws the labyrinth lair and three rune variants, lights only pulled levers, and never draws the Minotaur', async () => {
  const { labyrinth, labyrinthLegend } = await import('../play2/content.js');
  const { darknessFor } = await import('./darkness.js');
  const state = createWorldSim(createEngine()).init(labyrinth, labyrinthLegend, { learnedCommands: [], flags: {} });
  const initial = { state, stage: labyrinth, legend: labyrinthLegend, events: [], showSource: true,
    darkness: darknessFor(labyrinth, {})! };
  const scene = new FieldScene(initial, true);
  scene.create();
  const at = (texture: string, line: number, col: number) => fake.images.find(image =>
    image.texture === texture && image.x === col * 16 + 8 && image.y === line * 16 + 8);
  expect(at('field:minotaur-lair', 0, 1)).toBeDefined();
  expect(fake.images.some(image => image.texture.startsWith('field:minotaur:') || image.texture === 'field:minotaur')).toBe(false);
  expect(at('field:rune-lever-x', 4, 8)?.alpha).toBe(0);
  expect(at('field:rune-lever-y', 2, 9)).toBeDefined();
  expect(at('field:rune-lever-z', 8, 2)).toBeDefined();
  const flags = { 'labyrinth.x': true };
  scene.present({ ...initial, state: { ...state, flags }, darkness: darknessFor(labyrinth, flags)! });
  expect(at('field:rune-lever-x-lit', 4, 8)?.alpha).toBe(1);
  expect(at('field:rune-lever-x', 2, 2)).toBeDefined();
  expect(fake.images.some(image => image.texture === 'field:minotaur')).toBe(false);
});

it('draws the Last Page as ink without Source, boxes repaired doors, and shows a faceless tear smear', () => {
  const sim = createWorldSim(createEngine());
  const state = sim.init(lastPage, lastPageLegend, { learnedCommands: LAST_PAGE_COMMANDS, flags: {} });
  const frame = { state, stage: lastPage, legend: lastPageLegend, events: [], showSource: false };
  const scene = new FieldScene(frame, true); scene.create();
  expect(fake.strokeText).not.toHaveBeenCalled();
  expect(fake.fillText.mock.calls.some(call => call[0] === 'E')).toBe(true);
  expect(fake.containers[2]?.visible).toBe(true);
  expect(fake.images.some(image => image.texture === 'field:unwriter')).toBe(false);
  scene.present({ ...frame, state: { ...state, flags: { 'last.whole': true } } });
  expect(fake.images.filter(image => image.texture === 'field:page-door')).toHaveLength(6);
  scene.present({ ...frame, state: { ...state, turn: 3 }, events: [
    { type: 'rows-changed', fromLine: 6, toLine: 6, lineDelta: -1, by: 'entity' },
  ] });
  expect(fake.images.some(image => image.texture === 'field:page-smear' && image.visible)).toBe(true);
});

// Small real-engine field: input and world events remain authoritative in these regressions.
function feelField(reducedMotion = false, map = Array.from({ length: 12 }, () => 'oooo')) {
  const stage = { ...FIXTURE_STAGE, map,
    start: { line: 0, col: 0 }, entities: [], triggers: [], scripts: [],
    clear: [{ type: 'flag' as const, flag: 'never' }] };
  const options = { learnedCommands: ['h', 'j', 'l', 'G', 'gg', 'w', 'f', 'd', 'dd', 'x', 'i', 'c', 'cw', 'ciw', ':e!'], flags: {} };
  const sim = createWorldSim(createEngine());
  let state = sim.init(stage, FIXTURE_LEGEND, options);
  const initial = { state, stage, legend: FIXTURE_LEGEND, events: [], showSource: false };
  const scene = new FieldScene(initial, reducedMotion); scene.create();
  const player = fake.images.find(image => image.texture === 'field:player');
  const key = (input: string): void => {
    const result = sim.step(state, input, stage, FIXTURE_LEGEND, options);
    state = result.state; scene.present({ ...initial, ...result });
  };
  return { scene, player, key, initial, sim, current: () => state };
}

it.each(['3', 'f', 'd', '"a', ':'])('keeps a running move alive through unfinished %s', prefix => {
  const { key, player, current } = feelField();
  key('l');
  const playback = fake.tween.mock.calls.at(-1)?.[0];
  playback.targets.value = 0.25; playback.onUpdate();
  const drawn = [player?.x, player?.y];
  const kills = fake.killAll.mock.calls.length;
  for (const input of prefix) key(input);
  expect(current().pending).not.toBeNull();
  expect(fake.killAll).toHaveBeenCalledTimes(kills);
  expect(fake.tween).toHaveBeenCalledTimes(1);
  expect([player?.x, player?.y]).toEqual(drawn);
  playback.targets.value = 0.75; playback.onUpdate();
  expect(player?.x).toBeGreaterThan(drawn[0] ?? 0);
});

it('starts an interrupted move at the drawn sprite position when it is within one cell', () => {
  const { key, player } = feelField();
  key('l');
  const playback = fake.tween.mock.calls.at(-1)?.[0];
  playback.targets.value = 0.5; playback.onUpdate();
  const drawn = [player?.x, 8];
  key('h');
  expect([player?.x, player?.y]).toEqual(drawn);
  const next = fake.tween.mock.calls.at(-1)?.[0];
  next.targets.value = 0.25; next.onUpdate();
  expect(player?.x).toBeLessThan(drawn[0] ?? 0);
});

it('bounds the drawn backlog to one cell while repeatedly moving without waiting', () => {
  const { key, player, current } = feelField(false, ['o'.repeat(40)]);
  for (let count = 0; count < 30; count++) {
    const cursor = current().engine.cursor;
    key('l');
    expect(Math.abs((player?.x ?? 0) - (cursor.col * 16 + 8))
).toBeLessThanOrEqual(16.000001);
    const playback = fake.tween.mock.calls.at(-1)?.[0];
    playback.targets.value = 0.1; playback.onUpdate();
  }
});

it.each(['stage', 'restore', 'death', 'reduced motion'])('snaps the player and camera for %s', action => {
  fake.scale.width = 150;
  const { key, player, scene, initial, sim, current } = feelField();
  key('G');
  const playback = fake.tween.mock.calls.at(-1)?.[0];
  playback.targets.value = 0.25; playback.onUpdate();
  const tweens = fake.tween.mock.calls.length;
  if (action === 'stage') {
    scene.present({ ...initial, state: { ...initial.state, stage: 'next-stage' }, stage: { ...initial.stage, id: 'next-stage' } });
  } else if (action === 'restore') {
    scene.present({ ...initial, ...sim.restore(current()) });

  } else if (action === 'death') {
    scene.present({ ...initial, state: { ...current(), status: 'dead' }, events: [{ type: 'player-died' }] });
  } else scene.setReducedMotion(true);
  expect(player?.x).toBe(8);
  expect(player?.y).toBe(action === 'death' || action === 'reduced motion' ? 184 : 8);
  expect(fake.tween).toHaveBeenCalledTimes(tweens);
  // Finish and an explicit resize must agree on the settled camera position.
  const settledCamera = fake.centerOn.mock.calls.at(-1);
  const resize = fake.on.mock.calls[0]?.[1];
  if (typeof resize === 'function') resize.call(scene);
  expect(fake.centerOn.mock.calls.at(-1)).toEqual(settledCamera);
});

it('reuses the same three jump ghosts across many jumps and allocates nothing during playback', () => {
  const { key, player } = feelField();
  key('G');
  const count = fake.images.length;
  const ghosts = fake.images.filter(image => image.texture === 'field:player' && image !== player);
  expect(ghosts).toHaveLength(3);
  for (let jump = 0; jump < 20; jump++) {
    if (jump > 0) for (const input of jump % 2 ? ['g', 'g'] : ['G']) key(input);
    const playback = fake.tween.mock.calls.at(-1)?.[0];
    for (let sample = 1; sample < 10; sample++) {
      playback.targets.value = sample / 10; playback.onUpdate();
      expect(fake.images).toHaveLength(count);
    }
    expect(ghosts.every(image => image.visible && image.alpha > 0)).toBe(true);
    expect(ghosts.map(image => image.alpha)).toEqual([0.35, 0.25, 0.15].map(alpha => alpha * (1 - 0.9)));
    playback.targets.value = 1; playback.onUpdate(); playback.onComplete();
    expect(ghosts.every(image => !image.visible)).toBe(true);
    expect(player?.setScale).toHaveBeenLastCalledWith(1);
    expect(fake.tween.mock.calls.at(-1)?.[0]).toBe(playback);
  }
});

it('leans toward a blocked cell with pooled dust and keeps the camera still', () => {
  const { scene, player, initial } = feelField();
  scene.present({ ...initial, state: { ...initial.state, turn: 1 }, events: [
    { type: 'bump', reason: 'wall', at: { line: 0, col: 1 } },
  ] });
  const playback = fake.tween.mock.calls.at(-1)?.[0];
  const camera = fake.centerOn.mock.calls.at(-1);
  expect(playback.duration).toBe(140);
  playback.targets.value = 0.5; playback.onUpdate();
  expect([player?.x, player?.y]).toEqual([12, 8]);
  expect(fake.centerOn.mock.calls.at(-1)).toEqual(camera);
  const dust = fake.images.find(image => image.texture === 'field:dust-puff');
  expect(dust).toMatchObject({ x: 16, y: 8, visible: true });
  expect(dust?.setDisplaySize).toHaveBeenCalledWith(3, 3);
  playback.targets.value = 1; playback.onUpdate(); playback.onComplete();
  expect([player?.x, player?.y]).toEqual([8, 8]);
  expect(dust?.visible).toBe(false);
});

it('gives two entities independent stable idle phases and water a 900 ms clock', () => {
  const def = FIXTURE_STAGE.entities[0];
  if (!def) throw new Error('Fixture must supply an actor');
  const entities = ['blot-1', 'blot-2'].map((id, col) => ({
    id, at: { line: 0, col }, pathIndex: 0, def: { ...def, id, sprite: 'blot' },
  }));
  const scene = new FieldScene({ ...frame, state: { ...frame.state, entities } }, false); scene.create();
  const actors = fake.images.filter(image => image.texture === 'field:blot');
  expect(actors).toHaveLength(2);
  let independent = false;
  for (let elapsed = 0; elapsed < 600; elapsed += 50) {
    scene.update(elapsed, 50);
    if (actors[0]?.texture !== actors[1]?.texture) independent = true;
  }
  expect(independent).toBe(true);
  expect(fake.idle.mock.calls[0]?.[0].delay).toBe(900);
  const textures = actors.map(image => image.texture);
  scene.update(1200, 600);
  expect(actors.map(image => image.texture)).toEqual(textures);
  scene.setReducedMotion(true); scene.update(1800, 600);
  expect(actors.every(image => image.texture === 'field:blot')).toBe(true);
});

it('snaps reduced-motion moves without ghosts, bob, lean or landing squash', () => {
  const { key, player } = feelField(true);
  key('G');
  expect([player?.x, player?.y]).toEqual([8, 184]);
  expect(fake.tween).not.toHaveBeenCalled();
  expect(fake.images.filter(image => image.texture === 'field:player')).toHaveLength(1);
});


it('snaps :e! through the real session input path while a walk is running', () => {
  const { initial, scene, player, sim } = feelField();
  const controller = createSession({ sim, storyEngine: createStoryEngine(), content,
    stage: initial.stage, legend: initial.legend });
  let session = controller.init(false);
  session = controller.reduce(session, 'l');
  expect(session.world.engine.cursor.col).toBe(1);
  scene.present({ ...initial, state: session.world, events: session.lastEvents });
  const playback = fake.tween.mock.calls.at(-1)?.[0];
  playback.targets.value = 0.5; playback.onUpdate();
  for (const input of [':', 'e', '!']) {
    session = controller.reduce(session, input);
    scene.present({ ...initial, state: session.world, events: session.lastEvents });
  }
  expect(player?.x).toBe(20);
  session = controller.reduce(session, '<CR>');
  expect(session.lastEvents).toContainEqual({ type: 'checkpoint-restored' });
  scene.present({ ...initial, state: session.world, events: session.lastEvents });
  expect([player?.x, player?.y]).toEqual([8, 8]);
  expect(fake.tween).toHaveBeenCalledTimes(1);
});

it.each(['G', 'w'])('carries l into a full %s jump from the old destination', command => {
  const { key, player, current } = feelField();
  key('l');
  const walk = fake.tween.mock.calls.at(-1)?.[0];
  walk.targets.value = 0.25; walk.onUpdate();
  const oldCursor = current().engine.cursor;
  const groundX = 8 + 16 * (1 - 0.75 ** 2);
  key(command);
  expect(player?.x).toBeCloseTo(groundX);
  expect(player?.y).toBe(8); // No inherited bob.
  expect(Math.abs(groundX - (oldCursor.col * 16 + 8))).toBeLessThanOrEqual(16);
  const jump = fake.tween.mock.calls.at(-1)?.[0];
  const destination = current().engine.cursor;
  const cells = Math.abs(destination.line - oldCursor.line) + Math.abs(destination.col - oldCursor.col);
  expect(jump.duration).toBe(Math.min(360, 160 + 15 * cells));
  jump.targets.value = (jump.duration - 90) / (2 * jump.duration); jump.onUpdate();
  const groundY = 8 + destination.line * 8;
  const arc = Math.min(20, 6 + 1.5 * cells) * (destination.line > 6 ? 0.5 : 1);
  expect(player?.y).toBeCloseTo(groundY - arc);
  expect(player?.x).toBeCloseTo((groundX + destination.col * 16 + 8) / 2);
});

it.each(['i', 'cw', 'ciw'])('syncs insert typing at rest after %j', prefix => {
  const { key, player, current } = feelField();
  for (const input of prefix) key(input);
  key('o');
  expect(current().engine.mode).toBe('insert');
  expect(current().pending).not.toBeNull();
  expect([player?.x, player?.y]).toEqual([current().engine.cursor.col * 16 + 8, current().engine.cursor.line * 16 + 8]);
  expect(fake.centerOn).toHaveBeenCalled();
});

it.each(['3', 'f'])('preserves playback after cancelling %s', prefix => {
  const { key, player } = feelField();
  key('l');
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  clock.targets.value = 0.25; clock.onUpdate();
  key(prefix); key(prefix === '3' ? '<Esc>' : '<F1>');
  expect(fake.tween).toHaveBeenCalledTimes(1);
  clock.targets.value = 0.75; clock.onUpdate();
  expect(player?.x).toBeGreaterThan(20);
});

it('keeps repeated j bumps gliding from the drawn ground without snapping to the wall', () => {
  const { key, player } = feelField(false, ['oo', 'oo', 'TT']);
  key('j');
  let clock = fake.tween.mock.calls.at(-1)?.[0];
  clock.targets.value = 0.25; clock.onUpdate();
  let groundY = 8 + 16 * (1 - 0.75 ** 2);
  for (let repeat = 0; repeat < 4; repeat++) {
    key('j');
    expect(player?.y).toBeCloseTo(groundY);
    clock = fake.tween.mock.calls.at(-1)?.[0];
    clock.targets.value = 0.25; clock.onUpdate();
    groundY += (24 - groundY) * (1 - 0.75 ** 2);
    expect(player?.y).toBeCloseTo(groundY + 3);
  }
});

it.each(['x', 'dd'])('carries a running walk through the edit %j', inputs => {
  const { key, player } = feelField();
  key('l');
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  clock.targets.value = 0.25; clock.onUpdate();
  const groundX = 8 + 16 * (1 - 0.75 ** 2);
  for (const input of inputs) key(input);
  expect(player?.x).toBeCloseTo(groundX);
  const edit = fake.tween.mock.calls.at(-1)?.[0];
  edit.targets.value = 0.5; edit.onUpdate();
  expect(player?.x).toBeGreaterThan(groundX);
});

it('finishes squash inside the jump clock with planted feet and ghosts below the player', () => {
  const { key, player } = feelField();
  key('G');
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  const ghosts = fake.images.filter(image => image.texture === 'field:player' && image !== player);
  for (const ghost of ghosts) expect(fake.containers[1]?.addAt).toHaveBeenCalledWith(ghost, 0);
  clock.targets.value = (clock.duration - 90) / clock.duration; clock.onUpdate();
  expect(player?.setScale).toHaveBeenLastCalledWith(1.15, 0.8);
  expect(player?.y).toBeCloseTo(184 + 8 * 0.2);
  expect(ghosts.every(ghost => ghost.setTint.mock.calls.length > 0)).toBe(true);
  clock.targets.value = 1; clock.onUpdate(); clock.onComplete();
  expect(player?.y).toBe(184);
  expect(fake.tween).toHaveBeenCalledTimes(1);
  key('i'); key('o'); // Clock completion releases animating immediately.
  expect(player?.x).toBe(24);
});


it('draws static landing labels in reduced motion and removes hidden or dark markers', () => {
  const at = frame.state.engine.cursor;
  const scene = new FieldScene({ ...frame, markers: [{ key: 'w', at }] }, true);
  scene.create();
  const label = fake.texts.find(text => text.text === 'w');
  expect(label?.alpha).toBe(0.7);
  const labels = fake.containers.find(container => container.add.mock.calls.some(call => call[0] === label));
  expect(labels).toBeDefined();
  labels?.add.mockClear();
  scene.present({ ...frame, markers: [] });
  expect(labels?.removeAll).toHaveBeenCalledWith(true);
  expect(labels?.add).not.toHaveBeenCalled();
  scene.present({ ...frame, darkness: { radius: 1, lights: [] }, markers: [{ key: 'e', at: { line: at.line + 5, col: at.col } }] });
  expect(labels?.add).not.toHaveBeenCalled();
});

it('keeps landing text objects when a new marker list has equal contents', () => {
  const at = frame.state.engine.cursor;
  const scene = new FieldScene({ ...frame, markers: [{ key: 'w', at }] }, true);
  scene.create();
  const count = fake.texts.length;
  const label = fake.texts.find(text => text.text === 'w');
  const labels = fake.containers.find(container => container.add.mock.calls.some(call => call[0] === label));
  labels?.removeAll.mockClear();
  scene.present({ ...frame, markers: [{ key: 'w', at: { ...at } }] });
  expect(fake.texts).toHaveLength(count);
  expect(labels?.removeAll).not.toHaveBeenCalled();
  scene.present({ ...frame, markers: [{ key: 'e', at }] });
  expect(fake.texts).toHaveLength(count + 1);
  expect(labels?.removeAll).toHaveBeenCalledOnce();
});


describe('first-minute guidance', () => {
  it.each(['normal', 'insert', 'operator-pending'] as const)('draws the %s cursor above overhangs', mode => {
    const scene = new FieldScene({ ...frame, state: { ...frame.state, engine: { ...frame.state.engine, mode } } }, false);
    scene.create();
    const cursor = fake.images.find(image => image.texture.startsWith(`guidance:${mode}:`));
    const player = fake.images.find(image => image.texture === 'field:player');
    expect(cursor).toMatchObject({ x: player?.x, y: player?.y, depth: 4.2, visible: true });
    const pixels = fake.pixels.get(cursor?.texture ?? '');
    expect(pixels).toEqual(mode === 'insert' ? [[0, 0, 2, 16], [2, 0, 1, 16]] : mode === 'operator-pending'
      ? [[1, 14, 14, 1], [1, 15, 14, 1]]
      // A dark outer frame, then the accent one.
      : [[0, 0, 16, 1], [0, 15, 16, 1], [0, 1, 1, 14], [15, 1, 1, 14], [1, 1, 14, 1], [1, 14, 14, 1], [1, 1, 1, 14], [14, 1, 1, 14]]);
  });
  it('blinks 600ms on, 400ms off; movement resets it and reduced motion stays on', () => {
    const scene = new FieldScene(frame, false); scene.create();
    const cursor = fake.images.find(image => image.texture.startsWith('guidance:normal:'));
    scene.update(599, 599); expect(cursor?.visible).toBe(true);
    scene.update(600, 1); expect(cursor?.visible).toBe(false);
    scene.update(1000, 400); expect(cursor?.visible).toBe(true);
    scene.update(1700, 700); expect(cursor?.visible).toBe(false);
    scene.present(moving); expect(cursor?.visible).toBe(true);
    scene.update(2400, 700); expect(cursor?.visible).toBe(false);
    scene.setReducedMotion(true); scene.update(3100, 700); expect(cursor?.visible).toBe(true);
  });
  it('follows the drawn player through carry-over rather than the logical destination', () => {
    const scene = new FieldScene(frame, false); scene.create(); scene.present(moving);
    const config = fake.tween.mock.calls[0]?.[0];
    config.targets.value = 0.3; config.onUpdate();
    const cursor = fake.images.find(image => image.texture.startsWith('guidance:normal:'));
    const player = fake.images.find(image => image.texture.startsWith('field:player'));
    expect(cursor?.x).toBe(player?.x); expect(cursor?.y).toBe(player?.y);
    expect(cursor?.x).not.toBe(40 * 16 + 8);
    scene.present({ ...moving, state: { ...moving.state, turn: 2 } });
    expect(cursor?.x).toBe(player?.x);
  });
  it('hides the cursor for cutscenes and text stages', () => {
    const scene = new FieldScene(frame, false); scene.create();
    const cursor = fake.images.find(image => image.texture.startsWith('guidance:normal:'));
    scene.present({ ...frame, hideCursor: true }); expect(cursor?.visible).toBe(false);
    scene.present({ ...frame, stage: { ...frame.stage, type: 'text' } }); expect(cursor?.visible).toBe(false);
  });
  it('bobs an objective arrow, keeps it still for reduced motion and suppresses it in darkness or overlays', () => {
    const target = { line: 2, col: 4 };
    const scene = new FieldScene({ ...frame, objectiveTarget: target }, false); scene.create();
    const arrow = fake.images.find(image => image.texture.startsWith('guidance:arrow:'));
    expect(arrow).toMatchObject({ x: 72, y: 24, visible: true });
    scene.update(250, 250); expect(arrow?.y).toBe(26);
    scene.setReducedMotion(true); scene.update(500, 250); expect(arrow?.y).toBe(24);
    scene.present({ ...frame, objectiveTarget: target, hideObjective: true }); expect(arrow?.visible).toBe(false);
    scene.present({ ...frame, objectiveTarget: target, stage: { ...frame.stage, id: 'mouth' } }); expect(arrow?.visible).toBe(false);
    scene.present({ ...frame, objectiveTarget: target, stage: { ...frame.stage, type: 'text' } }); expect(arrow?.visible).toBe(false);
  });
  it('pins offscreen targets to the viewport edge and points toward them', () => {
    const scene = new FieldScene({ ...frame, objectiveTarget: { line: 2, col: 100 } }, true); scene.create();
    const arrow = fake.images.find(image => image.texture.startsWith('guidance:arrow:'));
    expect(arrow?.x).toBeLessThan(100 * 16);
    expect(arrow?.setAngle).toHaveBeenLastCalledWith(expect.any(Number));
    expect(arrow?.setAngle.mock.calls.at(-1)?.[0]).toBeLessThan(-80);
  });
});

it('caches guidance textures and changes the cursor texture only with its mode', () => {
  const scene = new FieldScene({ ...frame, objectiveTarget: { line: 2, col: 4 } }, true); scene.create();
  const cursor = fake.images.find(image => image.texture.startsWith('guidance:normal:'));
  const exists = scene.textures.exists;
  vi.mocked(exists).mockClear();
  scene.update(16, 16); scene.update(32, 16);
  expect(cursor?.setTexture).not.toHaveBeenCalled();
  expect(exists).not.toHaveBeenCalled();
  const insert = { ...frame, state: { ...frame.state, engine: { ...frame.state.engine, mode: 'insert' as const } } };
  scene.present(insert);
  expect(cursor?.setTexture).toHaveBeenCalledOnce();
  scene.update(48, 16);
  expect(cursor?.setTexture).toHaveBeenCalledOnce();
  vi.mocked(exists).mockClear();
  scene.present(frame);
  expect(cursor?.setTexture).toHaveBeenCalledTimes(2);
  expect(vi.mocked(exists).mock.calls.filter(([key]) => key.startsWith('guidance:'))).toEqual([]);
});

it('syncs the cursor after actor idle updates', () => {
  const scene = new FieldScene(frame, false); scene.create();
  const cursor = fake.images.find(image => image.texture.startsWith('guidance:normal:'));
  const player = fake.images.find(image => image.texture.startsWith('field:player'));
  if (!player) throw new Error('Missing player');
  player.setTexture.mockImplementation(function (value: string) {
    player.texture = value;
    player.y += 1;
    return player;
  });
  scene.update(16, 16);
  expect(cursor?.y).toBe(player.y);
});

it.each(['dead', 'cleared'] as const)('hides the cursor when the world is %s', status => {
  const scene = new FieldScene(frame, true); scene.create();
  const cursor = fake.images.find(image => image.texture.startsWith('guidance:normal:'));
  scene.present({ ...frame, state: { ...frame.state, status } });
  scene.update(16, 16);
  expect(cursor?.visible).toBe(false);
});

it('previews exactly the bank and four river cells for 5r, above overhangs', () => {
  const state = { ...frame.state, engine: { ...frame.state.engine,
    cursor: { line: 2, col: 30 }, lines: [' '.repeat(46), ' '.repeat(46), ' '.repeat(31) + '~~~~' + ' '.repeat(11)], pendingKeys: ['5', 'r'] } };
  const scene = new FieldScene({ ...frame, state }, true); scene.create();
  const range = fake.images.filter(image => image.texture.startsWith('guidance:range:'));
  expect(range.map(image => ({ line: (image.y - 8) / 16, col: (image.x - 8) / 16 })))
    .toEqual([30, 31, 32, 33, 34].map(col => ({ line: 2, col })));
  expect(range.every(image => image.depth > 2)).toBe(true);
  const short = { ...state, engine: { ...state.engine, cursor: { line: 2, col: 44 } } };
  scene.present({ ...frame, state: short });
  expect(range[0]?.setTintFill).toHaveBeenLastCalledWith(0xe06464);
});
it('draws dashed standing markers, makes the occupied marker solid, and hides them in overlays', () => {
  const at = frame.state.engine.cursor;
  const other = { line: at.line, col: at.col + 1 };
  const scene = new FieldScene({ ...frame, standAt: [at, other] }, false); scene.create();
  const solid = fake.images.find(image => image.texture.startsWith('guidance:stand-ready:'));
  const dashed = fake.images.find(image => image.texture.startsWith('guidance:stand:'));
  expect(solid).toMatchObject({ x: at.col * 16 + 8, y: at.line * 16 + 8, alpha: 1, depth: 3.1 });
  scene.update(500, 500); expect(dashed?.alpha).toBeCloseTo(0.3);
  scene.setReducedMotion(true); scene.update(1000, 500); expect(dashed?.alpha).toBe(1);
  scene.present({ ...frame, standAt: [at, other], hideObjective: true });
  expect(solid?.destroy).toHaveBeenCalled(); expect(dashed?.destroy).toHaveBeenCalled();
});

it('pools terrain, particles and shadows and hides ambient motion immediately on reduction', () => {
  const scene = new FieldScene({ ...frame, showSource: false }, false); scene.create();
  const particles = fake.images.filter(image => image.texture.startsWith('terrain:particle:'));
  const shadows = fake.images.filter(image => image.texture === 'terrain:actor-shadow');
  expect(particles).toHaveLength(24);
  expect(shadows.length).toBeGreaterThan(0);
  const images = fake.images.length;
  for (let tick = 0; tick < 20; tick++) scene.update(tick * 16, 16);
  expect(fake.images).toHaveLength(images);
  scene.setReducedMotion(true);
  expect(particles.every(image => !image.visible)).toBe(true);
  scene.setReducedMotion(false);
  expect(fake.images).toHaveLength(images);
  expect(particles.some(image => image.visible)).toBe(true);
});
it('freezes shoreline phase on the existing water clock with reduced motion', () => {
  const initial = { ...frame, stage: quarry, legend: quarryLegend,
    state: { ...frame.state, engine: { ...frame.state.engine, lines: [' ~ ', ' ~ ', '   '] } } };
  const scene = new FieldScene(initial, false); scene.create();
  const water = fake.images.find(image => image.texture.startsWith('terrain:') && image.texture.includes(':water:') && image.x === 24 && image.y === 8);
  const first = water?.texture;
  const callback = fake.idle.mock.calls[0]?.[0].callback;
  callback(); expect(water?.texture).not.toBe(first);
  scene.setReducedMotion(true); expect(water?.texture).toBe(first);
  callback(); expect(water?.texture).toBe(first);
});
it('updates shore neighbours immediately after a row shift without replacing overlay images', () => {
  const initial = { ...frame, stage: quarry, legend: quarryLegend,
    state: { ...frame.state, engine: { ...frame.state.engine, lines: [' ~ ', '   '] } } };
  const scene = new FieldScene(initial, true); scene.create();
  const neighbour = fake.images.find(image => image.texture.startsWith('terrain:') && image.texture.includes(':ground:') && image.x === 24 && image.y === 24);
  const before = neighbour?.texture;
  const imageCount = fake.images.length;
  scene.present({ ...initial, state: { ...initial.state, engine: { ...initial.state.engine, lines: ['  ', '   '] } } });
  expect(neighbour?.texture).not.toBe(before);
  expect(fake.images).toHaveLength(imageCount);
});
it('keeps jump shadows on the ground and shrinks them with actor height', () => {
  const { scene, key } = feelField();
  key('G');
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  clock.targets.value = 0.5; clock.onUpdate();
  const player = fake.images.find(image => image.texture === 'field:player');
  const shadow = fake.images.find(image => image.texture === 'terrain:actor-shadow');
  expect(shadow?.y).toBeGreaterThan(player?.y ?? Infinity);
  expect(shadow?.setScale).toHaveBeenLastCalledWith(expect.any(Number));
  expect(shadow?.setScale.mock.calls.at(-1)?.[0]).toBeLessThan(1);
  scene.setReducedMotion(true);
  expect(shadow?.setScale).toHaveBeenLastCalledWith(1);
});

it.each(['complete', 'finish', 'interrupt', 'reduce'] as const)('hides moving row overlays and paper until %s', ending => {
  const initial = { ...frame, state: { ...frame.state, entities: [], engine: { ...frame.state.engine, lines: ['    ', ' ', '    ', '    '] } } };
  const scene = new FieldScene(initial, false); scene.create();
  const changed = { ...initial, state: { ...initial.state, turn: 1 }, events: [
    { type: 'rows-changed' as const, fromLine: 1, toLine: 1, lineDelta: 1, by: 'player' as const },
  ] };
  const paper = fake.images.find(image => image.texture.startsWith('terrain:paper-tile:') && image.y === 24);
  scene.present(changed);
  const overlays = fake.images.filter(image => image.depth === 0.3);
  expect(overlays.filter(image => image.y >= 24).every(image => !image.visible)).toBe(true);
  expect(overlays.filter(image => image.y === 8).every(image => image.visible)).toBe(true);
  expect(paper?.visible).toBe(false);
  const ground = fake.images.find(image => image.texture.startsWith('terrain:ground-tile:') && image.depth === 0 && image.x === 8 && image.y === 8);
  expect(ground).toBeDefined();
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  clock.targets.value = 0.5; clock.onUpdate();
  if (ending === 'complete') clock.onComplete();
  else if (ending === 'finish') scene.finish();
  else if (ending === 'reduce') scene.setReducedMotion(true);
  else scene.present({ ...initial, state: { ...initial.state, turn: 2 }, events: [
    { type: 'player-moved', from: { line: 0, col: 0 }, to: { line: 0, col: 1 }, style: 'walk' },
  ] });
  expect(overlays.every(image => image.visible)).toBe(true);
  expect(paper?.visible).toBe(true);
});
it('recomputes edges only for changed text and neighbouring rows, never cursor-only steps', async () => {
  const module = await import('./terrain/edges.js');
  const edges = vi.spyOn(module, 'edgesFor');
  const initial = { ...frame, state: { ...frame.state, entities: [], engine: { ...frame.state.engine, lines: ['    ', '    ', '    ', '    ', '    '] } } };
  const scene = new FieldScene(initial, true); scene.create(); edges.mockClear();
  scene.present({ ...initial, state: { ...initial.state, engine: { ...initial.state.engine, cursor: { line: 1, col: 0 }, lines: [...initial.state.engine.lines] } } });
  expect(edges).not.toHaveBeenCalled();
  scene.present({ ...initial, state: { ...initial.state, engine: { ...initial.state.engine, lines: ['    ', '    ', ' T  ', '    ', '    '] } } });
  expect(edges).toHaveBeenCalledTimes(12);
  expect(new Set(edges.mock.calls.map(call => call[1].line))).toEqual(new Set([1, 2, 3]));
  edges.mockRestore();
});
it('uses swapped object sprites for outlines without generating a second non-water frame', () => {
  const initial = { ...frame, stage: lighthouse, legend: lighthouseLegend, state: {
    ...frame.state, stage: lighthouse.id, flags: {}, entities: [], engine: { ...frame.state.engine, lines: lighthouse.map, cursor: lighthouse.start },
  } };
  const scene = new FieldScene(initial, true); scene.create();
  const outline = fake.images.find(image => image.texture.startsWith('terrain:lamp:'));
  expect(outline).toBeDefined();
  scene.present({ ...initial, state: { ...initial.state, flags: { 'lighthouse.lit': true } } });
  expect(outline?.texture).toMatch(/^terrain:lamp-lit:/);
  expect([...fake.textures].filter(key => key.startsWith('terrain:') && key.includes(':object:')).every(key => key.endsWith(':0'))).toBe(true);
});
it('matches actor outline idle frames and avoids idle shadow writes', () => {
  const scene = new FieldScene({ ...frame, showSource: false }, false); scene.create();
  scene.update(1, 1);
  const outline = fake.images.find(image => image.texture.includes(':player:') && image.texture.startsWith('terrain:outline:'));
  const shadow = fake.images.find(image => image.texture === 'terrain:actor-shadow');
  expect(shadow?.depth).toBe(0.7);
  const calls = shadow?.setScale.mock.calls.length;
  scene.update(2, 1); expect(shadow?.setScale).toHaveBeenCalledTimes(calls ?? 0);
  scene.update(1000, 998);
  const player = fake.images.find(image => image.texture.startsWith('field:player'));
  expect(outline?.texture.endsWith(':1')).toBe(player?.texture.endsWith(':1'));
});
it('guards pre-create motion updates and wraps particles inside the camera, hiding them in source view', () => {
  const initial = { ...frame, showSource: false };
  const scene = new FieldScene(initial, false);
  scene.setReducedMotion(true); scene.update(0, 16); expect(fake.images).toHaveLength(0);
  scene.setReducedMotion(false); scene.create(); scene.update(10, 10);
  const particles = fake.images.filter(image => image.texture.startsWith('terrain:particle:'));
  const centre = fake.centerOn.mock.calls.at(-1);
  for (const particle of particles) {
    expect(particle.depth).toBe(1.05);
    expect(Math.abs(particle.x - (centre?.[0] as number))).toBeLessThanOrEqual(fake.scale.width / 3 / 2);
    expect(Math.abs(particle.y - (centre?.[1] as number))).toBeLessThanOrEqual(fake.scale.height / 3 / 2);
  }
  scene.present({ ...initial, showSource: true }); expect(particles.every(image => !image.visible)).toBe(true);
  scene.update(20, 10); expect(particles.every(image => !image.visible)).toBe(true);
  scene.present(initial); expect(particles.some(image => image.visible)).toBe(true);
});

it('P-18 preserves the Lighthouse stone floor instead of replacing it with the Lowlands ground', () => {
  const sim = createWorldSim(createEngine());
  const state = sim.init(lighthouse, lighthouseLegend, { learnedCommands: QUARRY_COMMANDS, flags: {} });
  new FieldScene({ state, stage: lighthouse, legend: lighthouseLegend, events: [], showSource: false }, true).create();
  const floor = fake.images.filter(image => image.texture === 'field:stone-floor');
  expect(floor.length).toBeGreaterThan(0);
  expect(fake.images.some(image => image.texture.startsWith('terrain:ground-tile:lowlands:'))).toBe(false);
});

it('P-18 pools 16x24 props, hides upper eight pixels in source view, and keeps markers above them', () => {
  const initial = { ...frame, showSource: false };
  const scene = new FieldScene(initial, false); scene.create();
  const tops = fake.images.filter(image => image.texture.startsWith('overhang:'));
  expect(tops.length).toBeGreaterThan(0);
  for (const top of tops) {
    expect(fake.pixels.get(top.texture)?.every(rect => (rect[1] ?? 0) + (rect[3] ?? 0) <= 8)).toBe(true);
    expect((top.y + 4) % 16).toBe(0);
  }
  const count = fake.images.length;
  scene.present({ ...initial, showSource: true });
  expect(tops.every(image => !image.visible)).toBe(true);
  scene.present(initial);
  expect(tops.some(image => image.visible)).toBe(true);
  expect(fake.images).toHaveLength(count);
  const cursor = fake.images.find(image => image.texture.startsWith('guidance:normal:'));
  expect(cursor?.depth).toBeGreaterThan(2);
});

it('P-18 keeps additive light present but perfectly steady with reduced motion', () => {
  const initial = { ...frame, showSource: false };
  const scene = new FieldScene(initial, false); scene.create();
  const glows = fake.images.filter(image => image.texture.startsWith('glow:'));
  expect(glows.length).toBeGreaterThan(0);
  expect(glows.every(image => image.setBlendMode.mock.calls.some(call => call[0] === 1))).toBe(true);
  scene.update(500, 500);
  expect(glows[0]?.alpha).toBeCloseTo(GLOW_ALPHA * 1.04);
  scene.setReducedMotion(true);
  expect(glows[0]?.alpha).toBe(GLOW_ALPHA);
  const textures = fake.textures.size; const images = fake.images.length;
  for (let tick = 0; tick < 20; tick++) scene.update(tick * 16, 16);
  expect(glows.every(image => image.alpha === GLOW_ALPHA)).toBe(true);
  expect(fake.textures.size).toBe(textures); expect(fake.images).toHaveLength(images);
});

import { AtmosphereLayer } from './terrain/AtmosphereLayer.js';
import { WORLD_PALETTES } from './palette.js';

function atmosphere(initial = frame): AtmosphereLayer {
  const scene = new FieldScene(initial, true);
  return new AtmosphereLayer(scene, scene.add.container(0, 0));
}

it('bounds the dark falloff atlas through 200 cursor moves and never draws the map silhouette', () => {
  const rows = Array.from({ length: 10 }, () => ' '.repeat(24));
  const initial = { ...frame, stage: { ...frame.stage, map: rows }, darkness: { radius: 3, lights: [{ line: 5, col: 12 }] },
    state: { ...frame.state, entities: [], engine: { ...frame.state.engine, lines: rows } } };
  const layer = atmosphere();
  for (let move = 0; move < 200; move++) layer.sync({ ...initial, state: { ...initial.state,
    engine: { ...initial.state.engine, cursor: { line: Math.floor(move / 24) % 10, col: move % 24 } } } }, 100, 60);
  const textures = [...fake.textures].filter(key => key.startsWith('darkness:'));
  expect(textures.length).toBeGreaterThan(8);
  expect(textures.length).toBeLessThanOrEqual(32);
  expect(fake.images.some(image => image.texture.startsWith('atmosphere:'))).toBe(false);
  const { darkness: _sight, ...lit } = initial;
  layer.sync(lit, 100, 60);
  expect(fake.images.some(image => image.texture.startsWith('atmosphere:outline:') && image.visible)).toBe(true);
  layer.sync(initial, 100, 60);
  expect(fake.images.filter(image => image.texture.startsWith('atmosphere:')).every(image => !image.visible)).toBe(true);
});

it('does not recompute lit map textures on cursor-only moves', () => {
  const scene = new FieldScene(frame, true);
  const layer = new AtmosphereLayer(scene, scene.add.container(0, 0)); layer.sync(frame, 100, 60);
  vi.mocked(scene.textures.exists).mockClear();
  for (let col = 1; col < 10; col++) layer.sync({ ...frame, state: { ...frame.state,
    engine: { ...frame.state.engine, cursor: { line: 0, col } } } }, 100, 60);
  expect(scene.textures.exists).not.toHaveBeenCalled();
});

it('gates overhang alpha and row visibility by both its own and covered cell', () => {
  const rows = ['   ', ' T ', '   '];
  const initial = { ...frame, showSource: false, stage: { ...frame.stage, map: rows }, state: { ...frame.state,
    entities: [], engine: { ...frame.state.engine, lines: rows, cursor: { line: 2, col: 1 } } } };
  const layer = atmosphere(); layer.sync(initial, 24, 24);
  const top = fake.images.find(image => image.texture.startsWith('overhang:tree:'));
  expect(top?.visible).toBe(true);
  layer.setHiddenRows(new Set([0])); expect(top?.visible).toBe(false);
  layer.setHiddenRows(new Set([1])); expect(top?.visible).toBe(false);
  layer.setHiddenRows(new Set()); expect(top?.visible).toBe(true);
  layer.sync({ ...initial, darkness: { radius: 1, lights: [] } }, 24, 24);
  expect(top?.alpha).toBe(0); expect(top?.visible).toBe(false);
  layer.setHiddenRows(new Set()); expect(top?.visible).toBe(false);
  layer.sync({ ...initial, darkness: { radius: 2, lights: [] } }, 24, 24);
  expect(top?.alpha).toBe(0.35); expect(top?.visible).toBe(true);
});

it('retains authored outline and paper after deleting columns and complete rows', () => {
  const rows = ['    ', '  ', '    '];
  const initial = { ...frame, stage: { ...frame.stage, map: rows }, state: { ...frame.state,
    entities: [], engine: { ...frame.state.engine, lines: [' '] } } };
  const layer = atmosphere(); layer.sync(initial, 24, 24);
  const deleted = fake.images.filter(image => image.texture.startsWith('atmosphere:paper:'));
  expect(deleted).toHaveLength(3);
  expect(deleted.some(image => image.x === 32 && image.y === 40)).toBe(true);
  const outline = fake.images.filter(image => image.texture.startsWith('atmosphere:outline:'));
  expect(outline.some(image => image.x === 56 && image.y === 40)).toBe(true);
  expect(outline.find(image => image.x === 8 && image.y === 8)?.texture).toBe('atmosphere:outline:9');
  const exterior = fake.images.filter(image => image.depth === -3);
  expect(exterior.some(image => image.x === 56 && image.y === 40)).toBe(false);
});

it('uses one Last Page paper everywhere, without vignette or outline', () => {
  const initial = { ...frame, stage: lastPage, legend: lastPageLegend, showSource: false, state: { ...frame.state,
    entities: [], engine: { ...frame.state.engine, lines: [' S', ' '] } } };
  const scene = new FieldScene(initial, true); scene.create();
  expect(WORLD_PALETTES['last-page'].paper).toBe(0xf6efd4);
  expect(fake.background).toHaveBeenLastCalledWith('#f6efd4');
  expect(fake.images.filter(image => image.texture.startsWith('atmosphere:outline:') || image.texture === 'vignette:last-page')).toEqual([]);
  for (const key of ['field:page-paper', 'atmosphere:paper:last-page', 'atmosphere:last-page:paper:0:0']) {
    expect(fake.colors.get(key), key).toEqual(new Set([0xf6efd4]));
  }
});

it('sorts trail ghosts directly behind the player and bump dust directly in front', () => {
  const { scene, key } = feelField();
  key('G');
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  clock.targets.value = 0.5; clock.onUpdate();
  const player = fake.images.find(image => image.texture === 'field:player');
  const ghosts = fake.images.filter(image => image.texture === 'field:player' && image !== player && image.visible);
  expect(ghosts).toHaveLength(3);
  expect(ghosts.every(ghost => ghost.depth === (player?.depth ?? 0) - 0.1)).toBe(true);
  scene.finish();
  // Bump into the fixture's top boundary.
  const bump = new FieldScene(frame, false); bump.create();
  bump.present({ ...frame, state: { ...frame.state, turn: 1 }, events: [
    { type: 'bump', at: frame.state.engine.cursor, reason: 'edge' },
  ] });
  const dust = fake.images.find(image => image.texture === 'field:dust-puff');
  const bumpPlayer = fake.images.filter(image => image.texture === 'field:player').at(-1);
  expect(dust?.depth).toBe((bumpPlayer?.depth ?? 0) + 0.1);
});

it('marks an explicit on-screen person above their head, keeping stand cells separate', async () => {
  const { stage, legend } = await import('../play2/content.js');
  const state = createWorldSim(createEngine()).init(stage, legend, { learnedCommands: [], flags: {} });
  const elder = state.entities.find(entity => entity.id === 'elder');
  expect(elder).toBeDefined();
  const initial = { state, stage, legend, events: [], showSource: false,
    objectiveTarget: { line: 4, col: 6 }, objectiveEntity: 'elder' };
  const scene = new FieldScene(initial, true); scene.create();
  const bubble = fake.images.find(image => image.texture.startsWith('guidance:person:'));
  expect(bubble?.visible).toBe(true);
  expect(bubble?.x).toBe(6 * 16 + 8); expect(bubble?.y).toBe(3 * 16 + 8 - 16);
  expect(fake.images.filter(image => image.visible && image.texture.startsWith('guidance:arrow:'))).toHaveLength(0);
  const { objectiveEntity: _person, ...withoutPerson } = initial;
  scene.present(withoutPerson);
  expect(bubble?.texture).toMatch(/^guidance:arrow:/);
  expect(bubble?.y).toBe(4 * 16 + 8 - 16);
  scene.present({ ...initial, objectiveTarget: null }); expect(bubble?.texture).toMatch(/^guidance:person:/);
  scene.present({ ...initial, objectiveEntity: 'missing' }); expect(bubble?.texture).toMatch(/^guidance:arrow:/);
  scene.present({ ...initial, objectiveEntity: 'elder', state: { ...state,
    entities: state.entities.map(entity => entity.id === 'elder' ? { ...entity, at: { line: 3, col: 100 } } : entity) } });
  expect(bubble?.texture).toMatch(/^guidance:arrow:/);
  scene.present({ ...initial, state: { ...state, entities: [] } }); expect(bubble?.texture).toMatch(/^guidance:arrow:/);
});

it.each([false, true])('turns on directional bumps, preserves facing at edges (reduced: %s)', reduced => {
  const scene = new FieldScene(frame, reduced); scene.create();
  const player = fake.images.find(image => image.texture === 'field:player');
  const cursor = frame.state.engine.cursor;
  const bump = (at: { line: number; col: number }) => scene.present({ ...frame,
    events: [{ type: 'bump', at, reason: 'edge' }] });
  bump({ line: cursor.line, col: cursor.col - 1 }); scene.finish();
  expect(player?.texture).toBe('field:player:7');
  bump(cursor); scene.finish(); expect(player?.texture).toBe('field:player:7');
  bump({ line: cursor.line - 1, col: cursor.col }); scene.finish();
  expect(player?.texture).toBe('field:player:4');
  bump(cursor); scene.finish(); expect(player?.texture).toBe('field:player:4');
});

it('bounds Margin texture creation, reuses all walking shapes, and restores source art', async () => {
  const { stage, legend } = await import('../play2/content.js');
  const sim = createWorldSim(createEngine());
  const options = { learnedCommands: ['h', 'j', 'k', 'l'], flags: {} };
  let state = sim.init(stage, legend, options);
  const initial = { state, stage, legend, events: [], showSource: false };
  const scene = new FieldScene(initial, false); scene.create();
  // Includes glyphs, finite terrain masks, ten player frames/outlines, glows and surroundings.
  // 612 today; a texture per cell would add hundreds.
  expect(fake.textures.size).toBeLessThanOrEqual(620);
  const textures = new Set(fake.textures);
  const erased = fake.images.find(image => image.texture === 'village:erased:0');
  expect(erased).toBeDefined();
  for (const key of ['j', 'l', 'l', 'h', 'k']) {
    const step = sim.step(state, key, stage, legend, options); state = step.state;
    scene.present({ ...initial, ...step });
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    if (clock) { clock.targets.value = 0.5; clock.onUpdate(); clock.targets.value = 1; clock.onUpdate(); }
    scene.finish(); scene.update(600, 600);
  }
  expect(fake.textures).toEqual(textures);
  const smoke = fake.images.filter(image => image.texture === 'village:smoke');
  expect(smoke).toHaveLength(9); expect(smoke.some(image => image.visible)).toBe(true);
  scene.setReducedMotion(true); expect(smoke.every(image => !image.visible)).toBe(true);
  scene.present({ ...initial, state, showSource: true });
  expect(erased?.texture).toMatch(/^terrain:ground-tile:/);
  expect(fake.images.filter(image => image.visible && image.texture.startsWith('overhang:'))).toHaveLength(0);
  expect(smoke.every(image => !image.visible)).toBe(true);
});

it('thins the crown in front of whoever stands behind it, and only that one', async () => {
  const { stage, legend } = await import('../play2/content.js');
  const sim = createWorldSim(createEngine());
  const state = sim.init(stage, legend, { learnedCommands: ['h', 'j', 'k', 'l'], flags: {} });
  const at = (line: number, col: number) => ({ ...state, engine: { ...state.engine, cursor: { line, col } } });
  const scene = new FieldScene({ state: at(11, 8), stage, legend, events: [], showSource: false }, true); scene.create();
  const crown = (col: number) => fake.images.find(image => image.texture.startsWith('overhang:tree') && image.x === col * 16 + 8 && image.y === 12 * 16 - 4);
  expect(crown(8)?.alpha).toBeCloseTo(0.35);
  expect(crown(9)?.alpha).toBe(1);
  scene.present({ state: at(11, 9), stage, legend, events: [], showSource: false });
  expect(crown(8)?.alpha).toBe(1);
  expect(crown(9)?.alpha).toBeCloseTo(0.35);
});
