import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SoundModeContext, type SoundMode } from './settings.js';
import { SoundButton } from './SoundButton.js';
const driver = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useEffect: (effect: () => (() => void) | undefined) => { driver.cleanup?.(); driver.cleanup = effect(); },
}));
import { audibleCues, useStarChimes } from './hooks.js';
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
it.each(['on', 'effects only', 'off'] as const)('labels both button variants with %s and no toggle semantics', (mode: SoundMode) => {
  for (const compact of [true, false]) {
    const button = renderToStaticMarkup(createElement(SoundModeContext.Provider, { value: mode },
      createElement(SoundButton, { enabled: mode !== 'off', onToggle: vi.fn(), compact })));
    expect(button).not.toContain('aria-pressed');
    expect(button).toContain(`aria-label="Sound: ${mode}"`);
    expect(button.includes('<svg')).toBe(compact);
  }
});

it('renders three distinct compact sound glyphs', () => {
  const glyphs = (['on', 'effects only', 'off'] as const).map(mode =>
    renderToStaticMarkup(createElement(SoundModeContext.Provider, { value: mode },
      createElement(SoundButton, { enabled: mode !== 'off', onToggle: vi.fn(), compact: true }))).match(/<svg.*<\/svg>/)?.[0]);
  expect(new Set(glyphs).size).toBe(3);
  expect(glyphs.every(Boolean)).toBe(true);
});

it.each(['on', 'effects only', 'off'] as const)('selects clear sound at playback in %s mode', mode => {
  const cues = [{ kind: 'clear', offsetMs: 0 }, { kind: 'hit', offsetMs: 0 }] as const;
  expect(audibleCues(cues, mode).map(cue => cue.kind)).toEqual(mode === 'on' ? ['hit'] : mode === 'off' ? [] : ['clear', 'hit']);
  expect(cues).toHaveLength(2);
});
