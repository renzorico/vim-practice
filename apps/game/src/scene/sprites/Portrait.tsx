import { SPRITES } from './index.js';
/** Reuses exactly the scene pixels; no second portrait asset to drift. */
export function Portrait({ sprite }: { readonly sprite: string }) {
  const art = SPRITES[sprite];
  if (!art) return null;
  return <svg width="64" height="64" viewBox="0 0 16 16" aria-hidden="true" style={{ imageRendering: 'pixelated', flexShrink: 0 }}>
    {art.frames[0]?.flatMap((row, y) => [...row].map((pixel, x) => pixel === '.' ? null
      : <rect key={`${y}:${x}`} x={x} y={y} width="1" height="1" fill={art.palette[pixel]} />))}
  </svg>;
}
