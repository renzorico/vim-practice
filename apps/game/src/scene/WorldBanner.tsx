import { WorldMap } from '../prologue/WorldMap.js';
import { WORLD_WHY } from '../prologue/data.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Legend, Stage, WorldId } from '@escape/world';
import { StagePicture } from './StagePicture.js';

export const BANNER_DURATION_MS = 2600;
const BANNER_ROWS = 12;
const BANNER_COLS = 20;
export const WORLD_NAMES: Readonly<Record<WorldId, readonly [string, string]>> = {
  margin: ['0', 'The Margin'], lowlands: ['1', 'Lowlands'], quarry: ['2', 'The Quarry'],
  wordwood: ['3', 'Wordwood'], 'copper-port': ['4', 'Copper Port'], library: ['5', 'The Library'],
  'echo-caves': ['6', 'Echo Caves'], 'last-page': ['F', 'The Last Page'],
};
export function bannerBrowserKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.metaKey || event.ctrlKey || event.altKey || /^F\d+$/.test(event.key)
    || event.key === 'Meta' || event.key === 'Control' || event.key === 'Alt';
}
/** App's capture listener owns dismissal so the same event cannot reach either game listener. */
export function useWorldBanner(world: WorldId, active: boolean) {
  const seen = useRef(new Set<WorldId>());
  const [visible, setVisible] = useState<WorldId | null>(null);
  const blocking = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (seen.current.has(world)) return;
    seen.current.add(world);
    blocking.current = true;
    setVisible(world);
    const timer = setTimeout(() => { blocking.current = false; setVisible(null); }, BANNER_DURATION_MS);
    return () => { clearTimeout(timer); blocking.current = false; setVisible(null); };
  }, [world, active]);
  const dismiss = useCallback((event?: KeyboardEvent): boolean => {
    if (!blocking.current) return false;
    if (event && bannerBrowserKey(event)) return false;
    if (event?.repeat || event?.key === 'Shift') return true;
    blocking.current = false; setVisible(null); return true;
  }, []);
  const reset = useCallback(() => { seen.current.clear(); }, []);
  return { visible, dismiss, reset };
}
export function WorldBanner({ world, stage, legend, onDismiss }: {
  readonly world: WorldId; readonly stage?: Stage; readonly legend?: Legend; readonly onDismiss: () => void;
}) {
  const [number, name] = WORLD_NAMES[world];
  return <div className="world-banner" role="status" aria-label={`World ${number}: ${name}`}>
    {stage && legend && stage.type !== 'text' && <StagePicture stage={stage} legend={legend} rows={BANNER_ROWS} cols={BANNER_COLS} className="world-banner__picture" />}
    <div className="world-banner__card">
      <p>World {number}</p><h2>{name}</h2>
      <p>{WORLD_WHY[world]}</p>
      <WorldMap world={world} />
      <button onClick={onDismiss}>Press any key to begin</button>
    </div>
  </div>;
}
