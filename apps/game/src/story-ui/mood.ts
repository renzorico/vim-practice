import type { Line } from '@escape/story';

export type Mood = 'neutral' | 'worried' | 'glad';

/** Frame overrides in dialogue-line order; absent entries use the text rules. */
export const MOOD_OVERRIDES: Record<string, readonly Mood[]> = {};

const WORRIED = /\b(?:gone|unwriter|unsaved|sorry|lost|can['’]t|blank|warning|danger|careful|beware|stop|don't|do not)\b|\.{3}|…/i;
const GLAD = /\b(?:thanks|thank you|done|open|saved|cleared|lit)\b|!/i;

/** Optional index lets multi-line overrides work without changing the frozen Line contract. */
export function moodFor(line: Line, dialogueId?: string, lineIndex = 0): Mood {
  const override = dialogueId === undefined ? undefined : MOOD_OVERRIDES[dialogueId]?.[lineIndex];
  if (override !== undefined) return override;
  if (WORRIED.test(line.text)) return 'worried';
  return GLAD.test(line.text) ? 'glad' : 'neutral';
}
