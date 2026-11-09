/**
 * Stub GameStore with one hard-coded demo level, so the UI is playable before P2-F wires the real
 * runner, skills and save data. It uses the real engine. UI components never import this file
 * except through `useGameStore`; P2-F swaps the implementation behind the same GameStore shape.
 */
import { createEngine } from '@escape/engine';
import type { EngineState, Key } from '@escape/engine';
import type { GameStore, Goal, Level, LevelRun, SaveData, Stars } from '@escape/curriculum';
import { create } from 'zustand';

export const DEMO_LEVEL: Level = {
  id: 'demo-1',
  region: 'motion-plains',
  type: 'golf',
  title: 'Trim the word',
  intro: 'A stray word is jamming the terminal. Cut it out with as few keys as you can.',
  startLines: ['the quick bad fox', 'jumps over the lazy dog'],
  startCursor: { line: 0, col: 0 },
  goals: [{ type: 'transform', targetLines: ['the quick fox', 'jumps over the lazy dog'] }],
  teaches: ['motion.word'],
  requires: [],
  par: 4,
  solution: ['w', 'w', 'd', 'w'],
  hints: ['Move to the word "bad" with w.', 'dw deletes from the cursor to the start of the next word.'],
};

export const OVERWORLD_LINES: readonly string[] = [
  '=== ESCAPE : THE OVERWORLD ===',
  '',
  '   [ Motion Plains ]',
  `   > ${DEMO_LEVEL.title}`,
  '',
  '   Move with j and k. Press Enter on a level to enter it.',
];
const OVERWORLD_PORTALS: readonly (string | null)[] = [null, null, null, DEMO_LEVEL.id, null, null];
const OVERWORLD_START = { line: 3, col: 3 };

const LEVELS: readonly Level[] = [DEMO_LEVEL];
const engine = createEngine();

const EMPTY_SAVE: SaveData = { version: 1, completed: {}, mastery: {} };

function goalMet(goal: Goal, state: EngineState): boolean {
  switch (goal.type) {
    case 'reach':
      return state.cursor.line === goal.target.line && state.cursor.col === goal.target.col;
    case 'transform':
      return state.lines.length === goal.targetLines.length && state.lines.every((line, i) => line === goal.targetLines[i]);
    case 'collect':
      return state.registers[goal.register]?.text === goal.text;
    case 'quit':
      return state.quitRequested && (!goal.mustSave || state.saved);
  }
}

function starsFor(keystrokes: number, par: number): Stars {
  if (keystrokes <= par) return 3;
  return keystrokes <= Math.ceil(par * 1.5) ? 2 : 1;
}

function startRun(level: Level): LevelRun {
  const state = engine.init(level.startLines, level.startCursor);
  return {
    level,
    state,
    status: 'playing',
    keystrokes: 0,
    commandLog: [],
    goalsMet: level.goals.map((goal) => goalMet(goal, state)),
    lastError: null,
    stars: 0,
    failureReason: null,
  };
}

/** Minimal stand-in for P2-A's stepLevel (no mustUse support: the demo level has none). */
function stepRun(run: LevelRun, key: Key): LevelRun {
  if (run.status !== 'playing') return run;
  const result = engine.step(run.state, key, run.level.allowedCommands ? { allowedCommands: run.level.allowedCommands } : undefined);
  const goalsMet = run.level.goals.map((goal) => goalMet(goal, result.state));
  const keystrokes = run.keystrokes + 1;
  const hasQuitGoal = run.level.goals.some((goal) => goal.type === 'quit');
  const won = goalsMet.every(Boolean);
  const failed = !won && result.state.quitRequested && !hasQuitGoal;
  return {
    ...run,
    state: result.state,
    keystrokes,
    commandLog: [...run.commandLog, ...result.commands],
    goalsMet,
    lastError: result.error,
    status: won ? 'won' : failed ? 'failed' : 'playing',
    stars: won ? starsFor(keystrokes, run.level.par) : 0,
    failureReason: failed ? 'quit' : null,
  };
}

function overworldState(): EngineState {
  return engine.init(OVERWORLD_LINES, OVERWORLD_START);
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: { kind: 'title' },
  save: EMPTY_SAVE,
  run: null,
  overworld: overworldState(),
  portals: OVERWORLD_PORTALS,

  pressKey(key: Key) {
    const { screen, overworld, portals, run } = get();
    switch (screen.kind) {
      case 'title':
        if (key === '<CR>' || key === ' ') set({ screen: { kind: 'overworld' } });
        return;
      case 'overworld': {
        const portalId = portals[overworld.cursor.line] ?? null;
        const level = LEVELS.find((candidate) => candidate.id === portalId);
        if (key === '<CR>' && overworld.mode === 'normal' && level) {
          set({ screen: { kind: 'level', levelId: level.id }, run: startRun(level) });
          return;
        }
        set({ overworld: engine.step(overworld, key).state });
        return;
      }
      case 'level': {
        if (!run) return;
        const next = stepRun(run, key);
        set(next.status === 'playing' ? { run: next } : { run: next, screen: { kind: 'result', levelId: screen.levelId } });
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
    if (!run) return;
    set({ run: startRun(run.level), screen: { kind: 'level', levelId: run.level.id } });
  },

  exitToOverworld() {
    set({ screen: { kind: 'overworld' }, run: null });
  },
}));
