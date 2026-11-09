import { describe, expect, it } from 'vitest';
import { shouldLeaveToBrowser } from './capture.js';

describe('shouldLeaveToBrowser', () => {
  it('lets Enter and Space activate a focused button or link', () => {
    expect(shouldLeaveToBrowser('Enter', { tagName: 'BUTTON' }, false)).toBe(true);
    expect(shouldLeaveToBrowser(' ', { tagName: 'button' }, true)).toBe(true);
    expect(shouldLeaveToBrowser('Enter', { tagName: 'A' }, false)).toBe(true);
  });

  it('still captures game keys while a button is focused', () => {
    expect(shouldLeaveToBrowser('j', { tagName: 'BUTTON' }, false)).toBe(false);
    expect(shouldLeaveToBrowser('Escape', { tagName: 'BUTTON' }, false)).toBe(false);
  });

  it('captures Enter and Space on the game area', () => {
    expect(shouldLeaveToBrowser('Enter', { tagName: 'BODY' }, false)).toBe(false);
    expect(shouldLeaveToBrowser(' ', null, false)).toBe(false);
  });

  it('moves focus with Tab unless insert or command-line mode needs it', () => {
    expect(shouldLeaveToBrowser('Tab', { tagName: 'BODY' }, false)).toBe(true);
    expect(shouldLeaveToBrowser('Tab', { tagName: 'BODY' }, true)).toBe(false);
    expect(shouldLeaveToBrowser('Tab', { tagName: 'BUTTON' }, true)).toBe(true);
  });

  it('gives form controls and editable content every key', () => {
    expect(shouldLeaveToBrowser('j', { tagName: 'INPUT' }, true)).toBe(true);
    expect(shouldLeaveToBrowser('j', { tagName: 'DIV', isContentEditable: true }, true)).toBe(true);
  });
});
