import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldSim, playKeys, FIXTURE_LEGEND, FIXTURE_STAGE } from '@escape/world';
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
    };
    make = { graphics: () => ({ fillStyle() { return this; }, fillRect() { return this; },
      generateTexture: (key: string) => fake.textures.add(key), destroy: vi.fn() }),
      text: () => ({ setOrigin() { return this; }, generateTexture: (key: string) => fake.textures.add(key), destroy: vi.fn() }) };
    textures = { exists: (key: string) => fake.textures.has(key),
      createCanvas: (key: string) => { fake.textures.add(key); return { context: { font: '', textAlign: '', textBaseline: '', strokeStyle: '', lineWidth: 0, fillStyle: '', strokeText: fake.strokeText, fillText: fake.fillText }, refresh: vi.fn() }; } };
    cameras = { main: { setBackgroundColor() { return this; }, setZoom() { return this; }, setRoundPixels() { return this; }, centerOn: fake.centerOn } };
    tweens = { killAll: fake.killAll, add: fake.tween };
    scale = Object.assign(fake.scale, { on: fake.on, off: fake.off });
    events = { once: fake.once };
    time = { addEvent: fake.idle };
  },
} }));
import { FieldScene } from './FieldScene.js';
import { createEngine } from '@escape/engine';
import { QUARRY_COMMANDS } from '../play2/session.js';
import { quarry, quarryLegend, lighthouse, lighthouseLegend, cut, cutLegend } from '../play2/content.js';

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

it('anchors the camera to the final player cell during movement playback', () => {
  const scene = new FieldScene(frame, false); scene.create(); scene.present(moving);
  const camera = fake.centerOn.mock.calls.at(-1);
  const config = fake.tween.mock.calls[0]?.[0];
  config.targets.value = 0.1; config.onUpdate();
  expect(fake.centerOn.mock.calls.at(-1)).toEqual(camera);
  config.targets.value = 0.8; config.onUpdate();
  expect(fake.centerOn.mock.calls.at(-1)).toEqual(camera);
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
