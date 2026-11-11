import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '@escape/world';
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
    setScale: vi.fn().mockReturnThis(), setScrollFactor: vi.fn().mockReturnThis(),
    setOrigin: vi.fn().mockReturnThis(), setTintFill: vi.fn().mockReturnThis(), clearTint: vi.fn().mockReturnThis(),
    add: vi.fn().mockReturnThis(), removeAll: vi.fn(), destroy: vi.fn(),
    setStroke: vi.fn().mockReturnThis(),
  });
  return { object, images: [] as ReturnType<typeof object>[], texts: [] as ReturnType<typeof object>[],
    containers: [] as ReturnType<typeof object>[], killAll: vi.fn(), tween: vi.fn(),
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
      createCanvas: (key: string) => { fake.textures.add(key); return { context: { font: '', textAlign: '', textBaseline: '', strokeStyle: '', lineWidth: 0, fillStyle: '', strokeText: vi.fn(), fillText: vi.fn() }, refresh: vi.fn() }; } };
    cameras = { main: { setZoom() { return this; }, setRoundPixels() { return this; }, centerOn: fake.centerOn } };
    tweens = { killAll: fake.killAll, add: fake.tween };
    scale = Object.assign(fake.scale, { on: fake.on, off: fake.off });
    events = { once: fake.once };
  },
} }));
import { FieldScene } from './FieldScene.js';

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
    expect(fake.tween.mock.calls[0]?.[0]).toMatchObject({ duration: 240 });
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

it('flashes only committed affected rows and restores them on completion', () => {
  const scene = new FieldScene(frame, false); scene.create();
  scene.present({ ...frame, state: { ...frame.state, turn: 1 }, events: [
    { type: 'rows-changed', fromLine: 1, toLine: 1, lineDelta: 0, by: 'player' },
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
  config.targets.value = 0.25; config.onUpdate();
  expect(ghost?.alpha).toBe(1); expect(ghost?.x).toBe(224);
  config.targets.value = 0.75; config.onUpdate();
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
