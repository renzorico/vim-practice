import { afterEach, expect, it, vi } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { createSession } from '../play2/session.js';
import { stage, legend, content } from '../play2/content.js';
import { useKeyCapture } from './useKeyCapture.js';
const effects = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
vi.mock('react', () => ({ useEffect: (effect: () => (() => void)) => effects.cleanups.push(effect()) }));
afterEach(() => {
  effects.cleanups.splice(0).forEach(cleanup => cleanup());
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
