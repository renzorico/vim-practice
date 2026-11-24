import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldId } from '@escape/world';
import { SPRITES } from './sprites/index.js';

export const BANNER_DURATION_MS = 1600;
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
    if (!active || seen.current.has(world)) return;
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
  return { visible, dismiss };
}
const WORLD_TILES: Readonly<Record<WorldId, readonly string[]>> = {
  margin: ['grass', 'road', 'house-wall', 'water', 'grass'],
  lowlands: ['grass', 'stone', 'tower-wall', 'water', 'jetty'],
  quarry: ['dirt', 'gravel', 'bedrock', 'river', 'plank'],
  wordwood: ['moss', 'branch', 'trunk', 'leaves', 'clearing'],
  'copper-port': ['boards', 'pier-post', 'warehouse-wall', 'port-water', 'boards'],
  library: ['reading-floor', 'archive-aisle', 'library-wall', 'atlas-shelf', 'vault-floor'],
  'echo-caves': ['cave-floor', 'cave-rock', 'crystal-ledge', 'crystal-lit', 'cave-floor'],
  'last-page': ['page-paper', 'page-margin', 'page-paper', 'page-corner', 'page-paper'],
};
function TileRibbon({ world }: { readonly world: WorldId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 80, 16);
    WORLD_TILES[world].forEach((name, index) => {
      const sprite = SPRITES[name];
      sprite?.frames[0]?.forEach((row, y) => [...row].forEach((pixel, x) => {
        const color = sprite.palette[pixel];
        if (color && color !== 'transparent') { context.fillStyle = color; context.fillRect(index * 16 + x, y, 1, 1); }
      }));
    });
  }, [world]);
  return <canvas className="world-banner__tiles" ref={canvas} width={80} height={16} aria-hidden="true" />;
}
export function WorldBanner({ world, onDismiss }: { readonly world: WorldId; readonly onDismiss: () => void }) {
  const [number, name] = WORLD_NAMES[world];
  return <div className="world-banner" role="status" aria-label={`World ${number}: ${name}`}>
    <p>World {number}</p><h2>{name}</h2>
    <TileRibbon world={world} />
    <button onClick={onDismiss}>Press any key to begin</button>
  </div>;
}
