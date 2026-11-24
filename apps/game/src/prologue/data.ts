import type { WorldId } from '@escape/world';

export const CAPTIONS = [
  'Once, someone wrote a world.',
  'Every tree, every house, every road:\na letter on a page.',
  'They called it Folio, and wrote\na little more of it every night.',
  'Then one night the sky went black.\nThe writer never came back.',
  'Now something grey walks the land.\nIt deletes it, one row at a time.',
  "You are Tilde. You live on the last row.\nIt's coming your way.",
  "Find the Scribe. Make them save the world\nbefore there's nothing left to save.",
  "You move the way text moves: with keys.\nYou'll learn each one when you need it.",
] as const;
export const CHARACTERS_PER_SECOND = 45;
export const AUTO_WAIT_MS = 3500;
export const WORLDS: readonly WorldId[] = ['margin', 'lowlands', 'quarry', 'wordwood', 'copper-port', 'library', 'echo-caves', 'last-page'];
export const WORLD_WHY: Readonly<Record<WorldId, string>> = {
  margin: "Home. What's left of it.", lowlands: 'The Lighthouse has to be warned.',
  quarry: 'The road south, after the Scribe.', wordwood: 'Through the wood, to the ferry.',
  'copper-port': 'Someone is filling the port with copies.', library: 'The Scribe signed a contract here.',
  'echo-caves': "The Scribe's study, somewhere in the dark.", 'last-page': 'The end of the page.',
};
export function goalLine(world: WorldId): string {
  return (world === 'last-page' || world === 'margin') ? 'Find the Scribe' : `World ${WORLDS.indexOf(world)} of 6 · Find the Scribe`;
}
