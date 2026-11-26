import { Prologue, PrologueScene } from './prologue/Prologue.js';
import { CAPTIONS, AUTO_WAIT_MS, CHARACTERS_PER_SECOND } from './prologue/data.js';
import { lessonFor, lessonKeys } from './play2/notebook/lessons.js';
import { keyCardEntries } from './play2/introducedAt.js';
import { track, dismissed, type Tracker } from './play2/notebook/queue.js';
import { clearSeenKeys, readSeenKeys, markKeysSeen, KEYS_SEEN_KEY } from './play2/notebook/seen.js';
import { HELP_KEYS } from './play2/help/keys.js';
import { openPage, pressKey } from './play2/notebook/pageModel.js';
import { WorldBanner, BANNER_DURATION_MS } from './scene/WorldBanner.js';
import { HelpOverlay } from './play2/help/HelpOverlay.js';
import type { HelpKey } from './play2/help/keys.js';
import { isValidElement, type ReactNode } from 'react';
import { SoundButton } from './audio/SoundButton.js';
import { synth } from './audio/synth.js';
import { SoundModeContext, readSoundMode } from './audio/settings.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { gates, manifest, jetty, warehouse, customs, counter, harbour, stacks, reading, archive, notary, contract, mouth, gallery, marked, labyrinth, study, lastPage } from './play2/content.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from './play2/session.js';
import type { Progress, ProgressStorage } from './play2/progress.js';

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
    useContext: (context: import('react').Context<unknown>) => context === SoundModeContext ? readSoundMode() : original.useContext(context),
    useRef: (value: unknown) => {
      const slot = hooks.cursor++;
      if (!hooks.values.has(slot)) hooks.values.set(slot, { current: value });
      return hooks.values.get(slot);
    },
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
// The written exercises stand between a clear card and the next stage; only their own test turns them on.
const exercises = vi.hoisted(() => ({ on: false }));
vi.mock('./play2/draft/drafts.js', async importOriginal => {
  const original = await importOriginal<typeof import('./play2/draft/drafts.js')>();
  return { ...original, draftFor: (stage: string) => exercises.on ? original.draftFor(stage) : undefined };
});
import { App } from './App.js';
import { DraftSheet } from './play2/draft/DraftSheet.js';
import { clearPractised, markPractised } from './play2/draft/practised.js';
import { stages, content, stage, lowlands, lighthouse, quarry, cut, shaft, ledger, canopy, glades } from './play2/content.js';
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
  readonly setTimeout = globalThis.setTimeout;
  readonly clearTimeout = globalThis.clearTimeout;
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
let appTree: ReactNode;
let introTree: ReactNode;
let mountedIntroKey: string | null | undefined;
let autoSkipIntro = true;
function skipIntroForPlaythrough(): void {
  if (autoSkipIntro && isValidElement(appTree) && appTree.type === Prologue) {
    window.dispatchEvent(new KeyEvent('Escape')); flush();
  }
}
let notebookTracker: Tracker | null = null;
function observeNotebook(): void {
  const current = hooks.session;
  if (!current) return;
  const stage = stages.find(item => item.stage.id === current.world.stage)?.stage;
  if (!stage) return;
  notebookTracker = track(notebookTracker, current, { stage, content,
    candidates: keyCardEntries(stage.id, current.story).map(entry => entry.key), seen: readSeenKeys() });
}
function flush(): void {
  for (let count = 0; count < 20; count += 1) {
    hooks.dirty = false; hooks.cursor = 0; appTree = App();
    const prologue = isValidElement<Parameters<typeof Prologue>[0]>(appTree) && appTree.type === Prologue ? appTree : null;
    if (!prologue || mountedIntroKey !== prologue.key) {
      for (const [slot, effect] of hooks.effects) if (slot >= 1000) { effect.cleanup?.(); hooks.effects.delete(slot); }
      for (const slot of hooks.values.keys()) if (slot >= 1000) hooks.values.delete(slot);
      mountedIntroKey = prologue?.key;
    }
    introTree = undefined;
    if (prologue) { hooks.cursor = 1000; introTree = Prologue(prologue.props); }
    hooks.pending.splice(0).forEach(run => run());
    if (!hooks.dirty) { observeNotebook(); return; }
  }
  throw new Error('Hooks did not settle');
}
function key(value: string, repeat = false, meta = false, ctrl = false): KeyEvent {
  // Existing playthroughs wait through each first-visit banner before sending game input.
  if (bannerWorld(appTree)) { vi.advanceTimersByTime(BANNER_DURATION_MS); flush(); }
  const event = new KeyEvent(value, repeat, meta, ctrl);
  window.dispatchEvent(event); flush(); skipIntroForPlaythrough(); return event;
}
function session(): Session {
  if (!hooks.session) throw new Error('App did not initialise');
  return hooks.session;
}
beforeEach(() => {
  vi.useFakeTimers();
  hooks.cursor = 0; hooks.dirty = false; hooks.values.clear(); hooks.effects.clear(); hooks.pending.length = 0; hooks.session = undefined;
  autoSkipIntro = true; mountedIntroKey = undefined; introTree = undefined;
  notebookTracker = null; clearSeenKeys();
  values = new Map();
  vi.stubGlobal('window', new WindowEvents({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }));
  vi.stubGlobal('HTMLElement', class {});
  clearSeenKeys(); notebookTracker = null;
});
afterEach(() => {
  hooks.effects.forEach(effect => effect.cleanup?.()); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks();
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
  values.set(KEYS_SEEN_KEY, '["w"]');
  flush(); key('Enter');
  expect(readSeenKeys().has('w')).toBe(true);
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
  expect(session().world.stage).toBe('ledger');
  play(ledger.solution);
  vi.advanceTimersByTime(400); flush(); dismiss();
  expect(session().world.stage).toBe('canopy');
  play(canopy.solution); dismiss();
  expect(session().world.stage).toBe('glades');
  play(glades.solution); dismiss();
  expect(session().world.stage).toBe('gates');
  play(gates.solution); dismiss();
  expect(session().world.stage).toBe('manifest');
  play(manifest.solution);
  vi.advanceTimersByTime(400); flush(); dismiss();
  expect(session().world.stage).toBe('jetty');
  play(jetty.solution); dismiss();
  expect(session().world.stage).toBe('warehouse');
  play(warehouse.solution); dismiss();
  expect(session().world.stage).toBe('customs');
  play(customs.solution); dismiss();
  expect(session().world.stage).toBe('counter');
  play(counter.solution); dismiss();
  expect(session().world.stage).toBe('harbour');
  expect(session().story.statues).toContain('D');
  play(harbour.solution);
  vi.advanceTimersByTime(400); flush(); dismiss();
  expect(session().world.stage).toBe('stacks');
  expect(savedProgress().stage).toBe('stacks');
  play(stacks.solution); dismiss();
  expect(session().world.stage).toBe('reading');
  expect(savedProgress().stage).toBe('reading');
  play(reading.solution); dismiss();
  expect(session().world.stage).toBe('archive');
  expect(savedProgress().stage).toBe('archive');
  play(archive.solution); dismiss();
  expect(session().world.stage).toBe('notary');
  expect(savedProgress().stage).toBe('notary');
  play(notary.solution); dismiss();
  expect(session().story.statues).toContain('Q');
  expect(session().world.stage).toBe('contract');
  expect(savedProgress().stage).toBe('contract');
  play(contract.solution);
  vi.advanceTimersByTime(400); flush(); dismiss();
  expect(session().world.stage).toBe('mouth');
  expect(savedProgress().stage).toBe('mouth');
  play(mouth.solution); dismiss();
  expect(session().world.stage).toBe('gallery');
  expect(savedProgress().stage).toBe('gallery');
  play(gallery.solution); dismiss();
  expect(session().world.stage).toBe('marked');
  expect(savedProgress().stage).toBe('marked');
  play(marked.solution); dismiss();
  expect(session().world.stage).toBe('labyrinth');
  expect(savedProgress().stage).toBe('labyrinth');
  play(labyrinth.solution); dismiss();
  expect(session().story.statues).toContain('A');
  expect(session().world.stage).toBe('study');
  expect(savedProgress().stage).toBe('study');
  play(study.solution);
  vi.advanceTimersByTime(400); flush(); dismiss();
  expect(session().world.stage).toBe('last-page');
  play(lastPage.solution);
  expect(session().queue[0]).toMatchObject({ cutscene: 'last.recover' });
  expect(savedProgress().story.ending).toBeNull();
  dismiss();
  expect(savedProgress().story.ending).toBe('recover');
  key('Enter'); // title; New game is selected after recovery
  key('Enter');
  expect(session().world.stage).toBe('margin');
  expect(session().story.flags['lowlands.knows-w']).toBeUndefined();
  expect(readSeenKeys().size).toBe(0);
  expect(JSON.parse(values.get(PROGRESS_KEY) ?? '{}')).toMatchObject({ stage: 'margin' });
});
function dismiss(): void {
  // App's lightweight harness does not mount child components. Drive the notebook's
  // real queue and engine here; Notebook.test covers its actual keyboard listener.
  for (let lines = 0; lines < 100 && !stageMenuProps(appTree); lines += 1) {
    const group = notebookTracker?.queue.group;
    if (group) {
      const before = session();
      expect(group.length).toBeLessThanOrEqual(2);
      for (const name of group) {
        const entry = HELP_KEYS.find(item => item.key === name);
        if (!entry) throw new Error(`Missing notebook example ${name}`);
        const lesson = lessonFor(entry);
        const completed = lesson.example.keys.reduce(pressKey, openPage(lesson, true));
        expect(completed.phase).toBe('done');
      }
      markKeysSeen(group.flatMap(lessonKeys));
      notebookTracker = notebookTracker ? { ...notebookTracker, queue: dismissed(notebookTracker.queue) } : null;
      expect(session()).toBe(before);
    }
    if (!(session().queue.length || session().clearCard) || (!session().clearCard && session().queue[0]?.type === 'ending')) break;
    key('Enter');
  }
}
function play(input: readonly string[]): void {
  for (const value of input) {
    dismiss();
    const control = /^<C-(.)>$/.exec(value)?.[1];
    key(control ?? (value === '<CR>' ? 'Enter' : value === '<Esc>' ? 'Escape' : value), false, false, control !== undefined);
  }
}
function savedProgress(): Progress {
  return JSON.parse(values.get(PROGRESS_KEY) ?? '{}') as { stage: string; story: Session['story'] };
}
function enterLowlands(): void {
  flush(); key('Enter'); play(stage.solution); dismiss();
  expect(session().world.stage).toBe('lowlands');
}
it('saves the entry story on New game and the actual Margin-to-Lowlands change only', () => {
  flush(); key('Enter');
  expect(savedProgress()).toEqual({ stage: 'margin', story: session().story, entries: { margin: session().story } });
  play(stage.solution); dismiss();
  const entryStory = session().story;
  expect(savedProgress()).toMatchObject({ stage: 'lowlands', story: entryStory, best: session().stageEntry.best });
  expect(Object.keys(savedProgress().entries ?? {})).toEqual(['margin', 'lowlands']);
  play([...'9l']); dismiss();
  expect(session().story.flags['lowlands.knows-w']).toBe(true);
  expect(savedProgress().story.flags['lowlands.knows-w']).toBeUndefined();
  expect(savedProgress().story).toEqual(entryStory);
});
type DraftProps = Parameters<typeof DraftSheet>[0];
function draftProps(node: ReactNode): DraftProps | undefined {
  if (Array.isArray(node)) return (node as readonly ReactNode[]).map(draftProps).find(Boolean);
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  return node.type === DraftSheet ? node.props as unknown as DraftProps : draftProps(node.props.children);
}
it('offers the written exercise after a clear card, goes on once it closes, and not again once it is done', () => {
  exercises.on = true;
  try {
    flush(); key('Enter');
    play(stage.solution);
    for (let count = 0; count < 60 && !draftProps(appTree); count += 1) key('Enter');
    expect(session().clearCard).toBe(true);
    expect(draftProps(appTree)?.draft.stage).toBe('margin');
    // The sheet owns the keys: nothing reaches the game behind it.
    const before = session();
    key('Enter'); key('j');
    expect(session()).toBe(before);
    draftProps(appTree)?.onClose(); flush();
    expect(session().world.stage).toBe('lowlands');
    expect(draftProps(appTree)).toBeUndefined();
    markPractised('margin');
  } finally { exercises.on = false; clearPractised(); }
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

it('keeps the solved ledger stamped for 400 ms and blocks keys until the story continues', () => {
  const story = createStoryEngine().init(content);
  values.set(PROGRESS_KEY, JSON.stringify({ stage: 'ledger', story }));
  flush(); key('Enter'); dismiss();
  expect(session().world.script?.id).toBe('ledger.book');
  play(ledger.solution);
  expect(session().world.status).toBe('cleared');
  expect(session().queue[0]).toMatchObject({ cutscene: 'ledger.end', index: 0 });
  key('Enter');
  vi.advanceTimersByTime(399); flush(); key('Enter');
  expect(session().queue[0]?.index).toBe(0);
  vi.advanceTimersByTime(1); flush(); key('Enter');
  expect(session().queue[0]?.index).toBe(1);
  key('Enter');
  expect(session().clearCard).toBe(true);
  key('Enter');
  expect(session().world.stage).toBe('canopy');
  expect(session().queue[0]).toMatchObject({ dialogue: 'canopy.intro' });
});

function reload(): void {
  hooks.effects.forEach(effect => effect.cleanup?.());
  hooks.values.clear(); hooks.effects.clear(); hooks.pending.length = 0; hooks.session = undefined;
  flush();
}
it('delete waits for the real cutscene and Continue restores study even after reloading the Last Page', () => {
  values.set(PROGRESS_KEY, JSON.stringify({ stage: 'study', story: createStoryEngine().init(content) }));
  flush(); key('Enter'); dismiss(); play(study.solution);
  vi.advanceTimersByTime(400); flush(); dismiss();
  expect(savedProgress().stage).toBe('last-page');
  reload(); key('Enter'); dismiss();
  play(lastPage.solution.slice(0, 18));
  play(['6', 'j', '0', 'f', 'D']);
  expect(session().queue[0]).toMatchObject({ cutscene: 'last.delete', index: 0 });
  expect(savedProgress().stage).toBe('last-page');
  key('Enter');
  expect(savedProgress().stage).toBe('last-page');
  key('Enter');
  expect(savedProgress().stage).toBe('study');
  reload(); key('Enter');
  expect(session().world.stage).toBe('study');
  expect(session().story.ending).toBeNull();
});
it('finished recover saves offer a fresh game after reload', () => {
  values.set(PROGRESS_KEY, JSON.stringify({ stage: 'last-page', story: createStoryEngine().init(content) }));
  flush(); key('Enter'); dismiss(); play(lastPage.solution); dismiss();
  expect(savedProgress().story.ending).toBe('recover');
  reload(); key('Enter');
  expect(session().world.stage).toBe('margin');
});


it('shows saved total stars on the title after a reload', () => {
  values.set(PROGRESS_KEY, JSON.stringify({ stage: 'lowlands', story: createStoryEngine().init(content),
    best: { margin: { turns: 5, stars: 3 }, lowlands: { turns: 12, stars: 2 } } }));
  flush();
  hooks.cursor = 0;
  const html = renderToStaticMarkup(App());
  expect(html).toContain('Stars: 2 / 63');
  expect(html).toContain('Continue');
});

it('New game resets the story and preserves best records in the save', () => {
  const best = { lowlands: { turns: 1, stars: 3 } };
  values.set(PROGRESS_KEY, JSON.stringify({ ...reachedSave(), best, previous: { stage: 'lowlands', story: createStoryEngine().init(content) } }));
  flush(); key('j'); key('j'); key('j'); key('j'); key('j'); key('Enter'); // Continue, Stages, Keys, Intro, Copybook, New game
  expect(session().world.stage).toBe('margin');
  expect(session().story.flags['lowlands.knows-w']).toBeUndefined();
  expect(session().stageEntry.best).toEqual(best);
  expect(savedProgress().best).toEqual(best);
  expect(savedProgress()).toEqual({ stage: 'margin', story: session().stageEntry.story, best,
    entries: { margin: session().stageEntry.story } });
  reload(); openStageMenu();
  key('j'); expect(stageMenuProps(appTree)?.selected).toBe('margin');
});

function soundProps(node: ReactNode): { enabled: boolean; onToggle: () => void; compact: boolean } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = soundProps(child);
      if (found) return found;
    }
  }
  if (!isValidElement<{ children?: ReactNode; enabled?: boolean; onToggle?: () => void;
    soundEnabled?: boolean; onToggleSound?: () => void }>(node)) return;
  if (node.type === SoundButton && node.props.onToggle) {
    return { enabled: node.props.enabled ?? true, onToggle: node.props.onToggle, compact: false };
  }
  if (node.props.onToggleSound) {
    return { enabled: node.props.soundEnabled ?? true, onToggle: node.props.onToggleSound, compact: true };
  }
  return soundProps(node.props.children);
}
function currentSound() {
  const props = soundProps(appTree);
  if (!props) throw new Error('Missing sound control');
  return SoundButton(props);
}
function clickSoundThenEnter(): void {
  if (bannerWorld(appTree)) { vi.advanceTimersByTime(BANNER_DURATION_MS); flush(); }
  const button = currentSound();
  const mouseDown = new Event('mousedown', { cancelable: true });
  Reflect.apply(button.props.onMouseDown, undefined, [mouseDown]);
  Reflect.apply(button.props.onClick, undefined, []);
  flush();
  const enter = new KeyEvent('Enter');
  // Model the browser focus default: an uncancelled mousedown focuses the button.
  if (!mouseDown.defaultPrevented) {
    const target = Object.assign(new HTMLElement(), { tagName: 'BUTTON', closest: () => target });
    Object.defineProperty(enter, 'target', { value: target });
  }
  window.dispatchEvent(enter); flush(); skipIntroForPlaythrough();
}
it('clicking the title and footer sound controls leaves Enter for start, dialogue and death replay', () => {
  flush(); clickSoundThenEnter();
  expect(session().queue[0]?.index).toBe(0);
  clickSoundThenEnter();
  expect(session().queue[0]?.index).toBe(1);
  hooks.session = { ...session(), world: { ...session().world, status: 'dead', hearts: 0 } }; flush();
  clickSoundThenEnter();
  expect(session().world.status).toBe('playing');
});
it('keeps native Enter and Space activation when a sound button is focused by keyboard', () => {
  flush();
  for (const name of ['Enter', ' ']) {
    const event = new KeyEvent(name);
    Object.defineProperty(event, 'target', { value: Object.assign(new HTMLElement(), { tagName: 'BUTTON' }) });
    window.dispatchEvent(event); flush();
    expect(event.defaultPrevented).toBe(false);
    expect(renderToStaticMarkup(appTree)).toContain('play-title');
  }
});

it('passes the current reduced-motion preference into movement cue timing', () => {
  enterLowlands();
  Object.assign(window, { matchMedia: () => ({ matches: true }) });
  const play = vi.spyOn(synth, 'play').mockReturnValue(() => {});
  key('9'); key('l');
  const movement = play.mock.calls.flatMap(call => call[0]).find(cue => cue.kind === 'step');
  expect(movement?.pulsesMs).toEqual([0, 0, 0, 0, 0]);
});

function appHtml(): string {
  hooks.cursor = 2000;
  return renderToStaticMarkup(introTree ?? appTree);
}
function stageMenuProps(node: ReactNode): { selected: string | null; onSelect: (id: string) => void } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = stageMenuProps(child); if (found) return found; }
  }
  if (!isValidElement<{ children?: ReactNode; selected?: string | null; onSelect?: (id: string) => void }>(node)) return;
  if (node.props.onSelect) return { selected: node.props.selected ?? null, onSelect: node.props.onSelect };
  return stageMenuProps(node.props.children);
}
function reachedSave(): Progress {
  const story = createStoryEngine().init(content);
  return { stage: 'quarry-road', story: { ...story, learnedSkills: ['w', 'e'] },
    entries: { margin: story, lowlands: story, 'quarry-road': story },
    best: { lowlands: { turns: 999, stars: 1 } } };
}
function openStageMenu(): void { key('j'); key('Enter'); }
it('Stages skips locked rows in both directions and Escape or q returns to title', () => {
  values.set(PROGRESS_KEY, JSON.stringify(reachedSave()));
  flush(); openStageMenu();
  expect(stageMenuProps(appTree)?.selected).toBe('margin');
  key('j'); expect(stageMenuProps(appTree)?.selected).toBe('lowlands');
  key('j'); expect(stageMenuProps(appTree)?.selected).toBe('quarry-road');
  key('j'); expect(stageMenuProps(appTree)?.selected).toBe('quarry-road');
  key('k'); expect(stageMenuProps(appTree)?.selected).toBe('lowlands');
  key('Escape'); expect(appHtml()).toContain('Start game');
  key('Enter'); expect(stageMenuProps(appTree)).toBeDefined();
  key('q'); expect(appHtml()).toContain('Start game');
});
it('an earlier stage starts from its entry, improves best and returns to Stages without moving Continue', () => {
  const saved = reachedSave();
  values.set(PROGRESS_KEY, JSON.stringify(saved));
  flush(); openStageMenu(); key('j'); key('Enter'); dismiss();
  expect(session().world.stage).toBe('lowlands');
  expect(session().story.learnedSkills).toEqual(saved.story.learnedSkills);
  expect(session().world.engine.cursor).toEqual(lowlands.start);
  play(lowlands.solution); dismiss();
  expect(stageMenuProps(appTree)?.selected).toBe('lowlands');
  expect(savedProgress().stage).toBe('quarry-road');
  expect(savedProgress().best?.lowlands?.turns).toBeLessThan(999);
  expect(savedProgress().entries).toEqual(saved.entries);
  key('Escape'); key('k'); key('Enter');
  expect(session().world.stage).toBe('quarry-road');
});
it('mouse selection of the furthest stage continues the story after its clear card', () => {
  values.set(PROGRESS_KEY, JSON.stringify(reachedSave()));
  flush(); openStageMenu();
  stageMenuProps(appTree)?.onSelect('quarry-road'); flush(); dismiss();
  expect(session().world.stage).toBe('quarry-road');
  play(quarry.solution); dismiss();
  expect(session().world.stage).toBe('cut');
  expect(savedProgress().stage).toBe('cut');
  expect(savedProgress().entries?.cut).toBeDefined();
});
it('an old save can replay the Margin without changing Continue, then acquires its current entry', () => {
  values.set(PROGRESS_KEY, JSON.stringify({ stage: 'lowlands', story: createStoryEngine().init(content) }));
  flush(); openStageMenu();
  expect(stageMenuProps(appTree)?.selected).toBe('margin');
  key('Enter');
  expect(session().world.stage).toBe('margin');
  expect(session().story).toEqual(session().stageEntry.story);
  play(stage.solution); dismiss();
  expect(stageMenuProps(appTree)?.selected).toBe('margin');
  expect(savedProgress().stage).toBe('lowlands');
  expect(savedProgress().entries).toBeUndefined();
  key('Escape'); key('k'); key('Enter');
  expect(Object.keys(savedProgress().entries ?? {})).toEqual(['lowlands']);
});

it('the furthest stage uses the real saved story just like Continue, rather than its canonical entry', () => {
  const original = reachedSave();
  const saved = { ...original, story: { ...original.story, flags: { 'quarry-road.intro-seen': true, 'saved-progress': true } } };
  values.set(PROGRESS_KEY, JSON.stringify(saved));
  flush(); key('Enter');
  const continuedStory = session().story;
  // Stage entry can settle story reactions; compare with the actual Continue path.
  values.set(PROGRESS_KEY, JSON.stringify(saved));
  reload(); openStageMenu();
  stageMenuProps(appTree)?.onSelect('quarry-road'); flush();
  expect(session().story).toEqual(continuedStory);
  expect(savedProgress().story).toEqual(continuedStory);
  expect(savedProgress().entries).toEqual(saved.entries);
});
it('replaying Last Page from a finished recover save preserves its ending through returning and reloading', () => {
  const story = createStoryEngine().init(content);
  values.set(PROGRESS_KEY, JSON.stringify({ stage: 'last-page', story, entries: { 'last-page': story } }));
  flush(); key('Enter'); dismiss(); play(lastPage.solution); dismiss();
  expect(savedProgress().story.ending).toBe('recover');
  const finished = values.get(PROGRESS_KEY);
  key('Enter'); key('k'); key('k'); key('k'); key('k'); key('Enter'); // New game, Copybook, Intro, Keys, Stages
  stageMenuProps(appTree)?.onSelect('last-page'); flush();
  expect(session().world.stage).toBe('last-page');
  expect(session().story.ending).toBeNull();
  key('Escape'); reload();
  expect(savedProgress().story.ending).toBe('recover');
  expect(values.get(PROGRESS_KEY)).toBe(finished);
  // Completing the replay also leaves the finished save untouched.
  key('k'); key('k'); key('k'); key('Enter');
  stageMenuProps(appTree)?.onSelect('last-page'); flush();
  dismiss(); play(lastPage.solution); dismiss();
  expect(values.get(PROGRESS_KEY)).toBe(finished);
});

function helpProps(node: ReactNode): { onClose: () => void; entries: readonly HelpKey[] } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const found = helpProps(child); if (found) return found; }
  }
  if (!isValidElement<{ children?: ReactNode; onClose: () => void; entries: readonly HelpKey[] }>(node)) return;
  if (node.type === HelpOverlay) return node.props;
  return helpProps(node.props.children);
}
it.each([':h', ':help'])('%s opens without dispatching a single key or changing the session', command => {
  flush(); key('Enter'); dismiss();
  const before = session();
  for (const char of command) { key(char); expect(session()).toBe(before); }
  key('Enter');
  expect(helpProps(appTree)).toBeDefined();
  expect(session()).toBe(before);
  helpProps(appTree)?.onClose(); flush();
  expect(helpProps(appTree)).toBeUndefined();
  expect(session()).toBe(before);
  key('l'); expect(session().world.turn).toBe(before.world.turn + 1);
});
it('F1 and the title Keys button open the saved reference without starting or changing a game', () => {
  values.set(PROGRESS_KEY, JSON.stringify({ stage: 'lowlands', story: {
    ...createStoryEngine().init(content), flags: { 'lowlands.knows-w': true },
  } }));
  flush();
  expect(appHtml()).toContain('>Keys</button>');
  const before = session();
  key('F1');
  expect(helpProps(appTree)?.entries.map(entry => entry.key)).toContain('w');
  expect(helpProps(appTree)?.entries.map(entry => entry.key)).not.toContain('x');
  expect(session()).toBe(before);
  helpProps(appTree)?.onClose(); flush();
  key('Enter'); dismiss();
  const playing = session();
  key('F1'); expect(helpProps(appTree)).toBeDefined(); expect(session()).toBe(playing);
});
it('forwards other command lines and cancels a held help prefix quietly', () => {
  flush(); key('Enter'); dismiss();
  const before = session();
  key(':'); key('h'); key('Escape'); expect(session()).toBe(before);
  key(':'); key('w'); key('Enter');
  if (!hooks.reducer) throw new Error('Missing reducer');
  const expected = [':', 'w', '<CR>'].reduce(hooks.reducer, before);
  expect(session()).toEqual(expected);
  expect(helpProps(appTree)).toBeUndefined();
});
it('a key held to close the reference never reaches the game; the next press does', () => {
  flush(); key('Enter'); dismiss();
  key('F1'); helpProps(appTree)?.onClose(); flush();
  const before = session();
  key('l', true); expect(session()).toBe(before);
  key('l'); expect(session().world.turn).toBe(before.world.turn + 1);
});
it('F1 drops a half-typed :h, so nothing stale is forwarded after closing', () => {
  flush(); key('Enter'); dismiss();
  const before = session();
  key(':'); key('h'); key('F1'); helpProps(appTree)?.onClose(); flush();
  key('l'); expect(session().world.turn).toBe(before.world.turn + 1);
});

function bannerWorld(node: ReactNode): string | undefined {
  if (Array.isArray(node)) return node.map(bannerWorld).find(Boolean);
  if (!isValidElement<{ children?: ReactNode; world?: string }>(node)) return;
  if (node.type === WorldBanner) return node.props.world;
  return bannerWorld(node.props.children);
}
it('shows each world once per session and swallows the banner dismissal key and held repeats', () => {
  flush(); key('Enter');
  expect(bannerWorld(appTree)).toBe('margin');
  const before = session();
  const skip = new KeyEvent('Enter'); window.dispatchEvent(skip); flush();
  expect(skip.defaultPrevented).toBe(true);
  expect(session()).toBe(before);
  expect(bannerWorld(appTree)).toBeUndefined();
  key('Enter', true); expect(session()).toBe(before);
  key('Enter'); expect(session().queue[0]?.index).toBe(1);
});
it('expires a banner after exactly 2600ms without forwarding input', () => {
  flush(); key('Enter');
  vi.advanceTimersByTime(BANNER_DURATION_MS - 1); flush(); expect(bannerWorld(appTree)).toBe('margin');
  vi.advanceTimersByTime(1); flush(); expect(bannerWorld(appTree)).toBeUndefined();
  expect(session().queue[0]?.index).toBe(0);
});
it('shows a new world banner once and does not show it on a same-session revisit', () => {
  flush(); key('Enter');
  vi.advanceTimersByTime(BANNER_DURATION_MS); flush();
  hooks.session = { ...session(), world: { ...session().world, stage: 'lowlands' } }; flush();
  expect(bannerWorld(appTree)).toBe('lowlands');
  vi.advanceTimersByTime(BANNER_DURATION_MS); flush();
  hooks.session = { ...session(), world: { ...session().world, stage: 'margin' } }; flush();
  expect(bannerWorld(appTree)).toBeUndefined();
});

it('swallows held repeats without dismissing the world banner', () => {
  flush(); key('Enter');
  const before = session();
  const held = new KeyEvent('j', true); window.dispatchEvent(held); flush();
  expect(held.defaultPrevented).toBe(true);
  expect(bannerWorld(appTree)).toBe('margin'); expect(session()).toBe(before);
});
it.each([new KeyEvent('Shift'), new KeyEvent('F1'), new KeyEvent('F12'),
  new KeyEvent('r', false, true), new KeyEvent('r', false, false, true), new KeyEvent('r', false, false, false, true)])
('keeps the world banner on modifier and browser keys (%s)', event => {
  flush(); key('Enter');
  const before = session(); window.dispatchEvent(event); flush();
  expect(bannerWorld(appTree)).toBe('margin'); expect(session()).toBe(before);
  if (event.key !== 'Shift') expect(event.defaultPrevented).toBe(false);
});

function introProps() {
  if (!isValidElement<Parameters<typeof PrologueScene>[0]>(introTree) || introTree.type !== PrologueScene) return undefined;
  return introTree.props;
}
it('New game opens the eight exact captions before the first banner, without changing the session or save', () => {
  autoSkipIntro = false;
  flush(); const before = session(); key('Enter');
  expect(introProps()?.beat).toBe(0);
  expect(bannerWorld(appTree)).toBeUndefined();
  for (let beat = 0; beat < CAPTIONS.length; beat++) {
    expect(introProps()?.beat).toBe(beat);
    expect(introProps()?.shown).toBe(0);
    key('l'); key('F1'); key('Enter', true);
    expect(introProps()?.shown).toBe(0);
    expect(session()).toBe(before); expect(values.has(PROGRESS_KEY)).toBe(false);
    key('Enter'); expect(introProps()?.shown).toBe(CAPTIONS[beat]?.length);
    key('Enter', true); expect(introProps()?.beat).toBe(beat);
    key('Enter');
  }
  expect(introProps()).toBeUndefined(); expect(bannerWorld(appTree)).toBe('margin');
  expect(savedProgress().stage).toBe('margin');
  const entry = session();
  window.dispatchEvent(new KeyEvent('Enter', true)); flush(); expect(session()).toBe(entry);
});
it('automatically reveals at 45 cps and waits 3.5 seconds after the caption', () => {
  autoSkipIntro = false; flush(); key('Enter');
  vi.advanceTimersByTime(1000); flush();
  expect(introProps()?.shown).toBe(CAPTIONS[0].length);
  const duration = CAPTIONS[0].length / CHARACTERS_PER_SECOND * 1000 + AUTO_WAIT_MS;
  vi.advanceTimersByTime(duration - 1000 - 1); flush(); expect(introProps()?.beat).toBe(0);
  vi.advanceTimersByTime(30); flush(); expect(introProps()?.beat).toBe(1);
});
it('Esc skips the entire opening and the held key never advances the game', () => {
  autoSkipIntro = false; flush(); key('Enter'); key('Escape');
  expect(introProps()).toBeUndefined(); expect(bannerWorld(appTree)).toBe('margin');
  const before = session(); key('Enter', true); expect(session()).toBe(before);
});
it('reduced motion shows whole captions, stays still and never auto-advances', () => {
  Object.assign(window, { matchMedia: () => ({ matches: true }) });
  autoSkipIntro = false; flush(); key('Enter');
  expect(introProps()).toMatchObject({ reduced: true, shown: CAPTIONS[0].length, elapsed: 0 });
  vi.advanceTimersByTime(60000); flush(); expect(introProps()?.beat).toBe(0);
  key('Enter'); expect(introProps()?.beat).toBe(1);
  key('Enter', true); expect(introProps()?.beat).toBe(1);
});
it('Intro follows Keys and returns to the title without dispatch or save changes', () => {
  autoSkipIntro = false;
  values.set(PROGRESS_KEY, JSON.stringify(reachedSave())); flush();
  const before = session(); const saved = values.get(PROGRESS_KEY);
  expect(appHtml()).toMatch(/Keys<\/button>.*Intro<\/button>.*New game<\/button>/);
  key('j'); key('j'); key('j'); key('Enter');
  expect(introProps()).toBeDefined(); key('Escape');
  expect(appHtml()).toContain('Start game'); expect(session()).toBe(before);
  expect(values.get(PROGRESS_KEY)).toBe(saved);
  key('k'); key('k'); key('k'); key('Enter'); expect(introProps()).toBeUndefined();
  expect(session().world.stage).toBe('quarry-road');
});
it('renders the prologue and cleans up its canvas effect when no canvas exists', () => {
  autoSkipIntro = false; flush(); key('Enter');
  expect(() => appHtml()).not.toThrow();
  expect(appHtml()).toContain('Esc skip');
  hooks.pending.splice(0).forEach(run => run());
});
it('keeps the new title menu indices correct with and without Continue', () => {
  flush(); key('k'); expect(appHtml()).toMatch(/aria-current="true">Copybook/);
  key('k'); expect(appHtml()).toMatch(/aria-current="true">Intro/);
  key('k'); expect(appHtml()).toMatch(/aria-current="true">Keys/);
  key('k'); key('Enter'); expect(stageMenuProps(appTree)).toBeDefined();
  key('Escape'); key('j'); key('j'); key('j'); key('j'); key('j');
  expect(appHtml()).toContain('data-sound-toggle="true" aria-label="Sound: on" aria-current="true"');
});
it('uses quiet dialogue ticks, one low tone on beat four, and no cues when muted', () => {
  autoSkipIntro = false;
  const playSound = vi.spyOn(synth, 'play').mockReturnValue(() => {});
  flush(); key('Enter'); vi.advanceTimersByTime(100); flush();
  expect(playSound.mock.calls.flatMap(call => call[0])).toContainEqual({ kind: 'voice', offsetMs: 0, pitch: 300 });
  key('Enter'); key('Enter'); key('Enter'); key('Enter'); key('Enter'); key('Enter');
  expect(introProps()?.beat).toBe(3);
  expect(playSound.mock.calls.flatMap(call => call[0]).filter(cue => cue.kind === 'fixed')).toHaveLength(1);
  key('Escape');
  // Return to the title with fresh hook state while retaining the stored sound preference.
  values.set('unsaved.sound.v1', 'off'); values.delete(PROGRESS_KEY); reload(); playSound.mockClear();
  key('Enter');
  for (let beat = 0; beat < 4; beat++) {
    vi.advanceTimersByTime(80); flush(); key('Enter'); key('Enter');
  }
  expect(playSound).not.toHaveBeenCalled();
});
it('Tab stays available for prologue controls while session keys are isolated', () => {
  autoSkipIntro = false; flush(); key('Enter');
  const before = session();
  expect(key('Tab').defaultPrevented).toBe(false);
  key('l'); key(':'); key('w'); expect(session()).toBe(before);
});
it('completing Intro returns to the title, while Continue and Stages bypass it', () => {
  Object.assign(window, { matchMedia: () => ({ matches: true }) });
  autoSkipIntro = false;
  values.set(PROGRESS_KEY, JSON.stringify(reachedSave())); flush();
  const before = session(); const saved = values.get(PROGRESS_KEY);
  key('j'); key('j'); key('j'); key('Enter');
  for (let beat = 0; beat < CAPTIONS.length; beat++) key('Enter');
  expect(introProps()).toBeUndefined(); expect(appHtml()).toContain('Start game');
  expect(session()).toBe(before); expect(values.get(PROGRESS_KEY)).toBe(saved);
  key('k'); key('k'); key('Enter'); expect(stageMenuProps(appTree)).toBeDefined();
  stageMenuProps(appTree)?.onSelect('quarry-road'); flush();
  expect(introProps()).toBeUndefined(); expect(session().world.stage).toBe('quarry-road');
});

it('mounts a fresh opening after closing on beat four, without replaying its tone', () => {
  autoSkipIntro = false;
  const sound = vi.spyOn(synth, 'play').mockReturnValue(() => {});
  flush(); key('k'); key('k'); key('Enter'); // New game, Copybook, Intro
  for (let beat = 0; beat < 3; beat++) { key('Enter'); key('Enter'); }
  expect(introProps()?.beat).toBe(3);
  key('Escape'); sound.mockClear(); key('Enter');
  expect(introProps()).toMatchObject({ beat: 0, elapsed: 0, shown: 0 });
  expect(sound.mock.calls.flatMap(call => call[0]).filter(cue => cue.kind === 'fixed')).toHaveLength(0);
  key('Escape'); key('j'); key('j'); key('Enter'); // Intro, Copybook, New game
  expect(introProps()).toMatchObject({ beat: 0, elapsed: 0, shown: 0 });
});

it('pauses while hidden and clamps a delayed visible tick to 100ms', () => {
  const page = new EventTarget();
  Object.assign(page, { hidden: false }); vi.stubGlobal('document', page);
  autoSkipIntro = false; flush(); key('Enter');
  vi.advanceTimersByTime(100); flush();
  const before = introProps()?.elapsed ?? 0;
  Object.assign(page, { hidden: true }); page.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(60000); flush(); expect(introProps()?.elapsed).toBe(before);
  Object.assign(page, { hidden: false }); page.dispatchEvent(new Event('visibilitychange'));
  const now = Date.now(); vi.setSystemTime(now + 60000);
  vi.advanceTimersByTime(23); flush(); expect(introProps()?.elapsed).toBe(before + 100);
});

it('keeps the final beat open and stops its ticker after the demonstration', () => {
  autoSkipIntro = false; flush(); key('Enter');
  for (let beat = 0; beat < 7; beat++) { key('Enter'); key('Enter'); }
  vi.advanceTimersByTime(3000); flush();
  expect(introProps()?.beat).toBe(7);
  const elapsed = introProps()?.elapsed;
  vi.advanceTimersByTime(60000); flush();
  expect(introProps()).toMatchObject({ beat: 7, elapsed });
  key('Enter'); expect(introProps()).toBeUndefined();
});

it('retains seen banners on returning to title and clears them only for New game', () => {
  flush(); key('Enter');
  expect(bannerWorld(appTree)).toBe('margin');
  vi.advanceTimersByTime(BANNER_DURATION_MS); flush();
  hooks.session = { ...session(), world: { ...session().world, status: 'cleared' }, queue: [], clearCard: false }; flush();
  key('Enter'); expect(appHtml()).toContain('Start game');
  key('Enter'); expect(bannerWorld(appTree)).toBeUndefined();
  hooks.session = { ...session(), world: { ...session().world, status: 'cleared' }, queue: [], clearCard: false }; flush();
  key('Enter');
  for (let choice = 0; choice < 5; choice++) key('j'); // Continue to New game
  key('Enter'); expect(bannerWorld(appTree)).toBe('margin');
});

it('stops idle frame updates while preserving a pausable auto-advance deadline', () => {
  const page = new EventTarget(); Object.assign(page, { hidden: false }); vi.stubGlobal('document', page);
  autoSkipIntro = false; flush(); key('Enter');
  vi.advanceTimersByTime(2000); flush();
  const elapsed = introProps()?.elapsed;
  vi.advanceTimersByTime(1000); flush(); expect(introProps()?.elapsed).toBe(elapsed);
  Object.assign(page, { hidden: true }); page.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(60000); flush(); expect(introProps()?.beat).toBe(0);
  Object.assign(page, { hidden: false }); page.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(1200); flush(); expect(introProps()?.beat).toBe(1);
});

it('cycles and saves on → effects only → off → on without requiring audio', () => {
  flush();
  for (const mode of ['effects only', 'off', 'on']) {
    currentSound().props.onClick(); flush();
    expect(values.get('unsaved.sound.v1')).toBe(mode);
    expect(appHtml()).toContain(`aria-label="Sound: ${mode}"`);
    expect(appHtml()).not.toContain('aria-pressed');
  }
});
