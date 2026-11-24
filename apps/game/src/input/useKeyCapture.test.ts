import { afterEach, expect, it, vi } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { createSession } from '../play2/session.js';
import { stage, legend, content } from '../play2/content.js';
import { useKeyCapture } from './useKeyCapture.js';
const effects = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
const refs = vi.hoisted(() => ({ cursor: 0, values: [] as { current: unknown }[] }));
vi.mock('react', () => ({
  useEffect: (effect: () => (() => void)) => effects.cleanups.push(effect()),
  useRef: (value: unknown) => refs.values[refs.cursor++] ??= { current: value },
}));
afterEach(() => {
  effects.cleanups.splice(0).forEach(cleanup => cleanup());
  refs.cursor = 0; refs.values.length = 0;
  vi.unstubAllGlobals();
});
it('dispatches 20 synchronous window keydowns through the capture hook and session reducer', () => {
  // Node EventTarget supplies synchronous DOM event dispatch without a canvas or DOM dependency.
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('HTMLElement', class {});
  const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(),
    stage: { ...stage, map: [' '.repeat(40)], start: { line: 0, col: 0 }, entities: [], triggers: [], clear: [{ type: 'reach', area: { from: { line: 0, col: 39 }, to: { line: 0, col: 39 } } }] }, legend, content });
  let session = controller.init(false);
  useKeyCapture({ captureTab: true, onHint: () => {}, onKey: key => { session = controller.reduce(session, key); } });
  for (let index = 0; index < 20; index += 1) {
    const event = Object.assign(new Event('keydown', { cancelable: true }), {
      key: 'l', isComposing: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
    });
    window.dispatchEvent(event);
  }
  expect(session.world.engine.cursor).toEqual({ line: 0, col: 20 });
  expect(session.world.turn).toBe(20);
  expect(session.keys).toBe(20);
});
it.each(['d', 'u'])('prevents Ctrl-%s browser shortcuts and forwards Vim notation', letter => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('HTMLElement', class {});
  const onKey = vi.fn();
  useKeyCapture({ captureTab: false, onHint: () => {}, onKey });
  const event = Object.assign(new Event('keydown', { cancelable: true }), {
    key: letter, isComposing: false, metaKey: false, ctrlKey: true, altKey: false,
  });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(onKey).toHaveBeenCalledWith(`<C-${letter}>`);
});
it('a Spanish dead key sends its character once, even though the hook re-renders before the completing Space', async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('navigator', { platform: 'MacIntel', keyboard: {
    getLayoutMap: () => Promise.resolve(new Map([['KeyQ', 'q'], ['Semicolon', '\u00f1']])),
  } });
  const sent: string[] = [];
  // Like the app: every key re-renders, which rebuilds the listener but keeps the refs.
  const render = (): void => {
    effects.cleanups.splice(0).forEach(cleanup => cleanup());
    refs.cursor = 0;
    useKeyCapture({ captureTab: true, onHint: () => {}, onKey: key => { sent.push(key); render(); } });
  };
  render();
  const press = (key: string, code: string, shiftKey = false): Event => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), {
      key, code, shiftKey, isComposing: false, metaKey: false, ctrlKey: false, altKey: false, repeat: false,
    });
    window.dispatchEvent(event);
    return event;
  };
  expect(press('Dead', 'BracketLeft', true).defaultPrevented).toBe(true);
  await Promise.resolve().then(() => Promise.resolve()).then(() => new Promise(resolve => setTimeout(resolve)));
  expect(sent).toEqual(['^']);
  press(' ', 'Space');
  expect(sent).toEqual(['^']);
  press(' ', 'Space');
  expect(sent).toEqual(['^', ' ']);
});
it('a dead key is ignored where the layout is unknown', async () => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  const onKey = vi.fn();
  useKeyCapture({ captureTab: true, onHint: () => {}, onKey });
  window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), {
    key: 'Dead', code: 'BracketLeft', shiftKey: false, isComposing: false, metaKey: false, ctrlKey: false, altKey: false,
  }));
  await new Promise(resolve => setTimeout(resolve));
  expect(onKey).not.toHaveBeenCalled();
});
