import { beforeEach, describe, expect, it } from 'vitest';
import { parseKeys } from '@escape/engine';
import { DEMO_LEVEL, useGameStore } from './stub.js';

const press = (keys: string): void => {
  for (const key of parseKeys(keys)) useGameStore.getState().pressKey(key);
};

describe('stub game store', () => {
  beforeEach(() => {
    useGameStore.setState({ screen: { kind: 'title' }, run: null });
  });

  it('walks title -> overworld -> level -> result using the real engine', () => {
    press('<CR>');
    expect(useGameStore.getState().screen.kind).toBe('overworld');
    press('<CR>');
    expect(useGameStore.getState().screen.kind).toBe('level');
    press(DEMO_LEVEL.solution.join(''));
    const state = useGameStore.getState();
    expect(state.screen.kind).toBe('result');
    expect(state.run?.status).toBe('won');
    expect(state.run?.stars).toBe(3);
    expect(state.run?.keystrokes).toBe(4);
  });

  it('restarts a level from scratch and returns to the overworld', () => {
    press('<CR><CR>jd');
    useGameStore.getState().restartLevel();
    expect(useGameStore.getState().run?.keystrokes).toBe(0);
    expect(useGameStore.getState().run?.state.pendingKeys).toEqual([]);
    useGameStore.getState().exitToOverworld();
    expect(useGameStore.getState().screen.kind).toBe('overworld');
  });
});
