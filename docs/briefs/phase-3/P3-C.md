# P3-C: world map engine
Owns: `packages/curriculum/src/world/**`

Implement every export in the "World map" section of `phase3.ts`, in `world/index.ts`.
- The map buffer lives in an engine state; movement uses `Engine.step` with `allowedCommands = mapCommands(learned)`. Never re-implement motions.
- After each completed motion: if the new cursor cell is a wall char (`map.walls`) or lies in an unrevealed region's rows, restore the previous cursor (and desiredCol) and emit 'bump' or 'fog'. Pending keys (e.g. after `f`) are not moves yet.
- `<CR>` in normal mode with no pending keys: look up `entityAt(cursor)`; note/door/echo events as specified; a door's skill prerequisites (catalog, transitive) must all be in `learned`, else 'door-locked' with the missing ones; exit: emit nothing yet (Phase 4).
- Ending a move on a key entity not yet collected: collect it, reveal `unlocks`, emit 'key-collected'.
- `visibleLines`: same line count; unrevealed region rows become '░' repeated to the line's length.
- Tests (at least 35) with a small fixture map built in the test file: wall bumps for h/l/w/$/G, fog, f{char} landing on an entity, locked door, key reveal, not-learned commands, the buffer never changes, `0`/`$` across walls.
