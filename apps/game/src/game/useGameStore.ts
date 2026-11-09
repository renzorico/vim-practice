import { useStore } from 'zustand';
import type { GameStore } from '@escape/curriculum';
import { LEVELS } from './levels.js';
import { createLocalStorage } from './storage.js';
import { createGameStore } from './store.js';

const gameStore = createGameStore({
  levels: LEVELS,
  storage: createLocalStorage(),
  now: () => new Date().toISOString(),
});

/** React binding for the real store; same selector API the stub had. */
export function useGameStore<T>(selector: (store: GameStore) => T): T {
  return useStore(gameStore, selector);
}
