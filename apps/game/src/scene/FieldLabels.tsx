import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { darknessAlpha } from './darkness.js';
import { stageZoom } from './camera.js';
import { interactionLabel, reachedEntity } from './characters.js';
import type { FieldFrame } from './FieldScene.js';
import { LABEL_HEIGHT, cellBox, labelArea, labelScale, labelWidth, layoutLabels, obstaclesFor, overlap, type FieldSign } from './labelLayout.js';
import { TILE_SIZE } from './palette.js';

/** Where the scene's camera is now; `follow` is set by the labels and called at every move. */
export interface LabelCamera { x: number; y: number; zoom: number; follow: (() => void) | null }

const EDGE = 4;
const PROMPT = 'prompt';
const NO_POSITIONS = [] as const;
const signId = (sign: FieldSign): string => `${sign.line}:${sign.text}`;

/** Paper labels over the field, at one size on the screen at any zoom; the layer follows the camera. */
export function FieldLabels({ frame, signs, named, view, camera }: {
  readonly frame: FieldFrame; readonly signs: readonly FieldSign[];
  /** The sign that names the objective's target, if one does. */
  readonly named: FieldSign | undefined;
  readonly view: { readonly width: number; readonly height: number }; readonly camera: LabelCamera;
}): JSX.Element | null {
  const { state, stage, legend, objectiveTarget, hideObjective, showSource } = frame;
  const layer = useRef<HTMLDivElement>(null);
  const promptAt = useRef<{ readonly x: number; readonly y: number; readonly width: number } | null>(null);
  const promptNode = useRef<HTMLDivElement>(null);
  const tile = stageZoom(stage, view) * TILE_SIZE;
  const scale = labelScale(view);
  const height = LABEL_HEIGHT * scale;
  const standAt = frame.standAt ?? NO_POSITIONS;
  const { lines, cursor } = state.engine;
  const reached = hideObjective ? null : reachedEntity(stage, state);
  const promptText = reached ? interactionLabel(reached, stage, state) : '';
  const area = useMemo(() => labelArea(lines, tile, view), [lines, tile, view]);
  // Signs do not depend on the player: they must not jump about at every step.
  const hung = useMemo(() => layoutLabels(
    signs.map(sign => ({ id: signId(sign), names: cellBox(sign.line, sign.from, sign.to, tile), width: labelWidth(sign.text, scale), height })),
    signs.length ? obstaclesFor(state, legend, [], tile) : [], area, tile),
  [JSON.stringify(signs), lines, state.entities, legend, area, tile, scale]);
  const player = cellBox(cursor.line, cursor.col, cursor.col, tile);
  const prompt = reached ? layoutLabels(
    [{ id: PROMPT, names: cellBox(reached.at.line, reached.at.col, reached.at.col, tile), width: labelWidth(promptText, scale), height }],
    [...obstaclesFor(state, legend, [...standAt, ...(objectiveTarget ? [objectiveTarget] : [])], tile),
      { box: player, cost: 200 }, ...hung.map(box => ({ box, cost: 200 }))], area, tile)[0] : undefined;
  promptAt.current = prompt ?? null;

  useLayoutEffect(() => {
    camera.follow = () => {
      const left = camera.x * camera.zoom - view.width / 2; const top = camera.y * camera.zoom - view.height / 2;
      if (layer.current) layer.current.style.transform = `translate(${Math.round(-left)}px, ${Math.round(-top)}px)`;
      const at = promptAt.current;
      if (!at || !promptNode.current) return;
      // The prompt belongs to the thing beside the player: it may not slide out of the view.
      const x = Math.max(left + EDGE, Math.min(left + view.width - at.width - EDGE, at.x));
      const y = Math.max(top + EDGE, Math.min(top + view.height - height - EDGE, at.y));
      promptNode.current.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    camera.follow();
    return () => { camera.follow = null; };
  });

  if (view.width === 0) return null;
  const texts = new Map(signs.map(sign => [signId(sign), sign]));
  const landings = state.pending ? [] : (frame.markers ?? []).map(({ key, at }) => ({ key, at, alpha: darknessAlpha(at, cursor, frame.darkness) }))
    .filter(landing => landing.alpha > 0);
  return <div className="field-labels" data-quiet={hideObjective === true} style={{ '--label-scale': scale } as CSSProperties} aria-hidden="true"><div ref={layer}>
    {hung.map(box => {
      const sign = texts.get(box.id);
      return sign && <div key={box.id} className="field-label" data-done={sign.done === true} data-target={sign === named && !hideObjective} data-under={overlap(box, player) > 0 || showSource}
        style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.width, height: box.height }}>
        {sign.done && <svg viewBox="0 0 8 7" shapeRendering="crispEdges"><path d="M0 3h1v1h1v1h1v1h-1v-1h-1v-1h-1zM2 5h2v-1h1v-1h1v-1h1v-1h1v2h-1v1h-1v1h-1v1h-1v1h-1v-1h-1z" /></svg>}{sign.text}
      </div>;
    })}
    {landings.map(({ key, at, alpha }) => <kbd key={`${key}:${at.line}:${at.col}`} className="field-key" style={{ opacity: alpha,
      transform: `translate(${Math.round((at.col + 0.5) * tile)}px, ${Math.round((at.line + 1) * tile)}px) translate(-50%, -60%)` }}>{key}</kbd>)}
    {prompt && <div ref={promptNode} className="field-label field-label--prompt" style={{ width: prompt.width, height: prompt.height }}>
      <kbd>Enter</kbd>{promptText.replace(/^Enter:\s*/, '')}
    </div>}
  </div></div>;
}
