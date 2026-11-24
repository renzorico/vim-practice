import { useEffect, useRef } from 'react';
import type { Legend, Stage } from '@escape/world';
import { paintStage, pictureWindow } from './terrain/stagePicture.js';
import { TABLEAU_TILE } from './terrain/tableau.js';

/** Stages never change, so each picture is painted once per size and then copied. */
const painted = new Map<string, HTMLCanvasElement>();
function picture(stage: Stage, legend: Legend, rows: number, cols: number): HTMLCanvasElement | null {
  const key = `${stage.id}:${rows}:${cols}`;
  const cached = painted.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = cols * TABLEAU_TILE; canvas.height = rows * TABLEAU_TILE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  paintStage(context, stage, legend, pictureWindow(stage, rows, cols));
  painted.set(key, canvas);
  return canvas;
}

/** A still of a stage's opening view. A text stage has no field, so it shows its first lines instead. */
export function StagePicture({ stage, legend, rows, cols, className }: {
  readonly stage: Stage; readonly legend: Legend; readonly rows: number; readonly cols: number; readonly className: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const script = stage.type === 'text' ? stage.scripts[0] : undefined;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    const source = context && !script ? picture(stage, legend, rows, cols) : null;
    if (!context || !source) return;
    context.clearRect(0, 0, source.width, source.height);
    context.drawImage(source, 0, 0);
  }, [stage, legend, rows, cols, script]);
  if (script) return <pre className={`${className} stage-picture--text`} aria-hidden="true">{script.startLines.slice(0, rows + 2).join('\n')}</pre>;
  return <canvas className={className} ref={canvas} width={cols * TABLEAU_TILE} height={rows * TABLEAU_TILE} aria-hidden="true" />;
}
