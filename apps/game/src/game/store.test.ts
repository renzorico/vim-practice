import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@escape/curriculum';
import { parseKeys } from '@escape/engine';
import { LEVELS } from './levels.js';
import { buildOverworld } from './overworld.js';
import { createGameStore } from './store.js';

const NOW = '2026-11-09T12:00:00.000Z';

function setup() {
  const storage = createMemoryStorage();
  const store = createGameStore({ levels: LEVELS, storage, now: () => NOW });
  const press = (keys: string): void => {
    for (const key of parseKeys(keys)) store.getState().pressKey(key);
  };
  return { store, storage, press };
}

describe('real game store', () => {
  it('ships the Prologue levels', () => {
    expect(LEVELS.map((level) => level.id)).toEqual(expect.arrayContaining(['p-01-trapped', 'p-02-guestbook', 'p-03-no-way-back']));
  });

  it('plays p-01 from the title screen to a saved win', () => {
    const { store, storage, press } = setup();
    press('<CR>');
    expect(store.getState().screen).toEqual({ kind: 'overworld' });
    expect(store.getState().portals[store.getState().overworld.cursor.line]).toBe('p-01-trapped');

    press('<CR>');
    expect(store.getState().screen).toEqual({ kind: 'level', levelId: 'p-01-trapped' });

    press(':q<CR>');
    const { screen, run, save } = store.getState();
    expect(screen).toEqual({ kind: 'result', levelId: 'p-01-trapped' });
    expect(run?.status).toBe('won');
    expect(run?.stars).toBe(3);
    expect(save.completed['p-01-trapped']).toEqual({ stars: 3, bestKeystrokes: 3 });
    expect(storage.load()?.completed['p-01-trapped']).toBeDefined();
  });

  it('unlocks the next level and moves the cursor to it after a win', () => {
    const { store, press } = setup();
    press('<CR><CR>:q<CR><CR>');
    const { screen, overworld, portals } = store.getState();
    expect(screen).toEqual({ kind: 'overworld' });
    expect(portals[overworld.cursor.line]).toBe('p-02-guestbook');
    expect(overworld.lines.some((line) => line.includes('[x] Trapped') && line.includes('***'))).toBe(true);
  });

  it('refuses to open a locked portal', () => {
    const { store, press } = setup();
    press('<CR>');
    const p03Line = store.getState().portals.indexOf('p-03-no-way-back');
    press(`${p03Line + 1}G<CR>`);
    expect(store.getState().screen).toEqual({ kind: 'overworld' });
  });

  it('never lets the player edit the overworld buffer', () => {
    const { store, press } = setup();
    press('<CR>');
    const before = store.getState().overworld.lines;
    press('ddxihello<Esc>');
    expect(store.getState().overworld.lines).toEqual(before);
  });

  it('counts r as a game key inside a level, and restartLevel resets the run', () => {
    const { store, press } = setup();
    press('<CR><CR>:q<CR><CR>');
    press('<CR>');
    expect(store.getState().screen).toEqual({ kind: 'level', levelId: 'p-02-guestbook' });
    press('r');
    expect(store.getState().run?.keystrokes).toBe(1);
    press('<Esc>');
    store.getState().restartLevel();
    expect(store.getState().run?.keystrokes).toBe(0);
  });

  it('restores progress from storage', () => {
    const storage = createMemoryStorage({ version: 1, completed: { 'p-01-trapped': { stars: 2, bestKeystrokes: 5 } }, mastery: {} });
    const store = createGameStore({ levels: LEVELS, storage, now: () => NOW });
    expect(store.getState().save.completed['p-01-trapped']?.stars).toBe(2);
  });
});

describe('buildOverworld', () => {
  it('marks locked levels and puts the cursor on the first playable one', () => {
    const map = buildOverworld(LEVELS, { version: 1, completed: {}, mastery: {} });
    const lockedLine = map.lines[map.portals.indexOf('p-03-no-way-back')];
    expect(lockedLine).toContain('[#]');
    expect(lockedLine).toContain('locked');
    expect(map.portals[map.start.line]).toBe('p-01-trapped');
    expect(map.portals).toHaveLength(map.lines.length);
  });
});
