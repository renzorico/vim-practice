import { drawVignette } from './art.js';
import { createContext, useEffect, useRef } from 'react';
import type { WorldId } from '@escape/world';
import { WORLDS } from './data.js';
import './prologue.css';

export const CurrentWorld = createContext<WorldId>('margin');
const NAMES = ['The Margin', 'Lowlands', 'The Quarry', 'Wordwood', 'Copper Port', 'The Library', 'Echo Caves', 'The Last Page'];
function Vignette({ world, current }: { readonly world: WorldId; readonly current: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawVignette(context, world, current);
  }, [world, current]);
  return <canvas ref={canvas} width={40} height={40} aria-hidden="true" />;
}
export function WorldMap({ world, visited, goal = false }: {
  readonly world: WorldId; readonly visited?: readonly WorldId[]; readonly goal?: boolean;
}) {
  const current = WORLDS.indexOf(world);
  return <ol className="folio-map" aria-label="Folio map">
    {WORLDS.map((place, index) => {
      const state = place === world ? 'current' : (visited ? visited.includes(place) : index < current) ? 'visited' : 'unknown';
      const destination = goal && place === 'last-page';
      return <li key={place} data-state={state} data-destination={destination || undefined}
        aria-current={state === 'current' ? 'location' : undefined}
        aria-label={state === 'unknown' ? `Unknown place ${index + 1}` : `${NAMES[index]}: ${state}`}>
        <span className="folio-map__dot" aria-hidden="true"><Vignette world={place} current={state === 'current'} />{(state === 'unknown' || place === 'last-page') && <span className="folio-map__unknown">?</span>}</span>
        {state !== 'unknown' && <span className="folio-map__name">{NAMES[index]}</span>}
        {goal && state === 'current' && <span>you</span>}
      </li>;
    })}
  </ol>;
}
