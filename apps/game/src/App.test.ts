import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from './play2/session.js';
import type { ProgressStorage } from './play2/progress.js';

// Exercise App itself and both real key listeners without a DOM/canvas dependency.
// Hooks retain state and dependencies; each flush is one React-style render/effect cycle.
const hooks = vi.hoisted(() => ({
  cursor: 0, dirty: false, values: new Map<number, unknown>(),
  effects: new Map<number, { deps: readonly unknown[]; cleanup: (() => void) | undefined }>(),
  pending: [] as (() => void)[], session: undefined as Session | undefined,
  reducer: undefined as ((session: Session, action: unknown) => Session) | undefined,
}));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original,
    useCallback: (callback: unknown) => callback,
    useState: (initial: unknown) => {
      const slot = hooks.cursor++;
      if (!hooks.values.has(slot)) hooks.values.set(slot, typeof initial === 'function' ? initial() : initial);
      return [hooks.values.get(slot), (value: unknown) => {
        const next: unknown = typeof value === 'function' ? value(hooks.values.get(slot)) : value;
        if (!Object.is(next, hooks.values.get(slot))) { hooks.values.set(slot, next); hooks.dirty = true; }
      }];
    },
    useReducer: (reducer: (session: Session, action: unknown) => Session, _arg: unknown, init: () => Session) => {
      hooks.cursor++;
      hooks.reducer = reducer;
      hooks.session ??= init();
      return [hooks.session, (action: unknown) => {
        if (!hooks.session) throw new Error('Missing session');
        hooks.session = reducer(hooks.session, action); hooks.dirty = true;
      }];
    },
    useEffect: (effect: () => (() => void) | undefined, deps: readonly unknown[]) => {
      const slot = hooks.cursor++;
      const previous = hooks.effects.get(slot);
      if (previous && deps.length === previous.deps.length && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
      hooks.pending.push(() => {
        previous?.cleanup?.();
        hooks.effects.set(slot, { deps, cleanup: effect() });
      });
    },
  };
});
vi.mock('./scene/FieldView.js', () => ({ FieldView: () => null }));
import { App } from './App.js';
import { content, stage, lowlands, lighthouse, quarry, cut, shaft } from './play2/content.js';
import { PROGRESS_KEY } from './play2/progress.js';
import { createStoryEngine } from '@escape/story';

class KeyEvent extends Event {
  stopped = false;
  readonly isComposing = false;
  constructor(readonly key: string, readonly repeat = false,
    readonly metaKey = false, readonly ctrlKey = false, readonly altKey = false) {
    super('keydown', { cancelable: true });
  }
  override stopImmediatePropagation() { this.stopped = true; super.stopImmediatePropagation(); }
}
class WindowEvents {
  private readonly capture = new EventTarget();
  private readonly bubble = new EventTarget();
  constructor(readonly localStorage: ProgressStorage) {}
  addEventListener(type: string, listener: EventListener, capture = false) {
    (capture ? this.capture : this.bubble).addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: EventListener, capture = false) {
    (capture ? this.capture : this.bubble).removeEventListener(type, listener);
  }
  dispatchEvent(event: KeyEvent) {
    this.capture.dispatchEvent(event);
    if (!event.stopped) this.bubble.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}
let values = new Map<string, string>();
function flush(): void {
  for (let count = 0; count < 20; count += 1) {
    hooks.dirty = false; hooks.cursor = 0; App();
    hooks.pending.splice(0).forEach(run => run());
    if (!hooks.dirty) return;
  }
  throw new Error('Hooks did not settle');
}
function key(value: string, repeat = false, meta = false): KeyEvent {
  const event = new KeyEvent(value, repeat, meta);
  window.dispatchEvent(event); flush(); return event;
}
function session(): Session {
  if (!hooks.session) throw new Error('App did not initialise');
  return hooks.session;
}
beforeEach(() => {
  hooks.cursor = 0; hooks.dirty = false; hooks.values.clear(); hooks.effects.clear(); hooks.pending.length = 0; hooks.session = undefined;
  values = new Map();
  vi.stubGlobal('window', new WindowEvents({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }));
  vi.stubGlobal('HTMLElement', class {});
});
afterEach(() => {
  hooks.effects.forEach(effect => effect.cleanup?.()); vi.unstubAllGlobals();
});
it('Enter advances exactly one line through both App listeners; repeat Enter and Space advance nothing extra', () => {
  flush(); key('Enter');
  expect(session().queue[0]?.index).toBe(0);
  key('Enter'); expect(session().queue[0]?.index).toBe(1);
  key('Enter', true); key(' ', true);
  expect(session().queue[0]?.index).toBe(1);
  key('Enter'); expect(session().queue).toEqual([]);
});
it('F5, F12, Escape and modified keys stay with the browser on title and death; held motions cannot restore', () => {
  flush();
  for (const name of ['F5', 'F12', 'Escape']) expect(key(name).defaultPrevented).toBe(false);
  expect(key('r', false, true).defaultPrevented).toBe(false);
  key('Enter');
  hooks.session = { ...session(), world: { ...session().world, status: 'dead', hearts: 0 } }; flush();
  for (const name of ['F5', 'F12', 'Escape']) expect(key(name).defaultPrevented).toBe(false);
  expect(key('r', false, true).defaultPrevented).toBe(false);
  key('l', true); expect(session().world.status).toBe('dead');
  key('l'); expect(session().world.status).toBe('playing');
});
it('Continue restores a Lowlands save and j / Enter chooses New game and replaces its story', () => {
  const story = createStoryEngine().init(content);
  const saved = { stage: 'lowlands', story: { ...story, flags: { 'lowlands.knows-w': true, 'lowlands.intro-seen': true } } };
  values.set(PROGRESS_KEY, JSON.stringify(saved));
  flush(); key('Enter');
  expect(session().world.stage).toBe('lowlands');
  expect(session().story.flags['lowlands.knows-w']).toBe(true);
  expect(session().queue).toEqual([]);
  play(lowlands.solution); dismiss();
  expect(session().world.stage).toBe('lighthouse');
  play(lighthouse.solution); dismiss();
  expect(session().world.stage).toBe('quarry-road');
  play(quarry.solution); dismiss();
  expect(session().world.stage).toBe('cut');
  play(cut.solution); dismiss();
  expect(session().world.stage).toBe('shaft');
  play(shaft.solution); dismiss();
  expect(session().story.statues).toContain('E');
  key('Enter'); // title
  key('j'); key('Enter');
  expect(session().world.stage).toBe('margin');
  expect(session().story.flags['lowlands.knows-w']).toBeUndefined();
  expect(JSON.parse(values.get(PROGRESS_KEY) ?? '{}')).toMatchObject({ stage: 'margin' });
});
function dismiss(): void {
  for (let lines = 0; session().queue.length && lines < 100; lines += 1) key('Enter');
}
function play(input: readonly string[]): void {
  for (const value of input) { dismiss(); key(value === '<CR>' ? 'Enter' : value); }
}
function savedProgress(): { stage: string; story: Session['story'] } {
  return JSON.parse(values.get(PROGRESS_KEY) ?? '{}') as { stage: string; story: Session['story'] };
}
function enterLowlands(): void {
  flush(); key('Enter'); play(stage.solution); dismiss();
  expect(session().world.stage).toBe('lowlands');
}
it('saves the entry story on New game and the actual Margin-to-Lowlands change only', () => {
  flush(); key('Enter');
  expect(savedProgress()).toEqual({ stage: 'margin', story: session().story });
  play(stage.solution); dismiss();
  const entryStory = session().story;
  expect(savedProgress()).toEqual({ stage: 'lowlands', story: entryStory });
  play([...'9l']); dismiss();
  expect(session().story.flags['lowlands.knows-w']).toBe(true);
  expect(savedProgress().story.flags['lowlands.knows-w']).toBeUndefined();
  expect(savedProgress().story).toEqual(entryStory);
});
it('Continue replays the Lowlands entry, including the note and both once-only jetty Blots', () => {
  enterLowlands();
  const entry = values.get(PROGRESS_KEY);
  play([...'9l', ...'4w', 'l', ...'11l4j', '<CR>', 'l', 'l']); dismiss();
  expect(session().world.entities.filter(entity => entity.def.kind === 'blot')).toHaveLength(2);
  expect(values.get(PROGRESS_KEY)).toBe(entry);
  // Reload the actual App while preserving storage.
  hooks.effects.forEach(effect => effect.cleanup?.());
  hooks.values.clear(); hooks.effects.clear(); hooks.pending.length = 0; hooks.session = undefined;
  flush(); key('Enter');
  expect(session().world.engine.cursor).toEqual(lowlands.start);
  expect(session().story.flags['lowlands.knows-dollar']).toBeUndefined();
  expect(session().world.entities.some(entity => entity.id === 'scribe-note')).toBe(true);
  play([...'9l', ...'4w', 'l', ...'11l4j', '<CR>', 'l', 'l']); dismiss();
  expect(session().world.entities.some(entity => entity.id === 'scribe-note')).toBe(false);
  expect(session().world.entities.filter(entity => entity.def.kind === 'blot').map(entity => entity.id))
    .toEqual(['lowlands.blot-1', 'lowlands.blot-2']);
});
it('plays normally when the storage getter throws', () => {
  Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('Blocked'); } });
  flush(); key('Enter'); key('Enter'); key('Enter'); key('l');
  expect(session().world.turn).toBe(1);
});
