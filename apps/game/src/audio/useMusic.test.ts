import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { musicChoice, type MusicView } from './useMusic.js';
import { SCORES, type ScoreId } from './score.js';
const view: MusicView = { screen: 'stage', world: 'margin', dead: false, text: false, overlay: false, cleared: false };
it.each(['title', 'opening', 'stages'] as const)('%s chooses title even with a stale world/death', screen => {
  expect(musicChoice({ ...view, screen, world: 'quarry', dead: true })).toEqual({ score: 'title', level: 1, resolved: false });
});
it.each(Object.keys(SCORES).filter(id => id !== 'title') as Exclude<ScoreId, 'title'>[])('%s chooses its world and lowers text stages', world => {
  expect(musicChoice({ ...view, world })).toEqual({ score: world, level: 1, resolved: false });
  expect(musicChoice({ ...view, world, text: true, overlay: true })).toEqual({ score: world, level: 0.6, resolved: false });
});
it('chooses the ending, cuts death, and restarts after retry', () => {
  expect(musicChoice({ ...view, screen: 'ending' }).score).toBe('last-page');
  expect(musicChoice({ ...view, dead: true }).score).toBeNull();
  expect(musicChoice(view).score).toBe('margin');
});

const harness = vi.hoisted(() => ({
  cursor: 0,
  refs: new Map<number, { current: unknown }>(),
  effects: new Map<number, { deps: readonly unknown[]; cleanup: (() => void) | undefined }>(),
  pending: [] as (() => void)[],
}));
const fake = vi.hoisted(() => ({ create: vi.fn(() => ({
  setResolved: vi.fn(), setScore: vi.fn(), setEnabled: vi.fn(), setLevel: vi.fn(), duck: vi.fn(),
  setHidden: vi.fn(), dispose: vi.fn(),
})) }));
vi.mock('./music.js', () => ({ createMusic: fake.create }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const slot = harness.cursor++;
    if (!harness.refs.has(slot)) harness.refs.set(slot, { current: initial });
    return harness.refs.get(slot);
  },
  useEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
    const slot = harness.cursor++;
    const previous = harness.effects.get(slot);
    if (previous && deps.length === previous.deps.length && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
    harness.pending.push(() => {
      previous?.cleanup?.(); harness.effects.set(slot, { deps, cleanup: effect() });
    });
  },
}));
import { useMusic } from './useMusic.js';
import { useNotebookDucking } from '../play2/notebook/musicDucking.js';
import type { SoundMode } from './settings.js';
function unmount(): void {
  for (const effect of harness.effects.values()) effect.cleanup?.();
  harness.effects.clear(); harness.refs.clear(); harness.pending = [];
}
function render(next: MusicView = view, mode: SoundMode = 'on', notebook = false): void {
  harness.cursor = 0;
  useNotebookDucking(notebook);
  useMusic(next, mode);
  harness.pending.splice(0).forEach(effect => effect());
}
beforeEach(() => { fake.create.mockClear(); });
afterEach(() => { unmount(); vi.unstubAllGlobals(); });
it('passes score, text level, death cut and retry to the player', () => {
  render(); const music = fake.create.mock.results[0]!.value;
  expect(music.setScore).toHaveBeenLastCalledWith('margin', 1.5);
  render({ ...view, world: 'lowlands', text: true });
  expect(music.setScore).toHaveBeenLastCalledWith('lowlands', 1.5);
  expect(music.setLevel).toHaveBeenLastCalledWith(0.6);
  render({ ...view, dead: true }); expect(music.setScore).toHaveBeenLastCalledWith(null, 0.2);
  render(); expect(music.setScore).toHaveBeenLastCalledWith('margin', 1.5);
});
it('ducks for presentation state and notebook state without querying the DOM', () => {
  render(); const music = fake.create.mock.results[0]!.value;
  render({ ...view, overlay: true }); expect(music.duck).toHaveBeenLastCalledWith(true);
  render(view, 'on', true); expect(music.duck).toHaveBeenLastCalledWith(true);
  render(view); expect(music.duck).toHaveBeenLastCalledWith(false);
});
it.each(['effects only', 'off'] as const)('silences music in %s mode and restores it on', mode => {
  render(); const music = fake.create.mock.results[0]!.value;
  render(view, mode); expect(music.setEnabled).toHaveBeenLastCalledWith(false);
  render(); expect(music.setEnabled).toHaveBeenLastCalledWith(true);
});
it('recreates the player and visibility listener on StrictMode mount, unmount, mount', () => {
  const page = Object.assign(new EventTarget(), { hidden: false });
  const add = vi.spyOn(page, 'addEventListener'); const remove = vi.spyOn(page, 'removeEventListener');
  vi.stubGlobal('document', page);
  render(); const first = fake.create.mock.results[0]!.value;
  unmount(); render(); const second = fake.create.mock.results[1]!.value;
  expect(first.dispose).toHaveBeenCalledOnce(); expect(second.dispose).not.toHaveBeenCalled();
  page.hidden = true; page.dispatchEvent(new Event('visibilitychange'));
  expect(first.setHidden).toHaveBeenCalledTimes(1);
  expect(second.setHidden).toHaveBeenLastCalledWith(true);
  expect(second.setScore).toHaveBeenLastCalledWith('margin', 1.5);
  expect(add).toHaveBeenCalledTimes(2); expect(remove).toHaveBeenCalledTimes(1);
});

it('holds resolution through cleared-stage overlays and resets on replay and title', () => {
  render(); const music = fake.create.mock.results[0]!.value;
  for (const overlay of [false, true, false]) {
    render({ ...view, cleared: true, overlay });
    expect(music.setResolved).toHaveBeenLastCalledWith(true);
  }
  render(); expect(music.setResolved).toHaveBeenLastCalledWith(false);
  render({ ...view, screen: 'title', cleared: true });
  expect(music.setResolved).toHaveBeenLastCalledWith(false);
});
