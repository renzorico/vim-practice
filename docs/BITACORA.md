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

## 2026-11-13: The Margin merged, the Lowlands built ("I see the point now")
Phase: B | Agent(s): Renzo (playtest), Orchestrator (Opus, design, content, browser checks), Codex/GPT (builds), Claude Sonnet (reviews), Ollama qwen3:14b (Gull's lines) | PRs: #39, #40
Tags: `#eval` `#routing` `#hybrid`

**What:** Renzo played the Margin (one open map, five characters, the `30l` road) and said: "I see the point now, keep going." It merged after a Sonnet review (#39). The Lowlands followed (#40): erased land drawn from tab characters, which Vim's word motions skip, so `w` leaps the gaps; a jetty where `$` outruns the Blots; Continue and New game.

**What the checks caught:**
| Where | Caught by | Problem |
|---|---|---|
| Lowlands design | orchestrator, playing in the browser | `w` from the last stone flew onto the jetty, skipping the `$` lesson and stalling the quest |
| Lowlands design | the solver | `$` from the first tile reached the Lighthouse: road, stones and jetty were one line. Then `5$` did the same from another line (kept as an expert shortcut) |
| Saves | orchestrator in the browser, confirmed by Sonnet | Continue replayed the map but kept mid-stage story, so once-only events (Blots, heals, Bram leaving) never happened again. Rule now: save only at stage entry |
| Quests | Sonnet | a lesson skipped with Vim (`w` past Wren's trigger) stalled the quest; progression now hangs on stage clears, never on lesson steps |
| Ollama | first call | qwen3:14b returned `{}` with `/no_think`; `think: false` plus a JSON schema worked. 6 drafts, 2 used after editing |

**Lesson:** Vim is a speedrunning tool. Any lesson can be skipped by a player who already knows a better command, so levels must be proven by the solver (it finds the skips) and progression must never depend on a lesson being taken.

---

## 2026-11-13: The Lighthouse, World 1's boss
Phase: B | Agent(s): Orchestrator (Opus, design, tower map, sim checks, browser playthrough), Codex/GPT (build, test updates), Claude Sonnet (review) | PR: #41
Tags: `#gates` `#eval`

**What:** The Unwriter's first appearance. Inside the Lighthouse it erases the tower from the bottom, one row per turn (the existing `unwrite` behaviour, no new rules), and the player outclimbs it with counts, `w` and `0`. At the top: the Lamplighter, the first clue ("The Scribe is in another buffer") and statue R. World 1 is now playable from New game to its end.

**What the checks caught:** Sonnet found that `9h` then `10k` jumped over the single trigger cell that starts the erasure, so the boss could be skipped by accident. Same family as the Lowlands bugs: in a game where every motion can jump, a trigger must be a region the player cannot fly over, not a cell. The playthrough also showed the margin was thin (a slow learner reached the Lamplighter 2 turns before his row vanished); the hall gained 4 rows.

**Lesson:** Design rule now: gates and triggers are regions sized for the longest jump the player can make at that point in the game; the solver and a "count skip" test check them.

---

## 2026-11-13: Exact edits (C-1), World 2 unblocked
Phase: C | Agent(s): Orchestrator (Opus, contract, World 2 design, sim prototypes), Codex/GPT (build), Claude Sonnet (review), Ollama qwen3:14b (Quarry lines) | PR: C-1
Tags: `#contract` `#gates`

**What:** The engine now reports the exact text edits every key makes (`StepResult.edits`), and undo/redo report theirs through `Snapshot.edits`. The world sim carries entities, the cursor, marks and fixed tiles through those edits instead of diffing texts around a cursor anchor. This removes the known limit that kept field editing out of Worlds 0 and 1: inside a run of equal tiles, `X`, `db`, `a`, `p`, undo and redo now hit the right Blot. The golden runner checks on every key that the edits rebuild the new text. World 2 design written (`docs/briefs/phase-c/WORLD-2.md`), every mechanic run in the sim first.

**What the checks caught:** Codex stopped on a real contract error: a replace does not always keep length (`r` with an emoji inserts 2 UTF-16 units; `2r<CR>` puts one newline for two characters). Contract fixed. Sonnet fuzzed about 29k sequences with zero edit violations, and found that a `set-rows` effect past the last row changed text with no edit; it now throws as a content error.

**Lesson:** Ask the engine what changed; never infer it from before and after. Builders stopping on a contract contradiction instead of working around it is the process working.

---

## 2026-11-13: The Quarry Road (2-1), the first stage you edit
Phase: C | Agent(s): Orchestrator (Opus, map, design calls, sim probes, browser playthrough), Codex/GPT (build, solver edits), Claude Sonnet (review), Ollama qwen3:14b (Ash and Kit lines) | PR: C-2
Tags: `#gates` `#eval` `#design`

**What:** World 2 begins. The player edits the field for the first time: `4x` eats the rubble in the only cut (the row slides in), `5r=` lays planks over the river. Foreman Ash, Kit, the Scribe's note and a crack that shows an emptier quarry (twist seed). The solver now explores counted `x` and `r`. New retry in every stage: `:e!` reverts to the last save, like Vim.

**What the checks caught:** Before handoff, the solver found `6$` landing on the gate at a row's end and `e` leaping the rubble and the river (word motions only test the landing cell); the rubble became a letter word with blank ground after it and the exit a prop. Codex stopped on a 4-turn `26r=` route; accepted as legitimate (it only uses `r` where the lesson teaches `x`). Sonnet found the real problem: overcounting `x` on the only connecting row slides bedrock into the cut and seals the stage while the player lives. No map prevents that, so the game gained `:e!`. The absolute clear area could also be deleted; the clear now follows the gate entity.

**Lesson:** Once players edit the world, every connecting row can be cut and every absolute area can vanish. Edit stages need a retry and clear conditions tied to things that move with the text, not to coordinates.

---

## 2026-11-13: The Cut (2-2): dd, u, and Dot
Phase: C | Agent(s): Orchestrator (Opus, map, design calls, sim probes, browser playthrough), Codex/GPT (build, solver dd/undo), Claude Sonnet (review) | PR: C-3
Tags: `#gates` `#design`

**What:** One ledge over a long drop, Dot caged at its end, Blots crawling along the ledge. `dd` deletes the line you stand on and everything on it; `u` brings the ledge back, never the Blots. Dot joins ("...out?", then "Again. ...again."). The solver explores `dd`, `u` and `<C-r>`.

**What the checks caught:** Four skips, three found by Codex's solver, one by Sonnet. Jumping past the Blots with a count and taking one hit (the Margin's own trick); `r` paving the drop; `x` sliding the ledge so the cage guards moved aside; `x` on the dirt shifting the cage off its spawn cell. Fixes: three Blots stacked on the only cell next to the cage, the drop and the dirt fixed, and the ledge ending exactly at the cage cell so any `x` removes that cell. `27x` then `u` was accepted: it is the same lesson.

**Lesson:** In an edit world every non-fixed tile is a lever. Decide per stage which rows the player may edit, make everything else fixed, and put the goal on a cell that edits can only destroy, never move.

---

## 2026-11-13: Motion felt "weird, unpredictable and buggy" (camera fix)
Phase: C | Agent(s): Orchestrator (Opus, diagnosis, fix, browser frame sampling), Codex/GPT (review) | PR: #45
Tags: `#playtest` `#bug`

**What:** Renzo's playtest. Root cause: the camera centred on the player's final cell on every frame while the sprite slid there, so each key lurched the whole map at once and the player glided in afterwards (a `30l` snapped the world 30 tiles). The camera now follows the player's ground position on the sprite's clock, and the first frame is drawn synchronously. Measured in the browser: one `l` now scrolls the map -1, -13, -27, -39, -49 px over 80 ms (a tile is 48 px).

**Lesson:** A test pinned the wrong behaviour ("anchors the camera to the final player cell") from the first build, with no reason recorded. Tests that freeze presentation choices need a one-line why, or they protect bugs.

---

## 2026-11-13: The Mason's Shaft (2-3), World 2's castle
Phase: C | Agent(s): Orchestrator (Opus, design, contract `build` and `move-player`, sim probes, browser playthrough), Codex/GPT (build), Claude Sonnet (review) | PR: C-4
Tags: `#contract` `#design` `#gates`

**What:** `dd` does not move you; it moves the world. The player stays on the lip while deleting rows pulls the shaft up; the Mason lays a row above himself every 2 turns; climbing down throws you back. `3dd` and `.` beat him; Dot teaches `.`. Cured, he shows the second carving, statue E lights, "End of World 2". New behaviour `build` in the contract.

**What the checks caught:** Design: a counted `j` lands on the same cell as `dd`, so walls can never force `dd`; the trap on absolute rows uses what only `dd` does. Unlimited building made the last row unclosable; the Mason now builds 6 rows. Sonnet: `x` on the chamber floor deleted the throw-back target and `move-player` silently did nothing, so the shaft could be walked; the floor is fixed stone and `move-player` now falls back to the nearest free cell (contract amended). Playthrough: the shaft looked like the lip; repeatable throw-back areas now draw dark with a wet sheen.

**Lesson:** Any effect that can silently do nothing is a skip waiting to happen. Effects should degrade to the nearest sensible result, and danger zones must be visible before they bite.

---

## 2026-11-14: The Mason's Ledger (2-4), the first text stage; World 2 complete
Phase: C | Agent(s): Orchestrator (Opus, puzzle design proven with the engine, fixes, browser playthrough), Codex/GPT (build), Claude Sonnet (review) | PR: C-5
Tags: `#design` `#gates`

**What:** World 2 ends on pure text, as the masterplan asks: the cured Mason's ledger. Strike the walls (`dd`, `.`), pay the crew (`2x`, `j`, `.`), fix a name (`r`), cut a note (`D`), add a door (`o`). New script panel: goal, buffer, the target beside it with a tick per matching line, hints by key count, `:e!` and closing unsolved restart it. "End of World 2" moved here.

**What the checks caught:** The first proven route used `f`, which is World 3; replaced by `4l`. The linter demanded field turns from a text stage. Sonnet: insert commands had been added to every quarry field stage, so they could be used before being taught; the ledger now has its own command list. The script accepts any Vim command (accepted: Vim freedom, like the field). The mode line now shows only insert and visual modes, like Vim.

**Lesson:** A command list is part of the lesson plan. Give each stage the commands it has taught, not the whole world's.

---

## 2026-11-16 · D-2: `<C-d>`/`<C-u>` and empty rows (PR 48)
**Who:** Opus (World 3 design, contract), Codex (build), Sonnet (review).

**What:** World 3 (Wordwood) is designed (`docs/briefs/phase-d/WORLD-3.md`). Two contract pieces it needs: the engine has `<C-d>`/`<C-u>` with Vim's 'scroll' option (`EngineState.scroll`, `EngineOptions.windowHeight`, default 28; a count sets scroll and keeps it), golden-tested against Neovim 0.11. `Legend.emptyRow` makes an empty row's (line, 0) a real cell, so `{ }` can land in clearings. `Stage.windowHeight` makes `<C-d>` move half of what the player sees.

**What the checks caught:** Sonnet: the script solver ignored the stage's window height; an entity on an empty row was deleted when text was typed there; a fixed clearing could be deleted; a count-set scroll was lost when the move errored; `<C-d>` counts above the window height multiplied solver branches; an empty row without `emptyRow` had become a lint warning. All fixed with tests.

**Lesson:** Measure Neovim before writing the contract. The numbers (half of 28, clamping, counts that stick) went into the brief, and the builder matched them on the first try.

---

## 2026-11-16 · D-1: The Canopy Road (3-1), World 3 begins
**Who:** Opus (design, map, story), Codex (build), Sonnet (review).

**What:** After the Mason's Ledger, the Wordwood. Branches hang in open air; walking cannot cross a gap, but `f t ; ,` only check where they land. `fH` jumps to the ladder across every gap, `,` runs the last find backwards on the next tier, `t@` stops one short of thorns, `fD` reaches the lift. Par 7 (`fH 2j , 2j t@ 2j fD`), proven over every learned motion; the World 1-2 motions need 14. Fern teaches `f`, Dot teaches `,`, a knothole shows the same wood as saplings (twin seed).

**What the checks caught:** Codex relaxed the legend linter for Wordwood; the real error was the legend's tile kinds, which encode Vim word classes (`object` = letters, digits, `_`; `barrier` = punctuation). Fixed the legend, dropped the special case. Sonnet: `3x` deleted the lift's cell (softlock), and `x` misaligned ladders. Every Wordwood tile is now fixed: nothing in this world needs deleting, and with edits inert the par proof is complete.

**Lesson:** When edits are not the lesson, make the world fixed. It removes a whole class of traps and lets the solver prove par.

---

## 2026-11-16 · D-3: The Glades (3-2)
**Who:** Fable (design, map, story), Codex (build), Sonnet (review).

**What:** Below the canopy: four thickets with three clearings between them. A clearing is an empty buffer row, one cell at column 0. `}` drops to the next clearing, `{` climbs back, `gg` is the lookout, `G` the forest floor. Pilcrow the owl sends the player back up to relight the second glade's lamp (`{{`) and to pull the gate rope at the lookout (`gg`), then down again (`G`). Learner route 8 turns; par 4 with `9G` (a line-number jump, real Vim).

**What the checks caught:** In the sim, before the brief: counted old motions teleport as well as `{ }` do (`18$` lands on the last row, counted `b`/`w` stop on empty rows), so this stage cannot halve the old-tools turn count. Accepted and written into the brief: `{ }` win by needing no counting. Sonnet found no bugs; added a test that visiting the lamp glade before Pilcrow asks does not use up its trigger, and stopped a test from pinning the solver's exact keys.

**Lesson:** Landing-only motions make every counted motion a teleport. Design the errand around where the player must go, not around which key gets there.

---

## 2026-11-16 · D-4: The Twin Gates (3-3), World 3's castle
**Who:** Fable (design, map, story), Codex (build), Sonnet (review).

**What:** A hollow tree, 37 rows. Shut keeps the bottom gate, Ope the top; one keeper before the Flicker, each now sure he is alone. The gate marks are real brackets: `%` on Shut's `)` lands on Ope's `(`. A second, inner pair leads to a sealed room (nesting). The hollow has a landing every 6 rows and `Stage.windowHeight` is 12, so `<C-d>`/`<C-u>` move landing to landing; the camera scrolls half a screen like Vim. Errand: light the lower trunk lamp, then the upper, tell Shut, go back to Ope. Statue R. Dot says "attention". Learner route 15 turns; par 8 with `65%`/`33%` (real Vim).

**What the checks caught:** Sonnet: a counted scroll that errored at the buffer edge (`5<C-u>` on the top row) spent no turn but set 'scroll' to 5, so every later `<C-d>` landed in air. The world now treats it like any failed command: nothing changes (this reverses one D-2 review decision; the engine itself still follows Vim). A replay test checked every stage with the Gates command list; it now uses each stage's own (`stageCommands`). The camera's scroll offset went stale after `:e!`, `G`, `gg`; jumps and restores now recentre.

**Lesson:** Hidden state is a trap in a turn game. If a failed command can change something the player cannot see, roll it back.

---

## 2026-11-17 · D-5: The Ferry Manifest (3-4); World 3 complete
**Who:** Opus (design, text, story), Codex (build), Sonnet (review).

**What:** Past the Twin Gates, Semi the ferryman won't sail on a wrong manifest. Pure text, like the Ledger: World 3's motions get you there, World 2's edits fix it. `fo;x` the extra o in the title, `0%` to the passengers' `)` and add the twins, `}3jf2r4` for four coils of rope, `dd` the banned ink, `G f: l D` and `a today.`, `t.` and `a, on three`. The design route is 59 keys, checked in the engine; Codex's par is 57 (`$` instead of `0%` and `t.`). "End of World 3."

**What the checks caught:** Sonnet found no bugs. The par route not using `%` or `t` is accepted: any route that reaches the target clears, and the intro, hints and HUD still teach them.

**Lesson:** In a text stage the target text is the whole contract. Prove one route against it in the engine before writing the brief; the builder then only wires it in.

---

## 2026-11-17 · E-1: World 4 design, text triggers, operators in the solver
**Who:** Opus (World 4 design, contract), Codex (build), Sonnet (review).

**What:** World 4 (Copper Port) is designed (`docs/briefs/phase-e/WORLD-4.md`): operator + motion, put, registers; five stages ending with a text stage. Contract: a `text` trigger fires at turn end when the characters right after an anchor entity spell an exact text (cargo on a shelf); the anchor follows edits. The solver now explores `d`/`y` + motions, `yy`, `p`/`P` with counts, and registers `"a "b "0`, only when a stage has learned them, so every existing proof searches exactly as before.

**What the checks caught:** In the sim, before the brief: `c` opens insert mode, which would let the player write terrain, so `c` is only for text stages; `dt|` lands you on the bollard (bump) while `dw` and `dt.` land on boards; `yyp` lands on the new row's first non-blank. Sonnet: puts could never use a count above the row length, nor be tried on an empty row; operators were paired with `<C-d>`/`<C-u>`, which Vim rejects; an anchor off the map was reported as "deletable". Fixed with tests.

**Lesson:** Prototype the verbs before the stages. The Jetty's real lesson (deleting behind you, which nothing before World 4 can do) only showed up once `d` was tried in the sim.

---

## 2026-11-17 · E-2: The Jetty (stage 4-1), World 4 opens
**Who:** Opus (design, sim proof, brief, browser check), Codex (build), Sonnet (review).

**What:** Copper Port's first stage. Junk is dumped on the jetty behind you; Bitt's cart needs the boards clear, end to end. Boards are fixed and junk is not walkable, so `x`, `r`, `dw` and `dt.` cannot clear it: only `db` from the board just past a pile (then `.`) works, and the boards slide up to you. The goal is a `text` trigger on the cart whose text ends in the pier post, so only a shorter walkway matches. Par 6 (`b db b . 2<C-u> $ <CR>`); learner route 7 turns; World 3 commands find nothing (10 turns, 40,000 expansions). New: `PORT_COMMANDS` (`GATES_COMMANDS` + `d`), the copper-port world, port sprites, a splash-and-slide animation for deleted junk.

**What the checks caught:** In the sim, before the brief: jumps fly over junk (`F.`, `2<C-u>`, `2G` reach anything), so junk cannot be a wall and a ladder-alignment design was dropped; `13r.` paints junk into boards, so the trigger text includes the next fixed tile. Sonnet: clearing before talking to Bitt never set `jetty.asked` (quest step and `d` key caps stuck): the clear now sets it. A full-vocabulary solver test asserted nothing at 200 expansions: removed, with the reason in a comment. CI: the first run hit the 10-minute job timeout (the old-vocabulary search took over 6 minutes on the runner); the bound is now 5,000 expansions, and the job timeout is 20 minutes.

**Lesson:** In a world where jumps only check the landing cell, an edit goal must be a trigger on the text itself, and the text must pin the length, not just the characters.

---

## 2026-11-18 · E-3: The Warehouse (stage 4-2)
**Who:** Opus (design, sim proof, brief, contract change, browser check), Codex (build), Sonnet (review).

**What:** Three bare shelves and a tally (`[oooo]` oil, `[rrr]` rope) that stays put. `y` + motion copies, `p` puts after the cursor: `yw f[ p` stocks the shelf in a rack's row, the middle oil shelf has no rack (the yank is still there: `p` again), and the rope yank replaces the oil, so order matters. Shelves are `text` triggers ending in `]#`; four flag reactions set `warehouse.stocked` on the third shelf in any order. Par 15 (`b 2k l yw f[ p 4h 2j p 4h 2j 3b yw f[ p <CR>`), measured by hand: the session solver runs out of memory before depth 15. New: `WAREHOUSE_COMMANDS` (`PORT_COMMANDS` + `y`, `p`), a HUD "yanked" slot, warehouse sprites, yank glint and put animations. Contract: undo and redo are exempt from the fixed rule (they only revisit legal states), so `u` takes back a put that copied fixed tiles.

**What the checks caught:** In the sim, before the brief: `u` after a put of fixed tiles bumped 'fixed' (only `:e!` could fix it), hence the contract change; a put whose last cell is a shelf lip `]` bumps, so `yf]` cannot overfill; cargo is not fixed so `x`/`u` fix an overfill. Codex: triggers fire at turn end, so a literal `p p` fires on the first `p`; the test uses `2p` (never fires) instead. Sonnet (0 blocking): the old-commands bound took 29 s and its invariant wrapper was unproven: now 1,000 expansions with a step counter (10 s); FieldView read layout on every render in every stage, FieldScene reset tile alpha and rebuilt the warehouse decorations on every frame: all gated. Browser: Ream's "Every shelf" played before "Three coils" (the flag cascade ran before the trigger dialogue): reactions reordered.

**Lesson:** A rule that protects the map must not block undo: undo only goes back to states the player already reached. And the order of story reactions is the order lines play, cascades included.

---

## Parking lot
Ideas that are out of v1 scope, kept so they are not lost:
- Supabase leaderboards and accounts
- Tauri desktop build (fixes `<C-w>` in browsers)
- Regions 6-9: macros, ex commands, windows/buffers, workflows
