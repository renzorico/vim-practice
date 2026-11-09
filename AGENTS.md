# ESCAPE (vim-practice): agent context

A browser game that teaches Vim from zero. The world is a text buffer the player moves through with Vim motions.
Plan: docs/PLAN.md. Who does what: docs/MODEL-ROUTING.md. Change log: docs/BITACORA.md.

## Stack
npm workspaces, TypeScript strict, Vitest. Later: Vite + React + Zustand in apps/game.

## Commands
- `npm install`
- `npm run typecheck`
- `npm test`

## Rules for every agent
1. Contracts are frozen: `packages/engine/src/types.ts`, `packages/curriculum/src/types.ts`. Only the orchestrator edits them.
2. The engine is pure (no DOM, timers or randomness) so it can be replayed and compared with Neovim.
3. One agent = one worktree = one module. Do not touch files outside your brief.
4. A branch merges only when CI (`.github/workflows/ci.yml`: typecheck, tests, golden tests; level replay from Phase 2) is green.
5. Every merge gets a BITACORA entry (the orchestrator writes it).
7. Merge policy (authorized by Renzo, 2026-11-09): agents do not wait for a human to merge. The orchestrator commits builder output and merges a PR into `main` once CI is green and the cross-vendor review is done. Direct pushes to `main` stay blocked; everything lands through a PR.
6. Keys use Vim notation strings: 'j', '<Esc>', '<CR>', '<C-r>'.
