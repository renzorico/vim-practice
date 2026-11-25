import { useEffect, useRef } from 'react';
import { notebookDucking } from '../play2/notebook/musicDucking.js';
import type { WorldId } from '@escape/world';
import { synth } from './synth.js';
import { createMusic } from './music.js';
import type { ScoreId } from './score.js';
import type { SoundMode } from './settings.js';

export interface MusicView {
  readonly screen: 'title' | 'opening' | 'stages' | 'stage' | 'ending';
  readonly world: WorldId;
  readonly text: boolean;
  readonly dead: boolean;
  readonly cleared: boolean;
  readonly overlay: boolean;
}
export function musicChoice(view: MusicView): { readonly score: ScoreId | null; readonly level: number; readonly resolved: boolean } {
  if (view.screen === 'stage' && view.dead) return { score: null, level: 1, resolved: false };
  return { score: view.screen === 'ending' ? 'last-page' : view.screen === 'stage' ? view.world : 'title',
    level: view.screen === 'stage' && view.text ? 0.6 : 1, resolved: view.screen === 'stage' && view.cleared };
}

/** Ducking follows presentation state; only visibility uses a browser event. */
export function useMusic(view: MusicView, mode: SoundMode): void {
  const player = useRef<ReturnType<typeof createMusic> | null>(null);
  const overlay = useRef(view.overlay);
  overlay.current = view.overlay;
  const previous = useRef<{ screen: MusicView['screen']; world: WorldId; cleared: boolean } | null>(null);
  const choice = musicChoice(view);
  useEffect(() => {
    const music = createMusic(); player.current = music;
    const page = typeof document === 'undefined' ? null : document;
    const visibility = (): void => music.setHidden(page?.hidden ?? false);
    visibility();
    const unsubscribe = notebookDucking.subscribe(() => music.duck(overlay.current || notebookDucking.getSnapshot()));
    page?.addEventListener('visibilitychange', visibility);
    return () => { unsubscribe(); page?.removeEventListener('visibilitychange', visibility); music.dispose(); player.current = null; };
  }, []);
  useEffect(() => {
    const music = player.current;
    music?.setEnabled(mode === 'on');
    music?.setLevel(choice.level);
    music?.setScore(choice.score, view.dead ? 0.2 : 1.5);
    const before = previous.current;
    const entering = view.screen === 'stage' && (before?.screen !== 'stage' || before.world !== view.world);
    const liveClear = choice.resolved && !entering && before?.cleared === false;
    const scheduled = choice.resolved && !liveClear
      ? music?.setResolved(true, { cadence: false })
      : music?.setResolved(choice.resolved);
    if (liveClear && !scheduled && mode === 'on' && !(typeof document !== 'undefined' && document.hidden))
      synth.play([{ kind: 'clear', offsetMs: 0 }]);
    previous.current = { screen: view.screen, world: view.world, cleared: view.cleared };
    music?.duck(view.overlay || notebookDucking.getSnapshot());
  }, [mode, choice.score, choice.level, view.dead, view.overlay, choice.resolved, view.screen, view.world]);
}
