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
    expect(store.getState().room?.level.id).toMatch(/-1-\d+$/); // practice rooms are difficulty 1
    playSolution();
    expect(store.getState().room?.session.phase).toBe('practice');
    expect(store.getState().room?.practiceWins).toBe(1);
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
    // door-mode-insert sits at line 2, col 19. Counts are not learned yet, so walk with single l presses.
    press('l'.repeat(19));
    expect(store.getState().map.engine.cursor).toEqual({ line: 2, col: 19 });
    press('<CR>');
    expect(store.getState().screen).toBe('map');
    expect(store.getState().log.at(-1)?.text).toMatch(/sealed.*:q/);
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

  it('gates notes on their prerequisites', () => {
    const { store, press } = setup();
    press('<CR>');
    press('l'.repeat(28)); // note-ex-wq at (2,28) builds on i
    press('<CR>');
    expect(store.getState().screen).toBe('map');
    expect(store.getState().log.at(-1)?.text).toMatch(/builds on .*i/);
  });

  it('keeps the Boot Sector key in place until every Prologue door is resolved', () => {
    const { store, press } = setup();
    press('<CR>jj');
    press('l'.repeat(47));
    expect(store.getState().progress.collectedKeys).toEqual([]);
    expect(store.getState().log.at(-1)?.text).toMatch(/won't budge/);
    expect(store.getState().map.revealed.has('motion-plains')).toBe(false);
  });

  it('grants the skip-test skills exactly once (mastery box 1)', () => {
    const { store, playSolution } = setup();
    store.getState().startSkipTest();
    playSolution();
    for (const mastery of Object.values(store.getState().progress.save.mastery)) expect(mastery.box).toBe(1);
  });

  it('skip test: no hints, and two failed tries send the player to the Boot Sector', () => {
    const { store, press } = setup();
    store.getState().startSkipTest();
    store.getState().hint();
    expect(store.getState().room?.session.hintsShown).toBe(0);
    press(':q!<CR>');
    press(':q!<CR>');
    expect(store.getState().screen).toBe('map');
    expect(store.getState().log.at(-1)?.text).toMatch(/Boot Sector/);
  });

  it('practice hints are revealed one at a time', () => {
    const { store, press } = setup();
    press('<CR>ll<CR>');
    store.getState().continueLesson();
    store.getState().hint();
    store.getState().hint();
    expect(store.getState().room?.practiceHints).toBe(2);
  });

  it('skipping marks the skill weak and moves the objective on', () => {
    const { store, press, playSolution } = setup();
    store.getState().startSkipTest();
    playSolution();
    store.getState().leaveRoom();
    press('<CR>');
    store.getState().continueLesson();
    playSolution();
    playSolution();
    for (let attempt = 0; attempt < 5; attempt += 1) press(':q<CR>');
    store.getState().showSolution();
    store.getState().newRoomAfterSolution();
    for (let failed = 0; failed < 3; failed += 1) press(':q<CR>');
    store.getState().skip();
    const { progress } = store.getState();
    expect(progress.skippedDoors).toContain('door-motion-hjkl');
    expect(objectiveFor(progress)).not.toMatch(/hjkl/);
  });

  it('saves progress and restores it in a new game', () => {
    const { store, storage, playSolution } = setup();
    store.getState().startSkipTest();
    playSolution();
    const restored = createGame({ solve: noSolver, storage, now: () => NOW });
    expect(restored.getState().progress.collectedKeys).toContain('key-boot-sector');
  });
});
