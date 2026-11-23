import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SoundButton } from './SoundButton.js';
const driver = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | undefined) => { driver.cleanup?.(); driver.cleanup = effect(); },
}));
import { useStarChimes } from './hooks.js';
import { synth } from './synth.js';
beforeEach(() => { driver.cleanup = undefined; });
afterEach(() => { driver.cleanup?.(); vi.restoreAllMocks(); });
it('staggers one chime per earned star and cancels on card dismissal', () => {
  const cancel = vi.fn();
  const play = vi.spyOn(synth, 'play').mockReturnValue(cancel);
  useStarChimes(true, 3);
  expect(play.mock.calls[0]?.[0]).toEqual([
    { kind: 'star', offsetMs: 650, pitch: 660 },
    { kind: 'star', offsetMs: 840, pitch: 825 },
    { kind: 'star', offsetMs: 1030, pitch: 990 },
  ]);
  useStarChimes(false, 3);
  expect(cancel).toHaveBeenCalledOnce();
  expect(play).toHaveBeenCalledOnce();
});
it('labels both button variants and exposes their on/off state', () => {
  const toggle = vi.fn();
  const title = renderToStaticMarkup(createElement(SoundButton, { enabled: true, onToggle: toggle }));
  const footer = renderToStaticMarkup(createElement(SoundButton, { enabled: false, onToggle: toggle, compact: true }));
  expect(title).toContain('aria-pressed="true"');
  expect(title).toContain('Sound: on');
  expect(footer).toContain('aria-pressed="false"');
  expect(footer).toContain('aria-label="Sound: off"');
  expect(footer).toContain('<svg');
});
