/**
 * Terminal playground: type real Vim keys into the ESCAPE engine and watch the state change.
 * Not the game (that is apps/game, Phase 2), just a live window into the engine.
 *
 * Run: npm run play        Quit the playground: Ctrl-C (or :q / :wq like in Vim)
 */
import { createEngine } from '../packages/engine/src/engine.js';
import type { CommandRecord, EngineState, Key } from '../packages/engine/src/types.js';

const START_TEXT = [
  'Welcome to ESCAPE. You are inside a Vim buffer.',
  '',
  'Move with h j k l. Jump words with w b e.',
  'Delete a word with dw, undo with u, redo with Ctrl-r.',
  'Press i to insert text, <Esc> to go back to normal mode.',
  'Search with /word<Enter>, then n to repeat.',
  '',
  'When you are done: type :wq and press Enter.',
];

const RESET = '\x1b[0m';
const INVERSE = '\x1b[7m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CLEAR = '\x1b[2J\x1b[H';
const MAX_HISTORY = 6;
const CTRL_C = '\u0003';

/** Raw terminal bytes to Vim key notation, the format Engine.step expects. */
function toKey(char: string): Key | null {
  const code = char.charCodeAt(0);
  if (char === '\u001b') return '<Esc>';
  if (char === '\r' || char === '\n') return '<CR>';
  if (char === '\u007f' || char === '\b') return '<BS>';
  if (char === '\t') return '<Tab>';
  if (code >= 1 && code <= 26) return `<C-${String.fromCharCode(code + 96)}>`;
  if (code < 32) return null;
  return char;
}

function renderLine(text: string, lineIndex: number, state: EngineState): string {
  const isCursorLine = lineIndex === state.cursor.line;
  const number = `${DIM}${String(lineIndex + 1).padStart(3)} ${RESET}`;
  if (!isCursorLine || state.mode === 'command-line') return number + text;
  const col = state.cursor.col;
  const under = text[col] ?? ' ';
  return `${number}${text.slice(0, col)}${INVERSE}${under === '\t' ? ' ' : under}${RESET}${text.slice(col + 1)}`;
}

function render(state: EngineState, history: readonly CommandRecord[], message: string): void {
  const body = state.lines.map((text, index) => renderLine(text, index, state)).join('\n');
  const mode = state.mode.toUpperCase();
  const pending = state.pendingKeys.length > 0 ? `  pending: ${state.pendingKeys.join('')}` : '';
  const flags = state.modified ? '  [+]' : '';
  const recent = history.map((command) => `${command.keys.join('')} (${command.kind})`).join('   ');
  const bottom = state.mode === 'command-line' ? state.commandLine : message;
  process.stdout.write(
    `${CLEAR}${BOLD}ESCAPE engine playground${RESET}  ${DIM}Ctrl-C quits${RESET}\n\n${body}\n\n`
    + `${INVERSE} ${mode} ${RESET}${flags}${pending}  ${DIM}cursor ${state.cursor.line + 1}:${state.cursor.col + 1}${RESET}\n`
    + `${DIM}commands: ${recent}${RESET}\n${bottom}\n`,
  );
}

function main(): void {
  if (!process.stdin.isTTY) {
    console.error('Run this in an interactive terminal: npm run play');
    process.exit(1);
  }
  const engine = createEngine();
  let state = engine.init(START_TEXT);
  let history: CommandRecord[] = [];
  let message = '';

  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  render(state, history, message);

  process.stdin.on('data', (chunk: string) => {
    if (chunk.includes(CTRL_C)) {
      process.stdout.write(`${CLEAR}Bye.\n`);
      process.exit(0);
    }
    // Arrow keys and other escape sequences are not Vim keys here: ignore them, keep plain <Esc>.
    const keys = chunk.startsWith('\u001b[') || chunk.startsWith('\u001bO') ? [] : [...chunk];
    for (const char of keys) {
      const key = toKey(char);
      if (key === null) continue;
      const result = engine.step(state, key);
      state = result.state;
      history = [...history, ...result.commands].slice(-MAX_HISTORY);
      message = result.error?.message ?? (result.commands.length > 0 ? '' : message);
    }
    render(state, history, message);
    if (state.quitRequested) {
      process.stdout.write(`\n${BOLD}You escaped Vim.${RESET} ${state.saved ? 'Saved and quit.' : 'Quit without saving.'}\n`);
      process.exit(0);
    }
  });
}

main();
