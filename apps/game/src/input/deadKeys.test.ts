import { describe, expect, it } from 'vitest';
import { afterDeadKey, deadKeyCharacter, type DeadKeyEvent } from './deadKeys.js';

const layout = (entries: Record<string, string>) => new Map(Object.entries(entries));
const SPANISH = layout({ KeyQ: 'q', Semicolon: '\u00f1' });
const GERMAN = layout({ KeyQ: 'q', Semicolon: '\u00f6' });
const FRENCH = layout({ KeyQ: 'a', Semicolon: 'm' });
const US = layout({ KeyQ: 'q', Semicolon: ';' });
const at = (code: string, mods: Partial<DeadKeyEvent> = {}): DeadKeyEvent =>
  ({ code, shiftKey: false, altKey: false, ...mods });

describe('deadKeyCharacter', () => {
  it('reads Spanish ISO', () => {
    expect(deadKeyCharacter(at('BracketLeft'), SPANISH)).toBe('`');
    expect(deadKeyCharacter(at('BracketLeft', { shiftKey: true }), SPANISH)).toBe('^');
    expect(deadKeyCharacter(at('Semicolon', { altKey: true }), SPANISH)).toBe('~');
    expect(deadKeyCharacter(at('Quote'), SPANISH)).toBeNull();
  });
  it('does not confuse layouts that put ^ where Spanish has the backtick', () => {
    expect(deadKeyCharacter(at('BracketLeft'), FRENCH)).toBe('^');
    expect(deadKeyCharacter(at('Backquote'), GERMAN)).toBe('^');
    expect(deadKeyCharacter(at('Backquote'), US)).toBe('`');
    expect(deadKeyCharacter(at('Quote', { shiftKey: true }), US)).toBe('"');
  });
  it('never guesses on an unknown layout', () => {
    expect(deadKeyCharacter(at('BracketLeft'), layout({ KeyQ: "'", Semicolon: 's' }))).toBeNull();
  });
});

describe('afterDeadKey', () => {
  it('drops the completing Space and strips the accent', () => {
    expect(afterDeadKey(' ', 'Space')).toBeNull();
    expect(afterDeadKey('`', 'Space')).toBeNull();
    expect(afterDeadKey('\u00e0', 'KeyA')).toBe('a');
    expect(afterDeadKey('a', 'KeyA')).toBe('a');
    expect(afterDeadKey('Enter', 'Enter')).toBe('Enter');
    expect(afterDeadKey('\u00f1', 'Semicolon')).toBe('\u00f1');
  });
});
