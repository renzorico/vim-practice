# Phase 3: the redesigned game (world, teach-then-test, story)

Design sources: [GAME-DESIGN.md](GAME-DESIGN.md), [STORY.md](STORY.md), [VISUAL-DESIGN.md](VISUAL-DESIGN.md).
**Done means: Renzo has played the Prologue and Region 1 in the new build and is happy with it** (the playtest gate). Green CI alone is not done.

## Scope
- The world map: an ASCII ATLAS you explore with learned motions (walls, notes, doors, keys, ECHO, fog, regions that appear).
- Lesson → practice → challenge for every skill of the Prologue and Region 1 (10 skills).
- Room generators and a solver: endless variants, par = proven optimum, a replayable solution.
- The fail flow: hints, "Show solution" after 5 failed attempts, a variant instead of a pass, "Skip" after 3 failed variants.
- The Prologue skip test.
- The Ember UI for every screen.
- Story content: notes, lessons and room text for the Prologue and Region 1, with the ECHO twist seeded.

**Out of scope:** Regions 2-5, corrupted-sector review rooms (the mastery data is kept, the rooms come in Phase 4), sound.

## Contracts first (orchestrator; merged into `main` before any dispatch)
`packages/curriculum/src/phase3.ts`: solver, room generators, lessons, world map + map state, room session (fail flow).

## Fan-out

| Task | Owns | Runner | Reviewer | Why |
|---|---|---|---|---|
| P3-A Solver (uniform-cost search over command actions) | `packages/curriculum/src/solver/**` | Codex | Claude Sonnet | Algorithmic, crisp spec, test-heavy |
| P3-B Room generators for 10 skills | `packages/curriculum/src/generators/**` | Claude Sonnet | Codex | Puzzle-design judgement |
| P3-C Map engine: collision, entities, fog, regions | `packages/curriculum/src/world/**` | Codex | Claude Sonnet | Pure logic with clear rules |
| P3-D Room session: fail flow state machine | `packages/curriculum/src/session/**` | Claude Haiku | Codex | Small, rule-driven, cheap |
| P3-E Ember UI: title + skip, map, lesson + replay, practice, challenge, fail banner | `apps/game/src/ui/**` | Claude Sonnet | Codex | UI judgement, design tokens given |
| P3-F Story content: world map, 10 lessons, notes, room text | `packages/curriculum/content/**` | Orchestrator (Opus) | Renzo | Quality-critical writing |

## Fan-in
- **P3-G (orchestrator):** wire everything into the store; Prologue skip; deploy.
- **P3-H:** Renzo playtests. Feedback becomes fix tasks.

## Gates
Typecheck, tests, Neovim goldens, the level gate (every hand-written level replays within par, and every generator output is solvable by the solver), cross-vendor review, CI, then **Renzo's playtest**.
