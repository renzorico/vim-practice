import { useStore } from 'zustand';
import { solve } from '@escape/curriculum';
import { createGame, type Game } from './game.js';
import { createProgressStorage } from './progress.js';

const game = createGame({ solve, storage: createProgressStorage(), now: () => new Date().toISOString() });

export function useGame<T>(selector: (state: Game) => T): T {
  return useStore(game, selector);
}
