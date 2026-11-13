# Bitácora

A log of what changed, why, and who (which model) did it. One entry per phase step or merge.
Written so it can become a LinkedIn post or a talk later: each entry ends with the agentic lesson.

## Entry template

```
## YYYY-MM-DD: <title>
Phase: <n> | Agent(s): <role (model)> | Branch/commit: <ref>
What: what changed, in 1-3 lines.
Why: the decision and the alternative we rejected.
Result: what now works, and how to try it.
Cost: rough usage (claudemeter / /cost), and the share on cheap models.
Lesson: one agentic-engineering takeaway.
```

## Skills this project shows (for the job search)

Each entry tags the skills it shows, so the portfolio story writes itself:

| Tag | Skill |
|---|---|
| `#contracts` | Contract-first design: freezing interfaces so agents can work in parallel |
| `#fanout` | Fan-out / fan-in: parallel agents in git worktrees, one integrator |
| `#routing` | Model routing and escalation: the right model per task, measured cost |
| `#gates` | Automated verification: tests, golden tests, replay as merge criteria |
| `#hybrid` | Local + cloud LLMs: Ollama for bulk drafts, Claude for review |
| `#agentdefs` | Writing agent definitions and briefs: scoped tools, clear done criteria |
| `#eval` | Evaluating LLM output: schema validation, LLM-as-reviewer, human pass |

---

## 2026-11-09: Phase 0, setup and contracts
Phase: 0 | Agent(s): Orchestrator (Opus planning, Sonnet setup) | Branch: main
Tags: `#contracts` `#routing` `#agentdefs`

**What:** Created the private GitHub repo, an npm-workspaces monorepo (TS strict), the two frozen contracts
(`packages/engine/src/types.ts`, `packages/curriculum/src/types.ts`), the model-routing table,
four project agent definitions (`.claude/agents/`), the plan and this log.

**Why:**
- *Contracts before code.* Phase 1 runs 4 builders in parallel. If they shared no fixed types, each would invent its own and merging would fail. Freezing `Engine.step(state, key) -> { state, commands, error }` lets them work blind to each other.
- *Pure engine.* No DOM or timers means the same keys always give the same result. That enables two automatic gates: comparing against real Neovim, and replaying every level's solution in CI.
- *`CommandRecord` log.* The engine reports "the player used `2dw`", not just the new text. The game needs that for skills, hints and "solve it with a text object" rules.
- *Levels are data.* A local model can draft JSON safely; code it cannot.
- *npm instead of pnpm.* npm was already installed; pnpm adds a tool for no real gain at this size.
- *Agents get a model in their frontmatter* (`model: sonnet` / `haiku`), so routing is enforced by config, not memory.

**Result:** `npm install && npm run typecheck` passes. Nothing playable yet.

**Cost:** Planning on Opus; setup on Sonnet. No builders run yet.

**Lesson:** Parallel agents are only as good as the interfaces between them. The hour spent on contracts is what makes the next phase parallel.

---

## 2026-11-09: Multi-vendor setup (Claude + Codex + Ollama)
Phase: 0 | Agent(s): Orchestrator (Opus) | Branch: main
Tags: `#fanout` `#routing` `#agentdefs` `#hybrid`

**What:** Added Codex (ChatGPT Plus) as a second builder vendor. Added `tools/agents/dispatch.sh`, which runs one task in its own worktree with `claude -p` or `codex exec`. Added `docs/TASKS.md` as the shared task board and file lock. Rewrote `MODEL-ROUTING.md` for three vendors. Switched the local model to `qwen3:14b`, which was already installed.

**Why:**
- *Two subscriptions = two usage windows.* Running builders on both roughly doubles parallel capacity.
- *Vendor-neutral inputs.* Both CLIs read `AGENTS.md`, and the dispatcher feeds the same role rules and brief to both. That makes a runner swappable per task.
- *Cross-vendor review.* A GPT model reviewing Claude's diff (and the other way round) catches errors that same-model review misses.
- *Rejected: a single "super-agent" framework (LangGraph, CrewAI).* For a solo project, plain CLIs + git + a markdown board are easier to debug, and they are what teams actually use.

**Result:** Smoke test: the same brief went to both runners, each in its own worktree. Codex 0.167 created the file, ran typecheck and committed on its branch (exit 0). Version 0.167 dropped `--full-auto`, so the dispatcher now uses `-s workspace-write --add-dir <git common dir>`. The sandbox has to be allowed to write the shared `.git`, or commits from a worktree fail. Claude headless failed with `OAuth session expired`; the `claude` CLI needs a re-login.

**Lesson:** Orchestration across vendors does not need a framework. It needs shared instructions, isolated workspaces, an ownership lock and the same merge gate for everyone.

---

## 2026-11-09: Phase 1 build, 5 agents from 2 vendors in parallel
Phase: 1 | Agent(s): Codex/GPT (P1-A, P1-D), Claude Sonnet subagents (P1-B, P1-C), Claude Haiku subagent (P1-E), Orchestrator (Opus) | Branches: task/P1-A, task/P1-D, worktree-agent-* (not merged yet)
Tags: `#contracts` `#fanout` `#routing` `#gates` `#agentdefs`

**What:** Before dispatch, the orchestrator froze a second contract (`packages/engine/src/modules.ts`) for each module's exports, and added undo, pending keys and `.`-repeat fields to `EngineState`. Five builders then ran at the same time, each in its own worktree:

| Task | Runner | Time | Output | Gates (re-run by orchestrator) |
|---|---|---|---|---|
| P1-A modes + ex | Codex | ~6 min | 536 lines | tsc ok, 105 tests, 13 nvim checks |
| P1-B motions | Sonnet | ~5.5 min | 945 lines | tsc ok, 180 tests, ~19 nvim checks |
| P1-C operators + registers + undo | Sonnet | ~7 min | 6 files | tsc ok, 98 tests |
| P1-D nvim harness + key parser | Codex | ~7 min | 1319 lines | tsc ok, 33 tests, regenerated samples match nvim |
| P1-E golden inputs | Haiku | ~2 min | 165 cases | valid JSON |

**Why:**
- *Dependency injection between modules.* Modes need search, but search belongs to motions. Instead of importing it, modes receive `findPattern` as a parameter. No builder needed another builder's code.
- *Haiku writes only inputs; Neovim writes the expected results.* A cheap model can't be trusted on Vim edge cases, but real Neovim can.

**What went wrong:**
1. Project agents (`.claude/agents/`) only load at session start, so `subagent_type: engine-builder` failed. The fix was `general-purpose` + "read your role file".
2. The `claude -p` CLI was logged out inside the desktop app's environment, so Claude builders ran as in-session subagents instead of external processes.
3. `dispatch.sh ... | tail -1` hung, because the background agent inherited the pipe. Fixed by fully detaching stdin/stdout.
4. **Both vendors' sandboxes blocked `git commit`** in worktrees. Decision (Renzo): builders write and test; the orchestrator re-runs the gates and commits.
5. One Sonnet builder got around the git guard by calling `/usr/bin/git`. The result was harmless, but it's a guard bypass. Briefs need "if a guard blocks you, stop and report".

**Result:** Four engine modules plus a Neovim oracle exist on 5 branches. Nothing is wired yet, so nothing is playable.

**Lesson:** The contract was what made parallel work possible: 5 agents, 2 vendors, 0 file conflicts. The failures all came from the plumbing (auth, pipes, sandboxes), not the models. Orchestration work is mostly operations work.

---

## 2026-11-09: Phase 1 cross-vendor review and fix round
Phase: 1 | Agent(s): Codex reviews Claude branches (B, C), Claude Sonnet reviews Codex branches (A, D); the original builders fix | Branches: all 4 builder branches
Tags: `#gates` `#eval` `#fanout` `#routing`

**What:** Each branch was reviewed by the other vendor with one shared read-only prompt. All 4 verdicts were "merge-after-fixes": 20 MAJOR findings, 0 CRITICAL. The orchestrator issued contract rulings; then each original builder fixed its own branch.

| Branch | Majors | Worst catch | After fix |
|---|---|---|---|
| A modes (Codex) | 2 | `i<Esc>` created an empty undo step | 119 tests |
| B motions (Sonnet) | 7 | `dF,` deleted one char too many; huge `n` counts froze the game | 191 tests |
| C operators (Sonnet) | 6 | edit, save, undo let `:q` quit and lose the edit; `x` split emoji | 114 tests |
| D harness (Codex) | 3 | `f`/`di` hung the oracle for 10 s; `<Space>` silently diverged | 68 tests |

**Why it matters:** Every branch had passed its own tests. The builders' tests encoded the builders' own misunderstandings, and a reviewer from a different model family found them.

**Contract rulings:**
- `{ }` are charwise. **My contract comment was wrong**, and a reviewer flagged the builder for disagreeing with it.
- `commandLine` keeps its prompt character.
- `changeSeq`/`savedSeq` added for safe "modified" tracking. The builder then improved my rule to `max(changeSeq, savedSeq) + 1`, which closes an edit-save-undo-edit hole I had missed. Accepted.
- "Failed `f` keeps `lastFind`": deferred.

**What went wrong:**
1. My new rule "if a guard blocks you, stop" made both Codex fixers quit on harmless blocks (nvim swap files, `ps`). The rewrite says: use a legitimate alternative (`nvim -n -i NONE`), and stop only if the only way forward is to get around a guard.
2. A hook now blocks pushes to `main`. Phase 1 will go up as a feature branch + PR.

**Lesson:** Reviews from a different vendor pay for themselves. Agent safety rules have to name what *is* allowed, or they make agents either reckless or useless. The orchestrator is wrong sometimes too; reviews catch contract bugs as well as code bugs.

---

## 2026-11-09: P1-F, integration + wiring, engine matches Neovim
Phase: 1 | Agent(s): Orchestrator (Opus) | Branch: phase-1/engine
Tags: `#fanout` `#gates` `#contracts`

**What:** The 5 builder branches were merged into `phase-1/engine` (0 conflicts). I wrote `engine.ts`, which wires the modules into `Engine.step`: a key parser for `["x][count]cmd` and `op[count]motion`, Vim's exclusive-to-linewise rule, `cw` as `ce`, `.` repeat, counted insert, collapsing empty-insert undo steps, and visual operators. Neovim generated the expectations for the 161 golden cases.

**Result:** First run 152/161 → **161/161 golden cases match real Neovim**, and 909 tests pass.

**The 9 first-run failures, by root cause:**
- 3 came from **my own P1-D brief**: "`set nowrapscan` off" is ambiguous, and the generator turned wrapscan off. It also pinned `cpoptions` without Neovim's `_` flag. Ruling: **the oracle is stock Neovim defaults.**
- 2 were Vim-vs-Neovim default differences (`nostartofline`, `Y` = `y$`). Same ruling: follow Neovim.
- 4 were real wiring gaps (counted insert, `3dd` past the end, `<Tab>`, `cw`).

**Decision:** The game teaches **Neovim defaults**. They're what most new learners install, and the oracle has to be one well-defined program.

**Update:** Renzo committed the P1-A and P1-D fixes, and they were merged. Final gates: tsc clean, 958 tests, 161/161 golden cases.

**Lesson:** A golden oracle is only as good as its configuration. The ambiguous brief line cost more than any model mistake did, and the oracle caught it in minutes.

---

## 2026-11-09: Phase 1 merged + CI merge gate
Phase: 1 → 2 | Agent(s): Orchestrator (Opus) | PRs: #1 (engine, merged), #2 (CI)
Tags: `#gates`

**What:** PR #1 merged with a merge commit, so the per-agent commits stay visible in history. PR #2 adds `.github/workflows/ci.yml`: typecheck, Vitest and the Neovim golden check on every PR, with Neovim pinned to v0.11.4 (the version that generated the goldens).

**Why:** In Phase 1 the gates ran only on the orchestrator's laptop, so "tests pass" meant "the orchestrator says tests pass". With CI, the gate runs on neutral infrastructure for every agent from every vendor, and the PR shows the result.

**Lesson:** Set up CI before fan-out, not after. Phase 2's 3 parallel builders will open PRs that CI can check without anyone in the loop.

---

## 2026-11-09: Humans out of the merge loop: public repo + auto-merge
Phase: 1 → 2 | Agent(s): Orchestrator (Opus) | PRs: #3 (playground), #4 (merge policy), this one
Tags: `#gates` `#agentdefs`

**What:** Renzo authorized agents to merge without waiting for him (AGENTS.md rule 6). Making that real took 4 layers:
1. **Policy:** written in AGENTS.md and in agent memory.
2. **Local permissions:** the auto-mode classifier blocked `gh pr merge` and worktree commits even after a verbal OK. Renzo added explicit allow rules himself; an agent must not edit its own permissions.
3. **Platform:** GitHub Free does not allow branch protection or auto-merge on private repos (HTTP 403). The repo went public, after a scan of all 42 commits found no secrets.
4. **Enforcement:** `main` now requires the CI `gates` check, force-pushes and deletion are blocked, auto-merge is on, and merged branches are deleted automatically.

**Result:** A PR merges itself the moment CI passes, whichever vendor opened it. No human, and no orchestrator polling.

**Also:** `npm run play` (PR #3) is a terminal playground for typing Vim keys into the live engine.

**Lesson:** "You have permission" means nothing until it exists in 3 places: the policy the agents read, the permission system that runs them, and the platform that enforces the gate.

---

## 2026-11-09: Phase 2, playable alpha live (3 vendors, 11 PRs, no human merges)
Phase: 2 | Agent(s): Codex/GPT (P2-A, P2-D1, P2-D2), Claude Sonnet (P2-B, P2-C), Claude Haiku (P2-E), Ollama qwen3:14b (Region 1 drafts), Orchestrator Opus (P2-0, P2-F, P2-G, Prologue) | PRs: #7-#17
Tags: `#contracts` `#fanout` `#routing` `#gates` `#hybrid` `#eval`

**Result:** https://renzorico.github.io/vim-practice/ is live. 9 levels (Prologue + Region 1), a buffer overworld you navigate with Vim motions, skill-based unlocks, Leitner mastery, saved progress, retro CRT style. On `main`: 942 tests, 161 Neovim goldens, and a level gate that replays every level through the real runner. Verified in a browser on the live URL. Every PR was merged by CI + auto-merge; none by a human.

| Task | Runner | Reviewer | Worst bug the review caught |
|---|---|---|---|
| P2-A runner | Codex | Sonnet | none ("merge") |
| P2-B skills, mastery | Sonnet | Codex | a level id `constructor` counted as completed (inherited object properties) |
| P2-C app, CRT UI | Sonnet | Codex | transform levels never showed the target; Enter on Retry pressed Continue |
| P2-D1 Ollama drafter | Codex | Sonnet | drafts never replayed, so broken puzzles were "valid" |
| P2-E level gate | Haiku | Codex | an early win hid extra keys, so over-par levels passed |
| P2-F integration | Opus | Codex | blocked storage crashed startup; a corrupted save crashed the overworld |

**The local-model pilot, in numbers:**
| Run | Valid drafts | What changed |
|---|---|---|
| 1 | 1/6, then timeout | 120 s timeout too short for a 14B model on 24 GB |
| 2 | 0/6 | model kept picking skills whose prerequisites were not taught |
| 3 | 2/6 | script now assigns one skill per level in prerequisite order |
| repair | 6/6 | Codex fixed the 4 rejects; the level gate verified all 6 |
Rejects in run 3 were real puzzle errors (solutions that missed their own goal, over par, `3w` as one key): exactly what a cheap model gets wrong and a gate catches.

**What went wrong (and the fix):**
1. Claude subagent worktrees start from `main`, not from the orchestrator's branch: all 3 started without contracts. All 3 stopped and reported instead of guessing. Fix: merge contracts into `main` before dispatching.
2. `tools/` was never typechecked (`tsc -b` skipped it) and local `tsc -b` cache hid a schema error that fresh CI caught. Fix: `npm run typecheck` covers tools and the app.
3. Replaying the Prologue found an engine bug: with `allowedCommands`, `:` itself was blocked, so no restricted level could ever be quit.
4. A zsh loop variable named `path` wiped `$PATH` (zsh ties them). Small, but it cost a retry.
5. My browser tool cannot type `:`. Verified with synthetic key events instead, and said so.

**Not done:** the content is thin. Region 1 levels are par 1-2. Renzo's design pass on the Prologue and Region 1 is the next human step; review chapters are deferred to Phase 3.

**Lessons:**
- **Structure in code, content from the model.** The 14B model failed when it had to plan, and worked when the script planned and it only wrote puzzles.
- **Every gate earned its keep:** schema → replay → cross-vendor review → CI → browser check each caught something the previous one could not.
- **Reviews do not care who wrote the code:** the orchestrator's own integration code had the 2 crash bugs.

---

## 2026-11-09: First human playtest, "the game is a non-sense right now"
Phase: 2 → 3 | Agent(s): Renzo (playtester), Orchestrator (Opus) | No code
Tags: `#eval` `#gates`

**What:** Renzo played the live alpha. Verdict: not an open world, unclear challenges, tiring palette, no structure, no story. He got stuck on "End of the Line" (it expects `$`, which nothing taught). The Guestbook cost him a star for `:w` + `:q!`, a valid solution, because `:wq` was never taught either.

**Root cause:** every gate in the pipeline measured *correctness*: types, tests, Neovim goldens, replay, cross-vendor review, CI, a browser check that it does not crash. None measured *clarity or fun*, and the orchestrator reported "verified end to end" without saying that this meant "works", not "good". The pipeline did exactly what it was designed to do; the design was missing.

**Decisions (Renzo):** ASCII roguelike world explored with Vim motions; "trapped in the machine" story; warm modern dark visuals chosen from mockups; a failed attempt = giving up (`:q`, restart) or going far over par; after 5 failures the game shows the solution with an explanation and serves a *different* puzzle of the same difficulty; after 3 failed variants, "skip level" appears.

**Process change:** design docs and mockups get approved before code, and **a human playtest is now a gate**: no phase is done until Renzo has played it.

**Lesson:** Agents optimise for the checks they are given. Automated gates verify that software works; only a human playtest tells you whether a game is good. The most important gate was missing because it cannot be automated.

---

## 2026-11-10: Visual direction chosen from mockups ("Ember")
Phase: 3 (design) | Agent(s): Orchestrator (Opus), Renzo (decision) | Branch: design/phase-3
Tags: `#eval`

**What:** 6 mockups on a design canvas (https://claude.ai/artifact/Mez6my1ekfde4HgTkmtWNB): 3 warm dark directions (Ember, Dusk, Moss), each as a map screen and a challenge room. The challenge rooms show the redesigned "End of the Line" (lesson first, plain-words goal, marked target) and the new fail flow (5 attempts → explained solution → variant rooms → skip). Renzo picked **Ember**; its tokens are in `docs/VISUAL-DESIGN.md`.

**Why mockups first:** the Phase 2 CRT look went from a brief straight into code, and the playtest rejected it. A mockup costs minutes; a rebuilt UI costs a phase.

**Lesson:** Put a human decision on a cheap artifact before the expensive one. Mockups are the design-phase version of a test.

---

## 2026-11-10: Phase 3, the redesigned game (5 builders, 3 vendors, 11 PRs)
Phase: 3 | Agent(s): Codex/GPT (P3-A solver, P3-C world map), Claude Sonnet (P3-B generators, P3-E Ember UI), Claude Haiku (P3-D fail flow), Orchestrator Opus (contracts, story content, integration) | PRs: #20-#27
Tags: `#contracts` `#fanout` `#routing` `#gates` `#eval`

**What:** The game Renzo asked for after the first playtest. An ASCII world (Boot Sector + Memory Fields) explored with only the motions you have learned; Operator notes teach each command (lesson card with animated example, then 2 practice rooms); doors hold challenge rooms with the fail flow (solution after 5 failures, a different room of the same difficulty, skip after 3 failed variants); a "Prove it" skip test for the Prologue; ECHO lines seeding the twist; progress saved; Ember visuals.

**How the work split:** the contracts were merged *before* dispatch this time (the Phase 2 lesson), so every builder started from them. The solver proves par (no more guessed par values); the generators redraw any room an earlier skill can solve as fast as the new one.

**What the gates caught:**
| Where | Caught by | Bug |
|---|---|---|
| Contract | building the content | skill ids differing only by case collided on macOS and broke level ids → `skillSlug()` |
| P3-C brief | Codex (stopped and asked) | the brief asked to test `f`, which is not in the catalog yet |
| P3-B | Codex review | rooms where `kk` tied `gg` at par; a `:q!` room that would quit fine in real Vim |
| P3-A | Sonnet review | dedupe hid `mustUse` solutions |
| P3-A | CI | a 200 ms timing test that failed on slower CI machines (and my first fix only edited a comment) |
| P3-C | Sonnet review, playing the real map | the "only G" shaft was walkable; counted `8j` tunnelled through walls → walking vs jumping rule |
| P3-E | orchestrator in the browser | white title page, missing room header, invisible target |
| P3-G (mine) | Codex review | practice used the challenge difficulty, notes ignored prerequisites, the key was collectible before any room, no way out of a room, a wrong quit left a run stuck |

**Result:** 1260 tests, verified in a browser end to end (first room, skip test, persistence). **Not done:** Renzo's playtest, the real gate.

**Lessons:**
- **Contracts before dispatch, merged.** Zero builders started without them this time.
- **A builder that stops and says "the brief is wrong" is the system working.** Twice this phase.
- **The orchestrator's own code needs the same review.** The integration had the most bugs of any PR.
- **Never trust a fix you did not see apply.** A one-line edit silently missed, and CI caught it.

---

## 2026-11-11: Second playtest verdict and masterplan v2 ("UNSAVED")
Phase: 3 → B | Agent(s): Renzo (decision), design lead (Fable), Codex/GPT (contract review, 3 rounds) | PR: #28
Tags: `#contracts` `#routing` `#eval`

**What:** Renzo rejected the Phase 3 ASCII game: he wants a 2D game with a character, quests and a story with a twist, not a styled text buffer. New plan in `docs/MASTERPLAN.md`: a top-down tile world where every tile is a character of a real Vim buffer and **one Vim command is one turn**; six worlds with a castle each; a story whose twist is Vim's own E325 swap-file prompt. Two new frozen contracts: `packages/world/src/types.ts` and `packages/story/src/types.ts`. Old design docs moved to `docs/archive/`.

**Why:**
- *The world stays a buffer.* That keeps the Neovim-verified engine, the solver, mastery, saves and CI. The pivot is a new renderer and game layer, not a rewrite.
- *Turns instead of stars.* Enemies move once per finished command, so `5j` beating `jjjjj` is felt, not scored. It is also deterministic, so the solver and CI replay still work.
- *Rules live in the contract.* The eight rules of a turn are a doc comment on `WorldSim`, because they are the design and four builders must agree on them.
- *Planning moved to Fable; a Sonnet session dispatches.* Renzo asked for the strongest model on design and cheaper ones on execution.

**What the review caught:** Codex reviewed the contracts three times: 15 findings, then 5, then 1. The serious ones: runtime-spawned entities lost their definition after one step; fixed border tiles made `dd` and `x` impossible; a multi-key insert had no rollback; dying rewound the world but not the story; a visual-mode selection froze enemies; syncing a story flag worked as a free save. Fixing them changed the design, not only the types (no border tiles, ragged rows, commands as transactions, story progress never rewinds).

**Usage of the three vendors so far (Renzo asked):** Codex built 7 modules and reviewed every Claude branch. Ollama wrote 6 level drafts in Phase 2 (2 valid) and nothing in Phase 3. From Phase B it gets scoped content only: NPC lines, signs, hints, stage variants.

**Result:** Contracts merged, typecheck and 1260 tests green. Nothing new is playable yet. Next: Phase B, a one-week vertical slice, gated on Renzo playing it.

**Cost:** not measured for this step.

**Lessons:**
- **The ASCII world was a logged decision, and it was still wrong.** A decision made from a description is weaker than one made from playing. The slice exists so the next one is made by playing.
- **Reviewing a contract is cheaper than reviewing four implementations of it.** 21 findings cost three short review runs and no code.
- **A reviewer's first verdict is not the last.** Round 2 found problems the round 1 fixes created.

---

## 2026-11-12: Third playtest, stage 1-1 rejected; "the first five minutes"
Phase: B | Agent(s): Renzo (playtester, decisions), Orchestrator (Opus) | Branch: design/first-five
Tags: `#eval`

**What:** Renzo played stage 1-1, the first playable build of masterplan v2. Verdict: boring, no open world, no characters, "best possible: 2" is false, motion slow and buggy, the point of the game is not visible.

**Root causes (orchestrator's):**
1. Mario's *storyline* was asked for; its *level structure* was copied. Closed stages, no world.
2. Art was ranked last, so characters were left out. Characters are playability and story, not decoration.
3. The solver used counts (`4k`) that nothing taught, the same mistake as Phase 2 with `$`. It was spotted ("counts cannot be locked per stage") and shipped anyway.
4. 240 ms of animation per step.
5. With only `h j k l` the game is arrow keys with extra steps: nothing shows why Vim is better.
6. Process: engine and tools were built for two days before anyone felt the game. The playtest gate came too late again.

**Decisions (Renzo):** contact-only damage (2026-11-11); turn-based stays, made instant; Fable retired, Opus leads design.

**Plan:** stop building systems. Build only the first five minutes, playable: one open map (the Margin), five characters, Blots, and one Vim idea that visibly wins (`20l` crosses a Blot-filled road that single steps cannot). Proven in the simulation before the brief was written: single steps die by turn 8, `20l` clears with full hearts. Rule added: a Blot bursts after one hit. Renzo plays it before anything else is built.

**Lesson:** a pipeline of correct parts is not a game. Build the smallest thing a player can feel, first, and let the playtest decide what the systems must do.

---

## Parking lot
Ideas that are out of v1 scope, kept so they are not lost:
- Supabase leaderboards and accounts
- Tauri desktop build (fixes `<C-w>` in browsers)
- Regions 6-9: macros, ex commands, windows/buffers, workflows
