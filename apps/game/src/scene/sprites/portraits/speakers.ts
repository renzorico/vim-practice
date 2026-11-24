import type { PixelSprite } from '../sprite.js';
import { PORTRAITS } from './index.js';

export function portraitId(speaker: string): string {
  const name = speaker.trim().replace(/^the\s+/i, '').toLowerCase();
  if (name === 'foreman ash') return 'ash';
  if (name === '???') return 'dot';
  return name;
}

export function portraitFor(speaker: string): PixelSprite | undefined {
  const id = portraitId(speaker);
  return Object.hasOwn(PORTRAITS, id) ? PORTRAITS[id as keyof typeof PORTRAITS] : undefined;
}
