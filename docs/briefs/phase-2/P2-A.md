# P2-A: level runner, goal checker, constraints, stars
Owns: `packages/curriculum/src/runner/**`

Implement every export listed under "Level runner" in `contracts.ts`, in `runner/index.ts`.
1. `startLevel`: engine state from `level.startLines` / `level.startCursor`; all counters zero; goalsMet computed.
2. `stepLevel`: no-op unless status is 'playing'. Pass `{ allowedCommands: level.allowedCommands }` to `Engine.step` only when defined. Count every key. Append CommandRecords. Store the step's error in `lastError`.
3. `checkGoals`: reach = cursor equals target; transform = lines equal targetLines exactly; collect = register content (`registers[name].text`) equals text; quit = quitRequested, and saved when mustSave.
4. Win/fail: all goals met + all mustUse skills used = 'won' with stars (3 if keystrokes <= par, 2 if <= ceil(par*1.5), else 1). All goals met but a mustUse skill missing = 'failed', 'must-use'. quitRequested in a level without a quit goal = 'failed', 'quit'.
5. `usedSkills`: map CommandRecord ids to catalog skills; any 'motion' record with count !== null adds 'motion.count'. For operator records (id 'd', motion 'w') the motion also counts toward its motion skill.
Tests: at least 40, including: a Prologue-style `:q` level, a reach level won under and over par, a disallowed command producing 'not-allowed' and no movement, must-use failure, quit failure, and no-op after win.
