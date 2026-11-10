import { describe, expect, it } from 'vitest';
import type { SolveFn } from '@escape/curriculum';
import { parseKeys } from '@escape/engine';
import { createGame, doorIdFor, learnedSkills, objectiveFor } from './game.js';
import { createMemoryProgressStorage } from './progress.js';

// The real solver is merged separately; a null solver makes finalizeRoom use each room's intended solution.
const noSolver: SolveFn = () => null;
const NOW = '2026-11-10T12:00:00.000Z';

function setup() {
  const storage = createMemoryProgressStorage();
  const store = createGame({ solve: noSolver, storage, now: () => NOW });
  const press = (keys: string): void => {
    for (const key of parseKeys(keys)) store.getState().pressKey(key);
  };
  const playSolution = (): void => {
    const room = store.getState().room;
    if (room === null) throw new Error('no room');
    for (const key of room.level.solution) store.getState().pressKey(key);
  };
  return { store, storage, press, playSolution };
}

describe('Phase 3 game', () => {
  it('starts on the title and goes to the map with Enter', () => {
    const { store, press } = setup();
    expect(store.getState().screen).toBe('title');
    press('<CR>');
    expect(store.getState().screen).toBe('map');
  });

  it('walks to the first note and plays lesson -> practice -> challenge -> won, clearing the door', () => {
    const { store, press, playSolution } = setup();
    press('<CR>ll<CR>');
    expect(store.getState().room?.session.phase).toBe('lesson');
    expect(store.getState().room?.skill).toBe('ex.q');

    store.getState().continueLesson();
    expect(store.getState().room?.session.phase).toBe('practice');
    playSolution();
    expect(store.getState().room?.session.phase).toBe('challenge');
    expect(learnedSkills(store.getState().progress.save).has('ex.q')).toBe(true);

    playSolution();
    expect(store.getState().room?.session.phase).toBe('won');
    expect(store.getState().progress.clearedDoors).toContain(doorIdFor('ex.q'));

    press('<CR>');
    expect(store.getState().screen).toBe('map');
    expect(store.getState().map.engine.cursor).toEqual({ line: 2, col: 2 });
  });

  it('offers the solution after 5 failed attempts, then serves a different room, then skip after 3 failed variants', () => {
    const { store, press, playSolution } = setup();
    store.getState().startSkipTest();
    playSolution();
    store.getState().leaveRoom();
    press('<CR>'); // on note-motion-hjkl at (8,2)
    expect(store.getState().room?.skill).toBe('motion.hjkl');
    store.getState().continueLesson();
    playSolution();
    expect(store.getState().room?.session.phase).toBe('challenge');
    const original = store.getState().room?.session.seed;

    // In a reach room, :q gives up: one failed attempt each time.
    for (let attempt = 1; attempt <= 4; attempt += 1) press(':q<CR>');
    expect(store.getState().room?.session.attempts).toBe(4);
    store.getState().showSolution();
    expect(store.getState().room?.session.phase).toBe('challenge');
    press(':q<CR>');
    store.getState().showSolution();
    expect(store.getState().room?.session.phase).toBe('solution');

    store.getState().newRoomAfterSolution();
    const variant = store.getState().room;
    expect(variant?.session.phase).toBe('challenge');
    expect(variant?.session.variant).toBe(1);
    expect(variant?.session.seed).not.toBe(original);

    for (let failed = 1; failed <= 3; failed += 1) press(':q<CR>');
    store.getState().skip();
    expect(store.getState().room?.session.phase).toBe('skipped');
  });

  it('seals doors whose prerequisites are not learned and says why', () => {
    const { store, press } = setup();
    press('<CR>');
    // door-mode-insert sits at line 2, col 19; walk there with l.
    press('17l<CR>');
    const last = store.getState().log.at(-1);
    expect(store.getState().screen).toBe('map');
    expect(last?.text).toMatch(/sealed|not something you know/);
  });

  it('the skip test clears the Prologue and drops the player in the Memory Fields', () => {
    const { store, playSolution } = setup();
    store.getState().startSkipTest();
    expect(store.getState().room?.skill).toBe('ex.wq');
    expect(store.getState().room?.session.phase).toBe('challenge');
    playSolution();
    expect(store.getState().room?.session.phase).toBe('won');
    const { progress } = store.getState();
    for (const skill of ['ex.q', 'ex.q!', 'mode.insert', 'ex.wq']) {
      expect(learnedSkills(progress.save).has(skill)).toBe(true);
      expect(progress.clearedDoors).toContain(doorIdFor(skill));
    }
    expect(progress.collectedKeys).toContain('key-boot-sector');
    store.getState().leaveRoom();
    expect(store.getState().map.engine.cursor).toEqual({ line: 8, col: 2 });
    expect(objectiveFor(store.getState().progress)).toMatch(/hjkl/);
  });

  it('saves progress and restores it in a new game', () => {
    const { store, storage, playSolution } = setup();
    store.getState().startSkipTest();
    playSolution();
    const restored = createGame({ solve: noSolver, storage, now: () => NOW });
    expect(restored.getState().progress.collectedKeys).toContain('key-boot-sector');
  });
});
