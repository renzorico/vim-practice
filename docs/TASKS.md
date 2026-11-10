# Task board

The single coordination point for every agent, whatever the vendor. Git is the shared state; this file is the lock.

Rules:
1. One task owns its files. No two open tasks may list the same file.
2. Only the orchestrator adds tasks, changes owners and marks `merged`.
3. Status flow: `todo` -> `running` -> `review` -> `merged` (or `blocked` with a reason).
4. Reviewer is always a different vendor from the builder (Claude builds, Codex reviews, and the other way round).

| ID | Task | Owns files | Runner | Reviewer | Branch | Status |
|---|---|---|---|---|---|---|
| P1-A | Modes, insert mode, ex `:q :q! :w :wq :x`, `ZZ` | `packages/engine/src/modes/**` | codex | claude-sonnet | task/P1-A | merged |
| P1-B | Motions `hjkl w b e 0 ^ $ gg G f t ; , % { }` + counts | `packages/engine/src/motions/**` | claude subagent (Sonnet) | codex | worktree-agent-a23eb1dc | merged |
| P1-C | Operators `d c y p`, registers, undo/redo, `.` | `packages/engine/src/operators/**`, `packages/engine/src/registers/**` | claude subagent (Sonnet) | codex | worktree-agent-a300c4f4 | merged |
| P1-D | nvim golden-test harness | `tools/golden/**` (not cases), `packages/engine/src/keys.ts` | codex | claude-sonnet | task/P1-D | merged |
| P1-E | Edge-case golden cases for P1-B and P1-C | `tools/golden/cases/**` | claude subagent (Haiku) | orchestrator | worktree-agent-a5d697fd | merged |
| P1-F | Wire modules into `Engine.step` (after A-D merge) | `packages/engine/src/engine.ts` | orchestrator | codex | phase-1/engine | merged |

### Phase 2 (see docs/PHASE-2.md)

| ID | Task | Owns files | Runner | Reviewer | Branch | Status |
|---|---|---|---|---|---|---|
| P2-0 | Contracts: runner, progress, GameStore | `packages/curriculum/src/types.ts`, `packages/curriculum/src/contracts/**` | orchestrator | codex | | merged |
| P2-A | Level runner + goals + constraints + stars | `packages/curriculum/src/runner/**` | codex | claude-sonnet | | merged |
| P2-B | Skill graph, mastery, review picker, unlocks | `packages/curriculum/src/skills/**` | claude-sonnet | codex | | merged |
| P2-C | App shell, CRT renderer, key capture, HUD | `apps/game/**` | claude-sonnet | codex | | merged |
| P2-D | Ollama level drafts + fixes for Region 1 | `packages/curriculum/levels/**`, `tools/draft-levels.ts` | ollama + codex | renzo | | merged |
| P2-E | Level schema validation + replay gate | `tools/levels/**` | claude-haiku | orchestrator | | merged |
| P2-F | Wire app, buffer overworld, Prologue levels | integration | orchestrator | codex | | merged |
| P2-G | GitHub Pages deploy | `.github/workflows/deploy.yml` | orchestrator | | | merged |

### Phase 3 (see docs/PHASE-3.md)

| ID | Task | Owns files | Runner | Reviewer | Branch | Status |
|---|---|---|---|---|---|---|
| P3-0 | Contracts: solver, generators, lessons, world, session | `packages/curriculum/src/phase3.ts` | orchestrator | codex | phase-3/contracts | merged |
| P3-A | Solver | `packages/curriculum/src/solver/**` | codex | claude-sonnet | | merged |
| P3-B | Room generators (10 skills) | `packages/curriculum/src/generators/**` | claude-sonnet | codex | | merged |
| P3-C | World map engine | `packages/curriculum/src/world/**` | codex | claude-sonnet | | merged |
| P3-D | Room session (fail flow) | `packages/curriculum/src/session/**` | claude-haiku | codex | | merged |
| P3-E | Ember UI components | `apps/game/src/ui/**` | claude-sonnet | codex | | merged |
| P3-F | Story content: map, lessons, notes, rooms | `packages/curriculum/content/**` | orchestrator | renzo | | merged |
| P3-G | Integration + skip test + deploy | integration | orchestrator | codex | | merged |
| P3-H | Playtest | | renzo | | | **next** |

## Backlog (minor review findings, not blocking merge)

| From | Item | Suggested owner |
|---|---|---|
| P1-A review | Visual mode lost after `:`/`/` + `<Esc>` from visual | P1-F wiring |
| P1-A review | E37 uses code `not-allowed`, which collides with allowedCommands rejection; add an error code in a later contract change | orchestrator |
| P1-A review | Insert ignores `<Tab>`; cmdline ignores `<C-c>`, `<C-u>`, `<C-w>` | Phase 2 |
| P1-B review | Failed `f`/`t` should still set `lastFind` (needs MotionFn contract change) | deferred |
| P1-C fix | engine.ts must pass an exclusive empty range for `d$` `de` `dl` on an empty line (operators treat inclusive empty ranges as `vd`) | P1-F wiring |
| P1-B/P1-C | `''`, `` `` `` jump-back marks; `cw` as `ce`; o_v linewise promotion for `d}`; `"1` for `%` `(` `{` deletes | P1-F wiring |
| P1-D review | Better watchdog error, pending-command tests, edge-case samples, reject raw `\n` in keys | Phase 2 |

| P3 review | Old `escape.save.v1` Phase 2 saves are not migrated: the redesign replaced every level, so there is nothing meaningful to carry over (decision, not a bug) | orchestrator |
| P3 browser | Lesson card sits small top-left with no header; map glyph colours for N could be warmer | P3-H polish |
