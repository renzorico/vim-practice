import type { Key } from '@escape/engine';

/** Keys that take the next key as an argument (a character, a mark, a register): never a command of their own. */
const ARGUMENT_KEYS = new Set(['f', 'F', 't', 'T', 'r', 'm', '`', "'", '"']);

/** The commands a key sequence runs, skipping find/replace/mark arguments and typed search or insert text. */
export function commandsIn(keys: readonly Key[], known: ReadonlySet<string>): string[] {
  const commands: string[] = [];
  let typing = false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] ?? '';
    if (typing) {
      if (key === '<Esc>') commands.push(key);
      if (key === '<CR>' || key === '<Esc>') typing = false;
      continue;
    }
    if (key === '/' || key === '?' || key === ':') { commands.push(key); typing = true; continue; }
    if (/^\d$/.test(key) && key !== '0') continue;
    const pair = `${key}${keys[index + 1] ?? ''}`;
    if (known.has(pair) && pair.length === 2) { commands.push(pair); index += 1; continue; }
    // A change takes its target before the typed text: `ci"` is `c` on `i"`, then insert.
    const target = `${keys[index + 1] ?? ''}${keys[index + 2] ?? ''}`;
    if (key === 'c' && known.has(target) && target.length === 2) { commands.push(key, target); index += 2; typing = true; continue; }
    commands.push(key);
    if (ARGUMENT_KEYS.has(key)) index += 1;
    if (['i', 'a', 'A', 'I', 'o', 'O', 'c', 'C', 's', 'S'].includes(key) && !known.has(pair)) typing = true;
  }
  return commands;
}
