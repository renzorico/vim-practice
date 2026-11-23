import { SPRITES } from './index.js';
import { portraitFor, portraitId } from './portraits/speakers.js';
import type { Mood } from '../../story-ui/mood.js';

const MOOD_FRAME: Readonly<Record<Mood, number>> = { neutral: 0, worried: 1, glad: 2 };

export function Portrait({ sprite, mood = 'neutral' }: { readonly sprite: string; readonly mood?: Mood }) {
  const id = portraitId(sprite);
  if (['system', 'sign', 'unwriter'].includes(id)) return null;
  const portrait = portraitFor(id);
  const art = portrait ?? SPRITES[id];
  if (!art) return null;
  const frame = art.frames[portrait ? MOOD_FRAME[mood] : 0] ?? art.frames[0];
  const size = portrait ? 32 : 16;
  return <svg width="96" height="96" className="dialogue__portrait" viewBox={`0 0 ${size} ${size}`}
    aria-hidden="true" style={{ imageRendering: 'pixelated', flexShrink: 0 }}>
    {frame?.flatMap((row, y) => [...row].map((pixel, x) => pixel === '.' ? null
      : <rect key={`${y}:${x}`} x={x} y={y} width="1" height="1" fill={art.palette[pixel]} />))}
  </svg>;
}
