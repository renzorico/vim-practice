/**
 * The real GameStore (replaces the P2-C stub): routes every key by screen, runs levels through the
 * curriculum runner, records results into mastery, and persists progress.
 */
import { createEngine } from '@escape/engine';
import type { EngineState, Key } from '@escape/engine';
import { emptySave, isUnlocked, recordResult, startLevel, stepLevel, usedSkills } from '@escape/curriculum';
import type { GameStore, Level, LevelRun, SaveData, StorageAdapter } from '@escape/curriculum';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { buildOverworld, OVERWORLD_COMMANDS } from './overworld.js';

const engine = createEngine();

export interface GameDeps {
  readonly levels: readonly Level[];
  readonly storage: StorageAdapter;
  /** ISO timestamp; injected so tests are deterministic. */
  readonly now: () => string;
}

function overworldFor(levels: readonly Level[], save: SaveData): { overworld: EngineState; portals: readonly (string | null)[] } {
  const map = buildOverworld(levels, save);
  return { overworld: engine.init(map.lines, map.start), portals: map.portals };
}

function finishRun(run: LevelRun, save: SaveData, deps: GameDeps): SaveData {
  return recordResult(save, {
    levelId: run.level.id,
    won: run.status === 'won',
    stars: run.stars,
    keystrokes: run.keystrokes,
    usedSkills: [...usedSkills(run.commandLog)],
    finishedAt: deps.now(),
  }, deps.levels);
}

export function createGameStore(deps: GameDeps): StoreApi<GameStore> {
  const initialSave = deps.storage.load() ?? emptySave();

  return createStore<GameStore>((set, get) => {
    const goToOverworld = (save: SaveData): void => {
      set({ screen: { kind: 'overworld' }, run: null, save, ...overworldFor(deps.levels, save) });
    };

    const openPortal = (): void => {
      const { overworld, portals, save } = get();
      const levelId = portals[overworld.cursor.line] ?? null;
      const level = deps.levels.find((candidate) => candidate.id === levelId);
      if (level === undefined || !isUnlocked(level, save, deps.levels)) return;
      set({ screen: { kind: 'level', levelId: level.id }, run: startLevel(level) });
    };

    return {
      screen: { kind: 'title' },
      save: initialSave,
      run: null,
      ...overworldFor(deps.levels, initialSave),

      pressKey(key: Key) {
        const { screen, overworld, run, save } = get();
        switch (screen.kind) {
          case 'title':
            if (key === '<CR>' || key === ' ') goToOverworld(save);
            return;
          case 'overworld':
            if (key === '<CR>' && overworld.mode === 'normal' && overworld.pendingKeys.length === 0) {
              openPortal();
              return;
            }
            set({ overworld: engine.step(overworld, key, { allowedCommands: OVERWORLD_COMMANDS }).state });
            return;
          case 'level': {
            if (run === null) return;
            const next = stepLevel(run, key);
            if (next.status === 'playing') {
              set({ run: next });
              return;
            }
            const updated = finishRun(next, save, deps);
            deps.storage.save(updated);
            set({ run: next, save: updated, screen: { kind: 'result', levelId: screen.levelId } });
            return;
          }
          case 'result':
            if (key === 'r') get().restartLevel();
            else if (key === '<CR>') get().exitToOverworld();
            return;
        }
      },

      restartLevel() {
        const { run } = get();
        if (run === null) return;
        set({ screen: { kind: 'level', levelId: run.level.id }, run: startLevel(run.level) });
      },

      exitToOverworld() {
        goToOverworld(get().save);
      },
    };
  });
}
