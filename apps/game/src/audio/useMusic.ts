import { useEffect, useRef } from 'react';
import { notebookDucking } from '../play2/notebook/musicDucking.js';
import type { WorldId } from '@escape/world';
import { createMusic } from './music.js';
import type { ScoreId } from './score.js';
import type { SoundMode } from './settings.js';

export interface MusicView {
  readonly screen: 'title' | 'opening' | 'stages' | 'stage' | 'ending';
  readonly world: WorldId;
  readonly text: boolean;
  readonly dead: boolean;
  readonly overlay: boolean;
}
export function musicChoice(view: MusicView): { readonly score: ScoreId | null; readonly level: number } {
  if (view.screen === 'stage' && view.dead) return { score: null, level: 1 };
  return { score: view.screen === 'ending' ? 'last-page' : view.screen === 'stage' ? view.world : 'title',
    level: view.screen === 'stage' && view.text ? 0.6 : 1 };
}

/** Ducking follows presentation state; only visibility uses a browser event. */
export function useMusic(view: MusicView, mode: SoundMode): void {
  const player = useRef<ReturnType<typeof createMusic> | null>(null);
  const overlay = useRef(view.overlay);
  overlay.current = view.overlay;
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
    music?.duck(view.overlay || notebookDucking.getSnapshot());
  }, [mode, choice.score, choice.level, view.dead, view.overlay]);
}
