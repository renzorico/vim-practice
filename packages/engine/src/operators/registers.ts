import type { EngineState, RegisterName, RegisterValue } from '../types.js';

export const UNNAMED_REGISTER = '"';
export const BLACK_HOLE_REGISTER = '_';
const YANK_REGISTER = '0';
const SMALL_DELETE_REGISTER = '-';
const FIRST_DELETE_REGISTER = 1;
const LAST_DELETE_REGISTER = 9;
const NAMED_REGISTER_PATTERN = /^[a-zA-Z0-9-]$/;
const UPPERCASE_PATTERN = /^[A-Z]$/;

/**
 * Linewise register text always ends with "\n" (like Vim's getreg), so a linewise
 * register of one line "foo" holds "foo\n". Charwise text has no trailing newline
 * unless the yanked region included a line break.
 */
export function linewiseText(lines: readonly string[]): string {
  return `${lines.join('\n')}\n`;
}

/** Returns the register to read for p/P, or undefined if it is empty or the black hole. */
export function readRegister(state: EngineState, register: RegisterName | null): RegisterValue | undefined {
  if (register === BLACK_HOLE_REGISTER) {
    return undefined;
  }
  if (register === null || register === UNNAMED_REGISTER) {
    return state.registers[UNNAMED_REGISTER];
  }
  return state.registers[register.toLowerCase()];
}

function appendValue(existing: RegisterValue | undefined, added: RegisterValue): RegisterValue {
  if (existing === undefined) {
    return added;
  }
  if (!existing.linewise && !added.linewise) {
    return { text: existing.text + added.text, linewise: false };
  }
  const head = existing.linewise && existing.text.endsWith('\n') ? existing.text : `${existing.text}\n`;
  const tail = added.linewise || added.text.endsWith('\n') ? added.text : `${added.text}\n`;
  return { text: head + tail, linewise: true };
}

function shiftDeleteRegisters(registers: Record<string, RegisterValue>, value: RegisterValue): void {
  for (let index = LAST_DELETE_REGISTER; index > FIRST_DELETE_REGISTER; index -= 1) {
    const previous = registers[String(index - 1)];
    if (previous === undefined) {
      delete registers[String(index)];
    } else {
      registers[String(index)] = previous;
    }
  }
  registers[String(FIRST_DELETE_REGISTER)] = value;
}

/**
 * Vim register rules:
 * - "_ discards everything.
 * - The unnamed register always ends up holding the new value (for an uppercase
 *   name, the combined value).
 * - Yank without a name also fills "0.
 * - Delete: linewise or multi-line text shifts "1-"9 and fills "1 (even with a
 *   named register); small deletes fill "- only when no register was named.
 * - Uppercase name appends to the lowercase register.
 */
export function writeRegister(
  state: EngineState,
  register: RegisterName | null,
  text: string,
  linewise: boolean,
  kind: 'yank' | 'delete',
): EngineState {
  if (register === BLACK_HOLE_REGISTER) {
    return state;
  }
  const value: RegisterValue = { text, linewise };
  const registers: Record<string, RegisterValue> = { ...state.registers };
  const named = register !== null && NAMED_REGISTER_PATTERN.test(register) ? register : null;

  if (named !== null) {
    const target = named.toLowerCase();
    const stored = UPPERCASE_PATTERN.test(named) ? appendValue(registers[target], value) : value;
    registers[target] = stored;
    registers[UNNAMED_REGISTER] = stored;
  } else {
    registers[UNNAMED_REGISTER] = value;
  }

  if (kind === 'yank') {
    if (named === null) {
      registers[YANK_REGISTER] = value;
    }
  } else if (linewise || text.includes('\n')) {
    shiftDeleteRegisters(registers, value);
  } else if (named === null) {
    registers[SMALL_DELETE_REGISTER] = value;
  }
  return { ...state, registers };
}
