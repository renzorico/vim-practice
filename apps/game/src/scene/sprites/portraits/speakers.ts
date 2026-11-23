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

/** Light costume/prop tones remain legible on the dialogue's dark surface. */
export const SPEAKER_ACCENTS: Readonly<Record<string, string>> = {
  elder: '#f6efd4', mira: '#74a9b0', dot: '#74a9b0', scribe: '#f6efd4',
  ash: '#fabd2f', wren: '#dfad80', echo: '#74a9b0', lamplighter: '#fabd2f',
  mason: '#f6efd4', shut: '#74a9b0', ope: '#74a9b0', tare: '#fabd2f',
  ream: '#f6efd4', bitt: '#dfad80', index: '#f6efd4', quire: '#dfad80',
  folio: '#f6efd4', notary: '#dfad80', pilcrow: '#a9b56d', fern: '#a9b56d',
  clerk: '#dfad80', semi: '#dfad80', gull: '#f6efd4', kit: '#fabd2f',
  bram: '#dfad80', pell: '#fabd2f', cleat: '#66788d',
};

export function speakerAccent(speaker: string): string | undefined {
  return SPEAKER_ACCENTS[portraitId(speaker)];
}
