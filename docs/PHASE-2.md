# Phase 2: game layer and alpha deploy

**Goal:** a playable alpha at a public GitHub Pages URL, with the overworld, the Prologue (3 levels) and Region 1 (6 levels), saved progress, and skills that track mastery.
**Time:** about 1 week part-time. Agents run in parallel for about 1-2 h of wall time; Renzo's design pass on the levels takes about 2 h.

## Decisions (2026-11-09)

| Area | Choice | Why |
|---|---|---|
| Visual style | **Retro CRT terminal**: phosphor on black, scanlines, subtle glow, CSS only | Strong identity ("hacker learning Vim"); no art assets |
| Deploy | **GitHub Pages** through a GitHub Action on every merge to `main` | Free, repo is public, the whole pipeline stays in the repo |
| Prologue | **Orchestrator drafts, Renzo edits** | The opening sets the tone, so a human has the final say |
| Behaviour | **Neovim defaults** (from Phase 1) | One exact oracle |
| New deps | `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `zustand`, `zod` | Flagged here; nothing else without a note |

## Step 0: contracts (orchestrator, sequential, before any fan-out)
1. **Level runner contract** (`packages/curriculum/src/runner.ts`): `startLevel(level)`, `stepLevel(run, key)` returning status (`playing` / `won` / `failed`), keystrokes, stars (from par) and which goals are met.
2. **Progress contract:** `SaveData` (completed levels, mastery per skill, keys collected), `StorageAdapter` (localStorage in the app, in-memory in tests), and the `updateMastery` / `reviewQueue` / `isUnlocked` signatures.
3. **App contract:** the `GameStore` shape (Zustand) that the UI reads, so the UI can be built against stubs.

## Fan-out

| Task | Owns | Runner | Reviewer |
|---|---|---|---|
| P2-A Level runner + goal checker + constraints (`allowedCommands`, `mustUse`, par → stars) | `packages/curriculum/src/runner/**` | Codex | Claude Sonnet |
| P2-B Skill graph, Leitner mastery with decay, review-chapter picker, unlock rules | `packages/curriculum/src/skills/**` | Claude Sonnet | Codex |
| P2-C App: Vite + React + Zustand, CRT buffer renderer (cursor, visual selection, mode), browser keys → Vim notation, HUD | `apps/game/**` | Claude Sonnet | Codex |
| P2-D Level pipeline pilot: Ollama drafts Region 1, Codex fixes and writes solutions, Renzo designs key levels | `packages/curriculum/levels/**`, `tools/draft-levels.ts` | Ollama `qwen3:14b` + Codex | Renzo |
| P2-E Level gate: schema validation + solution replay in CI | `tools/levels/**` | Claude Haiku | Orchestrator |

## Fan-in (orchestrator)
- **P2-F:** wire the app to the runner, skills and save data. Build the **overworld as a buffer**: the player moves to portals with Vim motions and presses `<CR>`, and locked portals are marked. Add the Prologue levels.
- **P2-G:** GitHub Pages deploy workflow, plus the alpha URL in the README.

## Gates
Every PR: cross-vendor review, then CI (typecheck, tests, Neovim goldens, level replay), then auto-merge.

## Risks
1. **Browser keys:** Chrome reserves `<C-w>`, `<C-t>` and `<C-n>`, but no Phase 2 level needs them. `<C-r>` can be captured with `preventDefault`.
2. **Ollama quality:** a 14B model drafting puzzles. The gates catch broken drafts but not boring ones; the design pass is Renzo's.
3. **Undo inside levels:** a level restart must reset engine state completely. The runner owns this, not the UI.
