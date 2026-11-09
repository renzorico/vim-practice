import { describe, expect, it } from 'vitest';
import { mapKeyEvent, type KeyEventLike } from './keys.js';

const press = (key: string, mods: Partial<KeyEventLike> = {}) =>
  mapKeyEvent({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('mapKeyEvent', () => {
  it('maps special keys', () => {
    expect(press('Escape')).toEqual({ key: '<Esc>', preventDefault: true });
    expect(press('Enter').key).toBe('<CR>');
    expect(press('Backspace').key).toBe('<BS>');
    expect(press('Tab')).toEqual({ key: '<Tab>', preventDefault: true });
  });

  it('keeps plain and shifted characters as typed', () => {
    expect(press('j').key).toBe('j');
    expect(press('A').key).toBe('A');
    expect(press('$').key).toBe('$');
    expect(press(' ').key).toBe(' ');
    expect(press('<').key).toBe('<');
    expect(press('/')).toEqual({ key: '/', preventDefault: true });
  });

  it('maps handled ctrl chords and prevents the browser default', () => {
    expect(press('r', { ctrlKey: true })).toEqual({ key: '<C-r>', preventDefault: true });
    expect(press('d', { ctrlKey: true }).key).toBe('<C-d>');
    expect(press('u', { ctrlKey: true }).key).toBe('<C-u>');
    expect(press('v', { ctrlKey: true }).key).toBe('<C-v>');
    expect(press('R', { ctrlKey: true }).key).toBe('<C-r>');
  });

  it('leaves unhandled ctrl chords to the browser', () => {
    expect(press('w', { ctrlKey: true })).toEqual({ key: null, preventDefault: false });
    expect(press('t', { ctrlKey: true })).toEqual({ key: null, preventDefault: false });
  });

  it('never handles or prevents Cmd/Meta and Alt shortcuts', () => {
    expect(press('r', { metaKey: true })).toEqual({ key: null, preventDefault: false });
    expect(press('r', { metaKey: true, ctrlKey: true }).preventDefault).toBe(false);
    expect(press('Enter', { metaKey: true }).key).toBeNull();
    expect(press('x', { altKey: true }).preventDefault).toBe(false);
  });

  it('ignores modifier and navigation keys', () => {
    for (const name of ['Shift', 'Control', 'Meta', 'ArrowUp', 'F5', 'Dead', 'CapsLock']) {
      expect(press(name)).toEqual({ key: null, preventDefault: false });
    }
  });
});
