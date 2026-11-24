import { useEffect, useRef } from 'react';
import { paintFrame, paintLetters, paintPlayer, paintWorld, TITLE_FRAME_MS, TITLE_HEIGHT, TITLE_WIDTH } from './scene.js';

function layer(paint: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = TITLE_WIDTH; canvas.height = TITLE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  paint(context);
  return canvas;
}

/** The Margin at dawn, its far edge turning back into letters and then into blank page. Once saved, whole. */
export function TitleScene({ saved = false }: { readonly saved?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    const world = context ? layer(target => paintWorld(target, saved)) : null;
    const letters = context ? layer(paintLetters) : null;
    const player = context ? layer(paintPlayer) : null;
    if (!context || !world || !letters || !player) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const start = Date.now();
    const draw = (): void => paintFrame(context, world, letters, player, Date.now() - start, reduced.matches, saved);
    let timer: ReturnType<typeof setInterval> | undefined;
    // Nothing moves with reduced motion or in a hidden tab, so nothing wakes up either.
    const restart = (): void => {
      clearInterval(timer);
      draw();
      if (!reduced.matches && !document.hidden) timer = setInterval(draw, TITLE_FRAME_MS);
    };
    restart();
    reduced.addEventListener('change', restart);
    document.addEventListener('visibilitychange', restart);
    return () => {
      clearInterval(timer);
      reduced.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [saved]);
  return <canvas className="title-scene" ref={canvas} width={TITLE_WIDTH} height={TITLE_HEIGHT} aria-hidden="true" />;
}
