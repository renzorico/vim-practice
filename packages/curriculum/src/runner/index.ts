import { createEngine } from '../../../engine/src/engine.js';
import type { CommandRecord, EngineState } from '@escape/engine';
import { SKILLS } from '../catalog.js';
import type { CheckGoalsFn, LevelRun, Stars, StartLevelFn, StepLevelFn } from '../contracts.js';
import type { SkillId } from '../types.js';

const engine = createEngine();
const TWO_STAR_PAR_MULTIPLIER = 1.5;

export const checkGoals: CheckGoalsFn = (goals, state) => goals.map((goal) => {
  switch (goal.type) {
    case 'reach':
      return state.cursor.line === goal.target.line && state.cursor.col === goal.target.col;
    case 'transform':
      return state.lines.length === goal.targetLines.length
        && state.lines.every((line, index) => line === goal.targetLines[index]);
    case 'collect':
      return state.registers[goal.register]?.text === goal.text;
    case 'quit':
      return state.quitRequested && (!goal.mustSave || state.saved);
  }
});

export function usedSkills(log: readonly CommandRecord[]): ReadonlySet<SkillId> {
  const used = new Set<SkillId>();
  for (const command of log) {
    for (const skill of SKILLS) {
      if (skill.commands.includes(command.id)
        || (command.kind === 'operator' && command.motion !== null
          && skill.id.startsWith('motion.') && skill.commands.includes(command.motion))) {
        used.add(skill.id);
      }
    }
    if (command.kind === 'motion' && command.count !== null) used.add('motion.count');
  }
  return used;
}

export const startLevel: StartLevelFn = (level) => {
  const state: EngineState = engine.init(level.startLines, level.startCursor);
  return {
    level,
    state,
    status: 'playing',
    keystrokes: 0,
    commandLog: [],
    goalsMet: checkGoals(level.goals, state),
    lastError: null,
    stars: 0,
    failureReason: null,
  };
};

function score(keystrokes: number, par: number): Stars {
  if (keystrokes <= par) return 3;
  return keystrokes <= Math.ceil(par * TWO_STAR_PAR_MULTIPLIER) ? 2 : 1;
}

export const stepLevel: StepLevelFn = (run, key) => {
  if (run.status !== 'playing') return run;
  const { level } = run;
  const result = level.allowedCommands === undefined
    ? engine.step(run.state, key)
    : engine.step(run.state, key, { allowedCommands: level.allowedCommands });
  const next: LevelRun = {
    ...run,
    state: result.state,
    keystrokes: run.keystrokes + 1,
    commandLog: [...run.commandLog, ...result.commands],
    goalsMet: checkGoals(level.goals, result.state),
    lastError: result.error,
  };
  if (next.state.quitRequested && !level.goals.some((goal) => goal.type === 'quit')) {
    return { ...next, status: 'failed', failureReason: 'quit' };
  }
  if (!next.goalsMet.every(Boolean)) return next;
  const skills = usedSkills(next.commandLog);
  if (level.mustUse?.some((skill) => !skills.has(skill))) {
    return { ...next, status: 'failed', failureReason: 'must-use' };
  }
  return { ...next, status: 'won', stars: score(next.keystrokes, level.par) };
};
