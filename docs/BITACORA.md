# Bitácora

A log of what changed, why, and who (which model) did it. One entry per phase step or merge.
Written so it can become a LinkedIn post or a talk later: each entry ends with the agentic lesson.

## 2026-11-27 · World 2 redesign: Quarry Road, Cut, Shaft; runs stop at rock on their own row
**Who:** Opus (design, build, solver proofs). Renzo: "Start World 2".

**Path rule, same row:** word and line-end runs (`w b e W B E 0 ^ $`) now find a clear path on their own row too, not only when they leave it: gaps are hopped, rock is not. The solver found `e` crossing eight cells of Quarry bedrock (`,` and `#` are both punctuation, one Vim word) for a 3-turn clear. `movement.ts` drops the `crossesLines` guard; finds (`f t`) still cross anything on a row. Three stages hopped solids on a row: the Warehouse, Customs and Counter crate lips (`]`, and the Customs nets) are now gap tiles, so their routes stand; the Gallery's `3w` over bedrock is gone and its par goes 5 to 6 (`# w # w # e`, found by the full solver).

**Solver:** the state key holds `lastChange` only when `.` is allowed. Without it, every no-op `r` forked every state. And (Codex review) a counted run or find stopped trying counts at the first one that bumped, so `3e` was never tried after `2e` hit rock: proofs missed routes. New limit `skipBumpedCounts` lets a search skip that many bumped counts in a row; exact proofs (Lowlands, Lighthouse, Quarry, Cut, Shaft) pass 10. The default stays 0, because scanning every count ran the Canopy and Jetty proofs out of 4 GB in CI.

**Ladders, again:** with exact counts the solver found three more holes. A run may not start on a ladder now (climb off first): from the Lowlands ladder bottom, `4e` wrapped into the next row and skipped the `b` room, and the Lighthouse cleared in 6 with `41b`. The Canopy's `H` ladders get `climb` (a `19e` cleared it in 4, par 7). After the fix the Lowlands solver's own best route is the stored one, `2b` included; Lighthouse par stays 7.

**Quarry Road** (par 3 to 10, `allowedCommands` `h j k l w b e 0 $ x r`): a shaft drops onto a boulder in the road. `4x` on the gravel slides the whole row west, boulder and all, until open road lies under the shaft (only `4x` or `5x` works; `:e!` undoes a wrong count). At the river, `5r=` from the bank meets the stairs on the far side; `5x` would drag the far bank and its stairs four columns west of the flight above. The clear needs Ash, the Scribe's note and the gate. Camp, passages and yard are packed earth (fixed), so only the road and the bank can be edited; the river is no longer a gap, so no run hops it; the stairs are their own fixed, climbed tile, so no single `r` letter paves bank, river and stairs. **Proof:** a search through the story runs out of memory, so `quarry-finalize` searches the plain world for the gate room alone (talks take no turns, the story adds no world effects): 10 turns (33 min with exact counts). Opt-in (`PROVE=1`); CI replays the route.

**Cut** (par 4 to 6, `allowedCommands` `h j k l w b e 0 $ dd u <C-r>`): Dot's cage is in a pit below the ledge's far end, and the stage clears back at the start (cols 1-7: a run from the pit lands at col 0). `dd` wipes the Blots, `u` restores the ledge, walk out and free Dot (a new wave pours onto the ledge), then `<C-r>`: it deletes the ledge again and puts the cursor back where the `dd` was, at the start. Walking back takes two turns. Proven by the solver with and without `<C-r>`.

**Shaft** (par 3 to 6): three drops of loose boards over three rows of wet mortar (not walkable), each ending on a fixed beam. `4dd` on the boards, `j`, `.`, `j`, `.`, then the Mason. A fixed beam stops one long `dd`; a short one would leave you on mortar. The throw-back trigger is gone. New keycap: `<C-r>` once Dot is free; the ledge dialogue itself now teaches `dd u`. `.` ties with retyping `4dd` (a turn each); the par route uses it but turns cannot force it.

**Lesson:** a stage whose edits leave many possible texts can't be proven by a full search; design the editable cells to be few (fixed ground everywhere else) and prove a lower bound on a relaxed goal.

---

## 2026-11-27 · World 1 redesign: Margin, Lowlands, Lighthouse
**Who:** Opus (design, build, solver proofs, browser check). Renzo: "Start World 1", after the challenge audit.

**Rule:** a redesigned stage's par route needs every key the stage teaches. `apps/game/src/play2/challenge.test.ts` checks it for each stage in its `REDESIGNED` list (now Margin, Lowlands, Lighthouse); it fails on the Glades today (`{ } gg` skipped). `commandsIn` moved out of the audit test into `audit/commandsIn.ts`.

**Lowlands** (par 4 to 11, proven by the solver over every Lowlands key, `allowedCommands` now `h j k l w b e $`): four rows of stones joined by ladders. Row 1 has two-cell stones and the ladder hangs from a stone's start (`3w`); row 2 has long stones and the ladder hangs from the next stone's end (`2e`); row 3 is a dead end east, the way down is back west (`2b`); row 4 runs out to the far side (`3e`, walk), then the Scribe's note and `$` along the jetty. The door also needs `lowlands.knows-w`: Wren is a required first step of the quest, not a skippable aside. New story beats teach `e` (the long stones) and `b` (Wren shouting across the field).

**Ladders are climbed, not leapt:** new `climb` flag on TileDef (frozen contract, changed by the design lead). A word or line-end motion leaving its line may not pass a climb tile, so a counted `8e` can't fall down a ladder and skip a row. Without it, the path rule let gaps carry runs straight down the ladder columns.

**`0` moves to the Lighthouse**, where the route already needs it (the stair starts at the far left of row 5); a new landing line teaches it and sets `lighthouse.knows-zero` for its keycap.

**Margin:** start moved to (7,12), so the Elder is west and the route needs `h` (`5h 4k`, Elder, `7j 4l`, Mira, `3k 28l`). Par stays 6: it is the first stage.

**Lesson:** a path rule alone is not a level design. Blank ground that a run may cross also lets a count cross whole rows; the fix was a tile that says how it is crossed (on foot), not another global rule.

---

## 2026-11-26 · Challenge audit
**Who:** Opus (tool, run, report). Renzo: "Start the audit".

**What:** `apps/game/src/play2/audit/challengeAudit.test.ts` (off in CI) probes each stage in the real session: every allowed motion with counts 1-40 and one-character searches, then one more motion, then a talk; any clear under par is a shortcut. It also reads each par route for the stage's taught keys and talks. A full solver search over late vocabularies was tried first and needed more than 4.5 GB per stage; the probe needs 150 MB and 1-2 s. Checked against the old Gallery map: it finds `?y<CR>`, 1 turn against par 6.

**Findings** (`docs/audit/2026-11-26-challenge-audit.md`): no shortcut within two moves and a talk after the path rule; seven stages clear in 4 turns or fewer; par routes skip taught keys (Lowlands `w`, Shaft `.`, Glades `{ } gg`, Gates `<C-d> <C-u>`); many characters are optional. Text stages not audited.

---

## 2026-11-26 · Path rule: counted runs stop at walls; Lowlands and Gallery
**Who:** Opus (diagnosis, design, build, browser check); Codex (found the Gallery's other shortcuts). Renzo: "5$ ... without talking to the other character... that's not how you learn" and "path rule".

**Root cause:** a motion lands where Vim puts the cursor and the world checked only the landing square. Any square was one or two counted motions away: `5$` cleared the Lowlands in 1 turn past three characters, `23e` the Gallery. Pars were proven on cut-down vocabularies (the Gallery's on `* w e`), so nobody saw it.

**Rule (packages/world, sim/movement.ts):** a word or line-end motion (`w b e W B E 0 ^ $`, any count) that leaves its line needs a clear path: either L-shaped route round one corner, with no solid tile on it. Gaps (water, river, the drop, void, blank ground, open air, the hollow: new `gap` flag on TileDef, frozen contract, changed by the design lead) can be crossed; the space past a row end is solid. Walks (`hjkl`) keep their step check. Unchanged on purpose: same-row moves (`f[`, the Lowlands stone hops), searches and marks, and the structural leaps `G gg % { } <C-d> <C-u>` that Gates and Glades are built on. A first, stricter version (every jump) broke 90 tests across 20 stages: their puzzles are leaps over barriers.

**Lowlands:** the door needs `lowlands.crossed` and a new `lowlands.read-note` (the Scribe's note on the jetty), with a new objective step for the note. Par 1 to 4 (`5e 5$ 15h <CR> $`). Still open: a counted `e` hops past Wren's `w` lesson.

**Gallery:** allows only `h j k l w b e 0 $ * # n N`; the last room's walls are punctuation found nowhere else, so `*`/`#` reach it only through `key`. Par 6 to 5, now proven with every allowed key (a `#` wrap route; the intended `*` chain earns two stars). A learned command a stage switches off says "/ does nothing here."; the status bar lists only keys that work.

**Glades** now needs its own keys: Wordwood motions alone find no route within 8 turns.

**Tests:** 5402 passed. New: path rule unit and field tests; Lowlands shortcut blocked and door locked; Gallery shortcuts (Codex's five) fail and no route under par.

---

## 2026-11-26 · DR-caves: Copybook drills for World 6
**Who:** Opus (design, build).

**What:** Four skills for the Echo Caves: Search, Search for this word, Marks, Visual selections. Every world now has Copybook drills. Not drilled: `` ` ` `` (engine bug after `G`), `V` (counted `dd`/`yy` beat it), `<C-d>`/`<C-u>` (need a windowed buffer). The solver check is budgeted by allow-list size and par instead of a fixed par cap. Notes in DRILLS.md section 14.

**Tests:** 233 drill tests, 0.67 GB peak; 61 game drill and App tests.

---

## 2026-11-26 · DR-library: Copybook drills for World 5
**Who:** Opus (design, build).

**What:** Five text-object skills for the Library: Word, Paren, Paragraph, Bracket and tag, Quote objects. Short reps of every skill are now solver-checked when generated; the drill test's "starts solved" check works for the first time. Notes in DRILLS.md section 13.

**Tests:** 204 drill tests, 0.6 GB peak.

---

## 2026-11-26 · DR-copper: Copybook drills for World 4
**Who:** Opus (design, build, browser check).

**What:** Five skills for Copper Port: Delete with a motion (`dw d2w df`), Copy and put (`ye y2e p`), Named registers (`"a "ap`), Change (`cw C`), Copy and move lines (`yy P`). The drill page now stacks the target under the buffer (it was cut off side by side). Design notes in DRILLS.md section 12.

**Tests:** 165 drill tests. The solver caught `D p .` beating `y$ j $ p` and `yy <C-u> P` beating `yy gg P`; both reps were redesigned.

---

## 2026-11-26 · DR-wordwood: Copybook drills for World 3
**Who:** Opus (design, build, browser check).

**What:** Five skills for the Wordwood: Find a letter (`f t`), Find again (`; ,`), Paragraphs (`{ }`), File ends (`gg G`), Matching bracket (`%`). They appear in the Copybook under The Wordwood and on the clear cards of the Canopy, the Glades and the Gates. `<C-d>`/`<C-u>` wait for a windowed buffer (DRILLS.md section 11).

**Tests:** every generator wins on par for 200 seeds x 3 difficulties; the solver finds nothing shorter; a new check that every skill's par uses its own keys (it caught `,` reps where `0` or `3b` won, 4 in 100, now 0 in 300).

---

## 2026-11-26 · DR-polish: the Copybook as a page, and a title menu with a reason
**Who:** Opus (diagnosis, design, build, browser check).

**Why:** Renzo on the live site: the Copybook was empty, looked "too AI and boring", and the title menu order "seems weird and random".

**Root causes:** P-35 turned `.script-panel` into a dark desk with paper sheets; the Copybook list and drill buttons sat on the desk in ink, so they were invisible. Separately, older saves record progress in `best` and `entries` but not always in `story.clearedStages`, so the list had no cleared stages to draw from.

**What:** The Copybook is a copybook page on the desk: binding holes, a red margin line, ruled rows, keys as large keycaps, skills grouped by world in teaching order, five mastery dots and a word (new, fading, kept), and a red "next" note in the margin beside the weakest skill (selected on open). Drills sit on the same page; the key count turns red over par; rep dots are green when clean. Cleared stages now also come from best scores and any stage before the furthest reached. Title menu: Continue · Stages, Copybook (play on) · Keys, Intro (learn) · New game · Sound, with a gap between groups.

**Tests:** clearedForCopybook, nextSkill, skillStatus; App menu tests updated for the new order.

---

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

## 2026-11-18 · E-4: Customs (stage 4-3)
**Who:** Opus (design, sim proof, brief, browser check), Codex (build), Sonnet (review).

**What:** Registers. Crate 1 sits behind nets on the oil rack's row: `yw` the oil, `3w db` the nets, and now the unnamed register holds the nets (`p` bumps: the cursor would land on a net), so `"0p`. Crate 2 wants oil then rope and the rope rack is far: `"byw` carries the rope (a named yank leaves `"0` alone). Par 16 by hand (`j l "byw h 4k l yw 3w db f[ "0p 8h 2j f[ "0p "bp <CR>`); without `"` the best route is 20 (one extra trip). Goals are `text` triggers on the customs post and the crate; `customs.nets-gone` fires on the `db` so Dot teaches `"0p` at the right moment. New: `CUSTOMS_COMMANDS` (`WAREHOUSE_COMMANDS` + `"`), the register prefix gated before 4-3, a HUD register list (`"`, `"0`, named), customs sprites, a step cache in the session solver.

**What the checks caught:** In the sim, before the brief: floor `_` is a word character, so `__nnn__` was one word and `db` could not isolate the nets (floor is `.` again); with the rope rack on crate 2's row registers saved almost nothing, so it moved to the far row. Sonnet: the old-commands bound ran 4.7 M steps in 20 s (counted operators fan out inside one expansion, so maxExpanded does not cap steps): now 5 turns / 300 expansions, 4.6 s. Accepted as intended: the `"` prefix is rejected in every stage before customs (a command list is the lesson plan); keys that leave a command pending skip the story engine. Browser: par route 16 turns, 3 hearts, plain `p` after `db` bumps, no console errors. Nit for the art pass: customs walls and floor are close in contrast.

**Lesson:** A solver bound in expansions is not a bound in time when one expansion can hold thousands of counted commands: measure steps, not nodes.

---

## 2026-11-22 · E-5: The Counterfeiter (stage 4-4, World 4's castle)
**Who:** Opus (design, sim proof with the clerk emulated, contract, brief, review fixes, browser check), Codex (build), Sonnet (review).

**What:** The clerk copies a fake crate after himself every 2 turns (new behaviour `put`); at eight fakes he files his count and the attempt is lost (new story-driven effect `hit` 3, then the normal retry). Before that, fill three crates on one row: 8 oil, 8 rope, 4 and 4. Counts on `p` are the lesson: `"ayl` and `"byl` on the way down, then `"a8p "b8p "a4p "b4p`. Par 12 (6 fakes); with `.` 14; without registers 18, so the fuse (turn 16) wins. One `text` trigger covers all three crates so a retry cannot leave a stale story flag. Engine: a count before a register (`8"ap`, `3"ayl`) as in Vim, with Neovim goldens. HUD ledger gauge; statue D; the copper-port world gets its castle.

**What the checks caught:** In the sim, before the brief: a chasing clerk was no pressure (every `p` moves you along the growing shelf); per-crate story flags would survive a death. Codex: `restore` keeps fired triggers, so a `once` fuse would never fire on attempt 2 (the brief was wrong): the fuse is repeatable, and the first firing kills, so there is no double hit; the stage type is `castle`. Sonnet (0 blocking): on the winning turn the fuse line still queued after the win: the fuse reaction now has `unless counter.through`, with a test; the old-commands bound ran 3.6 M steps near its 5 s timeout: now 3 turns / 50 expansions, 1.3 s; the 9 golden cases were not proven against Neovim: regenerated with `--force` (all unchanged), plus 5 cases that `f"`, `t"`, `r"`, `""p` and a lone `3"` still parse as before. Browser: the camera followed the player only, so the clerk was off screen: in a castle the camera now shifts sideways to keep the keeper in view when both fit (never vertically: `<C-d>` scrolling is a lesson). Accepted: `u` takes back the clerk's puts, at one turn each.

**Lesson:** A pressure mechanic must be checked against what the lesson's own commands do to the player: a put moves you, so a chaser cannot catch someone who is putting.

---

## 2026-11-23 · E-6: The Harbourmaster's Ledger (stage 4-5), World 4 complete
**Who:** Opus (design, engine proof, brief, browser check), Codex (build), Sonnet (review).

**What:** World 4's text stage. The clerk's ledger is still the port's word: `ct,` renames the keeper, `G dd gg P` pins the Lighthouse order on top (only `P` can put above the first line), `ddp` sorts the crates, `cw` then `b .` turns "copied" into "real" three times (the words share a column on purpose: `.` repeats the whole change), `C` rewrites line tails, `yyp` + `ct,` adds a ship. Par 100 (Codex found `3wct,rope boat`, 4 keys under the brief's 104); the World 1-4 tools without `c`, `C`, `P`, `yy` need 133. New: `HARBOUR_COMMANDS`, Cleat the harbourmaster, "End of World 4."

**What the checks caught:** In the engine, before the brief: `P` did not win while the order went above CRATES (`gg3jP` and `gg2jp` cost the same), so it moved to the very top. Sonnet: 0 blocking; the "different order" test is weak and the start reaction's `unlock-stage` follows the Manifest's pattern. Browser: the route solves, the ending plays to "To be continued", no console errors (synthetic keys faster than about 100 ms apart were dropped by the script panel: a test-harness limit, not a player one).

**Lesson:** A command only teaches if the map makes it win: design the one spot where the old tool costs more.
## 2026-11-23 · F-1: Text objects in the engine and the solver (World 5 opens)
**Who:** Opus (engine survey, brief, golden check, review fix), Codex (build), Sonnet (review).

**What:** Text objects after `d`/`c`/`y` and in `v`/`V`: `iw aw iW aW`, quotes, `( [ { <` pairs (with `b`/`B` aliases), `it at`, `ip ap`; counts as Vim (`2daw`, `d2aw`, `d2i(`); `.` repeat; a failed object is an engine error with no change. `CommandRecord`: id `diw`, motion `iw`. Solver: `d`/`y` with objects, counts 1-3, gated on the Library and later. 391 Neovim goldens. Suite 38 s to 32 s.

**What the checks caught:** Survey before the brief: no object parsed at all, and `viw` gave a wrong result. Golden check: regenerated with `--force`, byte-identical. Sonnet (0 blocking): the "no change, no dot command" rule Codex added for failed objects applied to every `d`; Neovim (new golden) makes even a no-op `d0` the dot command, so the rule is now scoped to text objects. Added goldens for `"adiw`/`"ayiw`, `vi(`/`vi"` on empty pairs and `di<Esc>`.

**Lesson:** When a rule is added for a new case, golden-test it on an old case too: the engine change was right for objects and wrong for motions.

---

## 2026-11-23 · F-2: The Stacks (stage 5-1), World 5 opens
**Who:** Opus (design, sim proof, brief, browser check, legend fix), Codex (build), Sonnet (review).

**What:** The Library's first stage. Shelves are text: books are words, gaps are real spaces, dust words sit between books. From the gallery, `j` drops into the middle of a dust word; `daw` takes it and its space wherever you stand, and the shift of each delete lines the cursor up over the next shelf's dust, so `j .` repeats down the stack. `diw` leaves a double gap and the shelf's text trigger rejects it. Par 6 (`j daw j . j . <CR>`); without text objects 9. New: `STACKS_COMMANDS`, the library world, Quire, library sprites, a dust puff.

**What the checks caught:** In the sim, before the brief: `dw` from a word's start equals `daw`, so the stage needed arrivals in the middle of a word (vertical drops); the solver cannot reach depth 6 even on 10 commands, so par is a replay test. Sonnet (0 bugs): the gap tile was authored as `barrier`, against the contract (a space is `ground`), and Codex had added a linter exception for it: the legend is fixed and the exception removed. Browser: 6 turns, 3 hearts, no console errors.

**Lesson:** When a builder adds an exception to a check, the input is usually wrong: fix the content, not the linter.

---

## 2026-11-23 · F-3: The Reading Room (stage 5-2)
**Who:** Opus (design, sim proof, brief, review fixes, browser check), Codex (build), Sonnet (review).

**What:** One long floor row with chains held by shackles, real brackets: `w` lands inside a chain and `da(` takes it with both shackles; a chain in a chain goes with `d2a(`; Folio's own chain is `di(`, leaving the open shackle `()`. One text trigger on the door post checks the whole row. Par 6 (`w da( w d2a( w di( <CR>`); without bracket objects 9 (`%` + `d%`, `dt)`). New: `READING_COMMANDS`, Folio, reading room sprites, chain clatter.

**What the checks caught:** Codex stopped on three things. The shackles were authored as `object`, against the contract (punctuation is `barrier`): the legend is fixed (the same mistake as the Stacks gap: the design lead now checks tile kinds before handing over content). Two tests had wrong expectations: `da(` on Folio's chain is cancelled by the sim (his cell would slide under the cursor), which is the right outcome, and Quire's closing lines play before the stacks cutscene. Codex also doubted the solver bound; `solveStage` does build moves from the given vocabulary, so the bound stands (the wall-time assertion was dropped as flaky). Sonnet: 0 blocking. Browser: 6 turns, 3 hearts, no console errors. Known: Dot's `d2a(` line plays after the room is clear, too late to help (parking lot).

**Lesson:** Check content against the contract's tile-kind convention before writing a brief: the linter catches it, but only after a builder has spent a run on it.

---

## 2026-11-23 · F-4: The Archive (stage 5-3)
**Who:** Opus (design, sim proof, contract, brief, review fixes, browser check), Codex (build), Sonnet (review).

**What:** Paragraphs are blocks of rows between blank rows. You start inside a misfiled block: `dap` lifts it with its aisle, `}` finds the aisle after the bibles, `p` files it; `gg 2j yap G P` puts a copy of the atlases above the bottom rail. `dip`/`yip` leave the aisle out and fail. Contract: a `text` trigger's text may contain `\n` and then matches across rows, so one anchor checks the order of whole blocks. Par 8; without paragraph objects 10 (count the rows). New: `ARCHIVE_COMMANDS` (adds `ip ap`, and `P`, `yy` to the field), Index, row folding.

**What the checks caught:** In the sim, before the brief: a row with a fixed cell cannot be deleted, so block rows are all cargo; with no blank row under the top rail, `yap` copied the rail too. Sonnet (0 blocking): the multi-row check joined the whole rest of the buffer at every turn end: it now joins only the rows the text can reach; a wall-time assertion (flaky on CI, as the Stacks one was) is dropped. Browser: 8 turns, 3 hearts, no console errors.

**Lesson:** No wall-clock assertions in tests that CI runs: bound the work (steps, expansions) and log the time.

---

## 2026-11-23 · F-5: The Notary (stage 5-4, World 5's castle)
**Who:** Opus (design, sim proof, brief, review fix, browser check), Codex (build), Sonnet (review).

**What:** The vault. The Notary signs a clause `"s" ` after himself every 2 turns (World 4's `put`); at seven the attempt is lost (`hit` 3). Three locks by the stair: `da[`, `da{`, `dit` from inside, `0 2j w` between them. One multi-row text trigger on the vault anchor checks all three. Par 11 (5 clauses); without these objects 15, and the fuse fires at 14. HUD clause gauge, statue Q, the library's castle.

**What the checks caught:** In the sim, before the brief: fighting him with `da"` loses to his signing rate, and `dt.` would wipe all his clauses with World 4 tools, so his row is out of reach and the castle is about the locks. Sonnet (0 blocking): the wax-melt effect and the seal-ribbon tile were chosen by hard-coded map rows; both now read the content (the deleted text, the enclosing braces). Browser: 11 turns, 3 hearts, the ending and statue Q, no console errors.

**Lesson:** Scene code keyed on map coordinates breaks silently on the next map edit; key it on the text.
## 2026-11-23 · G-1: Block visual, search operators, search and marks in the solver (World 6 opens)
**Who:** Opus (engine survey, contract, brief, golden check, review fixes), Codex (build), Sonnet (review).

**What:** `<C-v>` block visual with `d x c y p r I A` (contract: `RegisterValue.blockWidth` marks a blockwise register); operators with search motions (`d/pat<CR>`, `c/`, `y/`, `d?`) with `.`; the solver searches single map characters, `n N * #`, and one mark, gated on the Echo Caves. 195 Neovim goldens (178 + 17 from review). Suite 38 s to 34 s.

**What the checks caught:** Survey: `<C-v>` with any operator and `d/pat` failed. Codex stopped at the contract check (block put needs the register type): the design lead added `blockWidth`. Golden check: regenerated with `--force`, byte-identical. Sonnet: operator searches refused to wrap, unlike plain `/` and Neovim (wrapscan in the golden config), and a test pinned that: fixed, test now asserts Neovim's result; `d'a` upward snapped to column 0 where Neovim keeps the column (`nostartofline`): fixed; Sonnet's visual-mode switching "bug" did not reproduce in goldens (its probe was wrong): five switching goldens now pin it.

**Lesson:** Turn a reviewer's suspicion into Neovim goldens before fixing anything: here they confirmed two bugs and refuted the third.

---

## 2026-11-23 · F-6: The Founding Contract (stage 5-5), World 5 complete
**Who:** Opus (design, engine proof, brief, review fix, browser check), Codex (build), Sonnet (review).

**What:** World 5's text stage: the contract every chain came from, all inside `<contract>`. `ci"` + `.` on three seals, `ci(` on nested brackets (`ct)` stops at the inner one), `ci[`, `dap` strikes a clause, `cit` from the `<name>` tag only (from outside it rewrites the whole body: the trap), `cip` names the Minotaur for World 6. Par 163 (Codex found `3G$` for the second party, 4 under the brief); 189 without text objects. "End of World 5."

**What the checks caught:** In the engine, before the brief: `.` repeats the last change, so the seals had to follow the first `ci"` directly (after `cit`, `j.` re-ran `cit` and rewrote the contract); `gg` keeps the column, so `0` before `f`; my key tokenizer read `<citTilde<Esc>` as one key (fixed: only `<Esc>` is special). Sonnet: the trap test asserted the engine's output for `cit` on a multi-line tag, which differs from Neovim (Neovim joins the tags): the test now asserts only the lesson, and the gap is parked. Browser: route solves, ending plays, no console errors; long lines clip at the panel edge (parked).

**Lesson:** A test must never pin an engine result that Neovim contradicts: assert the lesson and park the gap.

---

## 2026-11-23 · G-2: The Mouth (stage 6-1), World 6 opens
**Who:** Opus (design, sim proof, brief, review fixes, browser check), Codex (build), Sonnet (review).

**What:** The Echo Caves begin in the dark: only cells near the player are drawn (Manhattan radius 3, faded edge; drawing only, the sim is unchanged). Three crystals sit in sealed pockets (a walking reachability check proves it); they light from the deepest up. `?x<CR>` wraps back to the deepest, `n` climbs to the next, `l` and `<CR>` to the Echo. Par 4. New: `MOUTH_COMMANDS` (`/ ? n N`), the echo-caves world, darkness, crystals, the Echo.

**What the checks caught:** In the sim, before the brief: a counted `w` also reaches the crystals in one turn (they are the only word characters); accepted, because a player cannot count words in the dark. Sonnet (0 blocking): a test pinned the solver's failure on the full vocabulary (it would break when the solver improves): removed, par stays proven on the focused vocabulary; the crystal cells were hard-coded in the scene: lights now come from the stage's single-cell `enter` triggers; darkness was wired to the Mouth only: a `DARK_STAGES` table lets the next caves reuse it. Browser: 4 turns, 3 hearts, no console errors.

**Lesson:** A test asserts behaviour, never the current limit of a tool.

---

## 2026-11-23 · G-3: The Echo Gallery (stage 6-2)
**Who:** Opus (design, sim proof, brief, review fix, browser check), Codex (build), Sonnet (review).

**What:** Sealed chambers of carved words; each chamber names the next word. `*` searches the whole word under the cursor, so it skips decoys that contain it (`inkwell`, `maps`, `keys`); on the `=` before a word, `*` takes the next keyword on the line (Vim). Par 6 (`* w * w * e <CR>`); `/ink<CR>` stops on the decoy first. Dark, via `DARK_STAGES`. New: `GALLERY_COMMANDS` (`* #`), carved-letter tiles.

**What the checks caught:** Sonnet (0 blocking): a full-vocabulary solver test guarded every assertion with `if (result)` and so asserted nothing at its bound: removed (par is proven on the focused vocabulary). Browser: 6 turns, 3 hearts, no console errors.

**Lesson:** A test whose assertions all sit behind a condition the run never meets is not a test.

---

## 2026-11-23 · G-4: The Marked Way (stage 6-3)
**Who:** Opus (design, sim proof, brief, review fix, browser check), Codex (build), Sonnet (review).

**What:** A fork in a tunnel of plain floor and two sealed pockets: search gets you in, nothing searchable gets you out. `ma` at the fork, `/o<CR>` to the oil, `/x<CR>` straight on to the crystal (Codex's route: no trip home in between), `` `a `` home, `<CR>` to the Echo. Par 4 (the brief said 5). A small flag marks the marked cell. New: `MARKED_COMMANDS` (`m`, `` ` ``, `'`).

**What the checks caught:** Codex: `'a` (to the mark's line, first non-blank) lands on rock at column 0 in this map, unlike the brief's claim; Vim's behaviour kept. Sonnet (0 blocking): a test asserted an upper bound on solver steps (a solver limit, again): removed. Browser: 4 turns, 3 hearts, no console errors.

**Lesson:** The design lead's claims about Vim need the same check as the builder's: `'a` and `` `a `` differ.

---

## 2026-11-23 · G-5: The Minotaur (stage 6-4, World 6's castle)
**Who:** Opus (design, sim proof, brief, review fixes, browser check), Codex (build), Sonnet (review).

**What:** The labyrinth, darker than the caves above. The Minotaur is never seen: his hoofprints fill the top row (`put` "M" every 2 turns); at six he finds you (`hit` 3). Three rune levers sit in sealed chambers; each has a false copy ahead, and the real one lies behind you, so `?` beats `/`. `ma` on the stair, `?x ?y ?z`, `` `a `` home. Par 5 (2 prints); with `/`+`n` 8; fuse at 12. Being stuck in a chamber without a mark ends in the fuse and a clean retry. Statue A.

**What the checks caught:** First prototype (a patrolling Minotaur with decoys) was weak pressure in a turn-based game: dropped. Codex: the levers are chained through story flags, which survive a death (the E-5 trap, in the design lead's own brief): a retry here restarts the stage from its entry story. Sonnet: that was hard-coded on the stage id in the shared retry path: now an explicit `RESTART_ON_RETRY` set with the reason, and the generic fix parked; a test pinned a solver step limit: removed. Browser: 5 turns, 3 hearts, statue A, no console errors.

**Lesson:** Puzzle state that must reset on death belongs in the world, not in story flags; until the session checkpoints story too, say so where the exception lives.

---

## 2026-11-23 · G-6: The Scribe's Study (stage 6-5), World 6 complete
**Who:** Opus (design, engine proof, brief, fixes, browser check), Codex (build), Sonnet (review).

**What:** The Scribe's study, without the Scribe. Her index is a table of eight rows: `<C-v>7j9ld` strikes the shelf column, `<C-v>7j$cfound<Esc>` marks every row found, `<C-v>7jI* <Esc>` stars them, and the drafts of the Last Page go. Par 35 (Codex: `w` for `$b`, `3dd` for `V2jd`); 81 without visual mode. Her note under the index points to the Last Page. "End of World 6."

**What the checks caught:** In the engine, before the brief: a block of `9l` spans ten columns, so the per-row route needs `d10l`; with few rows `cw` + `j.` keeps up with block mode, so the index has eight rows. Codex stopped on story validation: one ending line was too long for the box: split into two beats, wording kept; then the stage-list and full-game tests were updated for the new stage. Sonnet: 0 blocking. Browser: the index solves with real Ctrl-v key presses, ending to "To be continued", no console errors.

**Lesson:** Write dialogue to the box width: the validator measures it, and a builder cannot reflow the design lead's words.

---

## 2026-11-23 · P-1: Parking-lot fixes
**Who:** Opus (brief, golden check, review fix), Codex (build), Sonnet (review).

**What:** Engine: `cit`/`dit` on a tag whose content spans lines now match Neovim; a no-op change (`d0` at column 0, `dl` or `x` on an empty line) makes an empty undo entry, as Neovim does. 43 Neovim goldens (regenerated with `--force`: byte-identical). Script panel: no wrapping; it scrolls sideways to keep the cursor in view (now before paint). Reading Room: Dot's `d2a(` hint plays after the first chain, not after the last.

**What the checks caught:** Sonnet (0 blocking, about 120 extra Neovim probes): the panel scrolled after paint (one frame off-screen): now a layout effect. Parked: empty objects (`di"` on `""`, `dit` on `<a></a>`) and `dh`/`db` near column 0 still differ from Neovim on `u`; the cursor after undoing `cit`/`cat` lands at the original position, not the change start; the panel's narrow-width layout is only tested with mocks; the Reading Room hint is missed if the nested chain goes first (by design).

**Lesson:** Parity work finds more parity work: pin every reviewer probe as a golden before calling a family done.
## 2026-11-23 · H-1: The Last Page (the finale) and the endings
**Who:** Renzo (chose the undo-timing finale), Opus (design, sim proof, brief, review fixes, browser check), Codex (build), Sonnet (review).

**What:** The finale is the E325 dialog, damaged: a typo, a doubled word, two swapped lines. The Unwriter tears the doors row off every third turn; `u` brings it back only when his tear is the most recent change, so the rhythm is `u` right after he tears, then two turns of repair. When the page is whole (a multi-row text trigger) he stops: the Scribe is reading. R then `:w` writes the file: `"folio.txt" 4096L written`, "You are not erased. You are written.", UNSAVED, and a finished save (New game only). D folds back: Continue restores the Study. Q and A return the dialog; O and E are not hinged yet. Par 15. `:w` now works in every field stage, as MASTERPLAN says.

**What the checks caught:** In the sim, before the brief: `u` undoes the player's own repair when it is more recent (the heart of the finale, kept); a tear on the `:w` turn would spoil the `saved` clear, so the Unwriter is removed once the page is whole. Sonnet: the finale's state lives in story flags, so `:e!` or a death after the page was whole kept the doors open on a torn page (the E-5/G-5 class, a third time): `last-page` joins `RESTART_ON_RETRY`, with a test; the glyph texture was swapped for every cell on every render in every stage: now only when it changes; the delete fallback could carry the finale's flags back to the Study: stripped. Browser: both endings played end to end, no console errors.

**Lesson:** The third time a class of bug appears, fix the class: story state must be checkpointed with the world (parked as the next session task).

---

## 2026-11-23 · S-1: Story state is saved with the world
**Who:** Renzo (asked for it), Opus (design, contract, build, browser check), Sonnet (review).

**What:** Dying (or `:e!`) now sends the player back to the last save, story included, as MASTERPLAN 3.4 says. Contract: `Checkpoint` also holds flags, solved scripts and fired triggers, and `restore` brings them back (it used to keep them); the `:w` checkpoint is stored after the turn's triggers ("the very end of that turn"). Session: `storyCheckpoint` is taken at stage entry and whenever the world stores a checkpoint, restored with it (learned skills excepted), and the world's flags are re-synced from it. `RESTART_ON_RETRY` is gone: the Labyrinth and the Last Page reset through the general rule.

**What the checks caught:** A first, story-only restore failed: the world kept its fired triggers, so a retried lever never fired again; the contract itself said restore keeps them. Sonnet: effects deferred in the dying turn were still applied after the restore, so their reactions (now un-fired) would run them twice: dropped; the `:w` checkpoint was taken before the turn's triggers, so a same-turn trigger sat outside the save while the story counted it: moved after; a debug log line in a test: removed. Browser: Labyrinth fuse death, retry at 0/6 prints with 3 hearts, the first lever works again.

**Behaviour change (accepted):** in stages without a `:w`, a death reverts everything since stage entry: once-only hints and dialogues replay, lamps and levers must be redone. Playtest it.

**Lesson:** A rule that holds in one layer and not the other is worse than either rule: restore everything together, or nothing.

---

## 2026-11-23 · P-2: Engine undo parity
**Who:** Opus (Neovim goldens first, brief, review fixes), Codex (build), Sonnet (review).

**What:** The undo snapshot now records where the change starts (Neovim's cursor after `u`), and a usable empty object (`di"` on `""`, `dit` on `<a></a>`, `di(` on `()`, `di[` on `[]`) makes an empty undo entry, as Neovim does. Backward deletes (`dh`, `db`, `d0`, `d?`, `dF`, `d{`, `d'a`, backward visual `d`) and change-start undo (`cit`, `cat`, `dit .`) match. 65 new Neovim goldens (14 written before the build to define the target, 45 by Codex, 6 from review), all regenerated with `--force`: byte-identical. No stage's par changed.

**What the checks caught:** Sonnet: the rule applies to every operator, not only `d`/`c`: six more Neovim goldens pin the backward cases it named (all pass). `gU` and `>` are not engine commands at all (the keys fell through as `g`, `U`, `i`), so they are not pinned. Field effect: in the Jetty and Customs, `u` after `db` now lands on the restored junk (unwalkable) and bumps, so a junk delete cannot be undone there. Accepted: every pile must be deleted anyway.

**Lesson:** Write the target as Neovim goldens before the builder starts: thirteen red tests are a better brief than a paragraph.

---

## 2026-11-23 · P-3: Script panel layout, checked in a real browser
**Who:** Renzo (asked for the check), Opus (browser check and fix).

**What:** The Founding Contract's panel at 1280, 680 and 375 px wide: no page overflow at any width; at 375 the buffer scrolls sideways and follows the cursor. Three fixes: the number column is now fixed-width (`content-box`: the global `border-box` reset let the 16px padding eat the `ch` width, so two-digit line numbers pushed lines 10+ one column right); it is sticky with its own background, so numbers stay put while text scrolls under them, as in Vim; and the view returns to the first column whenever the cursor fits there (`0` used to stop at 41px, hiding the numbers), with the cursor kept clear of the sticky gutter.

**What the checks caught:** Only a real browser showed the misaligned lines and the half-home scroll: the component tests mock every rect (Sonnet had flagged that in P-1).

**Lesson:** Layout tests with mocked geometry prove the logic, not the layout: look at it at three widths.

---

## 2026-11-23 · P-4: Feel (movement, jumps, bumps, input carry-over)
**Who:** Renzo (played it: "the motion of the character feels buggy"), Opus (diagnosis, brief, browser check), Codex (build), Sonnet (review).

**What:** Movement timing moved into pure functions in `scene/animate.ts`. Walks (the world's `walk` style, so counted `hjkl` too) glide with no arc: 110 ms for one cell, +40 ms per extra cell, 420 ms cap, ease-out, a small bob. Jumps arc in proportion to distance (6-20 px), 160-360 ms with ease-in-out, a three-ghost trail over the skipped cells and a landing squash inside the jump's clock. Bumps lean 4 px toward the blocked cell and puff dust. A command that arrives mid-move starts from the drawn ground position, at most one cell behind the previous destination, so held keys glide instead of stuttering; unfinished keys, cancelled counts and insert-mode typing no longer cut a move short or freeze the sprite. Actors idle on their own phases (600 ms), water on a shared 900 ms clock. Edits got 180 ms instead of 90. Reduced motion still snaps.

**Why it felt buggy:** every move played in 60 or 90 ms (`30l` crossed 30 cells in 90 ms), any move over one cell was drawn as a hop, bumps were a 2 px shake nobody saw, every key snapped the sprite to its last destination, and the whole map flipped its idle frame on one shared tick.

**What the checks caught:** Sonnet's review found the first carry-over capped against the new cursor, so `l` then `G` teleported to one cell before the landing; insert-mode typing froze the sprite; bumps and edits mid-move still snapped. Fixed with regression tests. In the browser (before the fix round): one step 110 ms, `3l` 190 ms with no arc, six rapid `h` with no snap-back, `w` over 12 cells 340 ms with arc, squash and a trail that clears.

**Lesson:** "Buggy" can mean too fast. Measure the drawn position frame by frame before touching logic.

---

## 2026-11-23 · P-5: The game's text, rewritten
**Who:** Renzo (played it: "texts are kind of non-sense and not relatable"), Opus (brief, review), Sonnet (rewrite).

**What:** Every dialogue, quest title, objective and hint in `packages/story/content` and the stage `hints`, rewritten to rules in the brief: each box gives a goal, a key, a character beat or a joke; goals name what is on screen; keys are taught as see, key, result; intros have at most three boxes before you can move. The "Dot means:" device is gone: the Scribe's notes (`Note:`) explain, and Dot keeps one-or-two-word echoes where they read as callbacks. Named people got a want and a habit (Wren apologises, Foreman Ash is dry, the Elder fears being "unsaved"). Plot, cast, twist seeds, ids, triggers and the fixed lines (E325, "The Scribe is in another buffer.", `"folio.txt" 4096L written`) are unchanged. 56 files, 493 lines out, 363 in.

**What the checks caught:** The builder could not run tests; the orchestrator ran them (typecheck, 4,266 tests, build). Key instructions the builder was unsure about (Shaft `10dd`, Glades `{`, Gates `%`, Customs `"0p`, Labyrinth `?x`) were checked against each stage's `solution`.

**Lesson:** Text is a mechanic: an instruction box is only as good as the key it names. Check every one against the replayed solution.

---

## 2026-11-23 · P-7: Characters (portraits with moods, distinct sprites, livelier dialogue)
**Who:** Renzo (played it: "characters are too plain"), Opus (brief, browser check), Codex (build).

**What:** 27 new 32x32 portraits drawn as pixel strings, shown at 96 px in the dialogue box: 19 main characters with three moods (neutral, worried, glad), 8 villagers with one. A pure `moodFor` picks the mood from an override table, then words of loss or threat, then gladness. Field sprites redrawn so no two speakers share a body; Tilde got a scarf (the `~`) that flutters. The dialogue box shows each speaker's name in their accent colour and reveals text at 60 characters a second as a visual layer only: Enter advances exactly as before, screen readers get the full line at once, reduced motion shows it all.

**What the checks caught:** Rebased onto P-5's rewritten text, five mood tests pinned moods of the old wording; updated to the new lines (each checked by reading it). A rendered grid of all 65 portrait frames in the browser: readable and distinct, moods subtle (mostly the mouth).

**Lesson:** Render the whole cast side by side before judging pixel art; one portrait at a time hides look-alikes.

---

## 2026-11-23 · P-6: Show, don't tell; reward par
**Who:** Renzo (played it: "poor designed and explained"), Opus (brief, browser check), Codex (build), Sonnet (review).

**What:** Landing markers: each stage's new motion keys (up to 4) are run speculatively on a copy of the world each turn, and the key's label is drawn on the cell it would land on; a key's marker retires after 3 uses, and none show while a command is pending or a dialogue is open. A blocked turn says why in the footer for 1.5 s (one plain line per `BumpReason`; search misses keep Vim's E486). The HUD shows `Turn 3 · par 5`. Every field stage now ends on a card: stars (3 at par, 2 up to 1.5 x par, else 1), turns against par, hearts, the par route as key caps when you missed it, Enter to continue, `r` to replay from the stage entry. The best result per stage is saved (optional `best` in the save; old saves load; New game keeps it) and the title shows total stars. Text stages have no par, stars or best.

**What the checks caught:** `glades-finalize` (a 200,000-state solver proof) already peaked at 4.42 GB on main, at the edge of Node's default heap; the first build kept motion-use counts in the Session, which the solver keeps per state, and the worker ran out of memory. Counting moved to presentation state; peak back to 4.42 GB. Sonnet's review also found free stars for text stages, an f/t marker drawn on the player, markers recomputed on every render, and replay keeping the replayed stage in `clearedStages` (so its stage-cleared quest condition was already true); all fixed with tests. In the browser: markers for `0`, `e`, `w` on the Lowlands, "No landing here." on a blocked `h`, the card with three stars, replay to turn 0, best saved, and the `w` marker retired after three uses.

**Lesson:** Anything on the Session is multiplied by the solver's state count: keep presentation state out of it.

---

## 2026-11-23 · P-8: Sound
**Who:** Opus (brief, browser check), Codex (build), Sonnet (review).

**What:** Every turn now sounds like what happened, all synthesized with Web Audio (no files, no dependency): steps (capped), a jump whose pitch rises with distance and a landing timed to P-4's jump duration, bump and fixed-stone knocks, delete crunch, put pop, undo and redo swishes, hit, death, a clear jingle, a trigger chime and a search miss. A pure `cuesFor(events)` picks at most three cues per turn by priority (jump and landing count as one). Dialogue blips every three revealed characters with a pitch per speaker (one per line with reduced motion; none for system lines; a paper rustle for the Scribe's notes); the stage-clear card chimes once per star. Sound is on at low volume, toggled on the title and by a footer speaker button, saved in `localStorage`; no letter key mutes (every letter is Vim).

**What the checks caught:** Sonnet found the sound buttons kept focus after a click, so the next Enter toggled sound instead of starting the game or advancing a dialogue; the first cue after the first key was lost while the audio context resumed; an old-Safari `resume()` could mute the whole session; cue offsets ignored reduced motion. All fixed with tests. In the browser: one context, every oscillator started was disconnected, no errors.

**Lesson:** A button you click keeps the keyboard: in a keyboard-only game, controls must not take focus from the mouse.

---

## 2026-11-23 · P-9: First-minute clarity
**Who:** Opus (played a new game, brief, browser check, arrow redraw), Codex (build), Sonnet (review).

**What:** Three things a new player could not tell on the Margin's first screen. Which one is me: Vim's cursor is drawn on Tilde's cell (a block outline in Normal mode, a bar in Insert, an underline after an operator), blinking at 1 Hz, steady with reduced motion, following the drawn sprite. Where to go: `objectiveTarget` resolves the main quest's current step to a cell (a trigger condition directly; a flag condition through the reactions that set it, at most three hops, guards honoured) and a bobbing arrow marks it, at the screen edge when off screen; none in the dark caves, where finding things is the lesson. Why I'm already failing: the Margin has no par, stars or best (`stageScoring.ts`, with the text stages). The footer says "Hold Tab to see the file".

**What the checks caught:** The first arrow was a 3 px chevron that vanished against a roof; redrawn as an outlined triangle. Codex stopped to ask: the Margin's steps complete on flags, not triggers, so the arrow needed the reaction chain. Sonnet: ungated quest-step sources, per-render target computation, per-frame texture lookups, the cursor trailing the idle bob and staying on a dying sprite, and an import cycle; fixed.

**Lesson:** Play the first minute as a stranger: the gaps are not bugs, they are questions nobody answers.

---

## 2026-11-23 · P-10: Stage select
**Who:** Opus (brief, browser check), Codex (build), Sonnet (review).

**What:** The title has a Stages menu: every stage grouped by world, with its stars (or "-" when unscored or not yet played), selectable once reached (`j`/`k` skip locked rows, Enter plays, Esc or `q` return). The save stores each stage's entry story the first time it is reached (`entries`, optional, write-once, filtered to known stage ids); playing an earlier stage starts from that entry with the current skills and best, and its clear card returns to Stages. Continue's furthest progress is never rewritten by a replay; the furthest stage plays exactly like Continue, and a finished game stays finished. The Margin is always playable. New game keeps `best` and starts `entries` over.

**What the checks caught:** Sonnet found New game carrying the old run's entries, and picking the furthest stage after the recover ending replacing the finished story (Continue would then resume the Last Page). Fixed with tests. The browser showed the Margin locked for saves made before entries existed. `glades-finalize` peak memory unchanged (4.42 GB): the Session gained only a `startAt` function.

**Lesson:** Every new way into a stage is a new way to overwrite the save: test each entry path against a finished game.

---

## 2026-11-23 · P-11: Text stages get a wider buffer
**Who:** Opus (playtest, fix).

**What:** On text stages the buffer column takes 3/5 of the width (was half) and the target column 2/5 (still at least 22ch); the gap is 32px. At 1024px the Ledger's longest row (`Mira ....... unpaid  (owed since the Last Saving)`) no longer hides behind a scrollbar. Below 680px the columns still stack.

---

## 2026-11-24 · P-12: `:help`, a reference for every key you have learned
**Who:** Codex (build, stopped by its usage limit after the code was complete), Sonnet (review), Opus (brief, fixes, browser check).

**What:** `:help<CR>`, `:h<CR>`, F1 or the footer link open a list of the keys learned so far, newest world first, each with a plain description and a before/after example that a test runs through the real engine. `j`/`k` scroll, `/` filters, `q` or Esc closes. The title screen has a "Keys" item. The command is caught before the session, so no turn is spent.

**Review fixes:** script replays lock input again before the help check; opening help drops a half-typed `:h`; a held `q`/Esc no longer leaks into the game after closing; focus never returns to a button, which would have swallowed Enter. `glades-finalize` peak: 4.41 GB (unchanged).

---

## 2026-11-24 · K-1: Spanish (and other) keyboards can type every key
**Who:** Opus (found while diagnosing the Quarry, fix), Sonnet (review).

**What:** The game dropped every key typed with Option or AltGr, so on a Spanish ISO layout `{ } [ ] # @ |` did nothing and the later worlds could not be finished. Punctuation typed with Option (macOS) or AltGr (elsewhere) now reaches the game; real Alt and Ctrl+Alt shortcuts stay with the browser. Dead keys (`` ` ``, `^`, `~`) are resolved from the physical key and the active layout (Spanish, German, French, US International), and the Space that completes one is dropped.

**Limits:** dead keys need the Keyboard API (Chrome, Edge); in Safari and Firefox they stay ignored. Tested with synthetic events only: a real dead-key press on real hardware is still to be checked.

---

## 2026-11-24 · P-13: Instructions you can see
**Who:** Codex (build), Sonnet (review), Opus (brief, fixes, browser check).

**Why:** Renzo got stuck on the Quarry river. "Stand on the bank" never said which tile, `4x` broke the river's shape, the game waited silently after `5r`, and bumping the note said "Blocked".

**What:**
- Key cards: when a stage introduces keys, a card shows each with an animated, engine-checked example. Aliases and app controls stay in `:help` only.
- Guides: a "Do:" row with keycaps under the objective, and outlined tiles to stand on (Margin, Lowlands, Quarry Road). Later worlds show "Use:" with only the tools the objective names; a test stops a guide from spelling out a puzzle's solution.
- showcmd: half-typed keys and what the game is waiting for. After `[count]r` the tiles it will change light up (red when the count does not fit).
- Keycaps in any text between backticks, with a "Try this" label on dialogue boxes that contain one (P-14 adds the backticks).
- Bumps name the obstacle ("Blocked: river.") and say "Press Enter to read / to talk / here". Enter with nobody near no longer shows an engine error.
- The Quarry Road's row 6 is pre-shifted, so the river lines up after the taught `4x`. The gate on the far bank has markers.

**Review fixes:** three Caves guides had wrong keys (replaced by tools); the card came back on replays, swallowed F1 and kept the keyboard under `:help`; held Esc leaked into the game; register and text-object prompts. `glades-finalize` peak: 4.41 GB (unchanged).

---

## 2026-11-24 · P-14: A story worth reading, instructions that read as instructions
**Who:** Sonnet (writing), Sonnet (instruction check against the engine), Opus (brief, direction, final read, browser check).

**Why:** Renzo: "the messages are a bit odd and not so worth to read, when instructions are given they are not very clear to be instructions."

**What:**
- A spine (MASTERPLAN 3.7): the Scribe wrote Folio for a little brother who stopped asking for the next page, and stopped saving because nobody was waiting. The Scribe's notes are now six pages of that story, one per world, and the Last Page pays it off. The plot and the twist are unchanged.
- The Margin starts with a stake: a row of the village is gone, and Tilde's house with it.
- A box is either story or instruction, never both. An instruction is the last box, names the place by what is on screen, and has its keys in backticks ("Try this" and keycaps, from P-13). Key explanations moved to the key cards.
- The HUD no longer repeats keys the objective already shows.

**Instruction check:** every instruction was checked, most by driving the real game, and 11 were wrong or misleading (Lighthouse `8k` from a cell where a wall blocks it; Shaft `3dd` and `.` that never reach the Mason; Gates `Ctrl-d` pressed once instead of four times; others). All fixed. Ledger, Manifest, Harbour, Contract, Study and Last Page hints were checked by reading against their buffers, not by driving each key.

---

## 2026-11-26 · DR-pilot: Drill mode ("the Copybook"), Worlds 0-2
**Who:** Opus (spec, contracts, build, browser check). Renzo accepted the spec defaults.

**Why:** Renzo's playtest: stages are too short to learn a key (about 700 keystrokes for the whole game), and the game must take players to proficiency.

**What:** Ten-rep text drills per key, built on the existing engine, runner, solver and Leitner mastery. Reps 1-3 isolate the key, 4-7 vary it, 8-10 mix in earlier keys. Clean = at most par; after a rep over par the strip shows your keys and the par keys. Missing (3x par, or Show me) replays the par route, then gives one retry. A set passes with 8 done and 6 clean, and moves the skill one box. Entry points: `p` on a stage's clear card (keys that stage taught) and a Copybook item on the title menu (cleared keys, weakest first). Progress is saved under `unsaved.drills.v1`.

**Tests:** 14 generators x 3 difficulties x 200 seeds replay their par to a win on the last key; the solver finds nothing shorter for motion and edit reps; corpus rules; session, scoring, store and clear-card tests. Two App tests updated for the new menu order. Full suite: 4749 passed.

**Review fixes (Codex, two rounds):** Enter under the drill could press the clear card's Continue (the game is now inert under a drill); an `x` rep could ink next to punctuation and the par deleted real text; Show me on the last rep did not save mastery; StrictMode reserved two seeds; Enter on a focused button (Back, another set) ran the screen shortcut instead. `<Esc><Esc>` give-up dropped from the spec: Vim users press it by habit.

**Merged with main (P-34 to P-36):** title menu is Continue, Stages, Keys, Intro, Copybook, New game, Sound. On the clear card `p` practises and Enter opens the written exercise. Six App tests updated for the menu.

**Stage book fits one screen (Renzo: "I need to scroll down to see the whole content"):** only the chosen world lists its stages; the others fold to one line with their stars, and a click chooses their first open stage. On a short screen the list scrolls inside its page. Checked at 1280x720, 1440x900 and 1700x1000 with Copper Port (5 stages) open.

**Not done:** Worlds 3-6 skills, castle gate, Unwrite storms, JSON corpus via Ollama. Spec deviations are listed in `docs/briefs/drills/DRILLS.md` section 10.

---

## 2026-11-24 · P-15: Places that look like places
**Who:** Codex (build, fix round), Sonnet (review), Opus (brief, art direction, fixes, browser check).

**What:** Walls have a lit top and a shaded front, water has a bank and drifting foam, roads have worn edges, planks over water get posts. Actors stand on soft shadows and have thin dark outlines. Ground has four variants and sparse decoration per world (never on an obstacle, never in source view), plus a light particle layer. Eight world palettes. The title screen is the Margin at dawn, with one row of `~` that vanishes and comes back. Entering a world shows a short banner (any key skips it; the key does not reach the game). Bare paper marks deleted text only; the uneven ends of authored rows are no longer drawn.

**Art direction after seeing it:** lighter ground, shore without a dashed line, ink outlines instead of cream, ground (not background) behind trees, wells and stones.

**Review fixes:** the opaque ground hid `dd`, `p` and the other edit animations (ground is now the cell's own tile); stale outlines; shadow stripes on tall walls; full-map recompute on every edit; banner skipped by a held key and blocking browser shortcuts; sprite names matched by substring. The fake Phaser in the scene tests creates its mocks lazily (it ran out of memory). `glades-finalize` peak: 4.42 GB (unchanged).

**Not measured:** frames per second on the largest map.

---

## 2026-11-24 · P-17: The opening, and where am I
**Who:** Codex (build, fix round), Sonnet (review), Opus (brief, script, map and art polish, browser check).

**Why:** Renzo: "we need a short intro explaining what is this about... what's gonna be the goal of the game so people get actually hooked. It seems too abrupt and confusing on where to start or where are we."

**What:** New game plays eight short beats, skippable with Esc: someone types a world, the letters turn into the village, the writer disappears, something grey deletes rows, you are Tilde, "YOUR GOAL: find the Scribe, make them save the world", and how you move. It never states the twist (MASTERPLAN 3.8). The title menu has "Intro" to watch it again. World banners show the road through Folio with where you are and one line of why; the HUD keeps "Find the Scribe" under the stage title; the stage list has the same map.

**Review fixes:** a second run started on the old beat or closed at once; a hidden tab could skip beats; the whole app re-rendered 45 times a second; art was redrawn pixel by pixel every frame; banners repeated after every return to the title; the last beat started the game by itself.

## 2026-11-24 · P-18: Visuals 2 (surroundings, light, tall things)
**Who:** Codex (build, fix round), Sonnet (review), Opus (brief, Save Stone, glow, browser check).

**Why:** Renzo likes the new visuals and wants more; and the design lead's tour of every world found that P-15 had broken the Lighthouse (its floor became open sea), the Lowlands (land that read as water), the Cut and the Last Page.

**What:** Built floors keep their own sprites; the Lowlands are a chalk meadow; the Cut is a real drop; the Last Page is plain paper. Outside each map there is now a place (sea, rock, forest, bookcases, cave), dimmed and never walkable, instead of a void. Soft vignettes, light pools on lamps, windows, crystals and Save Stones, and a smooth falloff in dark stages (the same cells stay hidden). Trees, pillars, shelves, lamps and Save Stones are 24 px tall and overlap actors correctly; source view hides the overhang.

**Review fixes:** trees wore a square block; one texture per cell and cursor in dark stages; the hidden map's outline showed in the dark; deleted text got a border or sea; mixed paper colours.

---

## 2026-11-24 · P-16: The Scribe's notebook (new keys, when you need them, and you try them)
**Who:** Sonnet (start, stopped by its usage limit), Codex (build, fix round), Sonnet (review), Opus (brief, fixes, browser check).

**Why:** Renzo: "the 'your new keys' page is poorly designed, it needs to be scrolled up/down... appears out of nowhere, needs some redesign, I like the idea tho."

**What:** The black "Your new keys" page is gone. A page of the Scribe's notebook slides up over the dimmed game right after the dialogue that first names a key. One lesson per page, no scrolling, at most two in a row, each shown once per save. Tilde tries it first, then the player does, on a strip of that stage's own tiles driven by the real engine: `h j k l` around a square of path, `4x` on three stones, `5r=` across four water tiles, `w` over stepping stones. Keys without an authored lesson use their help example.

**Review fixes:** on layouts that need Option or AltGr the practice ignored `{ }` (the game and the notebook now share one key reader, `input/keyReader.ts`); focus no longer sits on a button that Space could press; the page limit counts pages, not keys; Tab behind an open page does nothing.

---

## 2026-11-24 · P-19: The frame (HUD, dialogue, status line, desk)
**Who:** Codex (build), Sonnet (review), Opus (brief, fixes, browser check).

**Why:** the header grew from 84 to 124 px as the objective and guide rows appeared, so the map was resized under it and its top rows were cut off; and everything around the map was dark rounded web-app boxes.

**What:** A header of constant height: one row of facts, and a paper strip that says what to do now. The footer is Vim's status line (mode block, buffer name, pending keys, the last six keys learned). Blocked messages are a paper slip over the field that fades, instead of staying in the footer. Dialogue is paper and ink with a framed portrait and a name tab; instruction boxes have a gold edge, a "Try this" stamp and raised keycaps; the box moves to the top when the player stands low on the map. Text stages are sheets on a desk. The clear and death panels match.

**Review fixes:** the toast hid a message when the turn also ended, and its live region was remounted; the old keycap rule won over the new one; the quest strip repeated keycaps; the focus ring vanished on paper; the footer could spill to a second row; the desk heading no longer stayed in view; a copied dialogue sequence; dead code. Matched target rows are ticked in green, not struck through (in a Vim game that reads as "delete").

**Known:** in the Gates, after `Ctrl-d` scrolls the window, the side the dialogue takes is computed without the scroll.

---

## 2026-11-24 · P-20: Life in the field (characters, forest, houses, the erased row)
**Who:** Codex (build, second round), Sonnet (review), Opus (brief, forest and path art, fixes, browser check).

**Why:** Renzo likes the visuals and wants more. The design lead's play found a player that slid without turning, tree columns like totem poles, houses made of repeated doors, and a first line ("a whole row of the village is gone") that nothing on screen showed.

**What:** Tilde faces where she walks and has a walk cycle; people breathe and turn to look at you; the person to talk to has a "!" bubble (the arrow used to point at the empty cell beside them). Trees are round crowns that join into a forest; the forest outside the map is a canopy in three distances; the Library's outside is shelves of varied width with gaps and ladders. Houses have a roof, one door, lit windows and chimney smoke. In the Margin the erased row is visible: torn paper, a `~`, and the pencil outline of Tilde's house. Worn paths lead from the doors. The label says talk, read or use. The clear card is a paper card over the map.

**Review fixes:** labels not moved on resize; a search through all entities for every actor on every frame; buildings searched on every key; the facing kept after a restart; the erased strip would have covered a line moved into its place; keepers said "use"; a seam at the map's left and right edges.

**Textures:** entering the Margin creates 612 (test limit 620), walking creates none.

---

## 2026-11-24 · P-21: The title and the opening, redrawn
**Who:** Opus (art and code), Sonnet (review).

**Why:** the title and the opening still used the old trees and houses, and the title looked like a web form over a flat field.

**What:** The title is the Margin at dawn under a dithered sky, the dark Lighthouse on the hill, Tilde on the road; the right edge of the world turns into its letters and then into blank page with `~`, and breathes. The menu is a sheet of paper headed `folio.txt [+]` (Vim's mark for an unsaved file), with line numbers and a cursor after the title. The opening's village uses the same art as the field (`scene/terrain/tableau.ts`, shared), and its letters are the Margin's real ones.

---

## 2026-11-24 · P-23: Ground you can read (materials)
**Who:** Opus (art and code), Sonnet (review).

**Why:** a render of every stage showed floors and walls drawn from the same texture (Customs, the Caves), striped rock that pulled the eye (Quarry), a walkway that was mostly sky (Canopy) and a noisy moss that hid the fern marks (Glades).

**What:** One rule everywhere: the floor is lighter and calmer than the wall. New masonry, bark, planks, moss, bramble, flagstones, cave floor and rock, gravel, tents and boulders, all procedural and deterministic (`sprites/material.ts`), same sprite names, frame counts and 16 by 16 grids.

---

## 2026-11-24 · P-24: The book's other pages (stages, keys, banners)
**Who:** Opus (design and code), Sonnet (review).

**What:** The stage list is a spread: contents on the left, and on the right the chosen stage's opening view, its goal, your best and the par. World banners show the first view of that world behind a paper card with the road through Folio. The keys reference is paper. One painter draws any stage without Phaser (`scene/terrain/stagePicture.ts`).

---

## 2026-11-25 · P-25: Cutscenes you can follow
**Who:** Opus (design and code), Sonnet (review).

**Why:** the 24 cutscenes were a blank page with one centred line and no name, so "Copy. ...copy." came from nobody.

**What:** Every beat plays over the place it happens in, between two film bars: speech uses the dialogue box with portrait and name, narration is a caption, "The Scribe is in another buffer." is carved in stone, the swap file is a terminal, the end of a world is a page. The death panel is a torn card over the map. Small maps are centred in their picture, with the world's own surroundings around them. Labels say "go south" and "take lift" again (P-20 had turned them into "use"). The unused second cutscene component is gone.

---

## 2026-11-25 · P-26: The ending you can see
**Who:** Opus (design and code), Sonnet (review).

**What:** After the saving ending, the last screen is the title's own picture with the edge whole and the lamp lit, and the title loses two letters: UNSAVED becomes SAVED. From then on the title screen keeps the whole world, and its file is `folio.txt` without the `[+]`.

---

## 2026-11-25 · P-22: Music
**Who:** Codex (player, two rounds), Opus (brief, the nine scores, level), Sonnet (review).

**Why:** between two keys the game was silent, so every place felt the same.

**What:** One original, synthesized score per world, plus title and ending (the title's theme alone, at half speed, finally answered). No audio files. It ducks under dialogue, the notebook, cards and help, cross-fades between worlds, stops on death, pauses in a hidden tab. The sound button now has three states: on, effects only, off (old settings still load).

**Review fixes:** fades jumped instead of fading; one error silenced music for good; pads decayed like plucks; notes lost at the node cap; a DOM observer for ducking. The first scores were one template transposed, so they were rewritten by hand in a small text notation (`tune([...])`) with tests for mode, range, rests and repetition.

**Checked:** the title score's output in the browser (level, no sample jumps over 0.001). Nobody has listened to all nine: Renzo's ears decide.

---

## 2026-11-25 · P-27: `:hint` (nobody stays stuck)
**Who:** Opus (design and code), Sonnet (review).

**Why:** Renzo got stuck on the planks. Every stage had hints written, but field stages never showed them; only the text stages did.

**What:** `:hint` (or its button in the status line) shows the stage's hints one at a time as a note in the margin: only those for the current objective when one names its keys, so later ones are not given away. After the last it puts them away. No turn, no star lost, nothing in the world changes. After 14 turns on one objective, or 4 blocked moves in a row, the button lights up and asks "stuck?". A new objective puts the note away. Nothing new on the Session.

---

## 2026-11-25 · P-28: Seen while playing
**Who:** Opus (play, fixes).

**What:** Crowns thin out over whoever stands behind them; the black edge of the map no longer cuts trees in two; pictures of the blank field show it whole; the "Enter: talk" label is drawn at screen size instead of being blurred by the zoom; Phaser and React are separate files, so a returning visitor downloads 166 kB instead of 550.

---

## 2026-11-25 · P-29: Played as a newcomer, Margin to Lighthouse
**Who:** Opus (play, fixes), Sonnet (review).

**What playing showed, and the fix:**
- After the last stepping stone, `w` answered "Blocked: tree" and the marker pointed back. The last stone now counts as across, so the next objective and its marker show at once.
- "At the foot of the stairs" in the Lighthouse, but no stairs were drawn and nothing marked the spot. The three openings are stairs now, the two places to press `8k` are marked, and the guide ends where the blank floor begins (guides can have an area).
- In the Quarry, with the rubble gone, the game still asked for `4x`. The marker now goes with the rubble, and the first step east is already the river. Landing on the last plank already counts as across, so the planks are not asked for twice. While Vim waits for a key (`5r` ...), the whole status line says what it waits for.
- Stand markers and the cursor were thin yellow lines, invisible on pale stone. Both have a dark second tone; the marker also tints its cell.

---

## 2026-11-25 · P-30: Played as a newcomer, the Cut to the Glades
**Who:** Opus (play, fixes).

**What:** Two objectives stayed on screen after they were done ("Clear the Blots", "fH reaches the ladder"); both now say something true until the step ends. Text stages use a larger sheet on wide screens. A map that fits the view is drawn larger (up to 5 times, whole steps, decided by the authored map so edits never change it): the Port, Library and Caves no longer sit tiny in the middle.

---

## 2026-11-25 · P-31: Played as a newcomer, Copper Port to the ending
**Who:** Opus (play, fixes), Sonnet (review).

**How:** a save built by replaying every stage's solution, then each field stage from World 4 to the ending played in the browser, reading every box against what is on screen.

**What playing showed, and the fix:**
- A player who takes `5$` in the Lowlands (the par route the game itself shows) kept "Cross the blank field" as the objective, with its markers, for the rest of the game. The screen now follows the latest quest begun (`currentQuest.ts`).
- Text stages never opened practice pages, so `o`, `D`, `c`, `C`, `P`, `yy`, `V` and `Ctrl-v` were taught in one line. They have pages now, as words on a sheet, before the first key.
- The "should read" sheet dropped blank rows, which looked like an instruction to delete them.
- The player was hidden behind crate props; a crate pallet covered its own post.
- Instructions named things not on screen ("tally word", "a shelf's [", "crate two", "the atlases", "the stair"). They now name jars, signs, posts, colours, and the labyrinth's stair is drawn.
- Keycaps showed Vim notation (`<Esc>`, `<C-v>`); they show the key's printed name.
- The yank slot was barely visible; letters of the buffer (Tab view, the Last Page) were blurred by the zoom.
- The hints of the text stages sat below the sheet, out of sight, and the first one named work already done. They are in the heading now, and follow the first unfinished part (`scriptHints.ts`).
- Practice pages whose example ends in Enter said "Enter: skip practice", but Enter only answered "Try again". Enter and Esc now do what the buttons say until the practice begins, and the buttons drop their keycap while it runs.
- The sheets of the contract and the manifest scrolled sideways, and the manifest's target hid the last full stop. The target now takes the width of its longest row. The manifest's intro said five fixes; there are six.
- In the Gates, a player who took the jump before talking to Shut kept "Talk to Shut" as the objective after Ope had sent them for the lamps.
- The next stage's objective was already on screen during the closing dialogue of the one just cleared.

**Review:** 5 risks. Fixed: the ending's key count (it counts since the file was opened), the keys filter (it matches "Ctrl" and "Enter" too), "the brown one" (the bibles are dark), "the crate's post" in the customs shed (there is a post of that name). Kept: practice pages may open over any script with no key typed in it; only text stages open one that way.

---

## 2026-11-25 · P-32: Renzo's play: the scripts, the Gates and the port
**Who:** Opus (design, code), Sonnet (review).

**What Renzo said:** the `%` stage is very confusing; in the scripts a space too many at the end of a row is invisible and nothing says so; every row was ticked and nothing happened; the instructions do not look like instructions; in the Warehouse it is not clear what to do, and TALLY was a smear of pixels.

**Root causes and fixes:**
- *Ticked but not finished:* the script ends at rest in Normal mode, and the ticks compared rows by position only. So Insert mode, or a row too many at the end, left every tick green with no next step. The heading now says "Every row is right. Press Esc to finish.", and a row too many is struck out and named.
- *Invisible differences:* rows are paired by least difference (`script/diff.ts`), so one extra row no longer unticks all below it. The characters that differ are underlined in both sheets, trailing spaces show as dots, and a "Look" line names what an eye misses (a space at the end, spaces, capitals, an empty row).
- *Instructions:* the goal paragraph and the late hints are replaced by a checklist of tasks and one "How" line for the current task: where to stand, which keys, what to type (`script/tasks.ts`). `script.test.tsx` follows every instruction literally and must reach the target text.
- *The Gates:* two `)` side by side jump to different places, 36 rows apart, with nothing on screen to say which. The nook (the inner pair) is now four rows above, so the first `%` shows both ends; dotted threads join each pair and light up when the player stands on an end; every step has a marker to stand on. A new first step teaches the pair before the long jump.
- *The port:* no step said where to stand. Markers now follow the state of the field (`stageGuides.ts`: what is yanked, what is stocked), and paper signs name piles, shelves and crates and tick when they are right. `stageGuides.test.ts` plays Jetty, Warehouse, Customs, Counter and Gates doing only what the screen says, and must clear them. The TALLY plates are gone; `[` and `]` are drawn as one rack.
- Between two things only the one Enter will use is labelled.

---

## 2026-11-25 · P-33: The music says the stage is done
**Who:** Opus (design, cadences, levels), Codex (build), Sonnet (review).

**Root cause:** a cleared stage only ducked the music, and the clear effect was a C major arpeggio that fits no score.

**What changed:** each score has a cadence in its own key. When a stage is cleared the plucked voices fade at the next beat, the cadence plays over the held pad, and the score then goes on "resolved" (pad only, brighter filter) until the next stage. With effects only, the old clear effect stays.

**Measured in the browser (Margin):** the first build's figure was a click (its notes were 10 ms long) and came two seconds late (it waited for free audio nodes under a cap of 24). Notes now last a beat, the cap is 48, and the cadence sits 2 dB over the music (about -32 dB against -35 dB RMS). Nobody has listened to it yet.

**Other options considered:** voices that join as objectives are done, so a place "wakes up" while you play (best next step, needs a listen first); a tempo change at the end (rejected: it fights the walking rhythm).

---

## 2026-11-25 · P-34: A written exercise after each stage
**Who:** Opus (design, texts, code), Sonnet (review).

**Why:** Renzo: people need to practise the keys on real text. The field makes a key memorable; the text shows what it is for.

**What:** after the clear card of 18 field stages the same keys are used once on a short text (a letter, a list, a bill): three to five tasks, under a minute. Moving tasks count only when the cell is reached with the key they teach; editing tasks end at a target text, on the same sheet as the text stages (`script/Sheet.tsx`, now shared). Esc twice skips; a finished one is not offered again. The exercise has its own buffer and never touches the session, so turns, stars, story and replays are unchanged (`play2/draft/`).

**Tests:** every exercise is played with the keys its instructions name, using only keys the player has learned by then.

**Not done:** Lighthouse, Counterfeiter and Labyrinth teach no key of their own and have no exercise. Closing the browser during an exercise repeats the stage, as closing it on the clear card already did.

**Review:** two traps fixed: the clear card's button kept the focus, so Enter could not finish the exercise after a mouse click; Tab walked out of the sheet. Also fixed: copies are checked by what is in the pocket they name, every editing task outlines where to stand, a text damaged beyond its tasks says so and offers `u` or Start again, and keys typed faster than renders are kept.

**Also:** the `5$` route left "Cross the blank field" on screen in the Lighthouse; clearing the Lowlands now completes that step.

---

## 2026-11-25 · P-35: One typeface, and labels that cover nothing
**Who:** Opus (design, code), Sonnet (review).

**Why:** Renzo, in the Warehouse: "everything is on top of everything", and the instructions "look like thrown there, not matching the vibe". Causes: the labels on the field were drawn with the browser's default `monospace` in map units, so they grew with the zoom and were placed by hand; the HUD was three full-width bars in three styles; a corporate sans sat on pixel art.

**What:**
- **Two faces.** Jersey 15, a pixel face (OFL, new dependency `@fontsource/jersey-15` 5.3.0, bundled), for everything the game says; JetBrains Mono only for Vim's own text and keys. IBM Plex Sans is gone. Paper surfaces share one pixel frame (`--paper-frame`).
- **One HUD band:** where you are, the instruction on a slip of paper in the middle, registers, gauges and turns at the right. The registers left the field.
- **Field labels are placed, not positioned.** A sign now says which cells it names (`FieldSign`), and `scene/labelLayout.ts` finds the cheapest place above, below or beside them: never over goods, people or another label, on walls when it can. One size on the screen at any zoom, in a layer over the canvas that follows the camera (`scene/FieldLabels.tsx`). The label that names the target turns gold and replaces the arrow; a finished one turns green; all hide while somebody speaks. The Enter prompt and the landing keys use the same layer.
- **Art:** the oil jar and the rope coil have an outline and a clear shape; the registers show them cut out.
- Large screens (1600 px and wider) draw the interface a third larger. The sheets say how many rows are too many.

**Tests:** in four stages, three window sizes, before and after the work, no label overlaps goods, people or another label (`scene/labels.test.tsx`).

**Review:** canvas letters wait for their fonts before the first frame; the prompt waits for the last step of a walk; obstacles are computed once per map, not per key; the prompt is announced to screen readers; no sideways scroll at 910, 1024 and 390 px.

---

## 2026-11-25 · P-36: The music follows the challenge
**Who:** Opus (design, fixes), Codex (build), Sonnet (review).

**Why:** Renzo: the music is "just ok, a bit tiring, and doesn't reflect the feeling of the challenge". The melody played all the time at one strength, the same 32 bars came back unchanged, every voice was dry and in mono, and the only thing it knew was the world.

**What:**
- **Five parts** per score: bed, pulse, melody, counter-melody, drum. The tune opens a stage, then comes and goes; no arrangement repeats within three minutes.
- **The quest is heard.** Each finished step adds something at the next bar: a firmer pulse, a second voice, a drum (`audio/mood.ts`, energy 0 to 3).
- **Danger is heard.** An enemy within five cells, then two, or the last heart: the tune withdraws, the sound darkens, a heartbeat starts. It comes in a quarter of a second and leaves slowly.
- **Pace:** text and walking stages are slower, races and duels faster with a drum from the first bar. The same pace keeps the music going from stage to stage.
- **Thinking is quiet:** after 20 seconds without a key the tune rests until the next phrase after a key.
- **Sound:** one room reverb, parts placed left and right, small fixed variations of level and timing, softer attacks.

**Measured (offline render of the real player):** about -31 dB at the start of a stage to -26.5 dB at its last step (it was a constant -24 to -27); the first build moved less than 1 dB between steps 1 and 3, so pulse, counter and drum were set again. The clear figure sits level with the music.

**Review:** the node cap starved a new stage of its parts during a crossfade (48 to 112, parts made at the start); the Quarry's knock was lost; danger left too fast; the heartbeat ran late; un-resolving brought every part back at full. Fixed.

**Not done:** nobody has listened to it yet. Pace and energy are guesses until then.

---

## Parking lot
- Engine: redo after moving (`dbul<C-r>`) matches Neovim now; `gU`/`gu`/`g~`/`>`/`<` are not implemented (never taught); add them with goldens if a later lesson needs them.
- Session (S-1 leftovers): a checkpoint stored mid-settle snapshots the story after all rounds (firedReactions can run ahead; flags are re-synced); the flag re-sync after a restore can re-evaluate a `flag` clear without emitting `stage-cleared` (unreproduced).
- Old-commands bounds at maxTurns 3 only show there is no shortcut of 3 turns or fewer; they do not prove the old route's length (Sonnet, G-5).
Ideas that are out of v1 scope, kept so they are not lost:
- Supabase leaderboards and accounts
- Tauri desktop build (fixes `<C-w>` in browsers)
- Regions 6-9: macros, ex commands, windows/buffers, workflows
