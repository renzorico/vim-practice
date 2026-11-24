import { keyParts } from '../play2/KeyText';

const ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ['&#x27;', "'"], ['&quot;', '"'], ['&lt;', '<'], ['&gt;', '>'], ['&amp;', '&'],
];

/** Text a player reads in rendered HTML: tags removed, entities decoded. */
export function visibleText(html: string): string {
  let text = html.replace(/<[^>]*>/g, '');
  for (const [entity, character] of ENTITIES) text = text.replaceAll(entity, character);
  return text;
}

/** Authored text as the player reads it: key backticks become keycaps, so only their content remains. */
export function plainText(authored: string): string {
  return keyParts(authored).map(part => part.text).join('');
}
