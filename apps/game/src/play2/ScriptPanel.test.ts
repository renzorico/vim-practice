import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine } from '@escape/engine';
import { buildLineCells, gutterWidth } from '../components/bufferView.js';
import { contract, harbour, ledger, manifest, study } from './content.js';
import { ScriptPanel } from './ScriptPanel.js';

// SSR supplies the actual buffer cells; DOM geometry and lifecycle are controlled so
// cursor following can be checked at narrow widths without adding a DOM dependency.
const lifecycle = vi.hoisted(() => ({
  viewport: {},
  effects: [] as (() => (() => void) | undefined)[],
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: () => ({ current: lifecycle.viewport }),
  useLayoutEffect: (effect: () => (() => void) | undefined) => lifecycle.effects.push(effect),
}));

let onResize = () => {};
const observe = vi.fn();
const disconnect = vi.fn();
beforeEach(() => {
  lifecycle.effects = [];
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { onResize = callback; }
    observe = observe;
    disconnect = disconnect;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each([ledger, manifest, harbour, contract, study])('follows the cursor without wrapping $title at 180px', stage => {
  const script = stage.scripts[0]!;
  const engine = createEngine();
  const longest = script.startLines.reduce((best, line, index, lines) =>
    line.length > (lines[best]?.length ?? 0) ? index : best, 0);
  let state = engine.init(script.startLines, { line: longest, col: 0 });
  const cellWidth = 10;
  const padding = 16;
  let cursorColumn = 0;
  const viewport = {
    clientWidth: 180,
    clientLeft: 1,
    scrollLeft: 0,
    getBoundingClientRect: () => ({ left: 0 }),
    querySelector: () => ({ getBoundingClientRect: () => ({
      left: cursorColumn - viewport.scrollLeft,
      right: cursorColumn + cellWidth - viewport.scrollLeft,
      width: cellWidth,
    }) }),
  };
  lifecycle.viewport = viewport;
  const render = () => {
    const cells = buildLineCells(state, state.cursor.line);
    cursorColumn = viewport.clientLeft + padding + (gutterWidth(state.lines.length) + cells.findIndex(cell => cell.cursor !== null)) * cellWidth + padding;
    const html = renderToStaticMarkup(createElement(ScriptPanel, { script, engine: state, keys: 0 }));
    // Every Vim buffer line remains exactly one rendered row, including blank lines.
    expect(html.match(/class="buffer__line"/g)).toHaveLength(state.lines.length);
    return lifecycle.effects.pop()?.();
  };
  const visible = () => {
    expect(cursorColumn - viewport.scrollLeft).toBeGreaterThanOrEqual(viewport.clientLeft);
    expect(cursorColumn + cellWidth - viewport.scrollLeft).toBeLessThanOrEqual(viewport.clientLeft + viewport.clientWidth);
  };
  render();
  expect(viewport.scrollLeft).toBe(0);
  state = engine.step(state, '$').state;
  const cleanup = render();
  expect(viewport.scrollLeft).toBeGreaterThan(0);
  visible();
  expect(observe).toHaveBeenCalledWith(viewport);
  viewport.clientWidth = 90;
  onResize();
  visible();
  state = engine.step(state, '0').state;
  render();
  visible();
  state = engine.step(state, 'A').state;
  render();
  visible();
  // A small move across the edge scrolls by eight cells, like sidescroll.
  viewport.scrollLeft = cursorColumn + cellWidth - viewport.clientWidth - viewport.clientLeft - 1;
  const before = viewport.scrollLeft;
  onResize();
  expect(viewport.scrollLeft - before).toBe(8 * cellWidth);
  visible();
  cleanup?.();
  expect(disconnect).toHaveBeenCalled();
});
