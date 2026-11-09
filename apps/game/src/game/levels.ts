import { parseLevel } from '@escape/curriculum';
import type { Level } from '@escape/curriculum';
import { sortLevels } from './overworld.js';

// Every shipped level file, bundled at build time. Drafts are not shipped.
const files = import.meta.glob<unknown>(
  ['../../../../packages/curriculum/levels/*/*.json', '!../../../../packages/curriculum/levels/drafts/**'],
  { eager: true, import: 'default' },
);

/** Throws at startup if a level file is invalid: CI's level gate should make that impossible. */
export const LEVELS: readonly Level[] = sortLevels(Object.values(files).map(parseLevel));
