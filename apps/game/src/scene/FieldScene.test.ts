import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldSim, playKeys, FIXTURE_LEGEND, FIXTURE_STAGE, type WorldStepResult } from '@escape/world';
import { FIXTURE_INITIAL_STATE } from './fixtureFrames.js';

const fake = vi.hoisted(() => {
  const object = () => ({
    x: 0, y: 0, alpha: 1, depth: 0, texture: '', text: '', visible: true,
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; },
    setAlpha(value: number) { this.alpha = value; return this; },
    setDepth(value: number) { this.depth = value; return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setTexture: vi.fn(function (this: { texture: string }, value: string) { this.texture = value; return this; }),
    setText(value: string) { this.text = value; return this; },
    setAngle: vi.fn().mockReturnThis(),
    setFlipX: vi.fn().mockReturnThis(),
    setDisplaySize: vi.fn().mockReturnThis(), setScale: vi.fn().mockReturnThis(), setScrollFactor: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(), setTintFill: vi.fn().mockReturnThis(), clearTint: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(), removeAll: vi.fn(), destroy: vi.fn(),
    setStroke: vi.fn().mockReturnThis(),
  });
  return { object, images: [] as ReturnType<typeof object>[], texts: [] as ReturnType<typeof object>[],
    containers: [] as ReturnType<typeof object>[], killAll: vi.fn(), tween: vi.fn(),
    strokeText: vi.fn(), fillText: vi.fn(), idle: vi.fn(),
    scale: { width: 900, height: 600 }, centerOn: vi.fn(), on: vi.fn(), off: vi.fn(), once: vi.fn(), textures: new Set<string>() };
});
vi.mock('phaser', () => ({ default: {
  Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Scale: { Events: { RESIZE: 'resize' } },
  Scene: class {
    add = {
      image: (x: number, y: number, texture: string) => {
        const result = fake.object().setPosition(x, y); result.texture = texture; fake.images.push(result); return result;
      },
      text: (_x: number, _y: number, text: string, style: { backgroundColor?: string }) => {
        const result = Object.assign(fake.object(), { style }); result.text = text; fake.texts.push(result); return result;
      },
      container: () => { const result = fake.object(); fake.containers.push(result); return result; },
      rectangle: (x: number, y: number) => {
        const result = fake.object().setPosition(x, y); result.texture = 'rectangle'; fake.images.push(result); return result;
      },
    };
    make = { graphics: () => ({ fillStyle() { return this; }, fillRect() { return this; },
      generateTexture: (key: string) => fake.textures.add(key), destroy: vi.fn() }),
      text: () => ({ setOrigin() { return this; }, generateTexture: (key: string) => fake.textures.add(key), destroy: vi.fn() }) };
    textures = { exists: (key: string) => fake.textures.has(key),
      createCanvas: (key: string) => { fake.textures.add(key); return { context: { font: '', textAlign: '', textBaseline: '', strokeStyle: '', lineWidth: 0, fillStyle: '', strokeText: fake.strokeText, fillText: fake.fillText }, refresh: vi.fn() }; } };
    cameras = { main: { setBackgroundColor() { return this; }, setZoom() { return this; }, setRoundPixels() { return this; }, centerOn: fake.centerOn, getWorldPoint: (x: number, y: number) => ({ x, y }) } };
    tweens = { killAll: fake.killAll, add: fake.tween };
    scale = Object.assign(fake.scale, { on: fake.on, off: fake.off });
    events = { once: fake.once };
    time = { addEvent: fake.idle };
  },
} }));
import { FieldScene } from './FieldScene.js';
import { createEngine } from '@escape/engine';
import { QUARRY_COMMANDS } from '../play2/session.js';
import { quarry, quarryLegend, lighthouse, lighthouseLegend, cut, cutLegend, shaft, shaftLegend } from '../play2/content.js';

const frame = { state: FIXTURE_INITIAL_STATE, events: [], legend: FIXTURE_LEGEND, stage: FIXTURE_STAGE, showSource: true };
const moving = { ...frame, state: { ...frame.state, turn: 1 }, events: [
  { type: 'player-moved' as const, from: { line: 2, col: 0 }, to: { line: 2, col: 40 }, style: 'walk' as const },
] };

beforeEach(() => {
  vi.clearAllMocks(); fake.scale.width = 900; fake.scale.height = 600; fake.images.length = 0; fake.texts.length = 0; fake.containers.length = 0; fake.textures.clear();
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
    expect(fake.tween.mock.calls[0]?.[0]).toMatchObject({ duration: 90 });
  });
  it('places actors over transparent glyph images and caches glyph textures', () => {
    const scene = new FieldScene(frame, false); scene.create();
    expect(fake.containers[1]?.depth).toBeGreaterThan(fake.containers[2]?.depth ?? 0);
    expect(fake.texts).toHaveLength(1);
    expect([...fake.textures].filter(key => key.startsWith('glyph:')).length).toBeGreaterThan(0);
  });
  it('reuses unchanged cell images across new states and source toggles', () => {
    const scene = new FieldScene(frame, false); scene.create();
    const cells = fake.images.filter(image => image.texture.startsWith('field:grass'));
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
  const grass = fake.images.find(image => image.texture === 'field:grass' && image.x === 8 && image.y === 8);
  const glyph = fake.images.find(image => image.texture.startsWith('glyph:') && image.x === 8 && image.y === 8);
  const vanished = fake.images.filter(image => image.y === 56 && (image.texture.startsWith('glyph:') || image.texture === 'field:grass' || image.texture === 'field:tree'));
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
  expect(ghost?.alpha).toBe(1); expect(ghost?.x).toBe(224);
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
  const grass = fake.images.find(image => image.texture === 'field:grass');
  scene.present({ ...frame, legend: { ...frame.legend, tiles: frame.legend.tiles.map(tile =>
    tile.sprite === 'grass' ? { ...tile, sprite: 'stone' } : tile) } });
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

it('retains a deleted row as ghosts and wipes left to right within 90 ms, then cleans up', () => {
  const scene = new FieldScene(frame, false); scene.create();
  scene.present({ ...frame, state: { ...frame.state, engine: {
    ...frame.state.engine, lines: frame.state.engine.lines.slice(0, -1),
  } }, events: [{ type: 'rows-changed', fromLine: 3, toLine: 3, lineDelta: -1, by: 'entity' }] });
  const ghosts = fake.images.filter(image => image.depth === 1 && image.y === 56);
  expect(ghosts).toHaveLength(16);
  const config = fake.tween.mock.calls[0]?.[0];
  expect(config.duration).toBe(90);
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
  const tiles = fake.images.filter(image => quarryLegend.tiles.some(tile => image.texture.startsWith(`field:${tile.sprite}`))
    && image.depth === 0 && image.y === row * 16 + 8 && image.destroy.mock.calls.length === 0);
  expect(tiles).toHaveLength(state.engine.lines[row]?.length ?? 0);
  for (const [col, char] of [...state.engine.lines[row] ?? ''].entries()) {
    const tile = tiles.find(image => image.x === col * 16 + 8);
    const sprite = quarryLegend.tiles.find(tile => tile.char === char)?.sprite;
    expect(tile?.texture).toMatch(new RegExp(`^field:${sprite}`));
  }
  const clock = fake.tween.mock.calls.at(-1)?.[0];
  expect(clock.duration).toBeLessThanOrEqual(90);
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
  const paper = fake.images.find(image => image.x === 24 && image.y === 24 && image.texture.startsWith('field:blank'));
  expect(paper).toBeDefined();
  const source = fake.images.find(image => image.x === 24 && image.y === 24 && image.texture.startsWith('glyph:'));
  expect(source?.visible).toBe(false);
  expect(initial.state.engine.lines[1]).toHaveLength(1);
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
  expect(clock.duration).toBeLessThanOrEqual(90);
  clock.targets.value = 0.5; clock.onUpdate();
  const shifted = fake.images.filter(image => image.texture === 'field:stone' && image.destroy.mock.calls.length === 0);
  expect(shifted.some(image => image.y % 16 !== 8)).toBe(true);
  clock.onComplete();
  const liveTiles = fake.images.filter(image => (image.texture === 'field:stone' || image.texture.startsWith('field:grass'))
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
  const player = fake.images.find(image => image.texture === 'field:player');
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
  for (const sprite of ['pilcrow', 'rope', 'stump', 'glade-lamp-lit', 'lamp-out', 'moss', 'fern-fronds', 'bramble', 'clearing']) {
    expect(fake.images.some(image => image.texture === `field:${sprite}`), sprite).toBe(true);
  }
  expect(fake.images.some(image => image.texture === 'field:moss:1')).toBe(true);
  const player = fake.images.find(image => image.texture === 'field:player');
  for (const keys of [['G'], ['g', 'g']]) {
    let jumped: WorldStepResult = { state, events: [] };
    for (const key of keys) {
      const result = sim.step(jumped.state, key, glades, gladesLegend, options);
      jumped = result;
    }
    scene.present({ ...initial, ...jumped });
    const playback = fake.tween.mock.calls.at(-1)?.[0];
    expect(playback.duration).toBeLessThanOrEqual(90);
    playback.targets.value = 0.5; playback.onUpdate();
    expect(fake.centerOn).toHaveBeenLastCalledWith(72, 144);
    expect(player?.y).toBe(136); // half-height arc, eight pixels above the ground midpoint
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
  expect(playback.duration).toBe(60);
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
  const player = fake.images.find(image => image.texture === 'field:player');
  const post = fake.images.find(image => image.texture === 'field:pier-post' && image.x === (reducedMotion ? 23 : 29) * 16 + 8 && image.y === 56);
  if (reducedMotion) {
    expect(fake.tween).not.toHaveBeenCalled();
    expect(junk).toHaveLength(0);
  } else {
    expect(junk).toHaveLength(6);
    expect(splashes).toHaveLength(6);
    const clock = fake.tween.mock.calls.at(-1)?.[0];
    expect(clock.duration).toBeLessThanOrEqual(90);
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
    expect(clock.duration).toBeLessThanOrEqual(90);
    clock.targets.value = 0.5; clock.onUpdate();
    expect(lip?.x).toBe(13 * 16 + 8);
    scene.finish();
  }
  expect(lip?.x).toBe(15 * 16 + 8);
  expect(result.state.engine.lines[1]).toBe('#[oooo]___[oooo]#');
  expect(fake.images.filter(image => !image.destroy.mock.calls.length).every(image => image.alpha === 1)).toBe(true);
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
    expect(clock.duration).toBeLessThanOrEqual(90);
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
  for (const sprite of ['gallery', 'library-wall', 'shelf-post', 'shelf-gap', 'library-dust', 'quire', 'book', 'book:1', 'book:2']) {
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
    expect(clock.duration).toBeLessThanOrEqual(90);
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
  for (const sprite of ['catalogue', 'index', 'filed-stamp', 'archive-aisle', 'archive-rail', 'atlas-shelf', 'bible-shelf', 'misfiled-shelf']) {
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
    expect(clock.duration).toBeLessThanOrEqual(90);
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
    expect(clock.duration).toBeLessThanOrEqual(90);
    const shelf = fake.images.find(image => image.texture === 'field:misfiled-shelf' && !image.destroy.mock.calls.length);
    expect(shelf?.setScale).toHaveBeenLastCalledWith(1, 0);
    clock.targets.value = 0.5; clock.onUpdate();
    expect(shelf?.setScale).toHaveBeenLastCalledWith(1, 0.875);
  }
  scene.finish();
  expect(fake.images.filter(image => !image.destroy.mock.calls.length).every(image => image.alpha === 1)).toBe(true);
});
