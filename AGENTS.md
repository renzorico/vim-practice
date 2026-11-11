# ESCAPE (vim-practice): agent context

A browser game that teaches Vim from zero: a 2D turn-based tile world where every tile is a character of a real Vim buffer, and one Vim command is one turn.
Plan: docs/MASTERPLAN.md (v2; older design docs are in docs/archive/). Who does what: docs/MODEL-ROUTING.md. Change log: docs/BITACORA.md.

## Stack
npm workspaces, TypeScript strict, Vitest. Later: Vite + React + Zustand in apps/game.

## Commands
- `npm install`
- `npm run typecheck`
- `npm test`

## Rules for every agent
1. Contracts are frozen: `packages/engine/src/types.ts`, `packages/curriculum/src/types.ts`, `packages/world/src/types.ts`, `packages/story/src/types.ts`. Only the design lead (Fable) edits them.
2. The engine, world and story logic are pure (no DOM, timers or randomness) so a playthrough can be replayed from keys alone and compared with Neovim. Only `apps/game` touches the DOM, time or sound.
3. One agent = one worktree = one module. Do not touch files outside your brief.
4. A branch merges only when CI (`.github/workflows/ci.yml`: typecheck, tests, golden tests; level replay from Phase 2) is green.
5. Every merge gets a BITACORA entry (the orchestrator writes it).
6. Merge policy (authorized by Renzo, 2026-11-09): agents do not wait for a human to merge. The orchestrator commits builder output and merges a PR into `main` once CI is green and the cross-vendor review is done. Direct pushes to `main` stay blocked; everything lands through a PR.
7. Keys use Vim notation strings: 'j', '<Esc>', '<CR>', '<C-r>'.
